import { useCallback, useEffect, useRef, useState } from 'react'
import BonusDialog from './components/BonusDialog.jsx'
import GameHeader from './components/GameHeader.jsx'
import GameHud from './components/GameHud.jsx'
import { GameEngine } from './engine/GameEngine.js'
import { tokenContainsPoint } from './engine/CollisionSystem.js'
import { createInputController } from './input/InputController.js'
import { attachKeyboardInput } from './input/KeyboardInput.js'
import { attachPointerInput } from './input/PointerInput.js'
import PixiCanvas from './rendering/pixi/PixiCanvas.jsx'
import { PixiEngineAdapter } from './rendering/pixi/PixiEngineAdapter.js'
import { PixiSceneRenderer } from './rendering/pixi/PixiSceneRenderer.js'
import { sharedVectorAssetCache } from './rendering/pixi/VectorAssetCache.js'
import { screenToWorld } from './rendering/pixi/Viewport.js'

/**
 * Resolves power inventory, granting test charges only in development mode.
 *
 * @pure
 */
function inputInventory(powerups, inventory, devMode) {
  return Object.fromEntries(
    powerups.map((power) => [
      power.id,
      devMode ? 999 : Number(inventory[power.id]) || 0,
    ]),
  )
}

/**
 * Selects collected coin IDs that belong to the current level namespace.
 *
 * @pure
 * @param {object} level Active level configuration.
 * @param {Record<string, boolean>} collectedCoins Persisted coin claims.
 * @returns {Set<string>} Claimed coin IDs local to the level.
 */
function claimedCoinIds(level, collectedCoins) {
  return level.coins
    .filter((coin) => collectedCoins[`${level.id}:${coin.id}`])
    .map((coin) => coin.id)
}

/**
 * Resolves an entity-specific sound only when the active manifest contains it.
 *
 * @pure
 * @param {object|null|undefined} entity Gameplay entity.
 * @param {string} fallbackSoundId Logical default sound ID.
 * @param {object|null|undefined} manifest Active resolved media manifest.
 * @returns {string} Playable entity override or the logical default.
 */
function entitySoundId(entity, fallbackSoundId, manifest) {
  const overrideId = entity?.audioOverrideId
  return overrideId && manifest?.audio?.some((item) => item.soundId === overrideId)
    ? overrideId
    : fallbackSoundId
}

/**
 * Coordinates one React-owned gameplay screen around an imperative Pixi canvas.
 *
 * @param {object} props Validated level, player state, media, and callbacks.
 * @returns {import('react').JSX.Element} Active game view.
 */
export default function GameView({
  level,
  levelBest,
  cumulative,
  audio,
  onComplete,
  onAttemptFailed,
  onExit,
  devMode = false,
  onPreviousLevel,
  onNextLevel,
  totalLevels = 100,
  powerups = [],
  inventory = {},
  collectedCoins = {},
  onUsePowerup = () => false,
  onCoinCollected = () => false,
  mediaManifest,
  reducedMotion = false,
  tokenCollisionTolerance = 0,
  collisionGuideStyle,
  microProtocol = null,
}) {
  const [engine] = useState(
    () =>
      new GameEngine(level, {
        clock: () => performance.now(),
        generate: (value) => value,
        powerups,
        inventory: inputInventory(powerups, inventory, devMode),
        claimedCourseCoinIds: claimedCoinIds(level, collectedCoins),
        tokenCollisionTolerance,
      }),
  )
  const rendererRef = useRef(null)
  const adapterRef = useRef(null)
  const inputCleanupRef = useRef(() => {})
  const resizeCleanupRef = useRef(() => {})
  const engineDisposeTimerRef = useRef(null)
  const [hud, setHud] = useState(() => engine.snapshot())
  const [phase, setPhase] = useState('ready')
  const [message, setMessage] = useState('Click the token to begin')
  const [bonusPrompt, setBonusPrompt] = useState(false)
  const [debugVisible, setDebugVisible] = useState(devMode)
  const [rendererError, setRendererError] = useState(null)
  const [displayInventory, setDisplayInventory] = useState(() =>
    inputInventory(powerups, inventory, devMode),
  )

  /** Publishes a throttled serializable HUD snapshot to React state. */
  const publishHud = useCallback(() => {
    setHud(engine.snapshot())
    setDisplayInventory(
      Object.fromEntries(
        powerups.map((power) => [
          power.id,
          devMode
            ? 999
            : Number(engine.session.powerInventory.get(power.id)) || 0,
        ]),
      ),
    )
  }, [devMode, engine, powerups])

  /**
   * Activates a numbered engine power and persists consumption on success.
   *
   * @param {string} key Configured numeric power key.
   * @returns {void}
   */
  const activatePowerup = useCallback(
    (power) => {
      const available = Number(engine.session.powerInventory.get(power.id)) || 0
      if (available <= 0) {
        audio.play('power-unavailable')
        setMessage(`No ${power.name} charges available`)
        return false
      }
      if (!devMode && !onUsePowerup(power.id)) {
        audio.play('power-unavailable')
        return false
      }
      const result = engine.activatePowerByKey(power.key)
      if (result.activated) {
        audio.play(power.soundId)
        setMessage(`${power.name} activated`)
      } else {
        audio.play('power-unavailable')
      }
      publishHud()
      return result.activated
    },
    [audio, devMode, engine, onUsePowerup, publishHud],
  )

  useEffect(() => {
    const unsubscribers = [
      engine.events.subscribe('state.changed', ({ payload }) => {
        setPhase(payload.state)
      }),
      engine.events.subscribe('collision.started', ({ payload }) => {
        audio.play('collision')
        const remaining =
          engine.session.level.scoring.maximumCollisions - payload.count
        setMessage(
          remaining > 0
            ? `Hazard contact — ${remaining} remaining`
            : 'Maximum contacts reached — recalibrating',
        )
        publishHud()
      }),
      engine.events.subscribe('target.reached', ({ payload }) => {
        audio.play(entitySoundId(payload.target, 'target-reached', mediaManifest))
        setMessage('Target reached')
        publishHud()
      }),
      engine.events.subscribe('bonus.offered', () => {
        audio.play('bonus-offered')
        setBonusPrompt(true)
        setMessage('Bonus relay available — bank or pursue')
      }),
      engine.events.subscribe('coin.claimed', ({ payload }) => {
        if (onCoinCollected(payload.coin)) {
          audio.play(
            entitySoundId(payload.coin, 'coin-collected', mediaManifest),
          )
          setMessage(
            `Coin collected — +${Number(payload.coin.value) || 1} gold`,
          )
        }
        publishHud()
      }),
      engine.events.subscribe('switch.activated', ({ payload }) => {
        audio.play(
          entitySoundId(payload.switch, 'target-reached', mediaManifest),
        )
        setMessage(
          payload.active
            ? `${payload.switch.id} activated — barrier open`
            : `${payload.switch.id} toggled — barrier restored`,
        )
      }),
      engine.events.subscribe('attempt.restarted', () => {
        adapterRef.current?.resetAttempt()
        audio.play('attempt-failed')
        setBonusPrompt(false)
        setMessage('Attempt restarted — click the token to begin')
        onAttemptFailed()
        publishHud()
      }),
      engine.events.subscribe('attempt.completed', ({ payload }) => {
        audio.play('level-complete')
        setBonusPrompt(false)
        const score = payload.score
        onComplete({
          ...score,
          elapsedMs: engine.session.elapsedMs,
          actualDistance: engine.session.distance.actual,
          collisions: engine.session.collisions.count,
          earnedBonuses: engine.session.targets.earnedBonuses,
          bonusFailed: payload.bonusFailed,
        })
      }),
    ]
    const hudTimer = window.setInterval(publishHud, 90)
    return () => {
      window.clearInterval(hudTimer)
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [
    audio,
    engine,
    onAttemptFailed,
    onCoinCollected,
    onComplete,
    mediaManifest,
    publishHud,
  ])

  useEffect(() => {
    if (engineDisposeTimerRef.current !== null) {
      window.clearTimeout(engineDisposeTimerRef.current)
      engineDisposeTimerRef.current = null
    }

    return () => {
      inputCleanupRef.current()
      resizeCleanupRef.current()
      adapterRef.current?.destroy()
      // React Strict Mode immediately replays effects in development. Deferring
      // disposal lets that replay cancel the teardown while real unmounts still
      // release the engine on the next task.
      engineDisposeTimerRef.current = window.setTimeout(() => {
        engine.dispose()
        engineDisposeTimerRef.current = null
      }, 0)
    }
  }, [engine])

  /**
   * Connects the mounted Pixi renderer to engine, input, audio, and event adapters.
   *
   * @param {object} renderer Initialized Pixi scene renderer.
   * @returns {() => void} Adapter cleanup callback.
   */
  const onRendererReady = useCallback(
    async (app, container) => {
      if (!mediaManifest) throw new Error('The media manifest is not ready.')
      const assetCache = await sharedVectorAssetCache.loadManifest(mediaManifest)
      const renderer = await new PixiSceneRenderer({
        app,
        level,
        manifest: mediaManifest,
        assetCache,
        development: devMode,
        reducedMotion,
        tokenCollisionTolerance,
        collisionGuideStyle,
      }).build()
      rendererRef.current = renderer

      const controller = createInputController(() => engine.session.input, {
        onActivate: (mode) => {
          engine.startAttempt(mode)
          audio.play('drag-start')
          setMessage(
            mode === 'pointer'
              ? 'Token linked — move to guide, then click again to stop'
              : 'Keyboard link active — steer with arrow keys',
          )
        },
        onRelease: (reason) => engine.releaseAttempt(reason),
        onRestart: () => {
          engine.restart('manual')
        },
        onPower: (key) => {
          const power = powerups.find((item) => item.key === key)
          if (power) activatePowerup(power)
        },
        onInterrupt: (reason, wasActive) => {
          if (wasActive) setMessage(`Input interrupted: ${reason}`)
        },
      })
      const canvas = app.canvas
      canvas.setAttribute('role', 'application')
      canvas.setAttribute('aria-label', `${level.name} obstacle course`)
    /** @param {{x:number,y:number}} point Client coordinates in CSS pixels. @returns {{x:number,y:number}} Logical world coordinates. */
    const toWorld = ({ x, y }) => {
        const bounds = canvas.getBoundingClientRect()
        return screenToWorld(
          { x: x - bounds.left, y: y - bounds.top },
          renderer.viewport,
        )
      }
      const detachPointer = attachPointerInput({
        element: canvas,
        toWorld,
        onPress: (point) => {
          if (!['ready', 'bonus-ready'].includes(engine.machine.state)) return false
          const token = {
            ...engine.session.level.token,
            ...engine.session.token.position,
          }
          if (!tokenContainsPoint(token, point)) return false
          controller.setPointer(point)
          return controller.activate('pointer')
        },
        onMove: (point) => controller.setPointer(point),
        onRelease: (point, reason) => {
          controller.setPointer(point)
          controller.release(reason)
        },
        onInterrupt: (reason) => controller.interrupt(reason),
        isActive: () =>
          engine.session.input.active &&
          engine.session.input.mode === 'pointer',
      })
      const detachKeyboard = attachKeyboardInput({
        target: window,
        controller,
        visibilityTarget: document,
      })
      inputCleanupRef.current = () => {
        detachPointer()
        detachKeyboard()
      }

    /** Resizes the Pixi renderer to its current CSS pixel bounds. */
    const resize = () =>
        renderer.resize(container.clientWidth, container.clientHeight)
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(resize)
      observer?.observe(container)
      resizeCleanupRef.current = () => observer?.disconnect()

      const adapter = new PixiEngineAdapter({ engine, renderer })
      adapterRef.current = adapter
      adapter.start()
    },
    [
      activatePowerup,
      audio,
      devMode,
      engine,
      level,
      mediaManifest,
      powerups,
      reducedMotion,
      tokenCollisionTolerance,
      collisionGuideStyle,
    ],
  )

  /** @param {Error} error Pixi initialization failure. @returns {void} */
  const handleRendererError = useCallback((error) => {
    setRendererError(error)
  }, [])

  /** Restarts the same deterministic level layout and resets adapter time. */
  const restart = () => {
    if (engine.machine.state === 'ready') {
      setMessage('Chamber ready — click the token')
      return
    }
    engine.restart('manual')
  }

  /** Accepts the offered bonus and reactivates control at its checkpoint. */
  const pursueBonus = () => {
    engine.pursueBonus()
    audio.play('bonus-accepted')
    setBonusPrompt(false)
    setMessage('Bonus relay armed — reactivate at the checkpoint')
  }

  /** Banks the current result without pursuing another offered bonus. */
  const bankBonus = () => {
    engine.bankBonus()
    setBonusPrompt(false)
  }

  /** Toggles engine/Pixi diagnostics for the active game view. */
  const toggleDebug = () => {
    setDebugVisible((visible) => {
      const next = !visible
      if (rendererRef.current) {
        rendererRef.current.development = next
        rendererRef.current.debugGraphics.visible = next
      }
      return next
    })
  }

  return (
    <main className="game-screen">
      <GameHeader
        level={level}
        levelBest={levelBest}
        cumulative={cumulative}
        devMode={devMode}
        debugVisible={debugVisible}
        totalLevels={totalLevels}
        onExit={onExit}
        onRestart={restart}
        onPreviousLevel={onPreviousLevel}
        onNextLevel={onNextLevel}
        onToggleDebug={toggleDebug}
        microProtocol={microProtocol}
      />
      <section className="game-layout">
        <GameHud
          hud={hud}
          level={level}
          phase={phase}
          message={message}
          powerups={powerups}
          activePowerIds={[...engine.session.activePowers.keys()]}
          inventory={displayInventory}
          devMode={devMode}
          availableCoinCount={
            level.coins.length - engine.session.collectedCoinIds.size
          }
          onActivatePowerup={activatePowerup}
        />
        <div className="arena-shell">
          <div className="arena-corners" aria-hidden="true" />
          <PixiCanvas
            className="pixi-arena"
            ariaLabel={`${level.name} obstacle course`}
            onReady={onRendererReady}
            onError={handleRendererError}
          />
          {rendererError && (
            <div className="renderer-error" role="alert">
              WebGL renderer unavailable: {rendererError.message}
            </div>
          )}
        </div>
      </section>
      {bonusPrompt && (
        <BonusDialog
          reward={level.bonuses.rewardPerTarget}
          onBank={bankBonus}
          onPursue={pursueBonus}
        />
      )}
    </main>
  )
}

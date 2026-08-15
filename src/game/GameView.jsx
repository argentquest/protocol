import { useCallback, useEffect, useRef, useState } from 'react'
import BonusDialog from './components/BonusDialog.jsx'
import GameHeader from './components/GameHeader.jsx'
import GameHud from './components/GameHud.jsx'
import { GameEngine } from './engine/GameEngine.js'
import { tokenContainsPoint } from './engine/CollisionSystem.js'
import { createInputController } from './input/InputController.js'
import { attachKeyboardInput } from './input/KeyboardInput.js'
import { attachPointerInput } from './input/PointerInput.js'
import { ThreeEngineAdapter } from './rendering/three/ThreeEngineAdapter.js'
import { ThreeSceneRenderer } from './rendering/three/ThreeSceneRenderer.js'
import ThreeCanvas from './rendering/three/ThreeCanvas.jsx'

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
 * Coordinates one React-owned gameplay screen around an imperative Three.js canvas.
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
  const isMountedRef = useRef(true)
  const arenaShellRef = useRef(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [hud, setHud] = useState(() => engine.snapshot())
  const [phase, setPhase] = useState('ready')
  const [message, setMessage] = useState(
    level.shotMechanic
      ? 'Press the token, pull back to aim, then release to launch'
      : 'Click the token to begin',
  )
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
      if (engine.session.kinetic) {
        audio.play('power-unavailable')
        setMessage('Powers are offline in Ricochet mode')
        return false
      }
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
      engine.events.subscribe('shot.launched', ({ payload }) => {
        audio.play('drag-start')
        setMessage(`Shot ${payload.shot} launched — steering locked`)
        publishHud()
      }),
      engine.events.subscribe('shot.impacted', ({ payload }) => {
        audio.play('collision')
        setMessage(
          payload.response === 'stop'
            ? 'Arrestor engaged — aim the next shot'
            : 'Ricochet',
        )
      }),
      engine.events.subscribe('shot.stopped', () => {
        setMessage('Token stopped — click it or press Space to aim again')
        publishHud()
      }),
      engine.events.subscribe('vertical.launched', () => {
        setMessage('Ramp launch — clear the obstacle')
        publishHud()
      }),
      engine.events.subscribe('vertical.landed', () => {
        setMessage('Landing confirmed')
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
      engine.events.subscribe('attempt.restarted', ({ payload }) => {
        adapterRef.current?.resetAttempt()
        audio.play('attempt-failed')
        setBonusPrompt(false)
        setMessage(
          payload.reason === 'maximum-shots'
            ? 'Shot limit reached — chamber recalibrated'
            : 'Attempt restarted — click the token to begin',
        )
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
          shotsTaken: payload.shotsTaken,
          shotPar: payload.shotPar,
          shotRating: payload.shotRating,
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
    // React StrictMode replays the cleanup before the real mount, so the guard
    // must be reset to true whenever this effect (re)runs.
    isMountedRef.current = true
    if (engineDisposeTimerRef.current !== null) {
      window.clearTimeout(engineDisposeTimerRef.current)
      engineDisposeTimerRef.current = null
    }

    return () => {
      isMountedRef.current = false
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
   * Connects the mounted Three.js renderer to engine, input, audio, and event adapters.
   *
   * @param {object} renderer Initialized Three.js scene renderer.
   * @returns {() => void} Adapter cleanup callback.
   */
  const onRendererReady = useCallback(
    async (app, container) => {
      const renderer = await new ThreeSceneRenderer({
        app,
        level,
        development: devMode,
        reducedMotion,
        tokenCollisionTolerance,
      }).build()
      if (!isMountedRef.current) {
        renderer.destroy()
        return
      }
      rendererRef.current = renderer

      const controller = createInputController(() => engine.session.input, {
        onActivate: (mode) => {
          if (engine.session.kinetic) {
            const accepted = engine.beginKineticAim(mode)
            if (accepted) {
              setMessage(
                mode === 'pointer'
                  ? (engine.session.level.shotMechanic.inputStyle ??
                      'drag-release') === 'drag-release'
                    ? 'Pull opposite the launch direction, then release'
                    : 'Aim with the pointer, then click to launch'
                  : 'Hold an arrow direction, then press Space to launch',
              )
            }
            return accepted
          }
          engine.startAttempt(mode)
          audio.play('drag-start')
          setMessage(
            mode === 'pointer'
              ? 'Token linked — move to guide, then click again to stop'
              : 'Keyboard link active — steer with arrow keys',
          )
        },
        onRelease: (reason, intent) => {
          if (!engine.session.kinetic) return engine.releaseAttempt(reason)
          if (
            !['pointer-release', 'pointer-toggle', 'keyboard-toggle'].includes(
              reason,
            )
          ) {
            return engine.cancelKineticAim()
          }
          const inputStyle =
            engine.session.level.shotMechanic.inputStyle ?? 'drag-release'
          const aim =
            intent.mode === 'keyboard'
              ? {
                  x:
                    Number(intent.directions.has('ArrowRight')) -
                    Number(intent.directions.has('ArrowLeft')),
                  y:
                    Number(intent.directions.has('ArrowDown')) -
                    Number(intent.directions.has('ArrowUp')),
                }
              : inputStyle === 'drag-release'
                ? {
                    x:
                      engine.session.kinetic.aimStart.x -
                      intent.desiredPosition.x,
                    y:
                      engine.session.kinetic.aimStart.y -
                      intent.desiredPosition.y,
                  }
                : {
                    x:
                      intent.desiredPosition.x -
                      engine.session.token.position.x,
                    y:
                      intent.desiredPosition.y -
                      engine.session.token.position.y,
                  }
          const scale = engine.session.level.shotMechanic.aimDistanceForMaximumSpeed
          const queued = engine.queueKineticShot(
            intent.mode === 'keyboard'
              ? { x: aim.x * scale, y: aim.y * scale }
              : aim,
            intent.mode,
          )
          if (!queued) {
            engine.cancelKineticAim()
            setMessage('Pull farther from the token before releasing')
          }
          return queued
        },
        onRestart: () => {
          engine.restart('manual')
        },
        onPower: (key) => {
          const power = powerups.find((item) => item.key === key)
          if (power) activatePowerup(power)
        },
        onDirection: (directions) => {
          if (!engine.session.kinetic || engine.session.kinetic.phase !== 'aiming') {
            return
          }
          const x =
            Number(directions.has('ArrowRight')) -
            Number(directions.has('ArrowLeft'))
          const y =
            Number(directions.has('ArrowDown')) -
            Number(directions.has('ArrowUp'))
          const magnitude = Math.hypot(x, y)
          if (!magnitude) return
          const length = engine.session.level.shotMechanic.aimDistanceForMaximumSpeed
          controller.setPointer({
            x: engine.session.token.position.x + (x / magnitude) * length,
            y: engine.session.token.position.y + (y / magnitude) * length,
          })
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
        return renderer.screenToWorld({ x: x - bounds.left, y: y - bounds.top })
      }
      const detachPointer = attachPointerInput({
        element: canvas,
        toWorld,
        onPress: (point, event) => {
          const allowedState = engine.session.kinetic
            ? ['ready', 'bonus-ready', 'active-main', 'active-bonus'].includes(
                engine.machine.state,
              ) && engine.session.kinetic.phase === 'resting'
            : ['ready', 'bonus-ready'].includes(engine.machine.state)
          if (!allowedState) return false
          const token = {
            ...engine.session.level.token,
            ...engine.session.token.position,
          }
          const bounds = canvas.getBoundingClientRect()
          const screenPoint = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          }
          if (
            !renderer.tokenHitTest(screenPoint) &&
            !tokenContainsPoint(token, point)
          ) {
            return false
          }
          controller.setPointer({ ...engine.session.token.position })
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
          engine.session.input.mode === 'pointer' &&
          (!engine.session.kinetic || engine.session.kinetic.phase === 'aiming'),
        releaseOnPointerUp: () =>
          Boolean(engine.session.kinetic) &&
          (engine.session.level.shotMechanic.inputStyle ?? 'drag-release') ===
            'drag-release',
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

    /** Resizes the Three.js renderer to its current CSS pixel bounds. */
    const resize = () =>
        renderer.resize(container.clientWidth, container.clientHeight)
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(resize)
      observer?.observe(container)
      resizeCleanupRef.current = () => observer?.disconnect()

      const adapter = new ThreeEngineAdapter({ engine, renderer })
      adapterRef.current = adapter
      adapter.start()
      canvas.dataset.engineReady = 'true'
    },
    [
      activatePowerup,
      audio,
      devMode,
      engine,
      level,
      powerups,
      reducedMotion,
      tokenCollisionTolerance,
    ],
  )

  /** @param {Error} error Renderer initialization failure. @returns {void} */
  const handleRendererError = useCallback((error) => {
    setRendererError(error)
  }, [])

  /** Restarts the same deterministic level layout and resets adapter time. */
  const restart = () => {
    if (engine.machine.state === 'ready') {
      setMessage(
        engine.session.kinetic
          ? 'Chamber ready — click the token to aim'
          : 'Chamber ready — click the token',
      )
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

  /** Toggles engine/Three.js diagnostics for the active game view. */
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

  /** @param {number} azimuth Horizontal degrees. @param {number} elevation Vertical degrees. */
  const adjustCamera = (azimuth, elevation) => {
    rendererRef.current?.adjustCamera(azimuth, elevation)
  }

  /** Restores the default perspective camera. */
  const resetCamera = () => {
    rendererRef.current?.resetCamera()
  }

  /** Toggles the arena between its normal size and browser fullscreen. */
  const toggleMax = () => {
    const shell = arenaShellRef.current
    if (!shell) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else if (shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    /** Synchronizes React presentation state with the browser fullscreen element. */
    const onFullscreenChange = () => {
      setIsMaximized(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

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
        <div className="arena-shell" ref={arenaShellRef}>
          <div className="arena-corners" aria-hidden="true" />
          <button
            type="button"
            className="max-toggle"
            onClick={toggleMax}
            aria-label={isMaximized ? 'Exit fullscreen' : 'Fullscreen the play area'}
            title={isMaximized ? 'Exit fullscreen' : 'Fullscreen the play area'}
          >
            {isMaximized ? 'MIN' : 'MAX'}
          </button>
          <ThreeCanvas
            className="three-arena"
            ariaLabel={`${level.name} obstacle course`}
            onReady={onRendererReady}
            onError={handleRendererError}
          />
          <div
            className="camera-controls"
            role="group"
            aria-label="Camera angle controls"
          >
              <button
                type="button"
                onClick={() => adjustCamera(-15, 0)}
                aria-label="Rotate camera left"
                title="Rotate camera left"
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => adjustCamera(0, 8)}
                aria-label="Raise camera"
                title="Raise camera"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={resetCamera}
                aria-label="Reset camera angle"
                title="Reset camera angle"
              >
                ●
              </button>
              <button
                type="button"
                onClick={() => adjustCamera(0, -8)}
                aria-label="Lower camera"
                title="Lower camera"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => adjustCamera(15, 0)}
                aria-label="Rotate camera right"
                title="Rotate camera right"
              >
                ↷
              </button>
          </div>
          {rendererError && (
            <div className="renderer-error" role="alert">
              {rendererError.message}
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

import { useCallback, useEffect, useRef, useState } from 'react'
import BonusDialog from './components/BonusDialog.jsx'
import GameArena from './components/GameArena.jsx'
import GameHeader from './components/GameHeader.jsx'
import GameHud from './components/GameHud.jsx'
import {
  advanceTrackingObstacle,
  currentMovingObstacle,
  distance,
  followPointer,
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from './geometry/geometry.js'
import { findPath } from './generation/levelGenerator.js'
import { createSeededRandom } from './generation/seededRandom.js'
import useGameInput from './hooks/useGameInput.js'
import {
  buildInitialRuntime,
  EMPTY_HUD,
} from './runtime/gameRuntime.js'
import { calculateScore, directDistance } from './scoring/scoreCalculator.js'

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
  totalLevels = 10,
  powerups = [],
  inventory = {},
  collectedCoins = {},
  onUsePowerup = () => false,
  onCoinCollected = () => false,
  pointerResponsePerSecond = 8,
  keyboardSpeedUnitsPerSecond = 280,
}) {
  const svgRef = useRef(null)
  const tokenRef = useRef(null)
  const trailRef = useRef(null)
  const movingRefs = useRef(new Map())
  const trackingRefs = useRef(new Map())
  const trackingStatesRef = useRef(new Map())
  const frameRef = useRef(null)
  const attemptNumberRef = useRef(1)
  const runtimeRef = useRef(buildInitialRuntime(level, 1))
  const [hud, setHud] = useState({
    ...EMPTY_HUD,
    attainableMaximum: level.scoring.baseMaximum,
  })
  const [ghostTrails, setGhostTrails] = useState([])
  const [message, setMessage] = useState('Press and hold the token to begin')
  const [phase, setPhase] = useState('ready')
  const [flash, setFlash] = useState(false)
  const [visibleBonus, setVisibleBonus] = useState(null)
  const [bonusPrompt, setBonusPrompt] = useState(false)
  const [activePowerIds, setActivePowerIds] = useState([])
  const [routeScanPath, setRouteScanPath] = useState(null)
  const [availableCoins, setAvailableCoins] = useState(() =>
    level.coins.filter((coin) => !collectedCoins[`${level.id}:${coin.id}`]),
  )
  const availableCoinsRef = useRef(availableCoins)
  const [debugVisible, setDebugVisible] = useState(devMode)

  const staticObstacles = level.obstacles

  const updateAvailableCoins = useCallback((coins) => {
    availableCoinsRef.current = coins
    setAvailableCoins(coins)
  }, [])

  const collectCoinsAt = useCallback(
    (token, magnetRadius = 0) => {
      const collected = availableCoinsRef.current.filter(
        (coin) =>
          shapesIntersect(token, coin) ||
          (magnetRadius > 0 && distance(token, coin) <= magnetRadius),
      )
      if (!collected.length) return
      const collectedIds = new Set()
      for (const coin of collected) {
        if (onCoinCollected(coin)) {
          collectedIds.add(coin.id)
          audio.play('coinCollected')
        }
      }
      if (collectedIds.size) {
        updateAvailableCoins(
          availableCoinsRef.current.filter((coin) => !collectedIds.has(coin.id)),
        )
      }
    },
    [audio, onCoinCollected, updateAvailableCoins],
  )

  const isPowerActive = useCallback(
    (runtime, effect, now = performance.now()) =>
      Number(runtime.activePowers[effect]?.expiresAt) > now,
    [],
  )

  const updateTokenElement = useCallback((position) => {
    tokenRef.current?.setAttribute('transform', `translate(${position.x} ${position.y})`)
  }, [])

  const updateTrailElement = useCallback((trail) => {
    trailRef.current?.setAttribute(
      'points',
      trail.map((point) => `${point.x},${point.y}`).join(' '),
    )
  }, [])

  const scoreRuntime = useCallback(
    (runtime, elapsedMs = runtime.elapsedMs) => {
      const benchmark = directDistance(runtime.reachedPoints)
      return calculateScore({
        scoring: level.scoring,
        elapsedMs: Math.max(1, elapsedMs),
        actualDistance: Math.max(benchmark, runtime.actualDistance),
        benchmarkDistance: Math.max(1, benchmark),
        earnedBonusMaximum: runtime.earnedBonuses * level.bonuses.rewardPerTarget,
        collisions: runtime.collisions,
        bonusFailures: runtime.bonusFailures,
        bonusFailurePenaltyRate: level.bonuses.failurePenaltyRate,
      })
    },
    [level],
  )

  const publishHud = useCallback(
    (runtime, now, force = false) => {
      if (!force && now - runtime.lastHudAt < 90) return
      runtime.lastHudAt = now
      const score = scoreRuntime(runtime, runtime.elapsedMs)
      setHud({
        elapsedMs: runtime.elapsedMs,
        actualDistance: runtime.actualDistance,
        collisions: runtime.collisions,
        score: score.finalScore,
        attainableMaximum: score.attainableMaximum,
        earnedBonuses: runtime.earnedBonuses,
        fps: runtime.fps,
        timeFactor: score.timeFactor,
        routeFactor: score.routeFactor,
        totalPenalty: score.collisionPenalty + score.bonusPenalty,
      })
    },
    [scoreRuntime],
  )

  const setHazardTransforms = useCallback(
    (elapsedMs, deltaMs, tokenPosition) => {
      const moving = level.movingObstacles.map((obstacle) => {
        const current = currentMovingObstacle(obstacle, elapsedMs)
        movingRefs.current
          .get(obstacle.id)
          ?.setAttribute('transform', `translate(${current.x} ${current.y})`)
        return current
      })
      const tracking = level.trackingObstacles.map((obstacle) => {
        const state = advanceTrackingObstacle(
          obstacle,
          trackingStatesRef.current.get(obstacle.id),
          tokenPosition,
          deltaMs,
        )
        trackingStatesRef.current.set(obstacle.id, state)
        const current = { ...obstacle, x: state.x, y: state.y }
        trackingRefs.current
          .get(obstacle.id)
          ?.setAttribute('transform', `translate(${current.x} ${current.y})`)
        return current
      })
      return [...moving, ...tracking]
    },
    [level.movingObstacles, level.trackingObstacles],
  )

  const offerNextBonus = useCallback(
    (runtime) => {
      if (
        runtime.earnedBonuses >= level.bonuses.maximumTargets ||
        runtime.earnedBonuses >= level.bonusTargets.length
      ) {
        runtime.activeBonus = null
        setVisibleBonus(null)
        setMessage('Protocol complete — release to bank your score')
        return
      }

      const score = scoreRuntime(runtime)
      const chance = score.attainableMaximum
        ? score.finalScore / score.attainableMaximum
        : 0
      const random = createSeededRandom(
        `${level.seed}:attempt-${runtime.attemptNumber}:bonus-${runtime.earnedBonuses}`,
      )
      if (random() <= chance) {
        runtime.activeBonus = level.bonusTargets[runtime.earnedBonuses]
        setVisibleBonus(runtime.activeBonus)
        audio.play('bonusOffered')
        return true
      } else {
        runtime.activeBonus = null
        setVisibleBonus(null)
        setMessage('No relay signal — release to bank your score')
        return false
      }
    },
    [audio, level, scoreRuntime],
  )

  const targetReached = useCallback(
    (runtime, target, isBonus) => {
      runtime.mode = 'target-reached'
      runtime.lastReachedTarget = target
      runtime.reachedPoints.push({ x: target.x, y: target.y })
      if (isBonus) runtime.earnedBonuses += 1
      setPhase('target-reached')
      setVisibleBonus(null)
      audio.play('targetReached')
      const hasBonusOffer = offerNextBonus(runtime)
      if (hasBonusOffer) {
        const checkpoint = { x: target.x, y: target.y }
        runtime.dragging = false
        runtime.mode = 'bonus-prompt'
        runtime.pendingPoint = null
        runtime.tokenPosition = checkpoint
        runtime.lastSafe = checkpoint
        runtime.lastPointerPosition = checkpoint
        runtime.trail.push(checkpoint)
        if (
          runtime.pointerId !== null &&
          svgRef.current?.hasPointerCapture?.(runtime.pointerId)
        ) {
          svgRef.current.releasePointerCapture(runtime.pointerId)
        }
        runtime.pointerId = null
        runtime.inputMode = null
        runtime.pressedDirections.clear()
        updateTokenElement(checkpoint)
        updateTrailElement(runtime.trail)
        setPhase('bonus-prompt')
        setMessage('Bonus relay available — choose whether to bank or pursue')
        setBonusPrompt(true)
      }
      publishHud(runtime, performance.now(), true)
    },
    [
      audio,
      offerNextBonus,
      publishHud,
      updateTokenElement,
      updateTrailElement,
    ],
  )

  const resetAttempt = useCallback(
    (reason, preserveTrail = true) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging && runtime.mode === 'restarting') return
      runtime.dragging = false
      runtime.mode = 'restarting'
      if (preserveTrail && runtime.trail.length > 1) {
        setGhostTrails((existing) => [runtime.trail, ...existing].slice(0, 2))
      }
      if (runtime.pointerId !== null && svgRef.current?.hasPointerCapture?.(runtime.pointerId)) {
        svgRef.current.releasePointerCapture(runtime.pointerId)
      }
      onAttemptFailed()
      audio.play('attemptFailed')
      setVisibleBonus(null)
      setBonusPrompt(false)
      setActivePowerIds([])
      setRouteScanPath(null)
      trackingStatesRef.current.clear()
      publishHud(runtime, performance.now(), true)

      attemptNumberRef.current += 1
      const next = buildInitialRuntime(level, attemptNumberRef.current)
      runtimeRef.current = next
      updateTokenElement(next.tokenPosition)
      updateTrailElement([])
      setHud({ ...EMPTY_HUD, attainableMaximum: level.scoring.baseMaximum })
      setPhase('ready')
      setMessage(`${reason}. Press and hold the token to try again.`)
    },
    [
      audio,
      level,
      onAttemptFailed,
      publishHud,
      updateTokenElement,
      updateTrailElement,
    ],
  )

  const handleManualRestart = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.mode === 'restarting') return
    if (runtime.mode === 'ready') {
      setMessage('Chamber ready — press and hold the token')
      return
    }
    resetAttempt('Attempt restarted — chamber layout preserved')
  }, [resetAttempt])

  const completeAttempt = useCallback(
    (bonusFailed = false, allowPaused = false) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging && !allowPaused) return
      runtime.dragging = false
      runtime.elapsedMs = performance.now() - runtime.startedAt
      if (bonusFailed) {
        runtime.bonusFailures += 1
        setMessage('Relay lost — 20% protocol penalty applied')
      } else {
        setMessage('Protocol complete')
      }
      const result = scoreRuntime(runtime, runtime.elapsedMs)
      if (runtime.pointerId !== null && svgRef.current?.hasPointerCapture?.(runtime.pointerId)) {
        svgRef.current.releasePointerCapture(runtime.pointerId)
      }
      audio.play('levelComplete')
      setBonusPrompt(false)
      publishHud(runtime, performance.now(), true)
      onComplete({
        ...result,
        elapsedMs: runtime.elapsedMs,
        actualDistance: runtime.actualDistance,
        collisions: runtime.collisions,
        earnedBonuses: runtime.earnedBonuses,
        bonusFailed,
      })
    },
    [audio, onComplete, publishHud, scoreRuntime],
  )

  const pursueBonus = () => {
    const runtime = runtimeRef.current
    if (runtime.mode !== 'bonus-prompt') return
    runtime.mode = 'bonus-ready'
    setBonusPrompt(false)
    setPhase('bonus-ready')
    setMessage('Bonus relay active — press and hold the token to continue')
  }

  const bankBonusOffer = () => {
    completeAttempt(false, true)
  }

  const processMovement = useCallback(
    (now, movingObstacles) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging || !runtime.pendingPoint) return
      const desired = runtime.pendingPoint
      runtime.pendingPoint = null
      const allObstacles = [...staticObstacles, ...movingObstacles]
      const tokenAtLastSafe = { ...level.token, ...runtime.lastSafe }
      const swept = sweepShape(
        runtime.lastSafe,
        desired,
        tokenAtLastSafe,
        level.arena,
        allObstacles,
      )
      const traveled = distance(runtime.lastPointerPosition, desired)
      runtime.actualDistance += traveled
      runtime.lastPointerPosition = { ...desired }

      const collisionShielded =
        isPowerActive(runtime, 'fullShield', now) ||
        (swept.collisionType === 'obstacle' &&
          isPowerActive(runtime, 'obstacleShield', now))

      if (!swept.safe && !collisionShielded) {
        runtime.tokenPosition = { ...runtime.lastSafe }
        updateTokenElement(runtime.lastSafe)
        if (!runtime.collisionLatched) {
          runtime.collisionLatched = true
          runtime.collisionPointerRevision = runtime.pointerRevision
          runtime.trail.push({ ...swept.point }, { ...runtime.lastSafe })
          runtime.collisions += 1
          updateTrailElement(runtime.trail)
          audio.play('collision')
          setFlash(true)
          setTimeout(() => setFlash(false), 180)
          setMessage(
            runtime.collisions >= level.scoring.maximumCollisions
              ? 'Three hazard contacts — recalibrating level'
              : `Hazard contact — ${level.scoring.maximumCollisions - runtime.collisions} remaining`,
          )
          publishHud(runtime, now, true)
          if (runtime.collisions >= level.scoring.maximumCollisions) {
            resetAttempt('Three hazard contacts — recalibrating level')
          }
        }
        return
      }

      runtime.collisionLatched = false
      runtime.tokenPosition = { ...desired }
      const token = { ...level.token, ...desired }
      const actuallySafe =
        shapeInsideArena(token, level.arena) &&
        !allObstacles.some((obstacle) => shapesIntersect(token, obstacle))
      if (actuallySafe) runtime.lastSafe = { ...desired }
      runtime.trail.push({ ...desired })
      updateTokenElement(desired)
      updateTrailElement(runtime.trail)

      const magnet = powerups.find((powerup) => powerup.effect === 'coinMagnet')
      collectCoinsAt(
        token,
        magnet && isPowerActive(runtime, 'coinMagnet', now) ? magnet.radius : 0,
      )
      if (runtime.mode === 'dragging-main' && shapesIntersect(token, level.mainTarget)) {
        targetReached(runtime, level.mainTarget, false)
      } else if (runtime.mode === 'target-reached' && runtime.activeBonus) {
        if (!shapesIntersect(token, runtime.lastReachedTarget)) {
          runtime.mode = 'dragging-bonus'
          setPhase('dragging-bonus')
          setMessage('Bonus relay committed — reach it before releasing')
        }
      } else if (
        runtime.mode === 'dragging-bonus' &&
        runtime.activeBonus &&
        shapesIntersect(token, runtime.activeBonus)
      ) {
        targetReached(runtime, runtime.activeBonus, true)
      }

      publishHud(runtime, now)
    },
    [
      audio,
      collectCoinsAt,
      isPowerActive,
      level,
      powerups,
      publishHud,
      resetAttempt,
      staticObstacles,
      targetReached,
      updateTokenElement,
      updateTrailElement,
    ],
  )

  const activatePowerup = useCallback(
    (powerup) => {
      const runtime = runtimeRef.current
      const now = performance.now()
      if (runtime.startedAt <= 0 || runtime.mode === 'restarting') {
        audio.play('powerUnavailable')
        setMessage('Power unavailable until the attempt begins')
        return
      }
      if (isPowerActive(runtime, powerup.effect, now)) {
        audio.play('powerUnavailable')
        setMessage(`${powerup.name} is already active`)
        return
      }
      if (!onUsePowerup(powerup.id)) {
        audio.play('powerUnavailable')
        setMessage(`No ${powerup.name} charges available`)
        return
      }
      runtime.activePowers[powerup.effect] = {
        id: powerup.id,
        expiresAt: now + powerup.durationMs,
      }
      runtime.activePowerSignature = Object.keys(runtime.activePowers).sort().join('|')
      setActivePowerIds(Object.keys(runtime.activePowers))
      if (powerup.effect === 'routeScan') {
        const target = runtime.activeBonus ?? level.mainTarget
        setRouteScanPath(
          findPath({
            arena: level.arena,
            token: level.token,
            start: runtime.tokenPosition,
            target,
            obstacles: staticObstacles,
            gridSize: level.generation.pathGrid,
          }),
        )
      }
      audio.play(powerup.sound)
      setMessage(`${powerup.name} activated`)
    },
    [audio, isPowerActive, level, onUsePowerup, staticObstacles],
  )

  useEffect(() => {
    const animate = (now) => {
      const runtime = runtimeRef.current
      if (devMode) {
        if (!runtime.fpsWindowStartedAt) runtime.fpsWindowStartedAt = now
        runtime.fpsFrames += 1
        const fpsElapsed = now - runtime.fpsWindowStartedAt
        if (fpsElapsed >= 500) {
          runtime.fps = Math.round((runtime.fpsFrames * 1000) / fpsElapsed)
          runtime.fpsFrames = 0
          runtime.fpsWindowStartedAt = now
          setHud((current) => ({ ...current, fps: runtime.fps }))
        }
      }
      const activeEffects = Object.entries(runtime.activePowers)
        .filter(([, power]) => power.expiresAt > now)
        .map(([effect]) => effect)
      const activeSignature = activeEffects.sort().join('|')
      if (activeSignature !== (runtime.activePowerSignature ?? '')) {
        const previousEffects = Object.keys(runtime.activePowers)
        runtime.activePowers = Object.fromEntries(
          Object.entries(runtime.activePowers).filter(([, power]) => power.expiresAt > now),
        )
        runtime.shieldExpired =
          previousEffects.some(
            (effect) => effect === 'fullShield' || effect === 'obstacleShield',
          ) &&
          !activeEffects.some(
            (effect) => effect === 'fullShield' || effect === 'obstacleShield',
          )
        runtime.activePowerSignature = activeSignature
        setActivePowerIds(activeEffects)
        if (!activeEffects.includes('routeScan')) setRouteScanPath(null)
      }

      if (runtime.dragging || runtime.startedAt > 0) {
        runtime.elapsedMs = now - runtime.startedAt
        const frameDelta = runtime.lastFrameAt ? now - runtime.lastFrameAt : 0
        runtime.lastFrameAt = now
        const slowField = powerups.find((powerup) => powerup.effect === 'slowField')
        const speedMultiplier =
          slowField && isPowerActive(runtime, 'slowField', now)
            ? slowField.slowMultiplier
            : 1
        runtime.hazardElapsedMs += frameDelta * speedMultiplier
        const hazards = setHazardTransforms(
          runtime.hazardElapsedMs,
          frameDelta * speedMultiplier,
          runtime.tokenPosition,
        )
        if (runtime.shieldExpired) {
          const token = { ...level.token, ...runtime.tokenPosition }
          const safelyPlaced =
            shapeInsideArena(token, level.arena) &&
            ![...staticObstacles, ...hazards].some((obstacle) =>
              shapesIntersect(token, obstacle),
            )
          if (!safelyPlaced) {
            runtime.tokenPosition = { ...runtime.lastSafe }
            runtime.pointerTarget = { ...runtime.lastSafe }
            runtime.pendingPoint = null
            runtime.collisionLatched = false
            runtime.trail.push({ ...runtime.lastSafe })
            updateTokenElement(runtime.lastSafe)
            updateTrailElement(runtime.trail)
            setMessage('Shield expired — token returned to the last safe point')
          }
          runtime.shieldExpired = false
        }
        if (runtime.dragging) {
          const horizontal =
            Number(runtime.pressedDirections.has('ArrowRight')) -
            Number(runtime.pressedDirections.has('ArrowLeft'))
          const vertical =
            Number(runtime.pressedDirections.has('ArrowDown')) -
            Number(runtime.pressedDirections.has('ArrowUp'))
          if (runtime.inputMode === 'keyboard' && (horizontal || vertical)) {
            const magnitude = Math.hypot(horizontal, vertical)
            const movement =
              keyboardSpeedUnitsPerSecond * (Math.min(frameDelta, 50) / 1000)
            runtime.pendingPoint = {
              x: runtime.tokenPosition.x + (horizontal / magnitude) * movement,
              y: runtime.tokenPosition.y + (vertical / magnitude) * movement,
            }
            runtime.pointerRevision += 1
          } else if (
            runtime.pointerTarget &&
            (!runtime.collisionLatched ||
              runtime.pointerRevision !== runtime.collisionPointerRevision)
          ) {
            runtime.pendingPoint = followPointer(
              runtime.tokenPosition,
              runtime.pointerTarget,
              frameDelta,
              pointerResponsePerSecond,
            )
          } else if (!runtime.pendingPoint && !runtime.collisionLatched) {
            runtime.pendingPoint = { ...runtime.tokenPosition }
          }
          processMovement(now, hazards)
        }
        const magnet = powerups.find((powerup) => powerup.effect === 'coinMagnet')
        if (magnet && isPowerActive(runtime, 'coinMagnet', now)) {
          collectCoinsAt({ ...level.token, ...runtime.tokenPosition }, magnet.radius)
        }
        if (!runtime.dragging) publishHud(runtime, now)
      } else if (runtime.mode === 'ready') {
        setHazardTransforms(0, 0, runtime.tokenPosition)
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameRef.current)
    }
  }, [
    collectCoinsAt,
    devMode,
    isPowerActive,
    level.arena,
    level.token,
    keyboardSpeedUnitsPerSecond,
    powerups,
    pointerResponsePerSecond,
    processMovement,
    publishHud,
    setHazardTransforms,
    staticObstacles,
    updateTokenElement,
    updateTrailElement,
  ])

  useEffect(() => {
    const runtime = buildInitialRuntime(level, 1)
    runtimeRef.current = runtime
    attemptNumberRef.current = 1
    setGhostTrails([])
    setVisibleBonus(null)
    setBonusPrompt(false)
    setActivePowerIds([])
    setRouteScanPath(null)
    trackingStatesRef.current.clear()
    setHud({ ...EMPTY_HUD, attainableMaximum: level.scoring.baseMaximum })
    setPhase('ready')
    setMessage('Press and hold the token to begin')
    requestAnimationFrame(() => {
      updateTokenElement(runtime.tokenPosition)
      updateTrailElement([])
    })
  }, [
    level,
    updateTokenElement,
    updateTrailElement,
  ])

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useGameInput({
    level,
    audio,
    powerups,
    runtimeRef,
    svgRef,
    setPhase,
    setMessage,
    completeAttempt,
    resetAttempt,
    handleManualRestart,
    activatePowerup,
  })

  return (
    <main className={`game-screen ${flash ? 'is-collision' : ''}`}>
      <GameHeader
        level={level}
        levelBest={levelBest}
        cumulative={cumulative}
        devMode={devMode}
        debugVisible={debugVisible}
        totalLevels={totalLevels}
        onExit={onExit}
        onRestart={handleManualRestart}
        onPreviousLevel={onPreviousLevel}
        onNextLevel={onNextLevel}
        onToggleDebug={() => setDebugVisible((visible) => !visible)}
      />

      <section className="game-layout">
        <GameHud
          hud={hud}
          level={level}
          phase={phase}
          message={message}
          powerups={powerups}
          activePowerIds={activePowerIds}
          inventory={inventory}
          devMode={devMode}
          availableCoinCount={availableCoins.length}
          onActivatePowerup={activatePowerup}
        />
        <GameArena
          level={level}
          devMode={devMode}
          debugVisible={debugVisible}
          staticObstacles={staticObstacles}
          routeScanPath={routeScanPath}
          movingRefs={movingRefs}
          trackingRefs={trackingRefs}
          ghostTrails={ghostTrails}
          attemptNumber={attemptNumberRef.current}
          trailRef={trailRef}
          visibleBonus={visibleBonus}
          availableCoins={availableCoins}
          tokenRef={tokenRef}
          activePowerIds={activePowerIds}
          svgRef={svgRef}
          dragging={runtimeRef.current.dragging}
          mainTargetReached={runtimeRef.current.reachedPoints.length > 1}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </section>
      {bonusPrompt && (
        <BonusDialog
          reward={level.bonuses.rewardPerTarget}
          onBank={bankBonusOffer}
          onPursue={pursueBonus}
        />
      )}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { calculateScore, directDistance } from './scoring/scoreCalculator.js'
import SvgArena from './rendering/SvgArena.jsx'
import SvgShape from './rendering/SvgShape.jsx'

const EMPTY_HUD = {
  elapsedMs: 0,
  actualDistance: 0,
  collisions: 0,
  score: 0,
  attainableMaximum: 0,
  earnedBonuses: 0,
  fps: 0,
  timeFactor: 0,
  routeFactor: 0,
  totalPenalty: 0,
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`
}

function formatDistance(value) {
  return `${Math.round(value)}u`
}

function pointerToLogical(event, svg) {
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse())
  return { x: transformed.x, y: transformed.y }
}

function buildInitialRuntime(level, attemptNumber) {
  return {
    attemptNumber,
    mode: 'ready',
    dragging: false,
    pointerId: null,
    inputMode: null,
    pressedDirections: new Set(),
    pendingPoint: null,
    pointerTarget: null,
    pointerRevision: 0,
    collisionPointerRevision: -1,
    lastPointerPosition: { ...level.startPoint },
    tokenPosition: { ...level.startPoint },
    lastSafe: { ...level.startPoint },
    trail: [],
    actualDistance: 0,
    collisions: 0,
    bonusFailures: 0,
    earnedBonuses: 0,
    reachedPoints: [{ ...level.startPoint }],
    startedAt: 0,
    elapsedMs: 0,
    activeBonus: null,
    lastReachedTarget: null,
    collisionLatched: false,
    lastHudAt: 0,
    fps: 0,
    fpsFrames: 0,
    fpsWindowStartedAt: 0,
    hazardElapsedMs: 0,
    lastFrameAt: 0,
    activePowers: {},
    shieldExpired: false,
  }
}

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

  const beginAttempt = useCallback((point, pointerId, inputMode) => {
    const runtime = runtimeRef.current
    if (runtime.mode !== 'ready' && runtime.mode !== 'bonus-ready') return
    audio.ensureContext()
    audio.startMusic()
    runtime.pointerId = pointerId
    runtime.inputMode = inputMode
    runtime.dragging = true
    const pursuingBonus = runtime.mode === 'bonus-ready'
    runtime.mode = pursuingBonus ? 'dragging-bonus' : 'dragging-main'
    if (!pursuingBonus) {
      runtime.startedAt = performance.now()
      runtime.trail = [{ ...runtime.tokenPosition }]
    }
    runtime.lastPointerPosition = { ...point }
    runtime.pendingPoint = point
    runtime.pointerTarget = inputMode === 'mouse' ? point : null
    runtime.pointerRevision += 1
    setPhase(pursuingBonus ? 'dragging-bonus' : 'dragging-main')
    setMessage(pursuingBonus ? 'Bonus relay committed' : 'Main protocol target active')
    audio.play('dragStart')
  }, [audio])

  const finishAttempt = useCallback((releaseLabel) => {
    const runtime = runtimeRef.current
    if (!runtime.dragging) return
    runtime.pressedDirections.clear()
    if (runtime.mode === 'target-reached') {
      completeAttempt(false)
    } else if (runtime.mode === 'dragging-bonus') {
      completeAttempt(true)
    } else {
      resetAttempt(`${releaseLabel} before target — recalibrating level`)
    }
  }, [completeAttempt, resetAttempt])

  const handlePointerDown = (event) => {
    if (event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return
    const runtime = runtimeRef.current
    if (runtime.mode !== 'ready' && runtime.mode !== 'bonus-ready') return
    event.preventDefault()
    const point = pointerToLogical(event, svgRef.current)
    const token = { ...level.token, ...runtime.tokenPosition }
    const pointerMarker = { shape: 'circle', x: point.x, y: point.y, size: 2 }
    if (!shapesIntersect(token, pointerMarker)) return

    svgRef.current.setPointerCapture(event.pointerId)
    beginAttempt(point, event.pointerId, 'mouse')
  }

  const handlePointerMove = (event) => {
    const runtime = runtimeRef.current
    if (
      !runtime.dragging ||
      runtime.inputMode !== 'mouse' ||
      event.pointerId !== runtime.pointerId
    ) return
    event.preventDefault()
    runtime.pointerTarget = pointerToLogical(event, svgRef.current)
    runtime.pointerRevision += 1
  }

  const handlePointerUp = (event) => {
    const runtime = runtimeRef.current
    if (
      !runtime.dragging ||
      runtime.inputMode !== 'mouse' ||
      event.pointerId !== runtime.pointerId
    ) return
    event.preventDefault()
    finishAttempt('Mouse released')
  }

  useEffect(() => {
    const isTypingTarget = (event) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement

    const handleKeyDown = (event) => {
      if (isTypingTarget(event)) return
      const runtime = runtimeRef.current
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        if (runtime.dragging && runtime.inputMode === 'keyboard') {
          runtime.pressedDirections.add(event.key)
        }
        return
      }
      if (event.repeat) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (runtime.dragging && runtime.inputMode === 'keyboard') {
          finishAttempt('Keyboard hold released')
        } else if (runtime.mode === 'ready' || runtime.mode === 'bonus-ready') {
          beginAttempt(runtime.tokenPosition, null, 'keyboard')
          setMessage('Keyboard control active — steer with the arrow keys, Space to release')
        }
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        handleManualRestart()
        return
      }
      const powerup = powerups.find((candidate) => candidate.key === event.key)
      if (!powerup) return
      event.preventDefault()
      activatePowerup(powerup)
    }

    const handleKeyUp = (event) => {
      if (!event.key.startsWith('Arrow')) return
      runtimeRef.current.pressedDirections.delete(event.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    activatePowerup,
    beginAttempt,
    finishAttempt,
    handleManualRestart,
    powerups,
  ])

  const arenaPoints = useMemo(
    () => (level.arena.shape === 'polygon' ? level.arena.points : null),
    [level.arena],
  )

  return (
    <main className={`game-screen ${flash ? 'is-collision' : ''}`}>
      <header className="game-header">
        <div className="game-header__actions">
          <button className="icon-button" type="button" onClick={onExit} aria-label="Exit level">
            <span aria-hidden="true">←</span>
          </button>
          <button
            className="restart-button"
            type="button"
            onClick={handleManualRestart}
            aria-label="Restart attempt"
            title="Restart attempt (R)"
          >
            <span aria-hidden="true">↻</span>
            Restart
            <kbd>R</kbd>
          </button>
          {devMode && (
            <>
              <button
                className="dev-step-button"
                type="button"
                onClick={onPreviousLevel}
                disabled={level.number === 1}
                aria-label="Previous playtest level"
              >
                ‹
              </button>
              <button
                className="dev-step-button"
                type="button"
                onClick={onNextLevel}
                disabled={level.number === totalLevels}
                aria-label="Next playtest level"
              >
                ›
              </button>
              <button
                className={`debug-toggle ${debugVisible ? 'is-on' : ''}`}
                type="button"
                onClick={() => setDebugVisible((visible) => !visible)}
                aria-pressed={debugVisible}
              >
                Overlay
              </button>
            </>
          )}
        </div>
        <div>
          <p className="eyebrow">Protocol {String(level.number).padStart(2, '0')}</p>
          <h1>{level.name}</h1>
        </div>
        <div className="game-header__scores">
          <span>Level best</span>
          <strong>{levelBest.toLocaleString()}</strong>
          <span>Total</span>
          <strong>{cumulative.toLocaleString()}</strong>
        </div>
      </header>

      <section className="game-layout">
        <aside className="hud-panel" aria-label="Live attempt status">
          <div className="hud-readout hud-readout--primary">
            <span>Live score</span>
            <strong>{hud.score.toLocaleString()}</strong>
            <small>/ {hud.attainableMaximum.toLocaleString()}</small>
          </div>
          <div className="hud-grid">
            <div className="hud-readout">
              <span>Time</span>
              <strong>{formatTime(hud.elapsedMs)}</strong>
              <small>Par {formatTime(level.scoring.parTimeMs)}</small>
            </div>
            <div className="hud-readout">
              <span>Travel</span>
              <strong>{formatDistance(hud.actualDistance)}</strong>
              <small>Par {formatDistance(level.scoring.parDistance)}</small>
            </div>
          </div>
          <div className="collision-meter">
            <span>Hazard contacts</span>
            <div className="collision-pips" aria-label={`${hud.collisions} of 3 collisions`}>
              {Array.from({ length: 3 }, (_, index) => (
                <i key={index} className={index < hud.collisions ? 'is-hit' : ''} />
              ))}
            </div>
          </div>
          <div className="bonus-readout">
            <span>Bonus relays</span>
            <strong>
              {hud.earnedBonuses}/{level.bonuses.maximumTargets}
            </strong>
          </div>
          <p className="status-message" data-phase={phase}>
            <span className="status-dot" />
            {message}
          </p>
          <p className="hud-hint">
            Hold the mouse, or toggle keyboard control with Space and steer with the arrow keys.
            The token’s full shape must clear every edge.
          </p>
          <div className="power-tray" aria-label="Power-up inventory">
            {powerups.map((powerup) => {
              const active = activePowerIds.includes(powerup.effect)
              const quantity = devMode ? '∞' : Number(inventory[powerup.id]) || 0
              return (
                <button
                  key={powerup.id}
                  type="button"
                  className={`power-slot ${active ? 'is-active' : ''}`}
                  style={{ '--power-color': powerup.color }}
                  onClick={() => activatePowerup(powerup)}
                  aria-label={`${powerup.name}, ${quantity} available`}
                >
                  <kbd>{powerup.key}</kbd>
                  <span>{powerup.name}</span>
                  <strong>{quantity}</strong>
                </button>
              )
            })}
          </div>
          {devMode && (
            <div className="debug-panel" data-testid="playtest-diagnostics">
              <div className="debug-panel__heading">
                <span>Playtest diagnostics</span>
                <strong>{hud.fps} FPS</strong>
              </div>
              <dl>
                <div>
                  <dt>Seed</dt>
                  <dd>{level.seed}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>
                    {level.generationSummary.generatedObstacles}/
                    {level.generationSummary.requestedObstacles} obstacles
                  </dd>
                </div>
                <div>
                  <dt>Route nodes</dt>
                  <dd>{level.validatedPath?.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Trackers</dt>
                  <dd>{level.trackingObstacles.length}</dd>
                </div>
                <div>
                  <dt>Coins left</dt>
                  <dd>{availableCoins.length}</dd>
                </div>
                <div>
                  <dt>Time factor</dt>
                  <dd>{Math.round(hud.timeFactor * 100)}%</dd>
                </div>
                <div>
                  <dt>Route factor</dt>
                  <dd>{Math.round(hud.routeFactor * 100)}%</dd>
                </div>
                <div>
                  <dt>Penalty</dt>
                  <dd>{Math.round(hud.totalPenalty).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          )}
        </aside>

        <div className="arena-shell">
          <div className="arena-corners" aria-hidden="true" />
          <svg
            ref={svgRef}
            className={`game-arena ${runtimeRef.current.dragging ? 'is-dragging' : ''}`}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="application"
            aria-label={`${level.name} obstacle course`}
          >
            <defs>
              <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <pattern id="lab-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" className="grid-line" fill="none" />
              </pattern>
              <clipPath id={`arena-clip-${level.id}`}>
                <SvgArena arena={level.arena} />
              </clipPath>
            </defs>

            <g className="arena-base">
              <SvgArena arena={level.arena} />
            </g>
            <g clipPath={`url(#arena-clip-${level.id})`}>
              <rect className="arena-grid" width="1000" height="1000" fill="url(#lab-grid)" />
              <g className="arena-scanlines">
                <path d="M0 250 H1000 M0 500 H1000 M0 750 H1000" />
              </g>

              {devMode && debugVisible && (
                <g className="debug-layer" aria-hidden="true">
                  <polyline
                    className="debug-route"
                    points={(level.validatedPath ?? [])
                      .map((point) => `${point.x},${point.y}`)
                      .join(' ')}
                  />
                  {(level.validatedPath ?? []).map((point, index) => (
                    <circle
                      key={`${point.x}-${point.y}-${index}`}
                      className="debug-route-node"
                      cx={point.x}
                      cy={point.y}
                      r="5"
                    />
                  ))}
                  {staticObstacles.map((obstacle) => (
                    <SvgShape
                      key={`debug-${obstacle.id}`}
                      item={obstacle}
                      className="debug-hitbox"
                    />
                  ))}
                  {level.movingObstacles.map((obstacle) => (
                    <SvgShape
                      key={`envelope-${obstacle.id}`}
                      item={{
                        ...obstacle,
                        width:
                          obstacle.width +
                          (obstacle.axis === 'x' ? obstacle.amplitude * 2 : 0),
                        height:
                          obstacle.height +
                          (obstacle.axis === 'y' ? obstacle.amplitude * 2 : 0),
                      }}
                      className="debug-motion-envelope"
                    />
                  ))}
                  {level.trackingObstacles.map((obstacle) => (
                    <rect
                      key={`tracking-zone-${obstacle.id}`}
                      className="debug-tracking-zone"
                      x={obstacle.zone.x}
                      y={obstacle.zone.y}
                      width={obstacle.zone.width}
                      height={obstacle.zone.height}
                    />
                  ))}
                  <circle
                    className="debug-center"
                    cx={level.startPoint.x}
                    cy={level.startPoint.y}
                    r="8"
                  />
                  <text
                    className="debug-label"
                    x={level.startPoint.x + 14}
                    y={level.startPoint.y - 14}
                  >
                    START
                  </text>
                  <text
                    className="debug-label"
                    x={level.mainTarget.x + 18}
                    y={level.mainTarget.y - 18}
                  >
                    MAIN
                  </text>
                </g>
              )}
              {routeScanPath && (
                <polyline
                  className="power-route-scan"
                  points={routeScanPath.map((point) => `${point.x},${point.y}`).join(' ')}
                  aria-hidden="true"
                />
              )}

              <g className="obstacle-layer">
                {staticObstacles.map((obstacle) => (
                  <SvgShape key={obstacle.id} item={obstacle} className="obstacle">
                    <span />
                  </SvgShape>
                ))}
                {level.movingObstacles.map((obstacle) => (
                  <SvgShape
                    key={obstacle.id}
                    ref={(element) => {
                      if (element) movingRefs.current.set(obstacle.id, element)
                      else movingRefs.current.delete(obstacle.id)
                    }}
                    item={obstacle}
                    className="obstacle obstacle--moving"
                  />
                ))}
                {level.trackingObstacles.map((obstacle) => (
                  <SvgShape
                    key={obstacle.id}
                    ref={(element) => {
                      if (element) trackingRefs.current.set(obstacle.id, element)
                      else trackingRefs.current.delete(obstacle.id)
                    }}
                    item={obstacle}
                    className="obstacle obstacle--tracking"
                  >
                    <circle className="tracking-eye" r={Math.min(obstacle.width, obstacle.height) * 0.16} />
                  </SvgShape>
                ))}
              </g>

              <g className="trail-layer">
                {ghostTrails.map((trail, index) => (
                  <polyline
                    key={`${attemptNumberRef.current}-${index}`}
                    className="ghost-trail"
                    points={trail.map((point) => `${point.x},${point.y}`).join(' ')}
                  />
                ))}
                <polyline ref={trailRef} className="active-trail" points="" />
              </g>

              <g className="target-layer">
                <SvgShape
                  item={level.mainTarget}
                  className={`target target--main ${
                    runtimeRef.current.reachedPoints.length > 1 ? 'is-reached' : ''
                  }`}
                >
                  <circle className="target-ring" r={level.mainTarget.width * 0.68} />
                </SvgShape>
                {visibleBonus && (
                  <SvgShape item={visibleBonus} className="target target--bonus">
                    <circle className="target-ring" r={visibleBonus.width * 0.7} />
                  </SvgShape>
                )}
              </g>

              <g className="coin-layer">
                {availableCoins.map((coin) => (
                  <SvgShape key={coin.id} item={coin} className="course-coin">
                    <circle className="coin-core" r={coin.width * 0.18} />
                  </SvgShape>
                ))}
              </g>

              <g className="token-layer">
                <SvgShape ref={tokenRef} item={level.token} className="token">
                  {activePowerIds.includes('obstacleShield') && (
                    <circle className="power-aura power-aura--obstacle" r={level.token.width * 0.78} />
                  )}
                  {activePowerIds.includes('fullShield') && (
                    <circle className="power-aura power-aura--full" r={level.token.width * 0.9} />
                  )}
                  <circle className="token-core" r={Math.max(5, level.token.width * 0.13)} />
                </SvgShape>
              </g>
            </g>

            {arenaPoints && (
              <polyline
                className="arena-outline"
                points={`${arenaPoints.map((point) => point.join(',')).join(' ')} ${arenaPoints[0].join(',')}`}
              />
            )}
          </svg>
          <div className="arena-label arena-label--top">PATH PROTOCOL // LIVE CHAMBER</div>
          <div className="arena-label arena-label--bottom">
            SEED {level.seed.split('-').slice(-2).join('-').toUpperCase()}
          </div>
        </div>
      </section>
      {bonusPrompt && (
        <div className="bonus-dialog-backdrop">
          <section
            className="bonus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bonus-dialog-title"
          >
            <p className="eyebrow">Optional relay detected</p>
            <h2 id="bonus-dialog-title">Bonus target available</h2>
            <p>
              Bank the score you have now, or pursue the relay for up to{' '}
              {level.bonuses.rewardPerTarget.toLocaleString()} extra points.
            </p>
            <p className="bonus-dialog__warning">
              Pursuing restarts your drag at this target. The clock keeps running, and releasing
              before the bonus target applies a 20% penalty.
            </p>
            <div className="bonus-dialog__actions">
              <button className="secondary-button" type="button" onClick={bankBonusOffer}>
                Bank score
              </button>
              <button className="primary-button" type="button" onClick={pursueBonus} autoFocus>
                OK — pursue bonus
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  currentMovingObstacle,
  distance,
  shapesIntersect,
  sweepShape,
} from './geometry/geometry.js'
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
    pendingPoint: null,
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
}) {
  const svgRef = useRef(null)
  const tokenRef = useRef(null)
  const trailRef = useRef(null)
  const movingRefs = useRef(new Map())
  const frameRef = useRef(null)
  const restartTimerRef = useRef(null)
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

  const staticObstacles = level.obstacles

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
      })
    },
    [scoreRuntime],
  )

  const setMovingTransforms = useCallback(
    (elapsedMs) => {
      return level.movingObstacles.map((obstacle) => {
        const current = currentMovingObstacle(obstacle, elapsedMs)
        movingRefs.current
          .get(obstacle.id)
          ?.setAttribute('transform', `translate(${current.x} ${current.y})`)
        return current
      })
    },
    [level.movingObstacles],
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
        setMessage('Bonus relay available — release to bank or keep moving to pursue')
        audio.play('bonusOffered')
      } else {
        runtime.activeBonus = null
        setVisibleBonus(null)
        setMessage('No relay signal — release to bank your score')
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
      offerNextBonus(runtime)
      publishHud(runtime, performance.now(), true)
    },
    [audio, offerNextBonus, publishHud],
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
      setPhase('failed')
      setVisibleBonus(null)
      setMessage(reason)
      publishHud(runtime, performance.now(), true)

      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        attemptNumberRef.current += 1
        const next = buildInitialRuntime(level, attemptNumberRef.current)
        runtimeRef.current = next
        updateTokenElement(next.tokenPosition)
        updateTrailElement([])
        setHud({ ...EMPTY_HUD, attainableMaximum: level.scoring.baseMaximum })
        setPhase('ready')
        setMessage('Press and hold the token to begin')
      }, 650)
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

  const completeAttempt = useCallback(
    (bonusFailed = false) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging) return
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

  const processMovement = useCallback(
    (now) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging || !runtime.pendingPoint) return
      runtime.elapsedMs = now - runtime.startedAt
      const desired = runtime.pendingPoint
      runtime.pendingPoint = null
      const moving = setMovingTransforms(runtime.elapsedMs)
      const allObstacles = [...staticObstacles, ...moving]
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

      if (!swept.safe) {
        runtime.tokenPosition = { ...runtime.lastSafe }
        updateTokenElement(runtime.lastSafe)
        if (!runtime.collisionLatched) {
          runtime.collisionLatched = true
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
      runtime.lastSafe = { ...desired }
      runtime.trail.push({ ...desired })
      updateTokenElement(desired)
      updateTrailElement(runtime.trail)

      const token = { ...level.token, ...desired }
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
      level,
      publishHud,
      resetAttempt,
      setMovingTransforms,
      staticObstacles,
      targetReached,
      updateTokenElement,
      updateTrailElement,
    ],
  )

  useEffect(() => {
    const animate = (now) => {
      const runtime = runtimeRef.current
      if (runtime.dragging) processMovement(now)
      else if (runtime.mode === 'ready') setMovingTransforms(0)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameRef.current)
      clearTimeout(restartTimerRef.current)
    }
  }, [processMovement, setMovingTransforms])

  useEffect(() => {
    const runtime = buildInitialRuntime(level, 1)
    runtimeRef.current = runtime
    attemptNumberRef.current = 1
    setGhostTrails([])
    setVisibleBonus(null)
    setHud({ ...EMPTY_HUD, attainableMaximum: level.scoring.baseMaximum })
    setPhase('ready')
    setMessage('Press and hold the token to begin')
    requestAnimationFrame(() => {
      updateTokenElement(runtime.tokenPosition)
      updateTrailElement([])
    })
  }, [level, updateTokenElement, updateTrailElement])

  const handlePointerDown = (event) => {
    if (event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return
    const runtime = runtimeRef.current
    if (runtime.mode !== 'ready') return
    event.preventDefault()
    audio.ensureContext()
    audio.startMusic()
    const point = pointerToLogical(event, svgRef.current)
    const token = { ...level.token, ...runtime.tokenPosition }
    const pointerMarker = { shape: 'circle', x: point.x, y: point.y, size: 2 }
    if (!shapesIntersect(token, pointerMarker)) return

    svgRef.current.setPointerCapture(event.pointerId)
    runtime.pointerId = event.pointerId
    runtime.dragging = true
    runtime.mode = 'dragging-main'
    runtime.startedAt = performance.now()
    runtime.trail = [{ ...runtime.tokenPosition }]
    runtime.lastPointerPosition = { ...point }
    runtime.pendingPoint = point
    setPhase('dragging-main')
    setMessage('Main protocol target active')
    audio.play('dragStart')
  }

  const handlePointerMove = (event) => {
    const runtime = runtimeRef.current
    if (!runtime.dragging || event.pointerId !== runtime.pointerId) return
    event.preventDefault()
    runtime.pendingPoint = pointerToLogical(event, svgRef.current)
  }

  const handlePointerUp = (event) => {
    const runtime = runtimeRef.current
    if (!runtime.dragging || event.pointerId !== runtime.pointerId) return
    event.preventDefault()
    if (runtime.mode === 'target-reached') {
      completeAttempt(false)
    } else if (runtime.mode === 'dragging-bonus') {
      completeAttempt(true)
    } else {
      resetAttempt('Mouse released before target — recalibrating level')
    }
  }

  const arenaPoints = useMemo(
    () => (level.arena.shape === 'polygon' ? level.arena.points : null),
    [level.arena],
  )

  return (
    <main className={`game-screen ${flash ? 'is-collision' : ''}`}>
      <header className="game-header">
        <button className="icon-button" type="button" onClick={onExit} aria-label="Exit level">
          <span aria-hidden="true">←</span>
        </button>
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
          <p className="hud-hint">Hold the mouse. The token’s full shape must clear every edge.</p>
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

              <g className="token-layer">
                <SvgShape ref={tokenRef} item={level.token} className="token">
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
    </main>
  )
}

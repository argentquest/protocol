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
    fps: 0,
    fpsFrames: 0,
    fpsWindowStartedAt: 0,
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
}) {
  const svgRef = useRef(null)
  const tokenRef = useRef(null)
  const trailRef = useRef(null)
  const movingRefs = useRef(new Map())
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
  const [debugVisible, setDebugVisible] = useState(devMode)

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
        fps: runtime.fps,
        timeFactor: score.timeFactor,
        routeFactor: score.routeFactor,
        totalPenalty: score.collisionPenalty + score.bonusPenalty,
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
      setVisibleBonus(null)
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
      staticObstacles,
      targetReached,
      updateTokenElement,
      updateTrailElement,
    ],
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
      if (runtime.dragging) {
        runtime.elapsedMs = now - runtime.startedAt
        const movingObstacles = setMovingTransforms(runtime.elapsedMs)
        processMovement(now, movingObstacles)
      } else if (runtime.mode === 'ready') {
        setMovingTransforms(0)
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameRef.current)
    }
  }, [devMode, processMovement, setMovingTransforms])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.key.toLowerCase() !== 'r' ||
        event.repeat ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      event.preventDefault()
      handleManualRestart()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleManualRestart])

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
                disabled={level.number === 10}
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
          <p className="hud-hint">Hold the mouse. The token’s full shape must clear every edge.</p>
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

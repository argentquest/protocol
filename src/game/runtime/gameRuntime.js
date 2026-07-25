export const EMPTY_HUD = {
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

export function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`
}

export function formatDistance(value) {
  return `${Math.round(value)}u`
}

export function pointerToLogical(event, svg) {
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse())
  return { x: transformed.x, y: transformed.y }
}

export function buildInitialRuntime(level, attemptNumber) {
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

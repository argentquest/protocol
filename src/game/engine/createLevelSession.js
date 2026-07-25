import { generateLevel } from '../generation/levelGenerator.js'
import { currentMovingObstacle } from '../geometry/geometry.js'

function copyPoint(point) {
  return { x: point.x, y: point.y }
}

function createTrackingState(obstacle) {
  return {
    id: obstacle.id,
    x: obstacle.x,
    y: obstacle.y,
    velocityX: 0,
    velocityY: 0,
    headingRadians: 0,
  }
}

export function createLevelSession(
  levelConfig,
  {
    attemptNumber = 1,
    generatedLevel = null,
    generate = generateLevel,
    tokenCollisionTolerance = 0,
  } = {},
) {
  const level = generatedLevel ?? generate(levelConfig)
  const start = copyPoint(level.startPoint)
  return {
    level,
    levelId: level.id,
    attemptNumber,
    simulationTimeMs: 0,
    hazardTimeMs: 0,
    startedAtMs: null,
    elapsedMs: 0,
    performance: {
      fps: 0,
      renderedFrames: 0,
      windowStartedAt: null,
    },
    token: {
      position: copyPoint(start),
      previousPosition: copyPoint(start),
      lastSafePosition: copyPoint(start),
      velocity: { x: 0, y: 0 },
    },
    input: {
      mode: null,
      active: false,
      desiredPosition: copyPoint(start),
      directions: new Set(),
      requestedPowerKey: null,
    },
    collisions: {
      count: 0,
      latched: false,
      latchedPosition: null,
      scoreMultiplier: 1,
      tokenToleranceUnits: Math.max(
        0,
        Number(tokenCollisionTolerance) || 0,
      ),
    },
    distance: {
      actual: 0,
      reachedPoints: [copyPoint(start)],
    },
    targets: {
      mainReached: false,
      earnedBonuses: 0,
      activeBonusIndex: null,
      bonusFailures: 0,
    },
    trails: {
      active: [copyPoint(start)],
      ghosts: [],
      maximumSamples: 512,
      maximumGhosts: 2,
    },
    movingObstacles: level.movingObstacles.map((obstacle) => {
      const initial = currentMovingObstacle(obstacle, 0)
      return {
        ...obstacle,
        currentX: initial.x,
        currentY: initial.y,
      }
    }),
    trackingObstacles: level.trackingObstacles.map(createTrackingState),
    activePowers: new Map(),
    powerInventory: new Map(),
    routeScanPath: null,
    collectedCoinIds: new Set(),
    disposed: false,
  }
}

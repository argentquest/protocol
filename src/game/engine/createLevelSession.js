import { generateLevel } from '../generation/levelGenerator.js'
import { currentMovingObstacle } from '../geometry/geometry.js'
import { resolveDynamicObstacles } from './DynamicObstacleSystem.js'
import { surfaceHeightAt, supportSurfaceAt } from './TerrainSystem.js'

/** @pure @param {{x:number,y:number}} point World point. @returns {{x:number,y:number}} Detached point copy. */
function copyPoint(point) {
  return { x: point.x, y: point.y }
}

/**
 * Creates mutable deterministic simulation state for a tracking obstacle.
 *
 * @pure
 * @param {object} obstacle Tracking obstacle configuration.
 * @returns {object} Position, velocity, and heading state in world units.
 */
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

/**
 * Creates all mutable engine-owned state for one deterministic level attempt.
 *
 * @param {object} levelConfig Validated authored level configuration.
 * @param {object} [options] Session options.
 * @param {number} [options.attemptNumber=1] One-based attempt number.
 * @param {object|null} [options.generatedLevel=null] Existing deterministic layout for restart.
 * @param {(level: object) => object} [options.generate] Deterministic generator.
 * @param {number} [options.tokenCollisionTolerance=0] Edge inset in logical world units.
 * @returns {object} Mutable framework-neutral level session.
 */
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
  const authoredStartElevation =
    level.startPoint.elevation ?? level.token.elevation
  const highestStartSurface = surfaceHeightAt(level, start)
  const initialElevation =
    authoredStartElevation ?? highestStartSurface.height
  const initialSupport = supportSurfaceAt(
    level,
    start,
    initialElevation,
    level.verticalPhysics?.maximumStepHeight ?? level.token.size * 0.35,
  )
  const startsGrounded =
    Math.abs(initialElevation - initialSupport.height) < 1e-7
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
      lastRestPosition: copyPoint(start),
      velocity: { x: 0, y: 0 },
      elevation: initialElevation,
      previousElevation: initialElevation,
      verticalVelocity: 0,
      motionSegments: [],
    },
    vertical: level.verticalPhysics
      ? {
          grounded: startsGrounded,
          surfaceId: startsGrounded ? initialSupport.id : null,
          rampLatchId: null,
        }
      : null,
    input: {
      mode: null,
      active: false,
      desiredPosition: copyPoint(start),
      directions: new Set(),
      requestedPowerKey: null,
    },
    kinetic: level.shotMechanic
      ? {
          phase: 'resting',
          launchRequested: false,
          launchVelocity: null,
          shotsTaken: 0,
          impactsThisShot: 0,
          aimStart: copyPoint(start),
        }
      : null,
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
    dynamicObstacles: resolveDynamicObstacles(
      level.dynamicObstacles ?? [],
      0,
    ),
    switchStates: new Map(
      (level.switches ?? []).map((item) => [
        item.id,
        { active: false, openUntilMs: null, contacting: false },
      ]),
    ),
    activePowers: new Map(),
    powerInventory: new Map(),
    routeScanPath: null,
    collectedCoinIds: new Set(),
    disposed: false,
  }
}

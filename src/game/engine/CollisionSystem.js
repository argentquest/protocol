import {
  distance,
  insetShape,
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from '../geometry/geometry.js'
import { advanceTokenMotion } from './MovementSystem.js'

function currentToken(session, position) {
  return insetShape(
    { ...session.level.token, x: position.x, y: position.y },
    session.collisions.tokenToleranceUnits,
  )
}

/**
 * Tests whether the complete token shape contains a world point.
 *
 * @pure
 * @param {object} token Token collision geometry.
 * @param {import('../types.js').Point} point Point in logical world units.
 * @returns {boolean} Whether the point touches the token.
 */
export function tokenContainsPoint(token, point) {
  return shapesIntersect(token, {
    shape: 'circle',
    x: point.x,
    y: point.y,
    width: 0.01,
    height: 0.01,
  })
}

/**
 * Advances token motion, performs swept collision, and mutates session state.
 *
 * @param {object} session Active engine session.
 * @param {number} stepMs Fixed-step duration in milliseconds.
 * @param {object} [options] Time-resolved collision inputs.
 * @param {object[]} [options.obstacles] Current obstacle shapes.
 * @param {object[]} [options.previousObstacles=options.obstacles] Obstacle shapes from the previous fixed step.
 * @param {boolean} [options.obstacleShield=false] Ignore obstacle collisions.
 * @param {boolean} [options.fullShield=false] Ignore obstacle and boundary collisions.
 * @returns {object} Movement and discrete collision outcome.
 */
export function advanceTokenWithCollisions(
  session,
  stepMs,
  {
    obstacles = session.level.obstacles,
    previousObstacles = obstacles,
    obstacleShield = false,
    fullShield = false,
  } = {},
) {
  if (!session.input.active) {
    return {
      moved: false,
      collision: false,
      collisionStarted: false,
      collisionType: null,
      maximumCollisions: false,
      point: { ...session.token.position },
      traveled: 0,
    }
  }
  const previous = { ...session.token.position }
  const motion = advanceTokenMotion({
    position: session.token.position,
    velocity: session.token.velocity,
    input: session.input,
    movement: session.level.movement,
    stepMs,
  })
  const swept = sweepShape(
    session.token.lastSafePosition,
    motion.position,
    currentToken(session, session.token.lastSafePosition),
    session.level.arena,
    obstacles,
    previousObstacles,
  )
  const shielded =
    fullShield || (swept.collisionType === 'obstacle' && obstacleShield)

  if (!swept.safe && !shielded) {
    session.token.position = { ...session.token.lastSafePosition }
    session.token.previousPosition = previous
    session.token.velocity = { x: 0, y: 0 }
    let collisionStarted = false
    if (!session.collisions.latched) {
      session.collisions.latched = true
      session.collisions.latchedPosition = {
        ...session.token.lastSafePosition,
      }
      session.collisions.count += 1
      collisionStarted = true
    }
    return {
      moved: false,
      collision: true,
      collisionStarted,
      collisionType: swept.collisionType,
      maximumCollisions:
        session.collisions.count >= session.level.scoring.maximumCollisions,
      point: swept.point,
      traveled: 0,
    }
  }

  session.token.previousPosition = previous
  session.token.position = motion.position
  session.token.velocity = motion.velocity
  if (session.collisions.latched) {
    const rearmDistance =
      Math.min(session.level.token.width, session.level.token.height) / 4
    if (
      distance(
        motion.position,
        session.collisions.latchedPosition ?? session.token.lastSafePosition,
      ) >= rearmDistance
    ) {
      session.collisions.latched = false
      session.collisions.latchedPosition = null
    }
  }
  const token = currentToken(session, motion.position)
  const geometricallySafe =
    shapeInsideArena(token, session.level.arena) &&
    !obstacles.some((obstacle) => shapesIntersect(token, obstacle))
  if (geometricallySafe) {
    session.token.lastSafePosition = { ...motion.position }
  }
  const traveled = distance(previous, motion.position)
  session.distance.actual += traveled
  return {
    moved: traveled > 0,
    collision: false,
    collisionStarted: false,
    collisionType: null,
    maximumCollisions: false,
    point: { ...motion.position },
    traveled,
  }
}

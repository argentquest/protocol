import {
  distance,
  insetShape,
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from '../geometry/geometry.js'
import { advanceTokenMotion } from './MovementSystem.js'
import { resolveForceFieldAcceleration } from './ForceFieldSystem.js'
import { terrainMotionAt } from './TerrainSystem.js'

/**
 * Identifies which wall (if any) the swept token collides with first.
 *
 * @pure
 * @param {{x:number,y:number}} from Last safe token center in world units.
 * @param {{x:number,y:number}} to Requested token center in world units.
 * @param {object} shape Authoritative token collision shape.
 * @param {object[]} walls Wall entities with collision geometry.
 * @returns {{hit:boolean, wall:object|null, point:{x:number,y:number}|null}} Wall hit info.
 */
function probeWallCollision(from, to, shape, walls) {
  if (!walls || walls.length === 0) {
    return { hit: false, wall: null, point: null }
  }
  const travel = distance(from, to)
  const smallestDimension = Math.min(shape.width, shape.height)
  const sampleDistance = Math.max(2, smallestDimension / 4)
  const steps = Math.max(1, Math.ceil(travel / sampleDistance))
  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps
    const candidate = {
      ...shape,
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    }
    for (const wall of walls) {
      if (shapesIntersect(candidate, wall)) {
        return { hit: true, wall, point: { ...candidate } }
      }
    }
  }
  return { hit: false, wall: null, point: null }
}

/**
 * Builds the token's authoritative collision shape at a candidate center.
 *
 * @pure
 * @param {object} session Active level session.
 * @param {{x:number,y:number}} position Candidate center in world units.
 * @returns {object} Inset token collision shape.
 */
function currentToken(session, position) {
  return insetShape(
    {
      ...session.level.token,
      x: position.x,
      y: position.y,
      elevation: session.token.elevation,
    },
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
 * @param {object[]} [options.walls=[]] Wall entities; bounce on contact without counting as a hazard.
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
    walls = [],
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
  session.token.motionSegments = []
  const forceAcceleration = resolveForceFieldAcceleration(
    session.level.forceFields ?? [],
    currentToken(session, session.token.position),
  )
  const terrainAcceleration = terrainMotionAt(session).acceleration
  const motion = advanceTokenMotion({
    position: session.token.position,
    velocity: session.token.velocity,
    input: session.input,
    movement: session.level.movement,
    stepMs,
    externalAcceleration: {
      x: forceAcceleration.x + terrainAcceleration.x,
      y: forceAcceleration.y + terrainAcceleration.y,
    },
  })
  const tokenShape = currentToken(session, session.token.lastSafePosition)
  const wallHit = probeWallCollision(
    session.token.lastSafePosition,
    motion.position,
    tokenShape,
    walls,
  )
  if (wallHit.hit && !fullShield) {
    session.token.position = { ...session.token.lastSafePosition }
    session.token.previousPosition = previous
    session.token.velocity = { x: 0, y: 0 }
    return {
      moved: false,
      collision: true,
      collisionStarted: false,
      collisionType: 'wall',
      wallId: wallHit.wall.id,
      point: wallHit.point,
      maximumCollisions: false,
      traveled: 0,
    }
  }
  const swept = sweepShape(
    session.token.lastSafePosition,
    motion.position,
    tokenShape,
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
  session.token.motionSegments = [{ from: previous, to: { ...motion.position } }]
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

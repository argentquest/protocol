import { distance, insetShape, traceFirstImpact } from '../geometry/geometry.js'
import {
  reconcileTerrainSupport,
  terrainMotionAt,
} from './TerrainSystem.js'

/** @pure @param {import('../types.js').Point} value Vector. @returns {import('../types.js').Point} Unit vector. */
function normalize(value) {
  const length = Math.hypot(value.x, value.y)
  return length > 1e-9 ? { x: value.x / length, y: value.y / length } : { x: 1, y: 0 }
}

/**
 * Reflects velocity around a unit surface normal.
 *
 * @pure
 * @param {import('../types.js').Point} velocity Incoming velocity in world units/second.
 * @param {import('../types.js').Point} normal Unit contact normal.
 * @param {number} restitution Dimensionless retained-speed multiplier.
 * @returns {import('../types.js').Point} Reflected velocity in world units/second.
 */
export function reflectVelocity(velocity, normal, restitution) {
  const dot = velocity.x * normal.x + velocity.y * normal.y
  return {
    x: (velocity.x - 2 * dot * normal.x) * restitution,
    y: (velocity.y - 2 * dot * normal.y) * restitution,
  }
}

/**
 * Converts an aim vector and distance into a bounded launch velocity.
 *
 * @pure
 * @param {import('../types.js').Point} aim Aim displacement in world units.
 * @param {object} config Kinetic level configuration.
 * @returns {import('../types.js').Point|null} Launch velocity, or null for a zero-length aim.
 */
export function launchVelocity(aim, config) {
  const aimDistance = Math.hypot(aim.x, aim.y)
  if (aimDistance < (config.minimumAimDistance ?? 1e-6)) return null
  const blend = Math.min(1, aimDistance / config.aimDistanceForMaximumSpeed)
  const speed =
    config.minimumLaunchSpeed +
    (config.maximumLaunchSpeed - config.minimumLaunchSpeed) * blend
  const direction = normalize(aim)
  return { x: direction.x * speed, y: direction.y * speed }
}

/**
 * Advances one ballistic token through drag and deterministic surface impacts.
 * Intentional rebounds do not mutate the normal collision counter.
 *
 * @param {object} session Mutable level session.
 * @param {number} stepMs Fixed-step duration in milliseconds.
 * @param {object[]} obstacles Time-resolved obstacle shapes.
 * @returns {{moved:boolean,traveled:number,stopped:boolean,impacts:object[],point:import('../types.js').Point,collision:false,collisionStarted:false,maximumCollisions:false}}
 */
export function advanceKineticToken(session, stepMs, obstacles) {
  const surfaceMotion = terrainMotionAt(session)
  const terrainWillRoll =
    Math.hypot(
      surfaceMotion.acceleration.x,
      surfaceMotion.acceleration.y,
    ) > surfaceMotion.friction
  if (session.kinetic.phase !== 'in-flight') {
    if (
      session.kinetic.phase !== 'resting' ||
      !terrainWillRoll
    ) {
      session.token.motionSegments = []
      return {
        moved: false,
        traveled: 0,
        stopped: false,
        impacts: [],
        point: { ...session.token.position },
        collision: false,
        collisionStarted: false,
        maximumCollisions: false,
      }
    }
    session.kinetic.phase = 'in-flight'
    session.input.active = true
  }
  const config = session.level.shotMechanic
  const tokenShape = insetShape(
    { ...session.level.token, ...session.token.position },
    session.collisions.tokenToleranceUnits,
  )
  let position = { ...session.token.position }
  const totalSeconds = stepMs / 1000
  let velocity = {
    x: session.token.velocity.x + surfaceMotion.acceleration.x * totalSeconds,
    y: session.token.velocity.y + surfaceMotion.acceleration.y * totalSeconds,
  }
  let remainingSeconds = stepMs / 1000
  let traveled = 0
  const impacts = []
  const motionSegments = []
  const dragPerSecond = session.vertical?.grounded
    ? surfaceMotion.friction
    : (config.airDragPerSecond ?? config.dragPerSecond)

  for (
    let impactIndex = 0;
    remainingSeconds > 1e-7 && impactIndex <= config.maximumImpactsPerStep;
    impactIndex += 1
  ) {
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed <= config.stopSpeed && !terrainWillRoll) {
      velocity = { x: 0, y: 0 }
      break
    }
    const direction = normalize(velocity)
    const endSpeed = Math.max(0, speed - dragPerSecond * remainingSeconds)
    const averageSpeed = (speed + endSpeed) / 2
    const requested = {
      x: position.x + direction.x * averageSpeed * remainingSeconds,
      y: position.y + direction.y * averageSpeed * remainingSeconds,
    }
    const trace = traceFirstImpact({
      from: position,
      to: requested,
      shape: { ...tokenShape, x: position.x, y: position.y },
      arena: session.level.arena,
      obstacles,
      velocity,
    })
    const segmentStart = { ...position }
    traveled += distance(position, trace.point)
    position = trace.point
    motionSegments.push({ from: segmentStart, to: { ...position } })
    if (!trace.hit) {
      velocity = { x: direction.x * endSpeed, y: direction.y * endSpeed }
      remainingSeconds = 0
      break
    }

    const impactSeconds = remainingSeconds * trace.fraction
    const impactSpeed = Math.max(0, speed - dragPerSecond * impactSeconds)
    const response = trace.obstacle?.kineticResponse ?? {
      type: 'rebound',
      restitution: config.restitution,
    }
    impacts.push({
      kind: trace.kind,
      obstacleId: trace.obstacle?.id ?? null,
      point: { ...trace.point },
      normal: { ...trace.normal },
      response: response.type,
      speed: impactSpeed,
    })
    remainingSeconds *= 1 - trace.fraction
    if (response.type === 'stop') {
      velocity = { x: 0, y: 0 }
      break
    }
    if (response.type === 'reset') {
      position = { ...session.token.lastRestPosition }
      velocity = { x: 0, y: 0 }
      break
    }
    velocity = reflectVelocity(
      { x: direction.x * impactSpeed, y: direction.y * impactSpeed },
      trace.normal,
      response.restitution ?? config.restitution,
    )
    const reflectedSpeed = Math.hypot(velocity.x, velocity.y)
    if (reflectedSpeed > config.maximumLaunchSpeed) {
      velocity = {
        x: (velocity.x / reflectedSpeed) * config.maximumLaunchSpeed,
        y: (velocity.y / reflectedSpeed) * config.maximumLaunchSpeed,
      }
    }
    if (impactIndex === config.maximumImpactsPerStep) {
      velocity = { x: 0, y: 0 }
      break
    }
  }

  if (
    Math.hypot(velocity.x, velocity.y) <= config.stopSpeed &&
    !terrainWillRoll
  ) {
    velocity = { x: 0, y: 0 }
  }
  session.token.previousPosition = { ...session.token.position }
  session.token.position = position
  session.token.lastSafePosition = { ...position }
  session.token.velocity = velocity
  session.token.motionSegments = motionSegments
  session.distance.actual += traveled
  reconcileTerrainSupport(session)
  const stopped =
    velocity.x === 0 &&
    velocity.y === 0 &&
    (!session.vertical || session.vertical.grounded)
  if (stopped) {
    session.token.lastRestPosition = { ...position }
    session.kinetic.phase = 'resting'
    session.input.active = false
    session.input.mode = null
  }
  return {
    moved: traveled > 0,
    traveled,
    stopped,
    impacts,
    point: { ...position },
    collision: false,
    collisionStarted: false,
    maximumCollisions: false,
  }
}

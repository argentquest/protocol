import { shapesIntersect } from '../geometry/geometry.js'
import {
  landingSurfaceBetween,
  reconcileTerrainSupport,
} from './TerrainSystem.js'

/**
 * Tests whether the token and an entity overlap vertically.
 * Missing obstacle height means an infinite wall, preserving every V2 level.
 *
 * @pure
 * @param {number} tokenElevation Token bottom elevation in world units.
 * @param {number} tokenHeight Token vertical size in world units.
 * @param {object} entity Entity elevation configuration.
 * @returns {boolean} Whether the vertical intervals overlap.
 */
export function verticalRangesOverlap(tokenElevation, tokenHeight, entity) {
  const entityBottom = Number(entity.elevation) || 0
  const entityHeight = entity.collisionHeight ?? Number.POSITIVE_INFINITY
  const entityTop = entityBottom + entityHeight
  return tokenElevation < entityTop && tokenElevation + tokenHeight > entityBottom
}

/**
 * Selects collision obstacles occupying the token's current elevation.
 *
 * @pure
 * @param {object} session Active level session.
 * @param {object[]} obstacles Time-resolved obstacle shapes.
 * @returns {object[]} Height-relevant obstacles.
 */
export function obstaclesAtTokenElevation(session, obstacles) {
  if (!session.vertical) return obstacles
  return obstacles.filter((obstacle) =>
    verticalRangesOverlap(
      session.token.elevation,
      session.level.token.collisionHeight ?? session.level.token.size,
      obstacle,
    ),
  )
}

/**
 * Integrates deterministic vertical motion for one fixed update.
 *
 * @param {object} session Mutable level session.
 * @param {number} stepMs Fixed duration in milliseconds.
 * @returns {{moved:boolean,landed:boolean,elevation:number,verticalVelocity:number}} Vertical result.
 */
export function advanceVerticalMotion(session, stepMs) {
  if (!session.vertical) {
    return {
      moved: false,
      landed: false,
      elevation: 0,
      verticalVelocity: 0,
    }
  }
  const config = session.level.verticalPhysics
  const seconds = stepMs / 1000
  const previousElevation = session.token.elevation
  if (session.vertical.grounded) {
    const support = reconcileTerrainSupport(session)
    if (support) {
      session.token.previousElevation = previousElevation
      return {
        moved: session.token.elevation !== previousElevation,
        landed: false,
        elevation: session.token.elevation,
        verticalVelocity: 0,
        surface: support,
      }
    }
  }
  let velocity = Math.max(
    -config.maximumFallSpeed,
    session.token.verticalVelocity - config.gravity * seconds,
  )
  let elevation = previousElevation +
    ((session.token.verticalVelocity + velocity) / 2) * seconds
  let landed = false
  const landing = landingSurfaceBetween(
    session.level,
    session.token.position,
    previousElevation,
    elevation,
  )
  if (landing) {
    landed = previousElevation > landing.height
    elevation = landing.height
    velocity = 0
  }
  session.token.previousElevation = previousElevation
  session.token.elevation = elevation
  session.token.verticalVelocity = velocity
  session.vertical.grounded = Boolean(landing && velocity === 0)
  session.vertical.surfaceId = landing?.id ?? null
  return {
    moved: elevation !== previousElevation,
    landed,
    elevation,
    verticalVelocity: velocity,
    surface: landing,
  }
}

/**
 * Launches the grounded token when it crosses a ramp in the configured direction.
 * The ramp remains latched until contact ends so one crossing produces one launch.
 *
 * @param {object} session Mutable level session.
 * @returns {object|null} Activated ramp, or null.
 */
export function activateContactRamp(session) {
  if (!session.vertical) return null
  const token = {
    ...session.level.token,
    ...session.token.position,
  }
  const contacts = (session.level.ramps ?? []).filter((ramp) =>
    verticalRangesOverlap(
      session.token.elevation,
      session.level.token.collisionHeight ?? session.level.token.size,
      ramp,
    ) && shapesIntersect(token, { ...ramp, shape: 'rect' }),
  )
  if (!contacts.length) {
    session.vertical.rampLatchId = null
    return null
  }
  const ramp = contacts[0]
  if (!session.vertical.grounded || session.vertical.rampLatchId === ramp.id) {
    return null
  }
  const radians = (ramp.directionDegrees * Math.PI) / 180
  const approach =
    session.token.velocity.x * Math.cos(radians) +
    session.token.velocity.y * Math.sin(radians)
  if (approach < (ramp.minimumApproachSpeed ?? 1)) return null
  session.token.verticalVelocity = ramp.launchVelocity
  session.vertical.grounded = false
  session.vertical.rampLatchId = ramp.id
  return ramp
}

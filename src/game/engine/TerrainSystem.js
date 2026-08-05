const EPSILON = 1e-7

/**
 * @typedef {object} TerrainSample
 * @property {string} id Stable surface or ground identifier.
 * @property {number} height Surface elevation in logical world units.
 * @property {{x:number,y:number}} gradient Height change per horizontal world unit.
 * @property {{x:number,y:number,z:number}} normal Up-facing Three.js-compatible unit normal.
 * @property {{x:number,y:number}} slopeDirection Unit direction of steepest descent.
 * @property {object|null} surface Authored terrain surface, or null for base ground.
 */

/** @pure @param {number} value Value. @param {number} minimum Lower bound. @param {number} maximum Upper bound. @returns {number} Clamped value. */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Samples one rectangular two-triangle terrain patch.
 * The authoritative diagonal runs from north-west to south-east, matching the
 * renderer mesh exactly.
 *
 * @pure
 * @param {object} surface Authored surface in logical world units.
 * @param {{x:number,y:number}} point Horizontal world point.
 * @returns {TerrainSample|null} Surface sample, or null outside its footprint.
 */
export function sampleTerrainSurface(surface, point) {
  const left = surface.x - surface.width / 2
  const top = surface.y - surface.height / 2
  const u = (point.x - left) / surface.width
  const v = (point.y - top) / surface.height
  if (u < -EPSILON || u > 1 + EPSILON || v < -EPSILON || v > 1 + EPSILON) {
    return null
  }
  const xRatio = clamp(u, 0, 1)
  const yRatio = clamp(v, 0, 1)
  const corners = surface.cornerElevations
  let height
  let du
  let dv
  if (xRatio >= yRatio) {
    du = corners.northEast - corners.northWest
    dv = corners.southEast - corners.northEast
    height = corners.northWest + xRatio * du + yRatio * dv
  } else {
    du = corners.southEast - corners.southWest
    dv = corners.southWest - corners.northWest
    height = corners.northWest + xRatio * du + yRatio * dv
  }
  const gradient = {
    x: du / surface.width,
    y: dv / surface.height,
  }
  const normalLength = Math.hypot(gradient.x, 1, gradient.y)
  const normal = {
    x: -gradient.x / normalLength,
    y: 1 / normalLength,
    z: -gradient.y / normalLength,
  }
  const slopeLength = Math.hypot(gradient.x, gradient.y)
  return {
    id: surface.id,
    height,
    gradient,
    normal,
    slopeDirection:
      slopeLength > EPSILON
        ? { x: -gradient.x / slopeLength, y: -gradient.y / slopeLength }
        : { x: 0, y: 0 },
    surface,
  }
}

/**
 * Returns every walkable layer at a horizontal point, highest first.
 * Base ground is always present, allowing stacked bridge surfaces without
 * removing the traversable ground beneath them.
 *
 * @pure
 * @param {object} level Generated level configuration.
 * @param {{x:number,y:number}} point Horizontal world point.
 * @returns {TerrainSample[]} Height-sorted samples.
 */
export function terrainSamplesAt(level, point) {
  const samples = (level.terrainSurfaces ?? [])
    .map((surface, priority) => {
      const sample = sampleTerrainSurface(surface, point)
      return sample ? { ...sample, priority } : null
    })
    .filter(Boolean)
  samples.push({
    id: 'ground',
    height: level.verticalPhysics?.groundHeight ?? 0,
    gradient: { x: 0, y: 0 },
    normal: { x: 0, y: 1, z: 0 },
    slopeDirection: { x: 0, y: 0 },
    surface: null,
    priority: -1,
  })
  return samples.sort(
    (first, second) =>
      second.height - first.height || second.priority - first.priority,
  )
}

/**
 * Gets the highest authored play-surface height at X/Y.
 *
 * @pure
 * @param {object} level Generated level configuration.
 * @param {{x:number,y:number}} point Horizontal world point.
 * @returns {TerrainSample} Highest surface sample.
 */
export function surfaceHeightAt(level, point) {
  return terrainSamplesAt(level, point)[0]
}

/**
 * Selects the highest surface reachable from the token's present elevation.
 * This prevents a ball below a bridge from teleporting onto its deck.
 *
 * @pure
 * @param {object} level Generated level configuration.
 * @param {{x:number,y:number}} point Horizontal world point.
 * @param {number} elevation Current token-bottom elevation in world units.
 * @param {number} maximumStepHeight Maximum upward transition in world units.
 * @returns {TerrainSample} Reachable supporting surface.
 */
export function supportSurfaceAt(level, point, elevation, maximumStepHeight) {
  const ceiling = elevation + maximumStepHeight + EPSILON
  return (
    terrainSamplesAt(level, point).find((sample) => sample.height <= ceiling) ??
    terrainSamplesAt(level, point).at(-1)
  )
}

/**
 * Finds the highest surface crossed by a falling token during one fixed step.
 *
 * @pure
 * @param {object} level Generated level configuration.
 * @param {{x:number,y:number}} point Horizontal world point.
 * @param {number} previousElevation Previous token-bottom elevation.
 * @param {number} requestedElevation Requested token-bottom elevation.
 * @returns {TerrainSample|null} Crossed landing surface.
 */
export function landingSurfaceBetween(
  level,
  point,
  previousElevation,
  requestedElevation,
) {
  return (
    terrainSamplesAt(level, point).find(
      (sample) =>
        previousElevation + EPSILON >= sample.height &&
        requestedElevation - EPSILON <= sample.height,
    ) ?? null
  )
}

/**
 * Resolves configured maximum step height.
 *
 * @pure
 * @param {object} session Active engine session.
 * @returns {number} Maximum climb/drop snap in world units.
 */
export function maximumTerrainStep(session) {
  return (
    session.level.verticalPhysics?.maximumStepHeight ??
    session.level.token.size * 0.35
  )
}

/**
 * Snaps a grounded token to a connected surface or starts a fall at a ledge.
 *
 * @param {object} session Mutable engine session.
 * @returns {TerrainSample|null} Current support, or null after leaving a ledge.
 */
export function reconcileTerrainSupport(session) {
  if (!session.vertical?.grounded) return null
  const reachableSupport = supportSurfaceAt(
    session.level,
    session.token.position,
    session.token.elevation,
    maximumTerrainStep(session),
  )
  const retainedSurface =
    session.vertical.surfaceId && session.vertical.surfaceId !== 'ground'
      ? terrainSamplesAt(session.level, session.token.position).find(
          (sample) => sample.id === session.vertical.surfaceId,
        )
      : null
  const support = retainedSurface ?? reachableSupport
  if (
    !retainedSurface &&
    session.token.elevation - support.height > maximumTerrainStep(session)
  ) {
    session.vertical.grounded = false
    session.vertical.surfaceId = null
    return null
  }
  session.token.elevation = support.height
  session.token.verticalVelocity = 0
  session.vertical.surfaceId = support.id
  return support
}

/**
 * Resolves gravity projected along the current support plus surface friction.
 *
 * @pure
 * @param {object} session Active engine session.
 * @returns {{acceleration:{x:number,y:number},friction:number,sample:TerrainSample|null}}
 */
export function terrainMotionAt(session) {
  if (!session.vertical?.grounded) {
    return { acceleration: { x: 0, y: 0 }, friction: 0, sample: null }
  }
  const sample = supportSurfaceAt(
    session.level,
    session.token.position,
    session.token.elevation,
    maximumTerrainStep(session),
  )
  const gradientSquared =
    sample.gradient.x ** 2 + sample.gradient.y ** 2
  const gravity = session.level.verticalPhysics.gravity
  return {
    acceleration: {
      x: (-gravity * sample.gradient.x) / (1 + gradientSquared),
      y: (-gravity * sample.gradient.y) / (1 + gradientSquared),
    },
    friction:
      sample.surface?.friction ??
      session.level.shotMechanic?.dragPerSecond ??
      0,
    sample,
  }
}

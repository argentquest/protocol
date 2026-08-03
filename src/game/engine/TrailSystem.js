const DEFAULT_MAXIMUM_SAMPLES = 512
const DEFAULT_MAXIMUM_GHOSTS = 2

/**
 * Tests exact equality of two deterministic world positions.
 *
 * @pure
 * @param {{x:number,y:number}} first First point.
 * @param {{x:number,y:number}} second Second point.
 * @returns {boolean} Whether both coordinates match.
 */
function samePoint(first, second) {
  return first?.x === second?.x && first?.y === second?.y
}

/**
 * Adds a unique token-center sample while bounding retained trail memory.
 *
 * @param {import('../types.js').Point[]} trail Mutable active trail.
 * @param {import('../types.js').Point} point Token center in logical world units.
 * @param {number} [maximumSamples=512] Maximum retained point count.
 * @returns {import('../types.js').Point[]} The mutated trail.
 */
export function appendTrailSample(
  trail,
  point,
  maximumSamples = DEFAULT_MAXIMUM_SAMPLES,
) {
  if (samePoint(trail.at(-1), point)) return trail
  trail.push({ x: point.x, y: point.y })
  if (trail.length > maximumSamples) {
    const first = trail[0]
    const retained = trail.filter(
      (_, index) => index === 0 || index === trail.length - 1 || index % 2 === 0,
    )
    trail.splice(0, trail.length, first, ...retained.slice(1))
    if (trail.length > maximumSamples) {
      trail.splice(1, trail.length - maximumSamples)
    }
  }
  return trail
}

/**
 * Copies a completed active trail into the bounded ghost-trail collection.
 *
 * @pure
 * @param {import('../types.js').Point[][]} ghosts Existing immutable ghost trails.
 * @param {import('../types.js').Point[]} activeTrail Completed active trail.
 * @param {number} [maximumGhosts=2] Maximum retained attempt count.
 * @returns {import('../types.js').Point[][]} New bounded ghost collection.
 */
export function retainGhostTrail(
  ghosts,
  activeTrail,
  maximumGhosts = DEFAULT_MAXIMUM_GHOSTS,
) {
  if (activeTrail.length < 2 || maximumGhosts <= 0) return ghosts.slice(0, maximumGhosts)
  return [
    activeTrail.map((point) => ({ ...point })),
    ...ghosts,
  ].slice(0, maximumGhosts)
}

const DEFAULT_MAXIMUM_SAMPLES = 512
const DEFAULT_MAXIMUM_GHOSTS = 2

function samePoint(first, second) {
  return first?.x === second?.x && first?.y === second?.y
}

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

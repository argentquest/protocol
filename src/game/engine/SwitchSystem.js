import { insetShape, shapesIntersect } from '../geometry/geometry.js'
import { resolveDynamicObstacles } from './DynamicObstacleSystem.js'

/**
 * Tests contact switches against the complete token and applies edge-triggered
 * once, timed, or toggle activation in deterministic hazard time.
 *
 * @param {object} session Active engine session.
 * @returns {object[]} Switch changes emitted during this fixed step.
 */
export function updateContactSwitches(session) {
  const token = insetShape(
    {
      ...session.level.token,
      ...session.token.position,
    },
    session.collisions.tokenToleranceUnits,
  )
  const changes = []
  for (const item of session.level.switches ?? []) {
    const state = session.switchStates.get(item.id)
    const touching = shapesIntersect(token, item)
    if (touching && !state.contacting) {
      if (item.activation === 'toggle') {
        state.active = !state.active
        state.openUntilMs = null
        changes.push({ switch: item, active: state.active })
      } else if (item.activation === 'timed') {
        state.active = true
        state.openUntilMs = session.hazardTimeMs + item.durationMs
        changes.push({
          switch: item,
          active: true,
          openUntilMs: state.openUntilMs,
        })
      } else if (!state.active) {
        state.active = true
        state.openUntilMs = null
        changes.push({ switch: item, active: true })
      }
    }
    state.contacting = touching
  }

  if (changes.length) {
    session.dynamicObstacles = resolveDynamicObstacles(
      session.level.dynamicObstacles ?? [],
      session.hazardTimeMs,
      session.switchStates,
    )
  }
  return changes
}

/**
 * Reports whether a switch is actively controlling its linked obstacle.
 *
 * @pure
 * @param {object} state Engine-owned switch state.
 * @param {number} timeMs Hazard simulation time in milliseconds.
 * @returns {boolean} Whether the switch is currently active.
 */
export function isSwitchActive(state, timeMs) {
  return Boolean(
    state?.active &&
      (state.openUntilMs === null || timeMs < state.openUntilMs),
  )
}

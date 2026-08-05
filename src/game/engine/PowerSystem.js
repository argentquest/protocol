import {
  distance,
  insetShape,
  isSafePosition,
  shapesIntersect,
} from '../geometry/geometry.js'
import { verticalRangesOverlap } from './VerticalMovementSystem.js'

/**
 * Tests a timed power against a monotonic real-time timestamp.
 *
 * @pure
 * @param {object} session Active engine session.
 * @param {string} effect Stable power effect ID.
 * @param {number} nowMs Monotonic time in milliseconds.
 * @returns {boolean} Whether the effect has not expired.
 */
export function isPowerActive(session, effect, nowMs) {
  return Number(session.activePowers.get(effect)?.expiresAtMs) > nowMs
}

/**
 * Consumes one inventory charge and activates its timed effect.
 *
 * @param {object} session Active engine session.
 * @param {object[]} definitions Validated power definitions.
 * @param {string} key Numeric power key.
 * @param {number} nowMs Monotonic activation time in milliseconds.
 * @returns {object} Activation result and remaining charge count.
 */
export function activatePower(session, definitions, key, nowMs) {
  const power = definitions.find((item) => item.key === String(key))
  if (!power) return { activated: false, reason: 'unknown-key' }
  const charges = Number(session.powerInventory.get(power.id)) || 0
  if (charges <= 0) return { activated: false, reason: 'no-charges', power }
  if (isPowerActive(session, power.effect, nowMs)) {
    return { activated: false, reason: 'already-active', power }
  }
  session.powerInventory.set(power.id, charges - 1)
  session.activePowers.set(power.effect, {
    ...power,
    activatedAtMs: nowMs,
    expiresAtMs: nowMs + power.durationMs,
  })
  if (power.effect === 'routeScan') {
    session.routeScanPath = session.level.validatedPath.map((point) => ({ ...point }))
  }
  return { activated: true, power, remaining: charges - 1 }
}

/**
 * Removes expired effects and restores safety after full-shield expiry.
 *
 * @param {object} session Active engine session.
 * @param {number} nowMs Monotonic time in milliseconds.
 * @param {object[]} obstacles Current obstacle shapes.
 * @returns {object[]} Power definitions that expired.
 */
export function expirePowers(session, nowMs, obstacles) {
  const expired = []
  for (const [effect, power] of session.activePowers) {
    if (power.expiresAtMs > nowMs) continue
    session.activePowers.delete(effect)
    expired.push(power)
    if (effect === 'routeScan') session.routeScanPath = null
  }
  if (
    expired.some((power) => power.effect === 'fullShield') &&
    !isSafePosition(
      insetShape(
        { ...session.level.token, ...session.token.position },
        session.collisions.tokenToleranceUnits,
      ),
      session.level.arena,
      obstacles,
    )
  ) {
    session.token.position = { ...session.token.lastSafePosition }
    session.token.previousPosition = { ...session.token.lastSafePosition }
    session.token.velocity = { x: 0, y: 0 }
  }
  return expired
}

/**
 * Claims all uncollected coins touching the token or magnet radius.
 *
 * @param {object} session Active engine session.
 * @param {number} [magnetRadius=0] Extra collection radius in logical world units.
 * @returns {object[]} Newly claimed coin definitions.
 */
export function collectContactCoins(session, magnetRadius = 0) {
  const token = { ...session.level.token, ...session.token.position }
  const claimed = []
  for (const coin of session.level.coins) {
    if (session.collectedCoinIds.has(coin.id)) continue
    if (
      session.vertical &&
      !verticalRangesOverlap(
        session.token.elevation,
        session.level.token.collisionHeight ?? session.level.token.size,
        {
          ...coin,
          collisionHeight: coin.collisionHeight ?? coin.size,
        },
      )
    ) {
      continue
    }
    const inMagnetRange =
      magnetRadius > 0 &&
      distance(session.token.position, coin) <=
        magnetRadius + Math.max(coin.width, coin.height) / 2
    if (!inMagnetRange && !shapesIntersect(token, coin)) continue
    session.collectedCoinIds.add(coin.id)
    claimed.push(coin)
  }
  return claimed
}

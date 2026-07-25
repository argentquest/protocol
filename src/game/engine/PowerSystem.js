import {
  distance,
  insetShape,
  isSafePosition,
  shapesIntersect,
} from '../geometry/geometry.js'

export function isPowerActive(session, effect, nowMs) {
  return Number(session.activePowers.get(effect)?.expiresAtMs) > nowMs
}

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

export function collectContactCoins(session, magnetRadius = 0) {
  const token = { ...session.level.token, ...session.token.position }
  const claimed = []
  for (const coin of session.level.coins) {
    if (session.collectedCoinIds.has(coin.id)) continue
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

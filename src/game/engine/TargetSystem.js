import { shapesIntersect } from '../geometry/geometry.js'
import { createSeededRandom } from '../generation/seededRandom.js'

function tokenShape(session) {
  return {
    ...session.level.token,
    x: session.token.position.x,
    y: session.token.position.y,
  }
}

export function activeTarget(session, phase) {
  if (phase === 'active-main') return session.level.mainTarget
  if (phase === 'active-bonus') {
    return session.level.bonusTargets[session.targets.activeBonusIndex] ?? null
  }
  return null
}

export function touchesActiveTarget(session, phase) {
  const target = activeTarget(session, phase)
  if (!target) return false
  const from = session.token.previousPosition
  const to = session.token.position
  const travel = Math.hypot(to.x - from.x, to.y - from.y)
  const sampleDistance = Math.max(
    2,
    Math.min(session.level.token.width, session.level.token.height) / 4,
  )
  const steps = Math.max(1, Math.ceil(travel / sampleDistance))
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps
    const token = {
      ...tokenShape(session),
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    }
    if (shapesIntersect(token, target)) return true
  }
  return false
}

export function checkpointAtTarget(session, target, isBonus) {
  const checkpoint = { x: target.x, y: target.y }
  session.token.position = { ...checkpoint }
  session.token.previousPosition = { ...checkpoint }
  session.token.lastSafePosition = { ...checkpoint }
  session.token.velocity = { x: 0, y: 0 }
  session.input.active = false
  session.input.mode = null
  session.input.directions.clear()
  session.distance.reachedPoints.push({ ...checkpoint })
  session.targets.mainReached = true
  if (isBonus) session.targets.earnedBonuses += 1
  return checkpoint
}

export function selectBonusOffer(session, score) {
  const bonusIndex = session.targets.earnedBonuses
  const maximum = Math.min(
    session.level.bonuses.maximumTargets,
    session.level.bonusTargets.length,
  )
  if (bonusIndex >= maximum) return null
  const chance =
    score.attainableMaximum > 0
      ? score.finalScore / score.attainableMaximum
      : 0
  const random = createSeededRandom(
    `${session.level.seed}:attempt-${session.attemptNumber}:bonus-${bonusIndex}`,
  )
  if (random() > chance) return null
  session.targets.activeBonusIndex = bonusIndex
  return session.level.bonusTargets[bonusIndex]
}

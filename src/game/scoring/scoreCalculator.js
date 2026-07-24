import { clamp, distance } from '../geometry/geometry.js'

export function directDistance(points) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index])
  }
  return total
}

export function calculateScore({
  scoring,
  elapsedMs,
  actualDistance,
  benchmarkDistance,
  earnedBonusMaximum = 0,
  collisions = 0,
  bonusFailures = 0,
  bonusFailurePenaltyRate = 0.2,
}) {
  const attainableMaximum = scoring.baseMaximum + earnedBonusMaximum
  const safeElapsed = Math.max(1, elapsedMs)
  const safeDistance = Math.max(1, actualDistance)
  const timeFactor = Math.min(1, scoring.parTimeMs / safeElapsed)
  const routeFactor = Math.min(1, benchmarkDistance / safeDistance)
  const performanceScore =
    attainableMaximum *
    (scoring.timeWeight * timeFactor + scoring.distanceWeight * routeFactor)
  const collisionPenalty =
    attainableMaximum * scoring.collisionPenaltyRate * collisions
  const bonusPenalty =
    attainableMaximum * bonusFailurePenaltyRate * bonusFailures
  const finalScore = Math.round(
    clamp(performanceScore - collisionPenalty - bonusPenalty, 0, attainableMaximum),
  )

  return {
    attainableMaximum,
    timeFactor,
    routeFactor,
    performanceScore,
    collisionPenalty,
    bonusPenalty,
    finalScore,
  }
}

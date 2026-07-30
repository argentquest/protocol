import { calculateScore, directDistance } from '../scoring/scoreCalculator.js'

/**
 * Maps mutable engine session state into the canonical scoring formula.
 *
 * @pure
 * @param {object} session Active engine session.
 * @returns {object} Complete score breakdown in points.
 */
export function calculateSessionScore(session) {
  const benchmarkDistance = Math.max(
    1,
    directDistance(session.distance.reachedPoints),
  )
  return calculateScore({
    scoring: session.level.scoring,
    elapsedMs: Math.max(1, session.elapsedMs),
    actualDistance: Math.max(benchmarkDistance, session.distance.actual),
    benchmarkDistance,
    earnedBonusMaximum:
      session.targets.earnedBonuses * session.level.bonuses.rewardPerTarget,
    collisions: session.collisions.count,
    bonusFailures: session.targets.bonusFailures,
    bonusFailurePenaltyRate: session.level.bonuses.failurePenaltyRate,
  })
}

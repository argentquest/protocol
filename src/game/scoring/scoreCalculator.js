import { clamp, distance } from '../geometry/geometry.js'

/**
 * Adds straight-line segments through reached ordered targets.
 *
 * @pure
 * @param {import('../types.js').Point[]} points Ordered reached points.
 * @returns {number} Benchmark distance in logical world units.
 */
export function directDistance(points) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index])
  }
  return total
}

/**
 * @typedef {object} ScoreResult
 * @property {number} attainableMaximum Maximum available score in points.
 * @property {number} timeFactor Clamped time-performance ratio from 0 to 1.
 * @property {number} routeFactor Clamped route-efficiency ratio from 0 to 1.
 * @property {number} performanceScore Unrounded performance points.
 * @property {number} collisionPenalty Collision deduction in points.
 * @property {number} bonusPenalty Bonus-failure deduction in points.
 * @property {number} finalScore Rounded and clamped score in points.
 */

/**
 * Calculates score from real elapsed time and actual token-center travel.
 *
 * @pure
 * @param {object} inputs Score inputs.
 * @param {object} inputs.scoring Validated level scoring configuration.
 * @param {number} inputs.elapsedMs Elapsed real time in milliseconds.
 * @param {number} inputs.actualDistance Traveled distance in logical world units.
 * @param {number} inputs.benchmarkDistance Direct distance in logical world units.
 * @param {number} [inputs.earnedBonusMaximum=0] Earned bonus ceiling in points.
 * @param {number} [inputs.collisions=0] Discrete collision count.
 * @param {number} [inputs.bonusFailures=0] Failed pursued-bonus count.
 * @param {number} [inputs.bonusFailurePenaltyRate=0.2] Fraction of maximum deducted per failure.
 * @returns {ScoreResult} Complete score breakdown.
 */
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

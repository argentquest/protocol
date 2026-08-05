/**
 * @typedef {object} ShotGoals
 * @property {number|null} par Target shot count, or null when no par is authored.
 * @property {number|null} perfectShots Maximum shot count for a perfect rating.
 * @property {number|null} maximumShots Attempt shot limit, or null for unlimited shots.
 */

/**
 * Normalizes optional kinetic shot goals without changing authored level data.
 *
 * @pure
 * @param {object} level Generated level configuration.
 * @returns {ShotGoals} Bounded shot goals.
 */
export function resolveShotGoals(level) {
  const configured = level.shotGoals ?? {}
  const par = Number.isInteger(configured.par) ? configured.par : null
  return {
    par,
    perfectShots: Number.isInteger(configured.perfectShots)
      ? configured.perfectShots
      : par === null
        ? null
        : 1,
    maximumShots: Number.isInteger(configured.maximumShots)
      ? configured.maximumShots
      : null,
  }
}

/**
 * Rates a completed kinetic run against authored shot goals.
 *
 * @pure
 * @param {number} shotsTaken Positive completed-run shot count.
 * @param {ShotGoals} goals Normalized level goals.
 * @returns {'perfect'|'under-par'|'par'|'over-par'|null} Stable rating ID.
 */
export function rateShotResult(shotsTaken, goals) {
  if (!Number.isInteger(shotsTaken) || shotsTaken <= 0 || goals.par === null) {
    return null
  }
  if (goals.perfectShots !== null && shotsTaken <= goals.perfectShots) {
    return 'perfect'
  }
  if (shotsTaken < goals.par) return 'under-par'
  if (shotsTaken === goals.par) return 'par'
  return 'over-par'
}

/**
 * Detects whether the current kinetic attempt has consumed its shot budget.
 *
 * @pure
 * @param {object} session Active engine session.
 * @returns {boolean} Whether no additional shot may be aimed.
 */
export function isShotBudgetExhausted(session) {
  const maximumShots = resolveShotGoals(session.level).maximumShots
  return Boolean(
    session.kinetic &&
      maximumShots !== null &&
      session.kinetic.shotsTaken >= maximumShots,
  )
}

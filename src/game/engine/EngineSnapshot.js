import { calculateSessionScore } from './ScoringSystem.js'
import { resolveShotGoals } from './ShotGoalSystem.js'

/**
 * Resolves the current kinetic launch displacement for HUD presentation.
 *
 * @pure
 * @param {object} session Active engine session.
 * @returns {{x:number,y:number}} Launch displacement in logical world units.
 */
function kineticAim(session) {
  const desired = session.input.desiredPosition
  if (
    session.input.mode === 'pointer' &&
    (session.level.shotMechanic.inputStyle ?? 'drag-release') === 'drag-release'
  ) {
    return {
      x: session.kinetic.aimStart.x - desired.x,
      y: session.kinetic.aimStart.y - desired.y,
    }
  }
  return {
    x: desired.x - session.token.position.x,
    y: desired.y - session.token.position.y,
  }
}

/**
 * Creates an immutable, serializable HUD projection of engine state.
 *
 * @param {object} session Active engine session.
 * @param {string} phase Current state-machine phase.
 * @returns {import('../types.js').HudSnapshot} React-safe HUD snapshot.
 */
export function createHudSnapshot(session, phase) {
  const score = calculateSessionScore(session)
  const shotGoals = resolveShotGoals(session.level)
  const aim = session.kinetic ? kineticAim(session) : null
  return Object.freeze({
    levelId: session.levelId,
    attemptNumber: session.attemptNumber,
    phase,
    elapsedMs: session.elapsedMs,
    actualDistance: session.distance.actual,
    collisions: session.collisions.count,
    collisionScoreMultiplier: session.collisions.scoreMultiplier,
    score: score.finalScore,
    attainableMaximum: score.attainableMaximum,
    timeFactor: score.timeFactor,
    routeFactor: score.routeFactor,
    totalPenalty: score.collisionPenalty + score.bonusPenalty,
    fps: session.performance.fps,
    earnedBonuses: session.targets.earnedBonuses,
    tokenPosition: Object.freeze({
      x: session.token.position.x,
      y: session.token.position.y,
      elevation: session.token.elevation ?? 0,
    }),
    activePowerIds: Object.freeze([...session.activePowers.keys()].sort()),
    availableCoinCount:
      session.level.coins.length - session.collectedCoinIds.size,
    kinetic: session.kinetic
      ? Object.freeze({
          phase: session.kinetic.phase,
          shotsTaken: session.kinetic.shotsTaken,
          speed: Math.hypot(session.token.velocity.x, session.token.velocity.y),
          aimPoint: Object.freeze({ ...session.input.desiredPosition }),
          aimVector: Object.freeze(aim),
          aimPower: Math.min(
            1,
            Math.hypot(aim.x, aim.y) /
              session.level.shotMechanic.aimDistanceForMaximumSpeed,
          ),
          par: shotGoals.par,
          maximumShots: shotGoals.maximumShots,
          shotsRemaining:
            shotGoals.maximumShots === null
              ? null
              : Math.max(0, shotGoals.maximumShots - session.kinetic.shotsTaken),
        })
      : null,
  })
}

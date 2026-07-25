import { calculateSessionScore } from './ScoringSystem.js'

export function createHudSnapshot(session, phase) {
  const score = calculateSessionScore(session)
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
    }),
    activePowerIds: Object.freeze([...session.activePowers.keys()].sort()),
    availableCoinCount:
      session.level.coins.length - session.collectedCoinIds.size,
  })
}

import { shapesIntersect } from '../geometry/geometry.js'
import { createSeededRandom } from '../generation/seededRandom.js'
import { verticalRangesOverlap } from './VerticalMovementSystem.js'
import { surfaceHeightAt } from './TerrainSystem.js'

/**
 * Builds the authoritative inset token shape at its current center.
 *
 * @pure
 * @param {object} session Active level session.
 * @returns {object} Token collision shape in world units.
 */
function tokenShape(session) {
  return {
    ...session.level.token,
    x: session.token.position.x,
    y: session.token.position.y,
  }
}

/**
 * Selects the currently reachable target for a game phase.
 *
 * @pure
 * @param {object} session Active engine session.
 * @param {string} phase Current state-machine phase.
 * @returns {object|null} Main or active bonus target.
 */
export function activeTarget(session, phase) {
  if (phase === 'active-main') return session.level.mainTarget
  if (phase === 'active-bonus') {
    return session.level.bonusTargets[session.targets.activeBonusIndex] ?? null
  }
  return null
}

/**
 * Sweeps the token's traveled segment for contact with the active target.
 *
 * @pure
 * @param {object} session Active engine session.
 * @param {string} phase Current state-machine phase.
 * @returns {boolean} Whether any part of the token touched the target.
 */
export function touchesActiveTarget(session, phase) {
  const target = activeTarget(session, phase)
  if (!target) return false
  if (
    session.vertical &&
    !verticalRangesOverlap(
      session.token.elevation,
      session.level.token.collisionHeight ?? session.level.token.size,
      {
        ...target,
        collisionHeight: target.collisionHeight ?? target.size,
      },
    )
  ) {
    return false
  }
  const sampleDistance = Math.max(
    2,
    Math.min(session.level.token.width, session.level.token.height) / 4,
  )
  const segments = session.token.motionSegments?.length
    ? session.token.motionSegments
    : [{ from: session.token.previousPosition, to: session.token.position }]
  for (const { from, to } of segments) {
    const travel = Math.hypot(to.x - from.x, to.y - from.y)
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
  }
  return false
}

/**
 * Moves the token center to a reached target and records the checkpoint.
 *
 * @param {object} session Active engine session.
 * @param {object} target Reached target in logical world coordinates.
 * @param {boolean} isBonus Whether the checkpoint is an optional bonus.
 * @returns {import('../types.js').Point} New token checkpoint.
 */
export function checkpointAtTarget(session, target, isBonus) {
  const checkpoint = { x: target.x, y: target.y }
  session.token.position = { ...checkpoint }
  session.token.previousPosition = { ...checkpoint }
  session.token.lastSafePosition = { ...checkpoint }
  session.token.lastRestPosition = { ...checkpoint }
  session.token.velocity = { x: 0, y: 0 }
  const targetSurface = surfaceHeightAt(session.level, checkpoint)
  session.token.elevation =
    target.elevation ?? targetSurface.height
  session.token.previousElevation = session.token.elevation
  session.token.verticalVelocity = 0
  if (session.vertical) {
    session.vertical.grounded =
      Math.abs(session.token.elevation - targetSurface.height) < 1e-7
    session.vertical.surfaceId = session.vertical.grounded
      ? targetSurface.id
      : null
  }
  if (session.vertical) {
    session.vertical.grounded = true
    session.vertical.rampLatchId = null
  }
  session.token.motionSegments = []
  if (session.kinetic) {
    session.kinetic.phase = 'resting'
    session.kinetic.launchRequested = false
    session.kinetic.launchVelocity = null
  }
  session.input.active = false
  session.input.mode = null
  session.input.directions.clear()
  session.distance.reachedPoints.push({ ...checkpoint })
  session.targets.mainReached = true
  if (isBonus) session.targets.earnedBonuses += 1
  return checkpoint
}

/**
 * Deterministically offers the next ordered bonus from achieved score quality.
 *
 * @param {object} session Active engine session.
 * @param {import('../scoring/scoreCalculator.js').ScoreResult} score Current score breakdown.
 * @returns {object|null} Offered bonus target, if selected.
 */
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

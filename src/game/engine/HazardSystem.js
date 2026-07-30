import {
  currentMovingObstacle,
  advanceTrackingObstacle,
  shapeInsideArena,
} from '../geometry/geometry.js'
import {
  dynamicObstacleEnvelope,
  resolveDynamicObstacles,
} from './DynamicObstacleSystem.js'

function withCurrentPosition(obstacle, state) {
  return { ...obstacle, x: state.x, y: state.y }
}

/**
 * Advances moving and tracking hazards using deterministic simulation time.
 *
 * @param {object} session Active engine session.
 * @param {number} stepMs Fixed-step duration in milliseconds.
 * @param {number} [timeScale=1] Hazard-time multiplier used by slow-field powers.
 * @returns {{previous: object[], current: object[]}} Previous and current hazard shapes.
 */
export function advanceHazards(session, stepMs, timeScale = 1) {
  const scaledStep = stepMs * timeScale
  session.hazardTimeMs += scaledStep
  const previous = [
    ...session.movingObstacles.map((obstacle) => ({
      ...obstacle,
      x: obstacle.currentX,
      y: obstacle.currentY,
    })),
    ...session.trackingObstacles.map((state, index) =>
      withCurrentPosition(session.level.trackingObstacles[index], state),
    ),
    ...session.dynamicObstacles.filter((obstacle) => obstacle.solid),
  ]

  session.movingObstacles = session.level.movingObstacles.map((obstacle) => {
    const current = currentMovingObstacle(obstacle, session.hazardTimeMs)
    return { ...obstacle, currentX: current.x, currentY: current.y }
  })
  session.trackingObstacles = session.level.trackingObstacles.map(
    (obstacle, index) => ({
      id: obstacle.id,
      ...advanceTrackingObstacle(
        obstacle,
        session.trackingObstacles[index],
        session.token.position,
        scaledStep,
      ),
    }),
  )
  session.dynamicObstacles = resolveDynamicObstacles(
    session.level.dynamicObstacles ?? [],
    session.hazardTimeMs,
    session.switchStates,
  )

  const current = [
    ...session.movingObstacles.map((obstacle) => ({
      ...obstacle,
      x: obstacle.currentX,
      y: obstacle.currentY,
    })),
    ...session.trackingObstacles.map((state, index) =>
      withCurrentPosition(session.level.trackingObstacles[index], state),
    ),
    ...session.dynamicObstacles.filter((obstacle) => obstacle.solid),
  ]
  return { previous, current }
}

/**
 * Verifies that complete moving and tracking shapes remain inside the arena.
 *
 * @pure
 * @param {object} level Validated level configuration.
 * @returns {string[]} Actionable envelope validation errors.
 */
export function validateHazardEnvelopes(level) {
  const errors = []
  for (const obstacle of level.movingObstacles) {
    const extremes = [-obstacle.amplitude, obstacle.amplitude].map((offset) => ({
      ...obstacle,
      x: obstacle.x + (obstacle.axis === 'x' ? offset : 0),
      y: obstacle.y + (obstacle.axis === 'y' ? offset : 0),
    }))
    if (extremes.some((shape) => !shapeInsideArena(shape, level.arena))) {
      errors.push(`${obstacle.id}: moving envelope leaves the arena`)
    }
  }
  for (const obstacle of level.trackingObstacles) {
    const halfWidth = obstacle.width / 2
    const halfHeight = obstacle.height / 2
    const positions = [
      [obstacle.zone.x + halfWidth, obstacle.zone.y + halfHeight],
      [obstacle.zone.x + obstacle.zone.width - halfWidth, obstacle.zone.y + halfHeight],
      [obstacle.zone.x + halfWidth, obstacle.zone.y + obstacle.zone.height - halfHeight],
      [
        obstacle.zone.x + obstacle.zone.width - halfWidth,
        obstacle.zone.y + obstacle.zone.height - halfHeight,
      ],
    ]
    if (
      positions.some(([x, y]) =>
        !shapeInsideArena({ ...obstacle, x, y }, level.arena),
      )
    ) {
      errors.push(`${obstacle.id}: tracking zone leaves the arena`)
    }
  }
  for (const obstacle of level.dynamicObstacles ?? []) {
    if (
      dynamicObstacleEnvelope(obstacle).some(
        (shape) => !shapeInsideArena(shape, level.arena),
      )
    ) {
      errors.push(`${obstacle.id}: dynamic envelope leaves the arena`)
    }
  }
  return errors
}

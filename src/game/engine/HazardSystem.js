import {
  currentMovingObstacle,
  advanceTrackingObstacle,
  shapeInsideArena,
} from '../geometry/geometry.js'

function withCurrentPosition(obstacle, state) {
  return { ...obstacle, x: state.x, y: state.y }
}

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

  const current = [
    ...session.movingObstacles.map((obstacle) => ({
      ...obstacle,
      x: obstacle.currentX,
      y: obstacle.currentY,
    })),
    ...session.trackingObstacles.map((state, index) =>
      withCurrentPosition(session.level.trackingObstacles[index], state),
    ),
  ]
  return { previous, current }
}

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
  return errors
}

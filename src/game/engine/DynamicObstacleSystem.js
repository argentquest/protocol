/**
 * @typedef {'solid'|'open'|'warning'|'active'} DynamicObstacleState
 */

/**
 * Resolves one configuration-driven obstacle at deterministic hazard time.
 *
 * Coordinates and dimensions are returned in logical world units. The result
 * is serializable and is shared by collision and rendering.
 *
 * @pure
 * @param {object} obstacle Validated dynamic-obstacle configuration.
 * @param {number} timeMs Hazard simulation time in milliseconds.
 * @param {Map<string, object>} [switchStates] Switch state keyed by switch ID.
 * @returns {object & {solid: boolean, state: DynamicObstacleState}} Time-resolved obstacle.
 */
export function resolveDynamicObstacle(
  obstacle,
  timeMs,
  switchStates = new Map(),
) {
  const behavior = obstacle.behavior
  if (behavior.type === 'phase') {
    const localTime =
      ((timeMs + behavior.offsetMs) % behavior.cycleMs + behavior.cycleMs) %
      behavior.cycleMs
    const solid = localTime < behavior.solidMs
    const warning =
      !solid && localTime >= behavior.cycleMs - behavior.warningMs
    return {
      ...obstacle,
      solid,
      state: solid ? 'solid' : warning ? 'warning' : 'open',
    }
  }

  if (behavior.type === 'orbit') {
    const angle =
      (timeMs / behavior.periodMs) * Math.PI * 2 + behavior.phase
    return {
      ...obstacle,
      x: obstacle.x + Math.cos(angle) * behavior.radiusX,
      y: obstacle.y + Math.sin(angle) * behavior.radiusY,
      solid: true,
      state: 'active',
    }
  }

  if (behavior.type === 'pulse') {
    const angle =
      (timeMs / behavior.periodMs) * Math.PI * 2 + behavior.phase
    const blend = (Math.sin(angle) + 1) / 2
    const scale =
      behavior.minScale +
      (behavior.maxScale - behavior.minScale) * blend
    return {
      ...obstacle,
      width: obstacle.width * scale,
      height: obstacle.height * scale,
      scale,
      solid: true,
      state: 'active',
    }
  }

  if (behavior.type === 'rotate') {
    return {
      ...obstacle,
      rotationRadians:
        ((behavior.initialDegrees +
          (timeMs / 1000) * behavior.speedDegreesPerSecond) *
          Math.PI) /
        180,
      solid: true,
      state: 'active',
    }
  }

  const switchState = switchStates.get(behavior.switchId)
  const open =
    Boolean(switchState?.active) &&
    (switchState.openUntilMs === null || timeMs < switchState.openUntilMs)
  return {
    ...obstacle,
    solid: behavior.initiallySolid ? !open : open,
    state: behavior.initiallySolid
      ? open
        ? 'open'
        : 'solid'
      : open
        ? 'solid'
        : 'open',
  }
}

/**
 * Resolves every dynamic obstacle while retaining non-solid entries for rendering.
 *
 * @pure
 * @param {object[]} obstacles Validated dynamic-obstacle configurations.
 * @param {number} timeMs Hazard simulation time in milliseconds.
 * @param {Map<string, object>} [switchStates] Switch state keyed by switch ID.
 * @returns {object[]} Time-resolved dynamic obstacle states.
 */
export function resolveDynamicObstacles(
  obstacles,
  timeMs,
  switchStates = new Map(),
) {
  return obstacles.map((obstacle) =>
    resolveDynamicObstacle(obstacle, timeMs, switchStates),
  )
}

/**
 * Produces the largest collision envelope a dynamic behavior can occupy.
 *
 * @pure
 * @param {object} obstacle Validated dynamic-obstacle configuration.
 * @returns {object[]} Shapes whose containment guarantees the full behavior envelope.
 */
export function dynamicObstacleEnvelope(obstacle) {
  const behavior = obstacle.behavior
  if (behavior.type === 'orbit') {
    return [
      {
        ...obstacle,
        x: obstacle.x - behavior.radiusX,
        dynamicEnvelope: true,
      },
      {
        ...obstacle,
        x: obstacle.x + behavior.radiusX,
        dynamicEnvelope: true,
      },
      {
        ...obstacle,
        y: obstacle.y - behavior.radiusY,
        dynamicEnvelope: true,
      },
      {
        ...obstacle,
        y: obstacle.y + behavior.radiusY,
        dynamicEnvelope: true,
      },
    ]
  }
  if (behavior.type === 'pulse') {
    return [
      {
        ...obstacle,
        width: obstacle.width * behavior.maxScale,
        height: obstacle.height * behavior.maxScale,
        dynamicEnvelope: true,
      },
    ]
  }
  if (behavior.type === 'rotate') {
    const radius = Math.hypot(obstacle.width, obstacle.height)
    return [
      {
        ...obstacle,
        shape: 'circle',
        width: radius,
        height: radius,
        dynamicEnvelope: true,
      },
    ]
  }
  return [{ ...obstacle, dynamicEnvelope: true }]
}

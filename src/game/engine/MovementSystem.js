/**
 * Moves a scalar toward a target by a bounded amount.
 *
 * @pure
 * @param {number} current Current value.
 * @param {number} target Target value.
 * @param {number} maximumChange Maximum magnitude of change.
 * @returns {number} Next value.
 */
function approach(current, target, maximumChange) {
  const difference = target - current
  if (Math.abs(difference) <= maximumChange) return target
  return current + Math.sign(difference) * maximumChange
}

function desiredPointerVelocity(position, desiredPosition, movement) {
  const deltaX = desiredPosition.x - position.x
  const deltaY = desiredPosition.y - position.y
  const distance = Math.hypot(deltaX, deltaY)
  if (distance < 1e-6) return { x: 0, y: 0 }
  const stoppingSpeed = Math.sqrt(2 * movement.deceleration * distance)
  const speed = Math.min(movement.maximumSpeed, stoppingSpeed)
  return {
    x: (deltaX / distance) * speed,
    y: (deltaY / distance) * speed,
  }
}

function desiredKeyboardVelocity(directions, movement) {
  const horizontal =
    Number(directions.has('ArrowRight')) - Number(directions.has('ArrowLeft'))
  const vertical =
    Number(directions.has('ArrowDown')) - Number(directions.has('ArrowUp'))
  const magnitude = Math.hypot(horizontal, vertical)
  if (magnitude === 0) return { x: 0, y: 0 }
  return {
    x: (horizontal / magnitude) * movement.keyboardSpeed,
    y: (vertical / magnitude) * movement.keyboardSpeed,
  }
}

/**
 * Advances token velocity and position from pointer or keyboard intent.
 *
 * @pure
 * @param {object} inputs Motion inputs.
 * @param {import('../types.js').Point} inputs.position Position in logical world units.
 * @param {import('../types.js').Point} inputs.velocity Velocity in world units/second.
 * @param {import('../types.js').GameInputState} inputs.input Current input intent.
 * @param {object} inputs.movement Speed in world units/second and acceleration in world units/second².
 * @param {number} inputs.stepMs Fixed-step duration in milliseconds.
 * @returns {{position: import('../types.js').Point, velocity: import('../types.js').Point}} Next motion state.
 */
export function advanceTokenMotion({
  position,
  velocity,
  input,
  movement,
  stepMs,
}) {
  const stepSeconds = stepMs / 1000
  const desiredVelocity =
    input.mode === 'keyboard'
      ? desiredKeyboardVelocity(input.directions, movement)
      : desiredPointerVelocity(position, input.desiredPosition, movement)
  const isDecelerating =
    Math.abs(desiredVelocity.x) < Math.abs(velocity.x) ||
    Math.abs(desiredVelocity.y) < Math.abs(velocity.y)
  const rate = isDecelerating ? movement.deceleration : movement.acceleration
  const maximumChange = rate * stepSeconds
  const nextVelocity = {
    x: approach(velocity.x, desiredVelocity.x, maximumChange),
    y: approach(velocity.y, desiredVelocity.y, maximumChange),
  }
  const speed = Math.hypot(nextVelocity.x, nextVelocity.y)
  if (speed > movement.maximumSpeed) {
    nextVelocity.x = (nextVelocity.x / speed) * movement.maximumSpeed
    nextVelocity.y = (nextVelocity.y / speed) * movement.maximumSpeed
  }
  return {
    position: {
      x: position.x + nextVelocity.x * stepSeconds,
      y: position.y + nextVelocity.y * stepSeconds,
    },
    velocity: nextVelocity,
  }
}

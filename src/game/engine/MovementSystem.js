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

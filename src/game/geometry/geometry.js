const EPSILON = 0.0001

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function normalizeShape(shape) {
  const size = shape.size ?? 0
  return {
    ...shape,
    width: shape.width ?? size,
    height: shape.height ?? size,
  }
}

export function polygonForShape(input) {
  const shape = normalizeShape(input)
  const halfWidth = shape.width / 2
  const halfHeight = shape.height / 2

  if (shape.shape === 'polygon' && shape.points) {
    return shape.points.map(([x, y]) => ({ x, y }))
  }

  if (shape.shape === 'diamond') {
    return [
      { x: shape.x, y: shape.y - halfHeight },
      { x: shape.x + halfWidth, y: shape.y },
      { x: shape.x, y: shape.y + halfHeight },
      { x: shape.x - halfWidth, y: shape.y },
    ]
  }

  return [
    { x: shape.x - halfWidth, y: shape.y - halfHeight },
    { x: shape.x + halfWidth, y: shape.y - halfHeight },
    { x: shape.x + halfWidth, y: shape.y + halfHeight },
    { x: shape.x - halfWidth, y: shape.y + halfHeight },
  ]
}

export function pointInPolygon(point, polygon) {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]
    const b = polygon[previous]
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  }
  const amount = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  )
  const closest = { x: start.x + amount * dx, y: start.y + amount * dy }
  return (point.x - closest.x) ** 2 + (point.y - closest.y) ** 2
}

function circleIntersectsPolygon(circle, polygon) {
  if (pointInPolygon(circle, polygon)) return true
  const radiusSquared = circle.radius ** 2
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length
    if (squaredDistanceToSegment(circle, polygon[index], polygon[next]) <= radiusSquared) {
      return true
    }
  }
  return false
}

function projectPolygon(axis, polygon) {
  let minimum = Infinity
  let maximum = -Infinity
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  return { minimum, maximum }
}

function polygonsIntersect(first, second) {
  const polygons = [first, second]
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const next = (index + 1) % polygon.length
      const edge = {
        x: polygon[next].x - polygon[index].x,
        y: polygon[next].y - polygon[index].y,
      }
      const axis = { x: -edge.y, y: edge.x }
      const a = projectPolygon(axis, first)
      const b = projectPolygon(axis, second)
      if (a.maximum < b.minimum || b.maximum < a.minimum) return false
    }
  }
  return true
}

export function shapesIntersect(firstInput, secondInput) {
  const first = normalizeShape(firstInput)
  const second = normalizeShape(secondInput)
  const firstCircle = first.shape === 'circle'
  const secondCircle = second.shape === 'circle'

  if (firstCircle && secondCircle) {
    return distance(first, second) <= first.width / 2 + second.width / 2
  }

  if (firstCircle) {
    return circleIntersectsPolygon(
      { x: first.x, y: first.y, radius: first.width / 2 },
      polygonForShape(second),
    )
  }

  if (secondCircle) {
    return circleIntersectsPolygon(
      { x: second.x, y: second.y, radius: second.width / 2 },
      polygonForShape(first),
    )
  }

  return polygonsIntersect(polygonForShape(first), polygonForShape(second))
}

function sampleCircle(shape, count = 20) {
  const radius = shape.width / 2
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return {
      x: shape.x + Math.cos(angle) * radius,
      y: shape.y + Math.sin(angle) * radius,
    }
  })
}

export function shapeInsideArena(shapeInput, arena) {
  const shape = normalizeShape(shapeInput)
  const samples = shape.shape === 'circle' ? sampleCircle(shape) : polygonForShape(shape)

  if (arena.shape === 'polygon') {
    const polygon = arena.points.map(([x, y]) => ({ x, y }))
    return samples.every((point) => pointInPolygon(point, polygon))
  }

  const margin = arena.margin ?? 0
  if (arena.shape === 'ellipse') {
    const center = { x: 500, y: 500 }
    const radiusX = 500 - margin
    const radiusY = 500 - margin
    return samples.every((point) => {
      const dx = (point.x - center.x) / radiusX
      const dy = (point.y - center.y) / radiusY
      return dx * dx + dy * dy <= 1
    })
  }

  return samples.every(
    (point) =>
      point.x >= margin &&
      point.x <= 1000 - margin &&
      point.y >= margin &&
      point.y <= 1000 - margin,
  )
}

export function isSafePosition(token, arena, obstacles) {
  if (!shapeInsideArena(token, arena)) return false
  return !obstacles.some((obstacle) => shapesIntersect(token, obstacle))
}

export function sweepShape(from, to, shape, arena, obstacles) {
  const travel = distance(from, to)
  const sampleDistance = Math.max(4, Math.min(shape.width, shape.height) / 4)
  const steps = Math.max(1, Math.ceil(travel / sampleDistance))

  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps
    const candidate = {
      ...shape,
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    }
    if (!shapeInsideArena(candidate, arena)) {
      return { safe: false, point: candidate, collisionType: 'boundary' }
    }
    if (obstacles.some((obstacle) => shapesIntersect(candidate, obstacle))) {
      return { safe: false, point: candidate, collisionType: 'obstacle' }
    }
  }

  return { safe: true, point: to }
}

export function currentMovingObstacle(obstacle, elapsedMs) {
  const angle = (elapsedMs / obstacle.periodMs) * Math.PI * 2 + (obstacle.phase ?? 0)
  const offset = Math.sin(angle) * obstacle.amplitude
  return {
    ...obstacle,
    x: obstacle.x + (obstacle.axis === 'x' ? offset : 0),
    y: obstacle.y + (obstacle.axis === 'y' ? offset : 0),
  }
}

export function advanceTrackingObstacle(obstacle, previousState, target, deltaMs) {
  const state = {
    x: previousState?.x ?? obstacle.x,
    y: previousState?.y ?? obstacle.y,
    velocityX: previousState?.velocityX ?? 0,
    velocityY: previousState?.velocityY ?? 0,
  }
  const seconds = Math.min(0.05, Math.max(0, deltaMs / 1000))
  if (seconds <= 0) return state

  const dx = target.x - state.x
  const dy = target.y - state.y
  const magnitude = Math.hypot(dx, dy) || 1
  const desiredX = (dx / magnitude) * obstacle.maxSpeed
  const desiredY = (dy / magnitude) * obstacle.maxSpeed
  const changeX = desiredX - state.velocityX
  const changeY = desiredY - state.velocityY
  const changeMagnitude = Math.hypot(changeX, changeY) || 1
  const maximumChange = obstacle.acceleration * seconds
  const steeringScale = Math.min(1, maximumChange / changeMagnitude)
  state.velocityX += changeX * steeringScale
  state.velocityY += changeY * steeringScale
  state.x += state.velocityX * seconds
  state.y += state.velocityY * seconds

  const halfWidth = obstacle.width / 2
  const halfHeight = obstacle.height / 2
  const minimumX = obstacle.zone.x + halfWidth
  const maximumX = obstacle.zone.x + obstacle.zone.width - halfWidth
  const minimumY = obstacle.zone.y + halfHeight
  const maximumY = obstacle.zone.y + obstacle.zone.height - halfHeight
  if (state.x <= minimumX || state.x >= maximumX) {
    state.x = clamp(state.x, minimumX, maximumX)
    state.velocityX *= -0.35
  }
  if (state.y <= minimumY || state.y >= maximumY) {
    state.y = clamp(state.y, minimumY, maximumY)
    state.velocityY *= -0.35
  }
  return state
}

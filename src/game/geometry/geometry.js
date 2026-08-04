import { WORLD_HEIGHT, WORLD_WIDTH } from '../world.js'

const EPSILON = 0.0001

/**
 * Computes Euclidean separation between two world points.
 *
 * @pure
 * @param {import('../types.js').Point} a First point.
 * @param {import('../types.js').Point} b Second point.
 * @returns {number} Distance in logical world units.
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Restricts a scalar to an inclusive range.
 *
 * @pure
 * @param {number} value Input value.
 * @param {number} minimum Inclusive minimum.
 * @param {number} maximum Inclusive maximum.
 * @returns {number} Bounded value.
 */
export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * Normalizes shorthand size into explicit logical width and height.
 *
 * @pure
 * @param {object} shape Source geometry.
 * @returns {object} Shape with explicit dimensions in logical world units.
 */
export function normalizeShape(shape) {
  const size = shape.size ?? 0
  return {
    ...shape,
    width: shape.width ?? size,
    height: shape.height ?? size,
  }
}

/**
 * Returns a centered collision shape inset from its visible edge.
 * The tolerance and resulting dimensions use logical world units.
 *
 * @param {object} shapeInput Visual token geometry.
 * @param {number} toleranceUnits Inset from every visible edge, in world units.
 * @returns {object} Collision geometry with positive width and height.
 */
export function insetShape(shapeInput, toleranceUnits = 0) {
  const shape = normalizeShape(shapeInput)
  const inset = Math.max(0, Number(toleranceUnits) || 0) * 2
  return {
    ...shape,
    width: Math.max(EPSILON, shape.width - inset),
    height: Math.max(EPSILON, shape.height - inset),
  }
}

/**
 * Converts rectangle, diamond, or polygon geometry to world-space vertices.
 *
 * @pure
 * @param {object} input Shape in logical world coordinates.
 * @returns {import('../types.js').Point[]} Polygon vertices.
 */
export function polygonForShape(input) {
  const shape = normalizeShape(input)
  const halfWidth = shape.width / 2
  const halfHeight = shape.height / 2

  if (shape.shape === 'polygon' && shape.points) {
    return shape.points.map(([x, y]) => ({ x, y }))
  }

  let vertices
  if (shape.shape === 'diamond') {
    vertices = [
      { x: shape.x, y: shape.y - halfHeight },
      { x: shape.x + halfWidth, y: shape.y },
      { x: shape.x, y: shape.y + halfHeight },
      { x: shape.x - halfWidth, y: shape.y },
    ]
  } else {
    vertices = [
      { x: shape.x - halfWidth, y: shape.y - halfHeight },
      { x: shape.x + halfWidth, y: shape.y - halfHeight },
      { x: shape.x + halfWidth, y: shape.y + halfHeight },
      { x: shape.x - halfWidth, y: shape.y + halfHeight },
    ]
  }
  const rotation = shape.rotationRadians ?? 0
  if (!rotation) return vertices
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return vertices.map((point) => {
    const x = point.x - shape.x
    const y = point.y - shape.y
    return {
      x: shape.x + x * cosine - y * sine,
      y: shape.y + x * sine + y * cosine,
    }
  })
}

/**
 * Tests whether a world point lies inside a polygon.
 *
 * @pure
 * @param {import('../types.js').Point} point Point in logical world units.
 * @param {import('../types.js').Point[]} polygon Polygon vertices.
 * @returns {boolean} Whether the point is inside.
 */
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

/**
 * Computes the signed doubled area of a polygon.
 *
 * @pure
 * @param {Array<[number,number]>} points Ordered arena vertices in world units.
 * @returns {number} Signed doubled area in world units².
 */
function doubledPolygonArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0)
}

/**
 * Reports whether two closed line segments intersect, including collinear contact.
 *
 * @pure
 * @param {[number,number]} firstStart First segment start.
 * @param {[number,number]} firstEnd First segment end.
 * @param {[number,number]} secondStart Second segment start.
 * @param {[number,number]} secondEnd Second segment end.
 * @returns {boolean} Whether the segments intersect.
 */
function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  /** @param {[number,number]} start Segment start. @param {[number,number]} end Segment end. @param {[number,number]} point Test point. @returns {number} Signed orientation. */
  const orientation = (start, end, point) =>
    (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0])
  /** @param {[number,number]} start Segment start. @param {[number,number]} end Segment end. @param {[number,number]} point Collinear point. @returns {boolean} Whether the point lies on the segment bounds. */
  const onSegment = (start, end, point) =>
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  const firstA = orientation(firstStart, firstEnd, secondStart)
  const firstB = orientation(firstStart, firstEnd, secondEnd)
  const secondA = orientation(secondStart, secondEnd, firstStart)
  const secondB = orientation(secondStart, secondEnd, firstEnd)
  if (
    ((firstA > EPSILON && firstB < -EPSILON) ||
      (firstA < -EPSILON && firstB > EPSILON)) &&
    ((secondA > EPSILON && secondB < -EPSILON) ||
      (secondA < -EPSILON && secondB > EPSILON))
  ) {
    return true
  }
  return (
    (Math.abs(firstA) <= EPSILON && onSegment(firstStart, firstEnd, secondStart)) ||
    (Math.abs(firstB) <= EPSILON && onSegment(firstStart, firstEnd, secondEnd)) ||
    (Math.abs(secondA) <= EPSILON && onSegment(secondStart, secondEnd, firstStart)) ||
    (Math.abs(secondB) <= EPSILON && onSegment(secondStart, secondEnd, firstEnd))
  )
}

/**
 * Validates a simple polygon arena before generation or persistence.
 * Concave outlines are supported; crossed edges and degenerate outlines are not.
 *
 * @pure
 * @param {Array<[number,number]>} points Ordered arena vertices in world units.
 * @returns {string[]} Actionable polygon errors.
 */
export function validateArenaPolygon(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return ['Polygon arenas require at least three corners.']
  }
  const errors = []
  for (const [index, point] of points.entries()) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      point[0] < 0 ||
      point[0] > WORLD_WIDTH ||
      point[1] < 0 ||
      point[1] > WORLD_HEIGHT
    ) {
      errors.push(`Arena corner ${index + 1} must remain inside the 1600 × 900 world.`)
    }
  }
  if (errors.length) return errors
  if (Math.abs(doubledPolygonArea(points)) < 200) {
    errors.push('Polygon arena area is too small or degenerate.')
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      ) {
        continue
      }
      if (
        segmentsIntersect(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext],
        )
      ) {
        errors.push(
          `Arena edges ${first + 1} and ${second + 1} cross or touch.`,
        )
      }
    }
  }
  return [...new Set(errors)]
}

/**
 * Computes squared distance from a point to the nearest point on a segment.
 *
 * @pure
 * @param {object} point World point.
 * @param {object} start Segment start in world units.
 * @param {object} end Segment end in world units.
 * @returns {number} Squared distance in world units².
 */
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

/**
 * Tests a circle against polygon interior and edges.
 *
 * @pure
 * @param {{x:number,y:number,radius:number}} circle Circle in world units.
 * @param {object[]} polygon World-space polygon vertices.
 * @returns {boolean} Whether the shapes touch or overlap.
 */
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

/**
 * Projects polygon vertices onto a separating axis.
 *
 * @pure
 * @param {{x:number,y:number}} axis Unnormalized axis vector.
 * @param {object[]} polygon World-space vertices.
 * @returns {{minimum:number,maximum:number}} Scalar projection interval.
 */
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

/**
 * Applies the separating-axis theorem to two convex polygons.
 *
 * @pure
 * @param {object[]} first First polygon vertices.
 * @param {object[]} second Second polygon vertices.
 * @returns {boolean} Whether no separating axis exists.
 */
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

/**
 * Tests two complete collision shapes for overlap.
 *
 * @pure
 * @param {object} firstInput First collision shape.
 * @param {object} secondInput Second collision shape.
 * @returns {boolean} Whether the shapes touch or overlap.
 */
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

/**
 * Samples evenly spaced points around a circle boundary.
 *
 * @pure
 * @param {object} shape Circle geometry in world units.
 * @param {number} [count=20] Number of perimeter samples.
 * @returns {object[]} Boundary points in world units.
 */
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

/**
 * Tests whether an entire shape is contained by the configured arena.
 *
 * @pure
 * @param {object} shapeInput Collision shape in logical world coordinates.
 * @param {object} arena Arena boundary configuration.
 * @returns {boolean} Whether every sampled edge point remains inside.
 */
export function shapeInsideArena(shapeInput, arena) {
  const shape = normalizeShape(shapeInput)
  const samples = shape.shape === 'circle' ? sampleCircle(shape) : polygonForShape(shape)

  if (arena.shape === 'polygon') {
    const polygon = arena.points.map(([x, y]) => ({ x, y }))
    return samples.every((point) => pointInPolygon(point, polygon))
  }

  const margin = arena.margin ?? 0
  if (arena.shape === 'ellipse') {
    const center = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
    const radiusX = WORLD_WIDTH / 2 - margin
    const radiusY = WORLD_HEIGHT / 2 - margin
    return samples.every((point) => {
      const dx = (point.x - center.x) / radiusX
      const dy = (point.y - center.y) / radiusY
      return dx * dx + dy * dy <= 1
    })
  }

  return samples.every(
    (point) =>
      point.x >= margin &&
      point.x <= WORLD_WIDTH - margin &&
      point.y >= margin &&
      point.y <= WORLD_HEIGHT - margin,
  )
}

/**
 * Tests arena containment and obstacle clearance at one position.
 *
 * @pure
 * @param {object} token Token collision shape.
 * @param {object} arena Arena boundary.
 * @param {object[]} obstacles Static or time-resolved obstacle shapes.
 * @returns {boolean} Whether the token position is safe.
 */
export function isSafePosition(token, arena, obstacles) {
  if (!shapeInsideArena(token, arena)) return false
  return !obstacles.some((obstacle) => shapesIntersect(token, obstacle))
}

/**
 * Samples movement between two positions to prevent collision tunneling.
 *
 * @pure
 * @param {import('../types.js').Point} from Safe starting position.
 * @param {import('../types.js').Point} to Requested ending position.
 * @param {object} shape Token geometry at the starting position.
 * @param {object} arena Arena boundary.
 * @param {object[]} obstacles Obstacle shapes at the end of the fixed step.
 * @param {object[]} [previousObstacles=obstacles] Matching obstacle shapes at the start of the fixed step.
 * @returns {{safe: boolean, point: import('../types.js').Point, collisionType?: string}} Sweep result.
 */
export function sweepShape(
  from,
  to,
  shape,
  arena,
  obstacles,
  previousObstacles = obstacles,
) {
  const tokenTravel = distance(from, to)
  const previousById = new Map(
    previousObstacles.map((obstacle, index) => [
      obstacle.id ?? `obstacle-${index}`,
      obstacle,
    ]),
  )
  let maximumRelativeTravel = tokenTravel
  let smallestDimension = Math.min(shape.width, shape.height)
  for (let index = 0; index < obstacles.length; index += 1) {
    const obstacle = obstacles[index]
    const previous =
      previousById.get(obstacle.id ?? `obstacle-${index}`) ?? obstacle
    maximumRelativeTravel = Math.max(
      maximumRelativeTravel,
      tokenTravel +
        distance(previous, obstacle) +
        Math.abs(
          (obstacle.rotationRadians ?? 0) -
            (previous.rotationRadians ?? 0),
        ) *
          Math.hypot(obstacle.width, obstacle.height) /
          2,
    )
    smallestDimension = Math.min(
      smallestDimension,
      obstacle.width,
      obstacle.height,
    )
  }
  const sampleDistance = Math.max(2, smallestDimension / 4)
  const steps = Math.max(1, Math.ceil(maximumRelativeTravel / sampleDistance))

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
    const resolvedObstacles = obstacles.map((obstacle, index) => {
      const previous =
        previousById.get(obstacle.id ?? `obstacle-${index}`) ?? obstacle
      return {
        ...obstacle,
        x: previous.x + (obstacle.x - previous.x) * amount,
        y: previous.y + (obstacle.y - previous.y) * amount,
        width:
          previous.width + (obstacle.width - previous.width) * amount,
        height:
          previous.height + (obstacle.height - previous.height) * amount,
        rotationRadians:
          (previous.rotationRadians ?? 0) +
          ((obstacle.rotationRadians ?? 0) -
            (previous.rotationRadians ?? 0)) *
            amount,
      }
    })
    if (
      resolvedObstacles.some((obstacle) =>
        shapesIntersect(candidate, obstacle),
      )
    ) {
      return { safe: false, point: candidate, collisionType: 'obstacle' }
    }
  }

  return { safe: true, point: to }
}

/**
 * Resolves a sinusoidal moving obstacle at simulation time.
 *
 * @pure
 * @param {object} obstacle Moving-obstacle configuration.
 * @param {number} elapsedMs Hazard simulation time in milliseconds.
 * @returns {object} Obstacle with current world coordinates.
 */
export function currentMovingObstacle(obstacle, elapsedMs) {
  const angle = (elapsedMs / obstacle.periodMs) * Math.PI * 2 + (obstacle.phase ?? 0)
  const offset = Math.sin(angle) * obstacle.amplitude
  return {
    ...obstacle,
    x: obstacle.x + (obstacle.axis === 'x' ? offset : 0),
    y: obstacle.y + (obstacle.axis === 'y' ? offset : 0),
  }
}

/**
 * Smoothly follows a pointer target with frame-rate-independent response.
 *
 * @pure
 * @param {import('../types.js').Point} from Current position in world units.
 * @param {import('../types.js').Point} target Desired position in world units.
 * @param {number} deltaMs Step duration in milliseconds.
 * @param {number} responsePerSecond Exponential response rate per second.
 * @returns {import('../types.js').Point} Next position.
 */
export function followPointer(from, target, deltaMs, responsePerSecond) {
  const boundedDelta = Math.max(0, Math.min(deltaMs, 50))
  const blend = 1 - Math.exp(-responsePerSecond * (boundedDelta / 1000))
  return {
    x: from.x + (target.x - from.x) * blend,
    y: from.y + (target.y - from.y) * blend,
  }
}

/**
 * Advances a tracking hazard with bounded acceleration, turn rate, and zone.
 *
 * @pure
 * @param {object} obstacle Tracking-obstacle configuration; speed uses world units/second.
 * @param {object|null} previousState Previous position, velocity, and heading.
 * @param {import('../types.js').Point} target Token center in world units.
 * @param {number} deltaMs Step duration in milliseconds.
 * @returns {object} Next tracking state with heading in radians.
 */
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
  const desiredHeading = Math.atan2(dy, dx)
  const currentHeading =
    Math.hypot(state.velocityX, state.velocityY) > 0.001
      ? Math.atan2(state.velocityY, state.velocityX)
      : (previousState?.headingRadians ?? 0)
  const wrappedDifference =
    Math.atan2(
      Math.sin(desiredHeading - currentHeading),
      Math.cos(desiredHeading - currentHeading),
    )
  const maximumTurn =
    ((obstacle.turnRateDegreesPerSecond ?? 180) * Math.PI * seconds) / 180
  const heading =
    currentHeading +
    clamp(wrappedDifference, -maximumTurn, maximumTurn)
  const desiredX = Math.cos(heading) * obstacle.maxSpeed
  const desiredY = Math.sin(heading) * obstacle.maxSpeed
  const changeX = desiredX - state.velocityX
  const changeY = desiredY - state.velocityY
  const changeMagnitude = Math.hypot(changeX, changeY) || 1
  const maximumChange = obstacle.acceleration * seconds
  const steeringScale = Math.min(1, maximumChange / changeMagnitude)
  state.velocityX += changeX * steeringScale
  state.velocityY += changeY * steeringScale
  state.x += state.velocityX * seconds
  state.y += state.velocityY * seconds
  state.headingRadians = heading

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

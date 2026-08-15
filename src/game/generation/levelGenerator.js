import {
  isSafePosition,
  normalizeShape,
  shapeInsideArena,
  shapesIntersect,
  validateArenaPolygon,
} from '../geometry/geometry.js'
import { createSeededRandom, randomBetween, randomItem } from './seededRandom.js'
import { dynamicObstacleEnvelope } from '../engine/DynamicObstacleSystem.js'
import { surfaceHeightAt } from '../engine/TerrainSystem.js'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world.js'

/**
 * Resolves an authored point or samples one from its seeded region.
 *
 * @param {object} specification Fixed coordinates or generated-region contract.
 * @param {() => number} random Seeded random source.
 * @returns {{x:number,y:number}} World point.
 */
function resolvePoint(specification, random) {
  if (specification.mode !== 'generated') {
    const point = {
      x: specification.x,
      y: specification.y,
    }
    if (specification.elevation !== undefined) {
      point.elevation = specification.elevation
    }
    if (specification.visualHeight !== undefined) {
      point.visualHeight = specification.visualHeight
    }
    if (specification.collisionHeight !== undefined) {
      point.collisionHeight = specification.collisionHeight
    }
    return point
  }
  const region = specification.region
  const point = {
    x: randomBetween(random, region.x, region.x + region.width),
    y: randomBetween(random, region.y, region.y + region.height),
  }
  if (specification.elevation !== undefined) {
    point.elevation = specification.elevation
  }
  if (specification.visualHeight !== undefined) {
    point.visualHeight = specification.visualHeight
  }
  if (specification.collisionHeight !== undefined) {
    point.collisionHeight = specification.collisionHeight
  }
  return point
}

/**
 * Normalizes obstacle shorthand to explicit collision dimensions.
 *
 * @pure
 * @param {object} obstacle Authored obstacle.
 * @returns {object} Obstacle with width and height in world units.
 */
function normalizeObstacle(obstacle) {
  return normalizeShape({
    ...obstacle,
    width: obstacle.width ?? obstacle.size,
    height: obstacle.height ?? obstacle.size,
  })
}

/**
 * Normalizes a wall entity with a default ricochet response and one shared
 * rotation for authoritative collision and Three.js presentation.
 *
 * @pure
 * @param {object} wall Authored wall entity.
 * @returns {object} Wall with default fields applied.
 */
function normalizeWall(wall) {
  const restitution = Math.max(
    0.1,
    Math.min(1, Number(wall.restitution ?? 0.85)),
  )
  const rotationRadians = ((Number(wall.orientation ?? 0) % 360) * Math.PI) / 180
  return normalizeShape({
    ...wall,
    kind: wall.kind ?? 'interior',
    restitution,
    rotationRadians,
    visualRotationRadians: rotationRadians,
  })
}

/**
 * Tests a placement candidate against reserved geometry with clearance.
 *
 * @pure
 * @param {object} candidate Candidate collision shape.
 * @param {object[]} reserved Existing reserved shapes.
 * @param {number} minimumGap Required clearance in world units.
 * @returns {boolean} Whether the expanded candidate overlaps anything reserved.
 */
function overlapsReserved(candidate, reserved, minimumGap) {
  const expanded = {
    ...candidate,
    width: candidate.width + minimumGap,
    height: candidate.height + minimumGap,
  }
  return reserved.some((item) => shapesIntersect(expanded, item))
}

/**
 * Performs an eight-direction breadth-first search for a complete-token route.
 *
 * @pure
 * @param {object} options Arena, token, endpoints, obstacles, and grid size in world units.
 * @param {boolean} includePoints Whether to reconstruct route points.
 * @returns {import('../types.js').Point[]|null} Empty/reconstructed route, or `null` when blocked.
 */
function searchPath(
  { arena, token, start, target, obstacles, gridSize = 24 },
  includePoints,
) {
  const columns = Math.ceil(WORLD_WIDTH / gridSize)
  const rows = Math.ceil(WORLD_HEIGHT / gridSize)
  /** @param {number} column Grid column. @param {number} row Grid row. @returns {string} Stable cell key. */
  const key = (column, row) => `${column}:${row}`
  /** @param {object} point World point. @returns {{column:number,row:number}} Bounded grid cell. */
  const toCell = (point) => ({
    column: Math.max(0, Math.min(columns - 1, Math.floor(point.x / gridSize))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(point.y / gridSize))),
  })
  const startCell = toCell(start)
  const targetCell = toCell(target)
  const queue = [startCell]
  const visited = new Set([key(startCell.column, startCell.row)])
  const cameFrom = new Map()
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ]

  let queueIndex = 0
  while (queueIndex < queue.length) {
    const cell = queue[queueIndex]
    queueIndex += 1
    if (cell.column === targetCell.column && cell.row === targetCell.row) {
      if (!includePoints) return []

      const cells = []
      let cellKey = key(cell.column, cell.row)
      const startKey = key(startCell.column, startCell.row)
      while (cellKey !== startKey) {
        const [column, row] = cellKey.split(':').map(Number)
        cells.push({
          x: column * gridSize + gridSize / 2,
          y: row * gridSize + gridSize / 2,
        })
        cellKey = cameFrom.get(cellKey)
        if (!cellKey) break
      }
      cells.reverse()
      return [{ ...start }, ...cells.slice(0, -1), { ...target }]
    }

    for (const [xChange, yChange] of directions) {
      const next = { column: cell.column + xChange, row: cell.row + yChange }
      if (
        next.column < 0 ||
        next.row < 0 ||
        next.column >= columns ||
        next.row >= rows ||
        visited.has(key(next.column, next.row))
      ) {
        continue
      }
      const isTarget =
        next.column === targetCell.column && next.row === targetCell.row
      const point = isTarget
        ? target
        : {
            x: next.column * gridSize + gridSize / 2,
            y: next.row * gridSize + gridSize / 2,
          }
      const candidate = { ...token, x: point.x, y: point.y }
      if (!isSafePosition(candidate, arena, obstacles)) continue
      const from =
        cell.column === startCell.column && cell.row === startCell.row
          ? start
          : {
              x: cell.column * gridSize + gridSize / 2,
              y: cell.row * gridSize + gridSize / 2,
            }
      const midpoint = {
        ...token,
        x: (from.x + point.x) / 2,
        y: (from.y + point.y) / 2,
      }
      if (!isSafePosition(midpoint, arena, obstacles)) continue
      if (xChange !== 0 && yChange !== 0) {
        const horizontal = { ...token, x: point.x, y: from.y }
        const vertical = { ...token, x: from.x, y: point.y }
        if (
          !isSafePosition(horizontal, arena, obstacles) ||
          !isSafePosition(vertical, arena, obstacles)
        ) {
          continue
        }
      }
      const nextKey = key(next.column, next.row)
      visited.add(nextKey)
      cameFrom.set(nextKey, key(cell.column, cell.row))
      queue.push(next)
    }
  }

  return null
}

/**
 * Tests whether a collision-safe route exists for the complete token.
 *
 * @pure
 * @param {object} options Arena, token, endpoints, obstacles, and grid size.
 * @returns {boolean} Whether the grid search reaches the target.
 */
export function pathExists(options) {
  return searchPath(options, false) !== null
}

/**
 * Finds a collision-safe grid route for the complete configured token.
 *
 * @pure
 * @param {object} options Arena, token, endpoints, obstacles, and grid size.
 * @returns {import('../types.js').Point[]|null} Route in logical world units.
 */
export function findPath(options) {
  return searchPath(options, true)
}

/**
 * Creates one seeded obstacle candidate from level generation constraints.
 *
 * @param {object} level Level configuration.
 * @param {() => number} random Seeded random source.
 * @param {number} index Zero-based generated obstacle index.
 * @returns {object} Normalized obstacle candidate.
 */
function makeGeneratedObstacle(level, random, index) {
  const generation = level.generation
  const shape = randomItem(random, generation.allowedShapes)
  const width = randomBetween(random, generation.minSize, generation.maxSize)
  const height =
    shape === 'circle' || shape === 'diamond'
      ? width
      : randomBetween(random, generation.minSize * 0.55, generation.maxSize)
  return normalizeObstacle({
    id: `generated-${index + 1}`,
    mediaId: generation.mediaByShape[shape],
    shape,
    x: randomBetween(random, 90, WORLD_WIDTH - 90),
    y: randomBetween(random, 90, WORLD_HEIGHT - 90),
    width,
    height,
    generated: true,
  })
}

/**
 * Performs fast semantic validation before deterministic generation.
 *
 * @pure
 * @param {object} level Authored level configuration.
 * @returns {string[]} Validation errors.
 */
export function validateLevel(level) {
  const errors = []
  if (level.schemaVersion !== 2) errors.push('Unsupported schema version.')
  if (!level.id || !level.name || !level.seed) errors.push('Level identity is incomplete.')
  if (level.scoring.timeWeight + level.scoring.distanceWeight !== 1) {
    errors.push('Scoring weights must total 1.')
  }
  if (level.scoring.maximumCollisions !== 3) {
    errors.push('The initial release requires three maximum collisions.')
  }
  if (level.bonuses.maximumTargets > level.bonuses.targets.length) {
    errors.push('Bonus maximum exceeds configured targets.')
  }
  if (level.arena?.shape === 'polygon') {
    errors.push(...validateArenaPolygon(level.arena.points))
  }
  for (const tracker of level.trackingObstacles ?? []) {
    if (!tracker.zone || tracker.maxSpeed <= 0 || tracker.acceleration <= 0) {
      errors.push(`Tracking obstacle ${tracker.id ?? 'unknown'} is missing motion settings.`)
    }
  }
  for (const obstacle of level.dynamicObstacles ?? []) {
    const behavior = obstacle.behavior
    if (
      behavior.type === 'phase' &&
      behavior.solidMs + behavior.warningMs >= behavior.cycleMs
    ) {
      errors.push(
        `Dynamic obstacle ${obstacle.id} requires a non-zero open phase.`,
      )
    }
    if (
      behavior.type === 'pulse' &&
      behavior.minScale > behavior.maxScale
    ) {
      errors.push(
        `Dynamic obstacle ${obstacle.id} has an inverted pulse scale.`,
      )
    }
  }
  const switchIds = new Set((level.switches ?? []).map((item) => item.id))
  for (const obstacle of level.dynamicObstacles ?? []) {
    if (
      obstacle.behavior.type === 'switch' &&
      !switchIds.has(obstacle.behavior.switchId)
    ) {
      errors.push(
        `Dynamic obstacle ${obstacle.id} references unknown switch ${obstacle.behavior.switchId}.`,
      )
    }
  }
  return errors
}

/**
 * Validates generated entity containment, overlap, and hazard envelopes.
 *
 * @pure
 * @param {object} level Generated runtime level.
 * @returns {string[]} Unique placement errors.
 */
export function validateGeneratedPlacement(level) {
  const errors = []
  const hazards = [
    ...level.obstacles,
    ...level.movingObstacles,
    ...level.trackingObstacles,
    ...(level.dynamicObstacles ?? []).flatMap(dynamicObstacleEnvelope),
  ]
  const orderedTargets = [
    level.token,
    level.mainTarget,
    ...level.bonusTargets,
  ]
  const pickups = [...orderedTargets, ...level.coins, ...(level.switches ?? [])]
  for (const surface of level.terrainSurfaces ?? []) {
    if (!shapeInsideArena({ ...surface, shape: 'rect' }, level.arena)) {
      errors.push(`${surface.id} is outside the arena`)
    }
  }
  for (const entity of [...hazards, ...pickups]) {
    if (!shapeInsideArena(entity, level.arena)) {
      errors.push(`${entity.id ?? entity.mediaId} is outside the arena`)
    }
  }
  for (const pickup of pickups) {
    for (const hazard of hazards) {
      if (shapesIntersect(pickup, hazard)) {
        errors.push(`${pickup.id ?? pickup.mediaId} overlaps ${hazard.id}`)
      }
    }
  }
  for (let index = 1; index < orderedTargets.length; index += 1) {
    if (shapesIntersect(orderedTargets[index - 1], orderedTargets[index])) {
      errors.push(
        `${orderedTargets[index - 1].id ?? orderedTargets[index - 1].mediaId} overlaps ${orderedTargets[index].id}`,
      )
    }
  }
  const uniqueEntities = [...hazards, ...level.coins]
  for (let first = 0; first < uniqueEntities.length; first += 1) {
    for (let second = first + 1; second < uniqueEntities.length; second += 1) {
      if (
        uniqueEntities[first].dynamicEnvelope ||
        uniqueEntities[second].dynamicEnvelope
      ) {
        continue
      }
      // Perimeter walls form a continuous boundary and may touch at corners.
      if (
        uniqueEntities[first].kind === 'perimeter' &&
        uniqueEntities[second].kind === 'perimeter'
      ) {
        continue
      }
      if (shapesIntersect(uniqueEntities[first], uniqueEntities[second])) {
        errors.push(`${uniqueEntities[first].id} overlaps ${uniqueEntities[second].id}`)
      }
    }
  }
  for (const coin of level.coins) {
    for (const target of orderedTargets) {
      if (shapesIntersect(coin, target)) {
        errors.push(`${coin.id} overlaps ${target.id ?? target.mediaId}`)
      }
    }
  }
  for (const obstacle of level.movingObstacles) {
    for (const direction of [-1, 1]) {
      const position = {
        ...obstacle,
        x:
          obstacle.x +
          (obstacle.axis === 'x' ? obstacle.amplitude * direction : 0),
        y:
          obstacle.y +
          (obstacle.axis === 'y' ? obstacle.amplitude * direction : 0),
      }
      if (!shapeInsideArena(position, level.arena)) {
        errors.push(`${obstacle.id} leaves the arena during its sweep`)
      }
    }
  }
  for (const obstacle of level.trackingObstacles) {
    const halfWidth = obstacle.width / 2
    const halfHeight = obstacle.height / 2
    for (const x of [
      obstacle.zone.x + halfWidth,
      obstacle.zone.x + obstacle.zone.width - halfWidth,
    ]) {
      for (const y of [
        obstacle.zone.y + halfHeight,
        obstacle.zone.y + obstacle.zone.height - halfHeight,
      ]) {
        if (!shapeInsideArena({ ...obstacle, x, y }, level.arena)) {
          errors.push(`${obstacle.id} has an invalid tracking zone`)
        }
      }
    }
  }
  return [...new Set(errors)]
}

/**
 * Resolves the bounding box of the arena play area.
 *
 * @pure
 * @param {object} arena Authored arena configuration.
 * @returns {{x:number,y:number,width:number,height:number}} Bounding box in world units.
 */
function arenaBoundingBox(arena) {
  if (arena.shape === 'ellipse' || arena.shape === 'rect') {
    const margin = Number(arena.margin ?? 0)
    return {
      x: margin,
      y: margin,
      width: WORLD_WIDTH - margin * 2,
      height: WORLD_HEIGHT - margin * 2,
    }
  }
  if (arena.shape === 'polygon' && arena.points) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of arena.points) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }
  return { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }
}

/**
 * Generates a default four-wall perimeter that bounds the arena play area.
 * The walls are thin and positioned just inside the arena margin so the
 * token can never reach the arena boundary edge from the interior.
 * Horizontal walls are shortened by `thickness` at each end so the corners
 * do not overlap the vertical walls.
 *
 * Currently only supports rectangular and elliptical arenas; polygon arenas
 * require authored interior walls.
 *
 * @pure
 * @param {object} level Authored level configuration.
 * @returns {object[]} Normalized perimeter walls for the level.
 */
function generatePerimeterWalls(level) {
  if (level.disablePerimeterWalls) return []
  const arena = level.arena
  if (!arena) return []
  if (arena.shape !== 'rect' && arena.shape !== 'ellipse') return []
  const box = arenaBoundingBox(arena)
  const thickness = 14
  const halfT = thickness / 2
  /** @pure @param {string} suffix Wall-side suffix. @returns {string} Stable generated wall ID. */
  const id = (suffix) => `perimeter-wall-${suffix}`
  return [
    {
      id: id('top'),
      mediaId: 'wall-default',
      model3dId: 'kenney-minigolf-straight',
      shape: 'rect',
      x: box.x + box.width / 2,
      y: box.y + halfT,
      width: Math.max(0, box.width - 2 * thickness),
      height: thickness,
      kind: 'perimeter',
      orientation: 0,
    },
    {
      id: id('bottom'),
      mediaId: 'wall-default',
      model3dId: 'kenney-minigolf-straight',
      shape: 'rect',
      x: box.x + box.width / 2,
      y: box.y + box.height - halfT,
      width: Math.max(0, box.width - 2 * thickness),
      height: thickness,
      kind: 'perimeter',
      orientation: 0,
    },
    {
      id: id('left'),
      mediaId: 'wall-default',
      model3dId: 'kenney-minigolf-straight',
      shape: 'rect',
      x: box.x + halfT + 0.01,
      y: box.y + box.height / 2,
      width: Math.max(0, box.height - 2 * thickness),
      height: thickness,
      kind: 'perimeter',
      orientation: 90,
    },
    {
      id: id('right'),
      mediaId: 'wall-default',
      model3dId: 'kenney-minigolf-straight',
      shape: 'rect',
      x: box.x + box.width - halfT - 0.01,
      y: box.y + box.height / 2,
      width: Math.max(0, box.height - 2 * thickness),
      height: thickness,
      kind: 'perimeter',
      orientation: 90,
    },
  ].map(normalizeWall)
}

/**
 * Builds one deterministic, solvable runtime level from authored configuration.
 *
 * Coordinates and dimensions use the 1600 × 900 logical world.
 *
 * @param {object} level Validated authored level.
 * @returns {object} Generated runtime level with a validated route.
 * @throws {Error} When configuration or generated placement is invalid.
 */
export function generateLevel(level) {
  const errors = validateLevel(level)
  if (errors.length) throw new Error(`${level.id}: ${errors.join(' ')}`)

  const random = createSeededRandom(level.seed)
  const startPoint = resolvePoint(level.start, random)
  const targetPoint = resolvePoint(level.mainTarget, random)
  if (level.terrainSurfaces?.length) {
    startPoint.elevation ??= surfaceHeightAt(level, startPoint).height
    targetPoint.elevation ??= surfaceHeightAt(level, targetPoint).height
  }
  const token = normalizeShape({
    ...level.token,
    x: startPoint.x,
    y: startPoint.y,
  })
  const mainTarget = normalizeShape({
    visualOverrideId: level.mainTarget.visualOverrideId,
    audioOverrideId: level.mainTarget.audioOverrideId,
    model3dId: level.mainTarget.model3dId,
    model3dSize: level.mainTarget.model3dSize,
    id: 'main-target',
    mediaId: level.mainTarget.mediaId,
    shape: 'circle',
    size: level.mainTarget.size,
    x: targetPoint.x,
    y: targetPoint.y,
    elevation: targetPoint.elevation,
    collisionHeight: targetPoint.collisionHeight,
    visualHeight: targetPoint.visualHeight,
  })
  const bonusTargets = level.bonuses.targets.map((target) => {
    const normalized = normalizeShape({
      ...target,
      shape: 'circle',
      width: target.size,
      height: target.size,
    })
    if (
      normalized.elevation === undefined &&
      level.terrainSurfaces?.length
    ) {
      normalized.elevation = surfaceHeightAt(level, normalized).height
    }
    return normalized
  })
  const ramps = (level.ramps ?? []).map((ramp) => ({
    ...ramp,
    elevation:
      ramp.elevation ??
      (level.terrainSurfaces?.length
        ? surfaceHeightAt(level, ramp).height
        : undefined),
  }))
  const manualObstacles = (level.manualObstacles ?? []).map(normalizeObstacle)
  const movingObstacles = (level.movingObstacles ?? []).map(normalizeObstacle)
  const trackingObstacles = (level.trackingObstacles ?? []).map(normalizeObstacle)
  const dynamicObstacles = (level.dynamicObstacles ?? []).map(normalizeObstacle)
  const switches = (level.switches ?? []).map((item) =>
    normalizeShape({
      ...item,
      shape: 'circle',
      width: item.size,
      height: item.size,
    }),
  )
  const forceFields = (level.forceFields ?? []).map((item) =>
    item.type === 'conveyor'
      ? normalizeShape({ ...item, shape: 'rect' })
      : normalizeShape({
          ...item,
          shape: 'circle',
          width: item.radius * 2,
          height: item.radius * 2,
        }),
  )
  const coins = (level.coins ?? []).map((coin) =>
    normalizeShape({ ...coin, shape: 'circle', width: coin.size, height: coin.size }),
  )
  const authoredWalls = (level.walls ?? []).map(normalizeWall)
  const perimeterWalls = generatePerimeterWalls(level, random)
  const walls = [...authoredWalls, ...perimeterWalls]
  const generatedObstacles = []
  const reserved = [
    { ...token, width: token.width * 3.5, height: token.height * 3.5 },
    { ...mainTarget, width: mainTarget.width * 2.7, height: mainTarget.height * 2.7 },
    ...bonusTargets.map((target) => ({
      ...target,
      width: target.width * 2.7,
      height: target.height * 2.7,
    })),
    ...manualObstacles,
    ...walls,
    ...coins.map((coin) => ({
      ...coin,
      width: coin.width * 2.2,
      height: coin.height * 2.2,
    })),
    ...trackingObstacles,
    ...movingObstacles,
    ...dynamicObstacles.flatMap(dynamicObstacleEnvelope),
    ...switches,
    ...forceFields,
  ]

  for (let index = 0; index < level.generation.obstacleCount; index += 1) {
    let accepted = null
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = makeGeneratedObstacle(level, random, index)
      if (!shapeInsideArena(candidate, level.arena)) continue
      if (
        overlapsReserved(
          candidate,
          [...reserved, ...generatedObstacles],
          level.generation.minimumGap,
        )
      ) {
        continue
      }
      const proposed = [
        ...manualObstacles,
        ...generatedObstacles,
        ...authoredWalls,
        candidate,
      ]
      if (
        !pathExists({
          arena: level.arena,
          token,
          start: startPoint,
          target: targetPoint,
          obstacles: proposed,
          gridSize: level.generation.pathGrid,
        })
      ) {
        continue
      }
      accepted = candidate
      break
    }
    if (accepted) generatedObstacles.push(accepted)
  }

  const obstacles = [...manualObstacles, ...generatedObstacles]
  const configuredHazards = [
    ...obstacles,
    ...walls,
    ...movingObstacles,
    ...trackingObstacles,
    ...dynamicObstacles.flatMap(dynamicObstacleEnvelope),
  ]
  if (
    !shapeInsideArena(token, level.arena) ||
    configuredHazards.some((obstacle) => shapesIntersect(token, obstacle))
  ) {
    throw new Error(`${level.id}: start point overlaps a hazard or arena boundary.`)
  }
  if (
    !shapeInsideArena(mainTarget, level.arena) ||
    configuredHazards.some((obstacle) => shapesIntersect(mainTarget, obstacle))
  ) {
    throw new Error(`${level.id}: main target overlaps a hazard or arena boundary.`)
  }
  for (const target of bonusTargets) {
    if (!shapeInsideArena(target, level.arena)) {
      throw new Error(`${level.id}: bonus target ${target.id} is outside the arena.`)
    }
    if (configuredHazards.some((obstacle) => shapesIntersect(target, obstacle))) {
      throw new Error(`${level.id}: bonus target ${target.id} overlaps an obstacle.`)
    }
  }

  const placementErrors = validateGeneratedPlacement({
    arena: level.arena,
    token,
    mainTarget,
    bonusTargets,
    obstacles: [...obstacles, ...walls],
    movingObstacles,
    trackingObstacles,
    dynamicObstacles,
    ramps,
    coins,
    switches,
    forceFields,
    terrainSurfaces: level.terrainSurfaces ?? [],
  })
  if (placementErrors.length) {
    throw new Error(`${level.id}: ${placementErrors.join('; ')}.`)
  }

  const solvable = pathExists({
    arena: level.arena,
    token,
    start: startPoint,
    target: targetPoint,
    obstacles: [...obstacles, ...authoredWalls],
    gridSize: level.generation.pathGrid,
  })

  if (!solvable) {
    throw new Error(`${level.id}: configured manual course is not solvable.`)
  }

  let previousTarget = mainTarget
  for (const bonusTarget of bonusTargets) {
    if (
      !pathExists({
        arena: level.arena,
        token,
        start: previousTarget,
        target: bonusTarget,
        obstacles: [...obstacles, ...authoredWalls],
        gridSize: level.generation.pathGrid,
      })
    ) {
      throw new Error(
        `${level.id}: bonus target ${bonusTarget.id} is not reachable with the configured token.`,
      )
    }
    previousTarget = bonusTarget
  }

  const validatedPath = findPath({
    arena: level.arena,
    token,
    start: startPoint,
    target: targetPoint,
    obstacles: [...obstacles, ...authoredWalls],
    gridSize: level.generation.pathGrid,
  })

  return {
    ...level,
    startPoint,
    token,
    mainTarget,
    obstacles,
    walls,
    movingObstacles,
    trackingObstacles,
    dynamicObstacles,
    ramps,
    coins,
    switches,
    forceFields,
    bonusTargets,
    validatedPath,
    generationSummary: {
      requestedObstacles: level.generation.obstacleCount,
      generatedObstacles: generatedObstacles.length,
      solvable,
    },
  }
}

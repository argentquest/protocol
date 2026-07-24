import {
  isSafePosition,
  normalizeShape,
  shapeInsideArena,
  shapesIntersect,
} from '../geometry/geometry.js'
import { createSeededRandom, randomBetween, randomItem } from './seededRandom.js'

function resolvePoint(specification, random) {
  if (specification.mode !== 'generated') {
    return { x: specification.x, y: specification.y }
  }
  const region = specification.region
  return {
    x: randomBetween(random, region.x, region.x + region.width),
    y: randomBetween(random, region.y, region.y + region.height),
  }
}

function normalizeObstacle(obstacle) {
  return normalizeShape({
    ...obstacle,
    width: obstacle.width ?? obstacle.size,
    height: obstacle.height ?? obstacle.size,
  })
}

function overlapsReserved(candidate, reserved, minimumGap) {
  const expanded = {
    ...candidate,
    width: candidate.width + minimumGap,
    height: candidate.height + minimumGap,
  }
  return reserved.some((item) => shapesIntersect(expanded, item))
}

function searchPath(
  { arena, token, start, target, obstacles, gridSize = 24 },
  includePoints,
) {
  const columns = Math.ceil(1000 / gridSize)
  const rows = Math.ceil(1000 / gridSize)
  const key = (column, row) => `${column}:${row}`
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
      const point = {
        x: next.column * gridSize + gridSize / 2,
        y: next.row * gridSize + gridSize / 2,
      }
      const candidate = { ...token, x: point.x, y: point.y }
      if (!isSafePosition(candidate, arena, obstacles)) continue
      const nextKey = key(next.column, next.row)
      visited.add(nextKey)
      cameFrom.set(nextKey, key(cell.column, cell.row))
      queue.push(next)
    }
  }

  return null
}

export function pathExists(options) {
  return searchPath(options, false) !== null
}

export function findPath(options) {
  return searchPath(options, true)
}

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
    shape,
    x: randomBetween(random, 90, 910),
    y: randomBetween(random, 90, 910),
    width,
    height,
    generated: true,
  })
}

export function validateLevel(level) {
  const errors = []
  if (level.schemaVersion !== 1) errors.push('Unsupported schema version.')
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
  return errors
}

export function generateLevel(level) {
  const errors = validateLevel(level)
  if (errors.length) throw new Error(`${level.id}: ${errors.join(' ')}`)

  const random = createSeededRandom(level.seed)
  const startPoint = resolvePoint(level.start, random)
  const targetPoint = resolvePoint(level.mainTarget, random)
  const token = normalizeShape({
    shape: level.token.shape,
    size: level.token.size,
    x: startPoint.x,
    y: startPoint.y,
  })
  const mainTarget = normalizeShape({
    id: 'main-target',
    shape: 'circle',
    size: level.mainTarget.size,
    x: targetPoint.x,
    y: targetPoint.y,
  })
  const manualObstacles = (level.manualObstacles ?? []).map(normalizeObstacle)
  const generatedObstacles = []
  const reserved = [
    { ...token, width: token.width * 3.5, height: token.height * 3.5 },
    { ...mainTarget, width: mainTarget.width * 2.7, height: mainTarget.height * 2.7 },
    ...manualObstacles,
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
      const proposed = [...manualObstacles, ...generatedObstacles, candidate]
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
  const solvable = pathExists({
    arena: level.arena,
    token,
    start: startPoint,
    target: targetPoint,
    obstacles,
    gridSize: level.generation.pathGrid,
  })

  if (!solvable) {
    throw new Error(`${level.id}: configured manual course is not solvable.`)
  }

  const validatedPath = findPath({
    arena: level.arena,
    token,
    start: startPoint,
    target: targetPoint,
    obstacles,
    gridSize: level.generation.pathGrid,
  })

  return {
    ...level,
    startPoint,
    token,
    mainTarget,
    obstacles,
    movingObstacles: (level.movingObstacles ?? []).map(normalizeObstacle),
    bonusTargets: level.bonuses.targets.map((target) =>
      normalizeShape({ ...target, shape: 'circle', width: target.size, height: target.size }),
    ),
    validatedPath,
    generationSummary: {
      requestedObstacles: level.generation.obstacleCount,
      generatedObstacles: generatedObstacles.length,
      solvable,
    },
  }
}

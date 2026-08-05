import { beforeAll, describe, expect, it } from 'vitest'
import { gameplayConfig, levels } from '../../config/loadConfig.js'
import {
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from '../geometry/geometry.js'
import { findPath, generateLevel } from './levelGenerator.js'
import { dynamicObstacleEnvelope } from '../engine/DynamicObstacleSystem.js'

function pairs(items) {
  const result = []
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      result.push([items[first], items[second]])
    }
  }
  return result
}

function campaignFingerprint(level) {
  const source = JSON.stringify({
    startPoint: level.startPoint,
    mainTarget: level.mainTarget,
    obstacles: level.obstacles,
    validatedPath: level.validatedPath,
  })
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

describe('released V2 campaign', () => {
  let campaign

  beforeAll(async () => {
    campaign = []
    for (const config of levels) {
      campaign.push(generateLevel(config))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }, 240_000)

  it('keeps every initial entity inside the arena and free of overlap', () => {
    const errors = []
    for (const level of campaign) {
      const hazards = [
        ...level.obstacles,
        ...level.movingObstacles,
        ...level.trackingObstacles,
        ...(level.dynamicObstacles ?? []).flatMap(dynamicObstacleEnvelope),
      ]
      const pickups = [
        level.token,
        level.mainTarget,
        ...level.bonusTargets,
        ...level.coins,
        ...(level.switches ?? []),
      ]
      for (const entity of [...hazards, ...pickups]) {
        if (!shapeInsideArena(entity, level.arena)) {
          errors.push(`${level.id}:${entity.id ?? entity.mediaId} outside arena`)
        }
      }
      for (const pickup of pickups) {
        for (const hazard of hazards) {
          if (shapesIntersect(pickup, hazard)) {
            errors.push(`${level.id}:${pickup.id ?? pickup.mediaId}/${hazard.id}`)
          }
        }
      }
      const orderedTargets = [level.token, level.mainTarget, ...level.bonusTargets]
      for (let index = 1; index < orderedTargets.length; index += 1) {
        const first = orderedTargets[index - 1]
        const second = orderedTargets[index]
        if (shapesIntersect(first, second)) {
          errors.push(
            `${level.id}:${first.id ?? first.mediaId}/${second.id ?? second.mediaId}`,
          )
        }
      }
      for (const [first, second] of pairs(level.coins)) {
        if (shapesIntersect(first, second)) {
          errors.push(`${level.id}:${first.id}/${second.id}`)
        }
      }
      for (const coin of level.coins) {
        for (const target of orderedTargets) {
          if (shapesIntersect(coin, target)) {
            errors.push(`${level.id}:${coin.id}/${target.id ?? target.mediaId}`)
          }
        }
      }
      for (const [first, second] of pairs(hazards)) {
        if (first.dynamicEnvelope || second.dynamicEnvelope) continue
        if (shapesIntersect(first, second)) {
          errors.push(`${level.id}:${first.id}/${second.id}`)
        }
      }
    }
    expect(errors).toEqual([])
  })

  it('repeats deterministic fingerprints across every mechanic tier', () => {
    expect(campaign).toHaveLength(100)
    for (let index = 0; index < levels.length; index += 10) {
      expect(campaignFingerprint(generateLevel(levels[index]))).toBe(
        campaignFingerprint(campaign[index]),
      )
    }
  })

  it('distributes endpoints and obstacles across the full 16:9 arena', () => {
    const cellFor = (entity) =>
      `${Math.floor(entity.x / 400)}:${Math.floor(entity.y / 300)}`
    const startCoordinates = new Set(
      campaign.map((level) => `${level.startPoint.x}:${level.startPoint.y}`),
    )
    const targetCoordinates = new Set(
      campaign.map(
        (level) => `${level.mainTarget.x}:${level.mainTarget.y}`,
      ),
    )
    const startCells = new Set(campaign.map((level) => cellFor(level.startPoint)))
    const targetCells = new Set(
      campaign.map((level) => cellFor(level.mainTarget)),
    )
    const obstacleCells = new Set(
      campaign.flatMap((level) => level.obstacles.map(cellFor)),
    )
    const fingerprints = new Set(campaign.map(campaignFingerprint))

    expect(startCoordinates.size).toBe(100)
    expect(targetCoordinates.size).toBe(100)
    expect(startCells.size).toBe(12)
    expect(targetCells.size).toBe(12)
    expect(obstacleCells.size).toBe(12)
    expect(fingerprints.size).toBe(100)
    expect(
      campaign
        .filter((level) => level.id !== 'level-100')
        .every((level) =>
          level.obstacles.some((obstacle) => obstacle.generated),
        ),
    ).toBe(true)
    expect(campaign[99].obstacles).toEqual([])
  })

  it('keeps moving sweeps and full tracking zones inside their arenas', () => {
    for (const level of campaign) {
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
          expect(
            shapeInsideArena(position, level.arena),
            `${level.id}:${obstacle.id} moving envelope`,
          ).toBe(true)
        }
      }
      for (const obstacle of level.trackingObstacles) {
        const halfWidth = obstacle.width / 2
        const halfHeight = obstacle.height / 2
        const centers = [
          [obstacle.zone.x + halfWidth, obstacle.zone.y + halfHeight],
          [
            obstacle.zone.x + obstacle.zone.width - halfWidth,
            obstacle.zone.y + halfHeight,
          ],
          [
            obstacle.zone.x + halfWidth,
            obstacle.zone.y + obstacle.zone.height - halfHeight,
          ],
          [
            obstacle.zone.x + obstacle.zone.width - halfWidth,
            obstacle.zone.y + obstacle.zone.height - halfHeight,
          ],
        ]
        for (const [x, y] of centers) {
          expect(
            shapeInsideArena({ ...obstacle, x, y }, level.arena),
            `${level.id}:${obstacle.id} tracking zone`,
          ).toBe(true)
        }
      }
      for (const obstacle of level.dynamicObstacles ?? []) {
        for (const envelope of dynamicObstacleEnvelope(obstacle)) {
          expect(
            shapeInsideArena(envelope, level.arena),
            `${level.id}:${obstacle.id} dynamic envelope`,
          ).toBe(true)
        }
      }
    }
  })

  it('finds collision-safe routes through every ordered required target', async () => {
    for (const level of campaign) {
      let start = level.startPoint
      for (const target of [level.mainTarget, ...level.bonusTargets]) {
        const route = findPath({
          arena: level.arena,
          token: level.token,
          start,
          target,
          obstacles: level.obstacles,
          gridSize: level.generation.pathGrid,
        })
        expect(route?.length, `${level.id}:${target.id}`).toBeGreaterThan(1)
        for (let index = 1; index < route.length; index += 1) {
          expect(
            sweepShape(
              route[index - 1],
              route[index],
              level.token,
              level.arena,
              level.obstacles,
            ).safe,
            `${level.id}:${target.id}:segment-${index}`,
          ).toBe(true)
        }
        start = target
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }, 120_000)

  it('uses increasing score maxima and campaign-wide movement controls', () => {
    for (let index = 0; index < levels.length; index += 1) {
      const level = levels[index]
      if (index > 0) {
        expect(level.scoring.baseMaximum, level.id).toBeGreaterThan(
          levels[index - 1].scoring.baseMaximum,
        )
      }
      expect(level.scoring.parTimeMs, level.id).toBeGreaterThan(0)
      expect(level.scoring.parDistance, level.id).toBeGreaterThan(0)
      expect(level.movement.maximumSpeed, level.id).toBeGreaterThanOrEqual(
        gameplayConfig.input.keyboardSpeedUnitsPerSecond,
      )
      expect(level.movement.keyboardSpeed, level.id).toBeGreaterThanOrEqual(
        gameplayConfig.input.keyboardSpeedUnitsPerSecond,
      )
      expect(level.movement.keyboardSpeed, level.id).toBeLessThanOrEqual(
        level.movement.maximumSpeed,
      )
      expect(level.token.size, level.id).toBeGreaterThanOrEqual(28)
      expect(level.token.size, level.id).toBeLessThanOrEqual(58)
    }
  })
})

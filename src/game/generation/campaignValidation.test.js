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
  }, 180_000)

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

  it('matches the locked generation fingerprint for every released seed', () => {
    expect(campaign.map(campaignFingerprint)).toEqual([
      '0f5cb844',
      'cfaf951b',
      '43b4bb10',
      '6c0c4aec',
      'c0e230a6',
      '03d3e866',
      'c50db939',
      'd7d65241',
      '6226c7a4',
      '252160e5',
      '0c522348',
      '4f0933a8',
      '2eec734d',
      '9729127d',
      '13a6d04f',
      'f4876580',
      '324b59c4',
      '794c5c2b',
      '387a4013',
      '3f544f27',
      '8ceb4912',
      '1dd1a767',
      '94ea3a90',
      '9f36467c',
      'f8bf20e9',
      '09dbae66',
      '9b220d66',
      'd10a5827',
      '1f7968aa',
      '214c55da',
      'fed1635c',
      '1c953c72',
      'faa73d4e',
      '08f23011',
      '10845ed3',
      '3d23e10d',
      '8ad097e1',
      '46610502',
      '41842e70',
      '31a802f7',
      '9fe77436',
      '214296b9',
      '3f368540',
      'a4fb9d29',
      'f0ccee0b',
      '6499c2dd',
      '82d6fb78',
      '54c15adb',
      'c38ef0c2',
      'bed4a802',
      '2db57abe',
      '1cd632f8',
      '8ba2abf6',
      '9b6c9bb8',
      '2d61753f',
      '1870525c',
      '35274bef',
      'd77670f2',
      'df64e43e',
      '344ec4d8',
      '10dc918c',
      'bb192f29',
      '5ee8ccd3',
      '90b075e8',
      '5a8dda4e',
      'eb6ce1ae',
      'cf041c1d',
      'dd36bb9e',
      'e8b82edb',
      '3c9ee913',
    ])
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

  it('finds collision-safe routes through every ordered required target', () => {
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
    }
  })

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
      expect(level.movement.keyboardSpeed, level.id).toBe(
        gameplayConfig.input.keyboardSpeedUnitsPerSecond,
      )
      expect(level.token.size, level.id).toBeGreaterThanOrEqual(28)
      expect(level.token.size, level.id).toBeLessThanOrEqual(58)
    }
  })
})

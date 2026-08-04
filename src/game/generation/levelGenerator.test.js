import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { shapesIntersect } from '../geometry/geometry.js'
import { generateLevel, pathExists } from './levelGenerator.js'

describe('levelGenerator', () => {
  it('generates every configured level as a solvable course', () => {
    const routeDirections = new Set()
    const representativeLevels = [
      levels[0],
      levels[1],
      levels[9],
      levels[29],
      levels[39],
      levels[59],
      levels[69],
    ]
    for (const config of representativeLevels) {
      const level = generateLevel(config)
      const xChange = level.mainTarget.x - level.startPoint.x
      const yChange = level.mainTarget.y - level.startPoint.y
      routeDirections.add(`${Math.sign(xChange)}:${Math.sign(yChange)}`)
      expect(level.generationSummary.solvable, config.id).toBe(true)
      expect(
        pathExists({
          arena: level.arena,
          token: level.token,
          start: level.startPoint,
          target: level.mainTarget,
          obstacles: level.obstacles,
          gridSize: level.generation.pathGrid,
        }),
        config.id,
      ).toBe(true)
      expect(level.validatedPath?.length, config.id).toBeGreaterThan(1)
      expect(level.validatedPath[0], config.id).toEqual(level.startPoint)
      expect(level.validatedPath.at(-1), config.id).toEqual({
        x: level.mainTarget.x,
        y: level.mainTarget.y,
      })
      for (const bonusTarget of level.bonusTargets) {
        expect(
          [...level.obstacles, ...level.movingObstacles, ...level.trackingObstacles].some(
            (obstacle) => shapesIntersect(bonusTarget, obstacle),
          ),
          `${config.id}:${bonusTarget.id}`,
        ).toBe(false)
      }
    }
    expect(routeDirections).toEqual(new Set(['1:1', '1:-1', '-1:1', '-1:-1']))
  })

  it('is deterministic for the same seed and configuration', () => {
    const first = generateLevel(levels[4])
    const second = generateLevel(levels[4])
    expect(second.startPoint).toEqual(first.startPoint)
    expect(second.mainTarget).toEqual(first.mainTarget)
    expect(second.obstacles).toEqual(first.obstacles)
  })

  it('preserves authored manual obstacle coordinates', () => {
    const config = levels[1]
    const authored = config.manualObstacles[0]
    const level = generateLevel(config)
    expect(level.obstacles).toContainEqual(
      expect.objectContaining({
        id: authored.id,
        x: authored.x,
        y: authored.y,
      }),
    )
  })

  it('generates simple polygon arenas and rejects crossed boundaries', () => {
    const polygonLevel = {
      ...levels[0],
      arena: {
        shape: 'polygon',
        mediaId: 'arena-polygon',
        points: [
          [10, 15],
          [420, 5],
          [800, 20],
          [1200, 5],
          [1590, 15],
          [1595, 450],
          [1585, 890],
          [1100, 895],
          [700, 885],
          [250, 895],
          [5, 875],
          [15, 400],
        ],
      },
    }
    expect(generateLevel(polygonLevel).generationSummary.solvable).toBe(true)
    expect(() =>
      generateLevel({
        ...polygonLevel,
        arena: {
          ...polygonLevel.arena,
          points: [[20, 20], [1580, 880], [1580, 20], [20, 880]],
        },
      }),
    ).toThrow(/edges 1 and 3 cross or touch/i)
  })
})

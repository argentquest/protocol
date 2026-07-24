import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel, pathExists } from './levelGenerator.js'

describe('levelGenerator', () => {
  it('generates every configured level as a solvable course', () => {
    for (const config of levels) {
      const level = generateLevel(config)
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
    }
  })

  it('is deterministic for the same seed and configuration', () => {
    const first = generateLevel(levels[4])
    const second = generateLevel(levels[4])
    expect(second.startPoint).toEqual(first.startPoint)
    expect(second.mainTarget).toEqual(first.mainTarget)
    expect(second.obstacles).toEqual(first.obstacles)
  })

  it('preserves authored manual obstacle coordinates', () => {
    const level = generateLevel(levels[1])
    expect(level.obstacles).toContainEqual(
      expect.objectContaining({ id: 'deflector', x: 430, y: 430 }),
    )
  })
})

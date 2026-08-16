import { describe, expect, it } from 'vitest'
import { levels } from '../config/loadConfig.js'
import { getSchemaValidators } from '../config/validateConfig.js'
import { generateLevel } from '../game/generation/levelGenerator.js'
import {
  createKenneyDemoLevel,
  placeKenneyCourseTemplate,
} from './kenneyCourseBuilder.js'

describe('Kenney Course Builder', () => {
  it('expands a lane template into editable terrain and wall geometry', () => {
    const source = structuredClone(levels[0])
    const result = placeKenneyCourseTemplate(source, 'straight-fairway', {
      x: 700,
      y: 400,
      sequence: 'test',
    })

    expect(result.selection).toEqual({ group: 'terrainSurfaces', index: 0 })
    expect(result.level.terrainSurfaces[0]).toMatchObject({
      x: 700,
      y: 400,
      model3dId: 'kenney-minigolf-straight',
      model3dFit: 'footprint',
    })
    expect(result.level.walls).toHaveLength(2)
    expect(result.level.walls.every((wall) => wall.kind === 'interior')).toBe(true)
    expect(result.level.verticalPhysics).toBeDefined()
  })

  it('creates a schema-valid and solvable demonstration level', () => {
    const source = {
      ...structuredClone(levels[0]),
      internalId: '12345678-1234-1234-1234-123456789abc',
      id: 'level-101',
      number: 101,
    }
    const demo = createKenneyDemoLevel(source)
    const validateLevel = getSchemaValidators().level

    expect(validateLevel(demo), JSON.stringify(validateLevel.errors)).toBe(true)
    expect(() => generateLevel(demo)).not.toThrow()
    expect(demo.name).toBe('Kenney Builder Showcase')
    expect(demo.manualObstacles.map((item) => item.model3dId)).toEqual([
      'kenney-minigolf-structure-windmill',
      'kenney-minigolf-obstacle-diamond',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { createLevelSession } from './createLevelSession.js'
import { advanceTokenWithCollisions } from './CollisionSystem.js'

/**
 * Creates a wall directly in front of the token's start position.
 *
 * @pure
 * @param {object} generated Generated level with start point.
 * @returns {object} A wall entity sized to the token diameter.
 */
function wallInFrontOfToken(generated) {
  return {
    id: 'test-wall',
    mediaId: 'wall-default',
    model3dId: 'kenney-minigolf-straight',
    shape: 'rect',
    x: generated.startPoint.x + 60,
    y: generated.startPoint.y,
    width: 4,
    height: 12,
    kind: 'interior',
    restitution: 0.85,
  }
}

describe('V3 wall feature', () => {
  it('generates perimeter walls by default for rect arenas', () => {
    const generated = generateLevel(levels[0])
    const perimeterWalls = (generated.walls ?? []).filter(
      (wall) => wall.kind === 'perimeter',
    )
    expect(perimeterWalls).toHaveLength(4)
    const ids = perimeterWalls.map((wall) => wall.id).sort()
    expect(ids).toEqual([
      'perimeter-wall-bottom',
      'perimeter-wall-left',
      'perimeter-wall-right',
      'perimeter-wall-top',
    ])
    for (const wall of perimeterWalls) {
      expect(wall).toMatchObject({
        shape: 'rect',
        restitution: 0.85,
      })
      expect(wall.visualRotationRadians).toBeGreaterThanOrEqual(0)
    }
  })

  it('skips perimeter walls for polygon arenas', () => {
    const polygonLevel = {
      ...levels[0],
      arena: {
        shape: 'polygon',
        mediaId: 'arena-polygon',
        points: [
          [100, 100],
          [1500, 100],
          [1500, 800],
          [700, 885],
          [250, 895],
          [5, 875],
          [15, 400],
        ],
        margin: 0,
        cornerRadius: 0,
      },
      coins: [],
      manualObstacles: [],
    }
    const generated = generateLevel(polygonLevel)
    const perimeterWalls = (generated.walls ?? []).filter(
      (wall) => wall.kind === 'perimeter',
    )
    expect(perimeterWalls).toHaveLength(0)
  })

  it('blocks token movement when a wall is directly ahead', () => {
    const generated = generateLevel(levels[0])
    generated.obstacles = []
    generated.walls = [wallInFrontOfToken(generated)]
    const session = createLevelSession(generated, {
      generate: () => generated,
    })
    session.input.active = true
    session.input.mode = 'keyboard'
    session.input.directions.add('ArrowRight')
    for (let step = 0; step < 5; step += 1) {
      advanceTokenWithCollisions(session, 100, { walls: generated.walls })
    }
    expect(session.collisions.count).toBe(0)
    expect(session.token.position.x).toBeLessThanOrEqual(
      generated.startPoint.x + 4 + generated.token.size / 2,
    )
  })

  it('does not count wall contacts as hazard collisions', () => {
    const generated = generateLevel(levels[0])
    generated.obstacles = []
    generated.walls = [wallInFrontOfToken(generated)]
    const session = createLevelSession(generated, {
      generate: () => generated,
    })
    session.input.active = true
    session.input.mode = 'keyboard'
    session.input.directions.add('ArrowRight')
    for (let step = 0; step < 30; step += 1) {
      advanceTokenWithCollisions(session, 100, { walls: generated.walls })
    }
    expect(session.collisions.count).toBe(0)
  })

  it('emits a wall collision type when the token strikes a wall', () => {
    const generated = generateLevel(levels[0])
    generated.obstacles = []
    generated.walls = [wallInFrontOfToken(generated)]
    const session = createLevelSession(generated, {
      generate: () => generated,
    })
    session.input.active = true
    session.input.mode = 'keyboard'
    session.input.directions.add('ArrowRight')
    let wallHit = null
    for (let step = 0; step < 30; step += 1) {
      const result = advanceTokenWithCollisions(session, 100, {
        walls: generated.walls,
      })
      if (result.collisionType === 'wall') {
        wallHit = result
        break
      }
    }
    expect(wallHit).not.toBeNull()
    expect(wallHit.wallId).toBe('test-wall')
  })

  it('preserves authored walls in addition to the perimeter', () => {
    const generated = generateLevel(levels[0])
    generated.walls = [
      {
        id: 'interior-wall-1',
        mediaId: 'wall-default',
        model3dId: 'kenney-minigolf-straight',
        shape: 'rect',
        x: 800,
        y: 200,
        width: 100,
        height: 14,
        kind: 'interior',
        orientation: 45,
        restitution: 0.9,
      },
    ]
    const reGenerated = generateLevel(generated)
    const interiorWall = reGenerated.walls.find(
      (wall) => wall.id === 'interior-wall-1',
    )
    expect(interiorWall).toBeDefined()
    expect(interiorWall.kind).toBe('interior')
    expect(interiorWall.restitution).toBeCloseTo(0.9)
    expect(interiorWall.rotationRadians).toBeCloseTo(Math.PI / 4)
    expect(interiorWall.visualRotationRadians).toBe(interiorWall.rotationRadians)
  })
})

import { describe, expect, it } from 'vitest'
import {
  landingSurfaceBetween,
  reconcileTerrainSupport,
  sampleTerrainSurface,
  supportSurfaceAt,
  surfaceHeightAt,
  terrainMotionAt,
} from './TerrainSystem.js'

const slope = {
  id: 'east-rise',
  x: 100,
  y: 100,
  width: 100,
  height: 100,
  cornerElevations: {
    northWest: 0,
    northEast: 100,
    southEast: 100,
    southWest: 0,
  },
  friction: 40,
}

const level = {
  token: { size: 40 },
  shotMechanic: { dragPerSecond: 80 },
  verticalPhysics: { groundHeight: 0, gravity: 900, maximumStepHeight: 12 },
  terrainSurfaces: [slope],
}

describe('deterministic terrain surfaces', () => {
  it('samples exact height, normal, and downhill direction from the renderer triangles', () => {
    const sample = sampleTerrainSurface(slope, { x: 100, y: 100 })

    expect(sample.height).toBe(50)
    expect(sample.gradient).toEqual({ x: 1, y: 0 })
    expect(sample.normal.x).toBeCloseTo(-Math.SQRT1_2)
    expect(sample.normal.y).toBeCloseTo(Math.SQRT1_2)
    expect(sample.slopeDirection).toEqual({ x: -1, y: -0 })
  })

  it('returns base ground outside patches and the highest layer on a bridge', () => {
    const bridge = {
      ...slope,
      id: 'bridge',
      cornerElevations: {
        northWest: 120,
        northEast: 120,
        southEast: 120,
        southWest: 120,
      },
    }
    const stacked = { ...level, terrainSurfaces: [slope, bridge] }

    expect(surfaceHeightAt(stacked, { x: 100, y: 100 }).height).toBe(120)
    expect(surfaceHeightAt(stacked, { x: 10, y: 10 }).height).toBe(0)
    expect(supportSurfaceAt(stacked, { x: 100, y: 100 }, 0, 12).id).toBe('ground')
    expect(supportSurfaceAt(stacked, { x: 100, y: 100 }, 118, 12).id).toBe('bridge')
  })

  it('lands on the highest crossed layer and projects gravity downhill', () => {
    const landing = landingSurfaceBetween(level, { x: 100, y: 100 }, 90, 30)
    expect(landing.id).toBe('east-rise')
    expect(landing.height).toBe(50)

    const session = {
      level,
      token: { position: { x: 100, y: 100 }, elevation: 50 },
      vertical: { grounded: true, surfaceId: 'east-rise' },
    }
    const motion = terrainMotionAt(session)
    expect(motion.acceleration).toEqual({ x: -450, y: -0 })
    expect(motion.friction).toBe(40)
  })

  it('retains continuous support on the same steep triangle', () => {
    const session = {
      level,
      token: {
        position: { x: 150, y: 100 },
        elevation: 0,
        verticalVelocity: 0,
      },
      vertical: { grounded: true, surfaceId: 'east-rise' },
    }

    expect(reconcileTerrainSupport(session).id).toBe('east-rise')
    expect(session.token.elevation).toBe(100)
    expect(session.vertical.grounded).toBe(true)
  })
})

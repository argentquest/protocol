import { describe, expect, it } from 'vitest'
import { resolveDynamicObstacle } from './DynamicObstacleSystem.js'
import { resolveForceFieldAcceleration } from './ForceFieldSystem.js'
import { sweepShape } from '../geometry/geometry.js'

describe('force fields and rotating obstacles', () => {
  const token = {
    shape: 'circle',
    x: 500,
    y: 450,
    width: 40,
    height: 40,
  }

  it('combines conveyor and radial acceleration deterministically', () => {
    const acceleration = resolveForceFieldAcceleration(
      [
        {
          type: 'conveyor',
          x: 500,
          y: 450,
          width: 200,
          height: 100,
          directionDegrees: 0,
          force: 300,
        },
        {
          type: 'repulsor',
          x: 450,
          y: 450,
          radius: 100,
          force: 200,
        },
      ],
      token,
    )
    expect(acceleration.x).toBeCloseTo(400)
    expect(acceleration.y).toBeCloseTo(0)
  })

  it('applies an elevated force field only when token height overlaps it', () => {
    const field = {
      type: 'conveyor',
      x: 500,
      y: 450,
      width: 200,
      height: 100,
      elevation: 100,
      collisionHeight: 30,
      directionDegrees: 0,
      force: 300,
    }

    expect(resolveForceFieldAcceleration([field], { ...token, size: 40, elevation: 0 })).toEqual({ x: 0, y: 0 })
    expect(resolveForceFieldAcceleration([field], { ...token, size: 40, elevation: 110 }).x).toBeCloseTo(300)
  })

  it('resolves spinner angle from deterministic hazard time', () => {
    const spinner = resolveDynamicObstacle(
      {
        id: 'spinner',
        shape: 'rect',
        x: 500,
        y: 450,
        width: 200,
        height: 20,
        behavior: {
          type: 'rotate',
          speedDegreesPerSecond: 90,
          initialDegrees: 0,
        },
      },
      1000,
    )
    expect(spinner.rotationRadians).toBeCloseTo(Math.PI / 2)
  })

  it('detects contact across a rotating arm sweep', () => {
    const previous = {
      id: 'spinner',
      shape: 'rect',
      x: 500,
      y: 450,
      width: 220,
      height: 20,
      rotationRadians: 0,
    }
    const current = { ...previous, rotationRadians: Math.PI / 2 }
    const result = sweepShape(
      { x: 570, y: 510 },
      { x: 570, y: 510 },
      { ...token, x: 570, y: 510 },
      { shape: 'rect', margin: 0 },
      [current],
      [previous],
    )
    expect(result.safe).toBe(false)
    expect(result.collisionType).toBe('obstacle')
  })
})

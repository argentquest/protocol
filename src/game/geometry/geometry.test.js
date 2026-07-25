import { describe, expect, it } from 'vitest'
import {
  advanceTrackingObstacle,
  followPointer,
  insetShape,
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from './geometry.js'

describe('geometry', () => {
  it('insets token collision geometry by the configured world-unit tolerance', () => {
    expect(
      insetShape(
        { shape: 'diamond', x: 50, y: 50, width: 34, height: 34 },
        4,
      ),
    ).toMatchObject({ x: 50, y: 50, width: 26, height: 26 })
  })

  it('detects circle contact at the exact edge', () => {
    expect(
      shapesIntersect(
        { shape: 'circle', x: 0, y: 0, size: 20 },
        { shape: 'circle', x: 20, y: 0, size: 20 },
      ),
    ).toBe(true)
  })

  it('uses complete diamond geometry', () => {
    expect(
      shapesIntersect(
        { shape: 'diamond', x: 100, y: 100, size: 40 },
        { shape: 'rect', x: 120, y: 100, width: 10, height: 10 },
      ),
    ).toBe(true)
  })

  it('requires the complete token to remain in the arena', () => {
    const arena = { shape: 'rect', margin: 40 }
    expect(shapeInsideArena({ shape: 'circle', x: 60, y: 60, size: 30 }, arena)).toBe(true)
    expect(shapeInsideArena({ shape: 'circle', x: 45, y: 45, size: 30 }, arena)).toBe(false)
  })

  it('catches swept movement through a thin obstacle', () => {
    const result = sweepShape(
      { x: 100, y: 500 },
      { x: 900, y: 500 },
      { shape: 'circle', width: 30, height: 30 },
      { shape: 'rect', margin: 20 },
      [{ shape: 'rect', x: 500, y: 500, width: 20, height: 200 }],
    )
    expect(result.safe).toBe(false)
  })

  it('steers tracking obstacles gradually and keeps them inside their configured zone', () => {
    const obstacle = {
      x: 100,
      y: 100,
      width: 40,
      height: 40,
      zone: { x: 80, y: 80, width: 200, height: 200 },
      maxSpeed: 100,
      acceleration: 50,
    }
    const first = advanceTrackingObstacle(obstacle, null, { x: 900, y: 100 }, 50)
    expect(first.velocityX).toBeCloseTo(2.5)
    expect(first.velocityY).toBeCloseTo(0)

    let constrained = first
    for (let index = 0; index < 300; index += 1) {
      constrained = advanceTrackingObstacle(obstacle, constrained, { x: 900, y: 900 }, 50)
    }
    expect(constrained.x).toBeGreaterThanOrEqual(100)
    expect(constrained.x).toBeLessThanOrEqual(260)
    expect(constrained.y).toBeGreaterThanOrEqual(100)
    expect(constrained.y).toBeLessThanOrEqual(260)
  })

  it('smooths pointer movement instead of snapping the token to the cursor', () => {
    const next = followPointer({ x: 100, y: 100 }, { x: 900, y: 500 }, 16.67, 8)
    expect(next.x).toBeGreaterThan(100)
    expect(next.x).toBeLessThan(250)
    expect(next.y).toBeGreaterThan(100)
    expect(next.y).toBeLessThan(200)
  })
})

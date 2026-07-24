import { describe, expect, it } from 'vitest'
import {
  shapeInsideArena,
  shapesIntersect,
  sweepShape,
} from './geometry.js'

describe('geometry', () => {
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
})

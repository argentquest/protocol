import { describe, expect, it } from 'vitest'
import {
  entitySize,
  isResizableEntity,
  resizeEntity,
  snapToEditorGrid,
} from './levelEditorGeometry.js'

describe('Theme Workshop level editor geometry', () => {
  it('resizes a rectangle from one edge while anchoring the opposite edge', () => {
    const entity = { x: 200, y: 200, width: 100, height: 80 }

    expect(resizeEntity(entity, 'e', { x: 310, y: 200 })).toEqual({
      x: 230,
      y: 200,
      width: 160,
      height: 80,
    })
  })

  it('resizes size-based entities proportionally from a corner', () => {
    const entity = { x: 200, y: 200, size: 60 }

    expect(resizeEntity(entity, 'se', { x: 280, y: 250 })).toEqual({
      x: 230,
      y: 230,
      size: 110,
    })
  })

  it('keeps radius entities circular and inside the logical world', () => {
    const entity = { x: 1540, y: 450, radius: 30 }
    const resized = resizeEntity(entity, 'e', { x: 1800, y: 450 })

    expect(resized).toEqual({ x: 1550, y: 450, radius: 40 })
    expect(resized.x + resized.radius).toBeLessThanOrEqual(1600)
  })

  it('recognizes only schema-backed dimensions and snaps to 10 world units', () => {
    expect(isResizableEntity({ x: 100, y: 100 })).toBe(false)
    expect(isResizableEntity({ x: 100, y: 100, size: 40 })).toBe(true)
    expect(entitySize({ radius: 25 })).toEqual({ width: 50, height: 50 })
    expect(snapToEditorGrid(46)).toBe(50)
  })
})

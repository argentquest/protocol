import { describe, expect, it } from 'vitest'
import { gameplayConfig, levels, powerups } from './loadConfig.js'

describe('game configuration', () => {
  it('loads a contiguous 30-level campaign', () => {
    expect(levels).toHaveLength(30)
    expect(levels.map((level) => level.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    )
  })

  it('maps five unique consumable powers to unique number keys and sounds', () => {
    expect(powerups).toHaveLength(5)
    expect(new Set(powerups.map((powerup) => powerup.key)).size).toBe(5)
    expect(new Set(powerups.map((powerup) => powerup.sound)).size).toBe(5)
    expect(powerups.every((powerup) => powerup.durationMs > 0)).toBe(true)
  })

  it('uses a bounded pointer response so the token follows rather than snaps', () => {
    expect(gameplayConfig.input.pointerResponsePerSecond).toBeGreaterThan(0)
    expect(gameplayConfig.input.pointerResponsePerSecond).toBeLessThanOrEqual(12)
    expect(gameplayConfig.input.keyboardSpeedUnitsPerSecond).toBeGreaterThan(0)
  })
})

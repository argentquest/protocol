import { describe, expect, it } from 'vitest'
import {
  configurationStatus,
  gameplayConfig,
  levels,
  mediaDefinitions,
  microProtocols,
  powerups,
  soundDefinitions,
} from './loadConfig.js'

describe('game configuration', () => {
  it('loads a contiguous 100-level campaign', () => {
    expect(configurationStatus.errors).toEqual([])
    expect(levels).toHaveLength(100)
    expect(levels.map((level) => level.number)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    )
  })

  it('distributes ten progressive mechanic tiers', () => {
    for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
      expect(
        levels.filter((level) => level.difficulty === difficulty),
      ).toHaveLength(10)
    }
  })

  it('maps five unique consumable powers to unique number keys and sounds', () => {
    expect(powerups).toHaveLength(5)
    expect(new Set(powerups.map((powerup) => powerup.key)).size).toBe(5)
    expect(new Set(powerups.map((powerup) => powerup.soundId)).size).toBe(5)
    expect(powerups.every((powerup) => powerup.durationMs > 0)).toBe(true)
  })

  it('registers unique media and sound identifiers', () => {
    expect(new Set(mediaDefinitions.map((entry) => entry.mediaId)).size).toBe(
      mediaDefinitions.length,
    )
    expect(new Set(soundDefinitions.map((entry) => entry.soundId)).size).toBe(
      soundDefinitions.length,
    )
  })

  it('uses a bounded pointer response so the token follows rather than snaps', () => {
    expect(gameplayConfig.input.pointerResponsePerSecond).toBeGreaterThan(0)
    expect(gameplayConfig.input.pointerResponsePerSecond).toBeLessThanOrEqual(12)
    expect(gameplayConfig.input.keyboardSpeedUnitsPerSecond).toBeGreaterThan(0)
    expect(gameplayConfig.collision.tokenToleranceUnits).toBe(4)
    expect(gameplayConfig.kineticShot.minimumLaunchSpeed).toBeGreaterThan(0)
    expect(gameplayConfig.kineticShot.inputStyle).toBe('drag-release')
    expect(gameplayConfig.kineticShot.minimumAimDistance).toBeGreaterThan(0)
    expect(gameplayConfig.kineticShot.maximumLaunchSpeed).toBeGreaterThan(
      gameplayConfig.kineticShot.minimumLaunchSpeed,
    )
    expect(gameplayConfig.kineticShot.stopSpeed).toBeGreaterThan(0)
  })

  it('loads seven mechanic-matched Micro Protocols outside campaign progression', () => {
    expect(microProtocols).toHaveLength(7)
    expect(microProtocols.map((item) => item.id)).toEqual([
      'phase-window',
      'pulse-thread',
      'orbit-lock',
      'switchback',
      'crosscurrent',
      'gravity-well',
      'spinner-sync',
    ])
    expect(
      microProtocols.every(
        (item) => item.level?.number >= 201 && item.level?.number <= 207,
      ),
    ).toBe(true)
    expect(configurationStatus.valid).toBe(true)
  })

  it('loads two modeled V3 test holes at the end of the campaign', () => {
    const firstHole = levels[98]
    const secondHole = levels[99]

    expect(firstHole.name).toBe('Kenney Test Hole 1')
    expect(firstHole.token.model3dId).toBe('kenney-minigolf-ball-green')
    expect(firstHole.manualObstacles.map((item) => item.model3dId)).toEqual(
      expect.arrayContaining([
        'kenney-minigolf-windmill',
        'kenney-minigolf-castle',
        'kenney-minigolf-obstacle-diamond',
      ]),
    )
    expect(secondHole.name).toBe('Round Green')
    expect(secondHole.ramps[0].model3dId).toBe('kenney-minigolf-ramp-large')
    expect(secondHole.generation.obstacleCount).toBe(0)
    expect(secondHole.manualObstacles).toEqual([])
    expect(secondHole.mainTarget.model3dId).toBe(
      'kenney-minigolf-hole-round',
    )
    expect(secondHole.mainTarget.model3dSize).toBe(440)
    expect(secondHole.mainTarget.size).toBe(70)
  })
})

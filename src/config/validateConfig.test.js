import { describe, expect, it } from 'vitest'
import gameConfig from './gameConfig.json'
import {
  configurationStatus,
  levels,
} from './loadConfig.js'
import mediaRegistry from './mediaRegistry.json'
import powerupConfig from './powerup.json'
import soundRegistry from './soundRegistry.json'
import themeConfig from './themeConfig.json'
import threeMediaManifest from './generated/threeMediaManifest.json'
import { validateConfiguration } from './validateConfig.js'

const clone = (value) => structuredClone(value)

function validConfiguration() {
  return {
    levels: clone(levels),
    gameConfig: clone(gameConfig),
    powerupConfig: clone(powerupConfig),
    themeConfig: clone(themeConfig),
    mediaRegistry: clone(mediaRegistry),
    soundRegistry: clone(soundRegistry),
    threeMediaManifest: clone(threeMediaManifest),
  }
}

describe('V2 configuration validation', () => {
  it('accepts the complete campaign and registries', () => {
    expect(configurationStatus).toEqual({ valid: true, errors: [] })
  })

  it('accepts optional 3D properties on every authored object category', () => {
    const configuration = validConfiguration()
    const level = configuration.levels.find((item) => item.id === 'level-100')
    level.terrainSurfaces = [
      {
        id: 'schema-terrain',
        mediaId: 'obstacle-static-rect',
        x: 800,
        y: 450,
        width: 120,
        height: 120,
        cornerElevations: {
          northWest: 0,
          northEast: 40,
          southEast: 40,
          southWest: 0,
        },
        friction: 100,
        thickness: 10,
      },
    ]
    const objects = [
      level.token,
      level.start,
      level.mainTarget,
      ...(level.ramps ?? []),
      ...(level.manualObstacles ?? []),
      ...(level.movingObstacles ?? []),
      ...(level.trackingObstacles ?? []),
      ...(level.dynamicObstacles ?? []),
      ...(level.switches ?? []),
      ...(level.forceFields ?? []),
      ...(level.coins ?? []),
      ...(level.bonuses?.targets ?? []),
      ...(
        configuration.levels.find((item) => item.switches?.length)?.switches ??
        []
      ),
      ...(
        configuration.levels.find((item) => item.bonuses?.targets?.length)
          ?.bonuses.targets ?? []
      ),
    ]
    for (const object of objects) {
      object.elevation ??= 0
      object.visualHeight ??= 60
      object.collisionHeight ??= 1600
    }

    expect(validateConfiguration(configuration)).toEqual({ valid: true, errors: [] })
  })

  it('accepts registered 3D model choices and rejects unknown model IDs', () => {
    const configuration = validConfiguration()
    configuration.levels[0].token.model3dId = 'kenney-minigolf-ball-red'
    expect(validateConfiguration(configuration)).toEqual({ valid: true, errors: [] })

    configuration.levels[0].token.model3dId = 'kenney-minigolf-not-registered'
    expect(validateConfiguration(configuration).errors).toContain(
      'level-01: unknown model3dId "kenney-minigolf-not-registered"',
    )
  })

  it('reports missing required level fields', () => {
    const configuration = validConfiguration()
    delete configuration.levels[0].token.mediaId

    const result = validateConfiguration(configuration)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('mediaId'))).toBe(true)
  })

  it('rejects unregistered media and sound references', () => {
    const configuration = validConfiguration()
    configuration.levels[0].token.mediaId = 'unknown-token'
    configuration.powerupConfig.powerups[0].soundId = 'unknown-sound'

    const result = validateConfiguration(configuration)

    expect(result.errors).toContain('level-01: unknown mediaId "unknown-token"')
    expect(result.errors).toContain(
      'powerups/obstacle-shield: unknown soundId "unknown-sound"',
    )
  })

  it('rejects duplicate registry IDs and non-contiguous levels', () => {
    const configuration = validConfiguration()
    configuration.mediaRegistry.media[1].mediaId =
      configuration.mediaRegistry.media[0].mediaId
    configuration.levels[1].number = 4

    const result = validateConfiguration(configuration)

    expect(result.errors.some((error) => error.includes('duplicate mediaId'))).toBe(
      true,
    )
    expect(
      result.errors.some((error) => error.includes('campaign numbers must be contiguous')),
    ).toBe(true)
  })

  it('rejects an undefined active theme and mismatched media version', () => {
    const configuration = validConfiguration()
    configuration.themeConfig.activeTheme = 'missing-theme'
    configuration.themeConfig.mediaVersion += 1

    const result = validateConfiguration(configuration)

    expect(
      result.errors.some((error) => error.includes('active theme "missing-theme"')),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.includes('mediaVersion must match')),
    ).toBe(true)
  })

  it('accepts server-issued entity overrides and rejects arbitrary source IDs', () => {
    const configuration = validConfiguration()
    configuration.levels[0].coins[0].visualOverrideId =
      'entity-visual-12345678-1234-1234-1234-123456789abc'
    configuration.levels[0].coins[0].audioOverrideId =
      'entity-audio-12345678-1234-1234-1234-123456789abc'
    expect(validateConfiguration(configuration).valid).toBe(true)

    configuration.levels[0].coins[0].visualOverrideId =
      'public-media/images/coin.png'
    expect(validateConfiguration(configuration).valid).toBe(false)
  })

  it('rejects inconsistent kinetic shot goals', () => {
    const configuration = validConfiguration()
    configuration.levels[0].shotMechanic = clone(gameConfig.kineticShot)
    configuration.levels[0].shotGoals = {
      perfectShots: 5,
      par: 4,
      maximumShots: 3,
    }

    const result = validateConfiguration(configuration)

    expect(result.errors).toContain(
      'level-01: perfectShots cannot exceed shot par',
    )
    expect(result.errors).toContain(
      'level-01: maximumShots cannot be below shot par',
    )
  })
})

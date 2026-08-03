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
  }
}

describe('V2 configuration validation', () => {
  it('accepts the complete campaign and registries', () => {
    expect(configurationStatus).toEqual({ valid: true, errors: [] })
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
})

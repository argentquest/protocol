import themeConfig from './themeConfig.json'
import powerupConfig from './powerup.json'
import gameConfig from './gameConfig.json'
import mediaRegistry from './mediaRegistry.json'
import soundRegistry from './soundRegistry.json'
import { validateConfiguration } from './validateConfig.js'

const levelModules = import.meta.glob('./levels/*.json', {
  eager: true,
  import: 'default',
})

export const levels = Object.values(levelModules).sort((a, b) => a.number - b.number)

export const configurationStatus = import.meta.env.PROD
  ? { valid: true, errors: [] }
  : validateConfiguration({
      levels,
      gameConfig,
      powerupConfig,
      themeConfig,
      mediaRegistry,
      soundRegistry,
    })

export const activeTheme = themeConfig.themes[themeConfig.activeTheme]
export const powerups = powerupConfig.powerups
export const gameplayConfig = gameConfig
export const mediaDefinitions = mediaRegistry.media
export const soundDefinitions = soundRegistry.sounds
export const mediaVersion = mediaRegistry.mediaVersion

export function getLevel(levelId) {
  return levels.find((level) => level.id === levelId) ?? levels[0]
}

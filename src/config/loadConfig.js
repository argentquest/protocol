import themeConfig from './themeConfig.json'
import powerupConfig from './powerup.json'
import gameConfig from './gameConfig.json'
import mediaRegistry from './mediaRegistry.json'
import soundRegistry from './soundRegistry.json'
import microProtocolConfig from './microProtocols.json'
import kenneyCourseTemplateConfig from './kenneyCourseTemplates.json'
import threeMediaManifest from './generated/threeMediaManifest.json'
import { validateConfiguration } from './validateConfig.js'

const levelModules = import.meta.glob('./levels/*.json', {
  eager: true,
  import: 'default',
})
const microLevelModules = import.meta.glob('./micro-levels/*.json', {
  eager: true,
  import: 'default',
})

export const levels = Object.values(levelModules).sort((a, b) => a.number - b.number)
export const microLevels = Object.values(microLevelModules).sort(
  (a, b) => a.number - b.number,
)
export const microProtocols = microProtocolConfig.protocols.map((protocol) => ({
  ...protocol,
  level: microLevels.find((level) => level.id === protocol.levelId),
}))

export const configurationStatus = import.meta.env.PROD
  ? { valid: true, errors: [] }
  : validateConfiguration({
      levels,
      microLevels,
      microProtocolConfig,
      gameConfig,
      powerupConfig,
      themeConfig,
      mediaRegistry,
      soundRegistry,
      threeMediaManifest,
      kenneyCourseTemplateConfig,
    })

export const activeTheme = themeConfig.themes[themeConfig.activeTheme]
export const configuredThemeName = themeConfig.activeTheme
export const themeDefinitions = themeConfig.themes
export const powerups = powerupConfig.powerups
export const gameplayConfig = gameConfig
export const mediaDefinitions = mediaRegistry.media
export const soundDefinitions = soundRegistry.sounds
export const mediaVersion = mediaRegistry.mediaVersion
export const threeModelCatalog = threeMediaManifest
export const kenneyCourseTemplates = kenneyCourseTemplateConfig.templates

/**
 * Resolves a level by stable ID, falling back to the first campaign level.
 *
 * @pure
 * @param {string} levelId Stable level ID.
 * @returns {object} Validated level configuration.
 */
export function getLevel(levelId) {
  return levels.find((level) => level.id === levelId) ?? levels[0]
}

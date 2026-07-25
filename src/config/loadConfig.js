import themeConfig from './themeConfig.json'
import powerupConfig from './powerup.json'
import gameConfig from './gameConfig.json'

const levelModules = import.meta.glob('./levels/*.json', {
  eager: true,
  import: 'default',
})

export const levels = Object.values(levelModules).sort((a, b) => a.number - b.number)

export const activeTheme = themeConfig.themes[themeConfig.activeTheme]
export const powerups = powerupConfig.powerups
export const gameplayConfig = gameConfig

export function getLevel(levelId) {
  return levels.find((level) => level.id === levelId) ?? levels[0]
}

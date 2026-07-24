import themeConfig from './themeConfig.json'

const levelModules = import.meta.glob('./levels/*.json', {
  eager: true,
  import: 'default',
})

export const levels = Object.values(levelModules).sort((a, b) => a.number - b.number)

export const activeTheme = themeConfig.themes[themeConfig.activeTheme]

export function getLevel(levelId) {
  return levels.find((level) => level.id === levelId) ?? levels[0]
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverThemeNames } from './lib/audio-pipeline.mjs'
import {
  findUnknownMediaFiles,
  resolveThemeManifest,
} from './lib/media-manifest.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicMediaRoot = path.join(projectRoot, 'public', 'media')
const defaultRoot = path.join(publicMediaRoot, 'default')
const themesRoot = path.join(publicMediaRoot, 'themes')
const manifestsRoot = path.join(publicMediaRoot, 'manifests')
/**
 * Reads and parses a repository-relative JSON document.
 *
 * @param {...string} segments Path segments below the repository root.
 * @returns {Promise<object>} Parsed JSON value.
 */
const readJson = async (...segments) =>
  JSON.parse(await readFile(path.join(projectRoot, ...segments), 'utf8'))

const mediaRegistry = await readJson('src', 'config', 'mediaRegistry.json')
const soundRegistry = await readJson('src', 'config', 'soundRegistry.json')
const themeConfig = await readJson('src', 'config', 'themeConfig.json')
const defaultAudioSettings = await readJson(
  'public',
  'media',
  'default',
  'audio.json',
)
const configuredThemeNames = Object.keys(themeConfig.themes).sort()
const directoryThemeNames = await discoverThemeNames(themesRoot)
const unknownThemeDirectories = directoryThemeNames.filter(
  (themeName) => !configuredThemeNames.includes(themeName),
)
if (unknownThemeDirectories.length) {
  throw new Error(
    `Theme directories are not configured: ${unknownThemeDirectories.join(', ')}`,
  )
}

await mkdir(manifestsRoot, { recursive: true })
const unknownDefaults = await findUnknownMediaFiles(
  defaultRoot,
  mediaRegistry,
  soundRegistry,
)
if (unknownDefaults.length) {
  throw new Error(`Unknown default media files: ${unknownDefaults.join(', ')}`)
}
const scopes = ['default', ...configuredThemeNames]
for (const themeName of scopes) {
  const isDefault = themeName === 'default'
  const theme = isDefault ? null : themeConfig.themes[themeName]
  const { manifest, warnings } = await resolveThemeManifest({
    themeName,
    mediaVersion: mediaRegistry.mediaVersion,
    mediaRegistry,
    soundRegistry,
    defaultRoot,
    defaultRootUrl: themeConfig.defaultMediaRoot,
    themeRoot: isDefault ? null : path.join(themesRoot, themeName),
    themeRootUrl: isDefault ? null : theme.mediaRoot,
    defaultAudioSettings,
  })
  if (!isDefault) {
    const unknownThemeFiles = await findUnknownMediaFiles(
      path.join(themesRoot, themeName),
      mediaRegistry,
      soundRegistry,
    )
    warnings.push(
      ...unknownThemeFiles.map((fileName) => `${themeName}: unknown media file ${fileName}`),
    )
  }
  await writeFile(
    path.join(manifestsRoot, `${themeName}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  if (process.env.NODE_ENV !== 'production') {
    for (const warning of warnings) console.warn(`[media fallback] ${warning}`)
  }
}

console.log(`Generated ${scopes.length} resolved media manifests.`)

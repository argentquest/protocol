import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (...segments) =>
  JSON.parse(await readFile(path.join(projectRoot, ...segments), 'utf8'))

const themeConfig = await readJson('src', 'config', 'themeConfig.json')
const mediaRegistry = await readJson('src', 'config', 'mediaRegistry.json')
const soundRegistry = await readJson('src', 'config', 'soundRegistry.json')
const manifestSchema = await readJson(
  'src',
  'config',
  'schemas',
  'resolvedMediaManifest.schema.json',
)
const validateManifest = new Ajv2020({ allErrors: true, strict: false }).compile(
  manifestSchema,
)
const expectedVisuals = new Set(mediaRegistry.media.map((entry) => entry.mediaId))
const expectedSounds = new Set(soundRegistry.sounds.map((entry) => entry.soundId))
const errors = []
const summaries = []

for (const [themeName, theme] of Object.entries(themeConfig.themes).sort()) {
  const themeDirectory = path.join(projectRoot, 'public', theme.mediaRoot)
  try {
    await access(themeDirectory)
  } catch {
    errors.push(`${themeName}: configured media directory does not exist`)
  }
  let manifest
  try {
    manifest = await readJson('public', 'media', 'manifests', `${themeName}.json`)
  } catch (error) {
    errors.push(`${themeName}: manifest is missing or invalid JSON (${error.message})`)
    continue
  }
  if (!validateManifest(manifest)) {
    errors.push(
      ...validateManifest.errors.map(
        (error) => `${themeName}${error.instancePath || '/'}: ${error.message}`,
      ),
    )
    continue
  }
  const visualIds = new Set(manifest.visuals.map((entry) => entry.mediaId))
  const soundIds = new Set(manifest.audio.map((entry) => entry.soundId))
  for (const mediaId of expectedVisuals) {
    if (!visualIds.has(mediaId)) errors.push(`${themeName}: missing visual ${mediaId}`)
  }
  for (const soundId of expectedSounds) {
    if (!soundIds.has(soundId)) errors.push(`${themeName}: missing sound ${soundId}`)
  }
  summaries.push({
    themeName,
    visualOverrides: manifest.visuals.filter((entry) => entry.sourceScope === 'theme')
      .length,
    audioOverrides: manifest.audio.filter((entry) => entry.fileSourceScope === 'theme')
      .length,
  })
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  for (const summary of summaries) {
    console.log(
      `${summary.themeName}: ${summary.visualOverrides} visual and ${summary.audioOverrides} audio overrides`,
    )
  }
  console.log(`Validated ${summaries.length} configured presentation themes.`)
}

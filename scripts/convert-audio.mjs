import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegStatic from 'ffmpeg-static'
import {
  convertAudioDirectory,
  discoverThemeNames,
  fileExists,
} from './lib/audio-pipeline.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicMediaRoot = path.join(projectRoot, 'public', 'media')
const registry = JSON.parse(
  await readFile(path.join(projectRoot, 'src', 'config', 'soundRegistry.json'), 'utf8'),
)
const soundIds = registry.sounds.map((sound) => sound.soundId)
const force = process.argv.includes('--force')
const configuredPath = process.env.PATH_PROTOCOL_FFMPEG
const ffmpegPath =
  configuredPath && (await fileExists(configuredPath))
    ? configuredPath
    : ffmpegStatic && (await fileExists(ffmpegStatic))
      ? ffmpegStatic
      : null

const defaultAudioRoot = path.join(publicMediaRoot, 'default', 'audio')
const defaultPlan = await convertAudioDirectory({
  ffmpegPath,
  sourceDirectory: path.join(defaultAudioRoot, 'source'),
  outputDirectory: defaultAudioRoot,
  soundIds,
  force,
  requireAllSources: true,
})

let generated = defaultPlan.jobs.length
const themesRoot = path.join(publicMediaRoot, 'themes')
for (const themeName of await discoverThemeNames(themesRoot)) {
  const themeAudioRoot = path.join(themesRoot, themeName, 'audio')
  const plan = await convertAudioDirectory({
    ffmpegPath,
    sourceDirectory: path.join(themeAudioRoot, 'source'),
    outputDirectory: themeAudioRoot,
    soundIds,
    force,
    requireAllSources: false,
  })
  generated += plan.jobs.length
}

console.log(
  `${force ? 'Forced' : 'Normal'} audio conversion complete: ${generated} delivery files generated.`,
)

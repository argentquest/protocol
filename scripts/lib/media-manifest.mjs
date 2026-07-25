import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { validateSvgSource } from './validate-svg.mjs'
import { validateWavBuffer } from './validate-audio.mjs'

const requiredPlaybackKeys = [
  'volume',
  'cooldownMs',
  'loop',
  'fadeInMs',
  'fadeOutMs',
  'channel',
]

function toUrl(root, ...segments) {
  return [root.replace(/\/$/, ''), ...segments].join('/')
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function isNonEmptyFile(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile() && fileStats.size > 0
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function listFiles(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

export async function findUnknownMediaFiles(root, mediaRegistry, soundRegistry) {
  const unknown = []
  const categories = [...new Set(mediaRegistry.media.map((entry) => entry.category))]
  for (const category of categories) {
    const allowed = new Set(
      mediaRegistry.media
        .filter((entry) => entry.category === category)
        .map((entry) => entry.fileName),
    )
    for (const fileName of await listFiles(path.join(root, category))) {
      if (fileName.endsWith('.svg') && !allowed.has(fileName)) {
        unknown.push(`${category}/${fileName}`)
      }
    }
  }

  const audioRoot = path.join(root, 'audio')
  const audioNames = new Set(soundRegistry.sounds.map((entry) => entry.fileName))
  for (const fileName of await listFiles(audioRoot)) {
    if (fileName === 'audio.json') continue
    const match = /^(.+)\.(webm|mp3)$/.exec(fileName)
    if (match && !audioNames.has(match[1])) unknown.push(`audio/${fileName}`)
  }
  for (const fileName of await listFiles(path.join(audioRoot, 'source'))) {
    const match = /^(.+)\.wav$/.exec(fileName)
    if (match && !audioNames.has(match[1])) unknown.push(`audio/source/${fileName}`)
  }
  return unknown.sort()
}

export function isCompletePlaybackEntry(entry, channel) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  if (Object.keys(entry).length !== requiredPlaybackKeys.length) return false
  if (!requiredPlaybackKeys.every((key) => Object.hasOwn(entry, key))) return false
  return (
    typeof entry.volume === 'number' &&
    entry.volume >= 0 &&
    entry.volume <= 1 &&
    Number.isInteger(entry.cooldownMs) &&
    entry.cooldownMs >= 0 &&
    typeof entry.loop === 'boolean' &&
    Number.isInteger(entry.fadeInMs) &&
    entry.fadeInMs >= 0 &&
    Number.isInteger(entry.fadeOutMs) &&
    entry.fadeOutMs >= 0 &&
    entry.channel === channel
  )
}

async function validateVisualFile(filePath, label) {
  const source = await readOptional(filePath)
  if (!source) return { exists: false, errors: [] }
  return {
    exists: true,
    errors: validateSvgSource(source.toString('utf8'), label),
  }
}

async function validateAudioSet(audioRoot, soundId) {
  const sourcePath = path.join(audioRoot, 'source', `${soundId}.wav`)
  const source = await readOptional(sourcePath)
  if (!source) return { exists: false, valid: false, errors: [] }
  const errors = validateWavBuffer(source, `${soundId}.wav`)
  for (const format of ['webm', 'mp3']) {
    if (!(await isNonEmptyFile(path.join(audioRoot, `${soundId}.${format}`)))) {
      errors.push(`${soundId}.${format}: missing or empty delivery file`)
    }
  }
  return { exists: true, valid: errors.length === 0, errors }
}

async function readThemeSettings(themeRoot, warnings) {
  if (!themeRoot) return null
  const source = await readOptional(path.join(themeRoot, 'audio.json'))
  if (!source) return null
  try {
    return JSON.parse(source.toString('utf8'))
  } catch (error) {
    warnings.push(`theme audio.json is invalid JSON: ${error.message}`)
    return null
  }
}

export async function resolveThemeManifest({
  themeName,
  mediaVersion,
  mediaRegistry,
  soundRegistry,
  defaultRoot,
  defaultRootUrl = '/media/default',
  themeRoot = null,
  themeRootUrl = null,
  defaultAudioSettings,
}) {
  const warnings = []
  const errors = []
  const visuals = []

  for (const entry of mediaRegistry.media) {
    const relativeSegments = [entry.category, entry.fileName]
    const defaultFile = path.join(defaultRoot, ...relativeSegments)
    const defaultValidation = await validateVisualFile(
      defaultFile,
      `default/${relativeSegments.join('/')}`,
    )
    if (!defaultValidation.exists) {
      errors.push(`default/${relativeSegments.join('/')}: required asset is missing`)
      continue
    }
    if (defaultValidation.errors.length) {
      errors.push(...defaultValidation.errors)
      continue
    }

    let sourceScope = 'default'
    let sourceRootUrl = defaultRootUrl
    if (themeRoot && themeRootUrl) {
      const themeValidation = await validateVisualFile(
        path.join(themeRoot, ...relativeSegments),
        `${themeName}/${relativeSegments.join('/')}`,
      )
      if (themeValidation.exists && themeValidation.errors.length === 0) {
        sourceScope = 'theme'
        sourceRootUrl = themeRootUrl
      } else if (themeValidation.exists) {
        warnings.push(...themeValidation.errors)
      }
    }

    const alias = `${themeName}:${entry.mediaId}:v${mediaVersion}`
    visuals.push({
      mediaId: entry.mediaId,
      alias,
      src: `${toUrl(sourceRootUrl, ...relativeSegments)}?v=${mediaVersion}`,
      category: entry.category,
      renderMode: entry.renderMode,
      sizing: entry.sizing,
      sourceScope,
    })
  }

  const themeSettings = await readThemeSettings(themeRoot, warnings)
  const audio = []
  for (const entry of soundRegistry.sounds) {
    const defaultAudioRoot = path.join(defaultRoot, 'audio')
    const defaultSet = await validateAudioSet(defaultAudioRoot, entry.soundId)
    if (!defaultSet.exists || !defaultSet.valid) {
      errors.push(
        ...(!defaultSet.exists
          ? [`default/audio/source/${entry.soundId}.wav: required source is missing`]
          : defaultSet.errors.map((error) => `default/audio/${error}`)),
      )
      continue
    }
    const defaultPlayback = defaultAudioSettings.sounds?.[entry.soundId]
    if (!isCompletePlaybackEntry(defaultPlayback, entry.channel)) {
      errors.push(`default/audio.json: invalid complete entry for "${entry.soundId}"`)
      continue
    }

    let fileSourceScope = 'default'
    let audioRootUrl = `${defaultRootUrl}/audio`
    if (themeRoot && themeRootUrl) {
      const themeSet = await validateAudioSet(
        path.join(themeRoot, 'audio'),
        entry.soundId,
      )
      if (themeSet.exists && themeSet.valid) {
        fileSourceScope = 'theme'
        audioRootUrl = `${themeRootUrl}/audio`
      } else if (themeSet.exists) {
        warnings.push(
          ...themeSet.errors.map((error) => `${themeName}/audio/${error}`),
        )
      }
    }

    let settings = defaultPlayback
    let settingsSourceScope = 'default'
    if (themeSettings?.sounds && Object.hasOwn(themeSettings.sounds, entry.soundId)) {
      const candidate = themeSettings.sounds[entry.soundId]
      if (isCompletePlaybackEntry(candidate, entry.channel)) {
        settings = candidate
        settingsSourceScope = 'theme'
      } else {
        warnings.push(
          `${themeName}/audio.json: incomplete or invalid entry "${entry.soundId}"`,
        )
      }
    }

    audio.push({
      soundId: entry.soundId,
      sources: [
        `${toUrl(audioRootUrl, `${entry.fileName}.webm`)}?v=${mediaVersion}`,
        `${toUrl(audioRootUrl, `${entry.fileName}.mp3`)}?v=${mediaVersion}`,
      ],
      settings,
      fileSourceScope,
      settingsSourceScope,
    })
  }

  if (errors.length) {
    throw new Error(errors.join('\n'))
  }

  const orderedVisuals = visuals.sort((a, b) => a.mediaId.localeCompare(b.mediaId))
  const orderedAudio = audio.sort((a, b) => a.soundId.localeCompare(b.soundId))
  const manifest = {
    schemaVersion: 1,
    mediaVersion,
    theme: themeName,
    pixi: {
      bundles: [
        {
          name: `${themeName}-visuals-v${mediaVersion}`,
          assets: orderedVisuals.map(({ alias, src }) => ({ alias, src })),
        },
      ],
    },
    visuals: orderedVisuals,
    audio: orderedAudio,
  }
  return { manifest, warnings }
}

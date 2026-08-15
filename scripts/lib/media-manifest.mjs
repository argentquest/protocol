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

/**
 * Joins URL path segments without introducing duplicate separators.
 *
 * @pure
 * @param {string} root Base URL path.
 * @param {...string} segments Child URL segments.
 * @returns {string} Normalized URL path.
 */
function toUrl(root, ...segments) {
  return [root.replace(/\/$/, ''), ...segments].join('/')
}

/**
 * Reads an optional asset, distinguishing absence from other I/O failures.
 *
 * @param {string} filePath Absolute asset path.
 * @returns {Promise<Buffer|null>} File bytes, or `null` when absent.
 */
async function readOptional(filePath) {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Tests whether a path identifies a non-empty regular file.
 *
 * @param {string} filePath Absolute path to inspect.
 * @returns {Promise<boolean>} Whether the file can be used as media.
 */
async function isNonEmptyFile(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile() && fileStats.size > 0
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Recursively lists files below a directory in deterministic order.
 *
 * @param {string} directory Absolute directory to scan.
 * @returns {Promise<string[]>} Absolute file paths.
 */
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

/**
 * Finds files that do not map to registered visual or sound IDs.
 *
 * @param {string} root Media-library root path.
 * @param {object} mediaRegistry Visual registry.
 * @param {object} soundRegistry Sound registry.
 * @returns {Promise<string[]>} Unknown relative paths.
 */
export async function findUnknownMediaFiles(root, mediaRegistry, soundRegistry) {
  const unknown = []
  const categories = [...new Set(mediaRegistry.media.map((entry) => entry.category))]
  for (const category of categories) {
    const allowed = new Set(
      mediaRegistry.media
        .filter((entry) => entry.category === category)
        .flatMap((entry) => [
          entry.fileName,
          `${path.parse(entry.fileName).name}.png`,
        ]),
    )
    for (const fileName of await listFiles(path.join(root, category))) {
      if (/\.(?:png|svg)$/.test(fileName) && !allowed.has(fileName)) {
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

/**
 * Tests whether a theme playback entry completely overrides its default.
 *
 * @pure
 * @param {object} entry Playback settings.
 * @param {'ambience'|'effects'} channel Audio channel.
 * @returns {boolean} Whether every required setting is present and valid.
 */
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

/**
 * Validates an optional SVG vector or PNG texture override.
 *
 * @param {string} filePath Absolute media path.
 * @param {string} label Human-readable diagnostic label.
 * @param {'vector'|'texture'} [renderMode='vector'] Expected Pixi render mode.
 * @returns {Promise<{exists: boolean, errors: string[]}>} Presence and validation result.
 */
async function validateVisualFile(filePath, label, renderMode = 'vector') {
  const source = await readOptional(filePath)
  if (!source) return { exists: false, errors: [] }
  if (renderMode === 'texture') {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const signatureValid =
      source.length >= 24 && source.subarray(0, 8).equals(pngSignature)
    const width = signatureValid ? source.readUInt32BE(16) : 0
    const height = signatureValid ? source.readUInt32BE(20) : 0
    return {
      exists: true,
      errors:
        signatureValid && width > 0 && height > 0
          ? []
          : [`${label}: file must be a non-empty PNG texture`],
    }
  }
  return {
    exists: true,
    errors: validateSvgSource(source.toString('utf8'), label),
  }
}

/**
 * Validates a logical sound's WAV master and runtime delivery pair.
 *
 * @param {string} audioRoot Absolute audio directory.
 * @param {string} soundId Registered logical sound ID.
 * @returns {Promise<{exists: boolean, valid: boolean, errors: string[]}>} Audio-set status.
 */
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

/**
 * Reads optional theme playback settings and reports invalid JSON as fallback warnings.
 *
 * @param {string|null} themeRoot Absolute theme directory, if any.
 * @param {string[]} warnings Mutable fallback warning collection.
 * @returns {Promise<object|null>} Parsed settings or `null` when unavailable.
 */
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

/**
 * Resolves each theme asset independently through theme-to-default fallback.
 *
 * @param {object} options Registry, filesystem roots, theme, and warning options.
 * @returns {Promise<object>} Deterministic resolved media manifest.
 */
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
    let resolvedFileName = entry.fileName
    let resolvedRenderMode = entry.renderMode
    if (themeRoot && themeRootUrl) {
      const textureFileName = `${path.parse(entry.fileName).name}.png`
      const textureSegments = [entry.category, textureFileName]
      const textureValidation = await validateVisualFile(
        path.join(themeRoot, ...textureSegments),
        `${themeName}/${textureSegments.join('/')}`,
        'texture',
      )
      const vectorValidation = await validateVisualFile(
        path.join(themeRoot, ...relativeSegments),
        `${themeName}/${relativeSegments.join('/')}`,
        'vector',
      )
      if (textureValidation.exists && textureValidation.errors.length === 0) {
        sourceScope = 'theme'
        sourceRootUrl = themeRootUrl
        resolvedFileName = textureFileName
        resolvedRenderMode = 'texture'
      } else if (vectorValidation.exists && vectorValidation.errors.length === 0) {
        sourceScope = 'theme'
        sourceRootUrl = themeRootUrl
      }
      if (textureValidation.exists && textureValidation.errors.length) {
        warnings.push(...textureValidation.errors)
      }
      if (vectorValidation.exists && vectorValidation.errors.length) {
        warnings.push(...vectorValidation.errors)
      }
    }

    const alias = `${themeName}:${entry.mediaId}:v${mediaVersion}`
    visuals.push({
      mediaId: entry.mediaId,
      alias,
      src: `${toUrl(sourceRootUrl, entry.category, resolvedFileName)}?v=${mediaVersion}`,
      category: entry.category,
      renderMode: resolvedRenderMode,
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
    visuals: orderedVisuals,
    audio: orderedAudio,
  }
  return { manifest, warnings }
}

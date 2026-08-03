import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * Validates the minimum RIFF/WAVE structure of a canonical audio master.
 *
 * @pure
 * @param {Buffer} buffer WAV file bytes.
 * @param {string} [label='WAV'] Diagnostic asset label.
 * @returns {string[]} Validation errors.
 */
export function validateWavBuffer(buffer, label = 'WAV') {
  const errors = []
  if (buffer.length < 44) errors.push(`${label}: WAV file is smaller than its header`)
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    errors.push(`${label}: missing RIFF signature`)
  }
  if (buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    errors.push(`${label}: missing WAVE signature`)
  }
  if (buffer.length >= 28 && buffer.readUInt32LE(24) <= 0) {
    errors.push(`${label}: sample rate must be positive`)
  }
  return errors
}

/**
 * Validates that a required delivery asset is a non-empty regular file.
 *
 * @param {string} filePath Absolute delivery-file path.
 * @param {string} label Human-readable diagnostic label.
 * @returns {Promise<string[]>} Validation errors, empty when valid.
 */
async function validateNonEmptyFile(filePath, label) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile() && fileStats.size > 0
      ? []
      : [`${label}: file is empty or not a regular file`]
  } catch (error) {
    if (error.code === 'ENOENT') return [`${label}: required file is missing`]
    return [`${label}: ${error.message}`]
  }
}

/**
 * Validates all required WAV, WebM, MP3, and playback entries.
 *
 * @param {object} options Default audio-library paths and registry.
 * @returns {Promise<string[]>} Validation errors.
 */
export async function validateDefaultAudioLibrary({
  audioRoot,
  registry,
  settings,
}) {
  const errors = []
  const registeredIds = registry.sounds.map((sound) => sound.soundId)
  const configuredIds = Object.keys(settings.sounds)
  const registeredSet = new Set(registeredIds)

  for (const soundId of registeredIds) {
    const sourcePath = path.join(audioRoot, 'source', `${soundId}.wav`)
    try {
      const source = await readFile(sourcePath)
      errors.push(...validateWavBuffer(source, `${soundId}.wav`))
    } catch (error) {
      if (error.code === 'ENOENT') errors.push(`${soundId}.wav: required WAV master is missing`)
      else errors.push(`${soundId}.wav: ${error.message}`)
    }
    errors.push(
      ...(await validateNonEmptyFile(
        path.join(audioRoot, `${soundId}.webm`),
        `${soundId}.webm`,
      )),
      ...(await validateNonEmptyFile(
        path.join(audioRoot, `${soundId}.mp3`),
        `${soundId}.mp3`,
      )),
    )

    const playback = settings.sounds[soundId]
    if (!playback) {
      errors.push(`audio.json: missing complete entry for "${soundId}"`)
      continue
    }
    const registryEntry = registry.sounds.find((sound) => sound.soundId === soundId)
    if (playback.channel !== registryEntry.channel) {
      errors.push(`audio.json: "${soundId}" channel does not match its registry entry`)
    }
  }

  for (const soundId of configuredIds) {
    if (!registeredSet.has(soundId)) {
      errors.push(`audio.json: unknown sound entry "${soundId}"`)
    }
  }
  if (settings.sounds.ambience?.loop !== true) {
    errors.push('audio.json: default ambience must loop')
  }

  return errors
}

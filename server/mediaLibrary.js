import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { validateWavBuffer } from '../scripts/lib/validate-audio.mjs'
import { validateSvgSource } from '../scripts/lib/validate-svg.mjs'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg'])
const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3', '.aif', '.aiff'])
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_AUDIO_BYTES = 100 * 1024 * 1024

/** @returns {'image'|'audio'|null} Catalog kind for a lowercase extension. */
function mediaKind(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return null
}

/** @returns {Promise<string[]>} Absolute file paths below the catalog root. */
async function walkFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkFiles(root, absolute)
    return entry.isFile() ? [absolute] : []
  }))
  return groups.flat()
}

/** @returns {Promise<void>} Completion of one hidden FFmpeg conversion process. */
function runFfmpeg(ffmpegPath, argumentsList, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, argumentsList, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let standardError = ''
    child.stderr.on('data', (chunk) => {
      standardError += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label}: ${standardError.trim() || `FFmpeg exited ${code}`}`))
    })
  })
}

/** @returns {Promise<void>} Atomic replacement of one materialized theme file. */
async function replaceFile(temporaryPath, destinationPath) {
  await rm(destinationPath, { force: true })
  await rename(temporaryPath, destinationPath)
}

/** @returns {Promise<void>} Validation of one normalized SVG or PNG file. */
async function validateNormalizedImage(filePath, extension) {
  const source = await readFile(filePath)
  if (extension === '.svg') {
    const errors = validateSvgSource(source.toString('utf8'), path.basename(filePath))
    if (errors.length) {
      throw Object.assign(new Error('Selected SVG is incompatible with the game.'), {
        status: 422,
        details: errors,
      })
    }
    return
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (
    source.length < 24 ||
    !source.subarray(0, 8).equals(signature) ||
    source.readUInt32BE(16) === 0 ||
    source.readUInt32BE(20) === 0
  ) {
    throw Object.assign(new Error('Selected image did not produce a valid PNG.'), {
      status: 422,
    })
  }
}

/**
 * Creates a read-only external-media catalog and theme materialization service.
 *
 * @param {object} options Media-library options.
 * @param {string} options.root Absolute PublicMedia catalog path.
 * @param {string|null} [options.ffmpegPath] FFmpeg executable path.
 * @returns {Promise<object>} Catalog queries, safe path resolution, and converters.
 */
export async function createMediaLibrary({ root, ffmpegPath = ffmpegStatic }) {
  const resolvedRoot = path.resolve(root)
  let catalogConfig
  try {
    catalogConfig = JSON.parse(
      await readFile(path.join(resolvedRoot, 'catalog.json'), 'utf8'),
    )
  } catch (error) {
    throw new Error(`PublicMedia catalog.json is required: ${error.message}`)
  }
  const collections = catalogConfig.collections ?? {}
  if (catalogConfig.schemaVersion !== 1 || typeof collections !== 'object') {
    throw new Error('PublicMedia catalog.json must use schemaVersion 1 and define collections.')
  }
  for (const [collection, provenance] of Object.entries(collections)) {
    if (
      !provenance ||
      typeof provenance.license !== 'string' ||
      !provenance.license.trim() ||
      typeof provenance.sourceUrl !== 'string' ||
      !provenance.sourceUrl.trim()
    ) {
      throw new Error(`PublicMedia collection ${collection} requires license and sourceUrl.`)
    }
  }
  const allFiles = await walkFiles(resolvedRoot)
  const entries = []
  const byId = new Map()
  for (const absolutePath of allFiles) {
    const extension = path.extname(absolutePath).toLowerCase()
    const kind = mediaKind(extension)
    if (!kind) continue
    const id = path.relative(resolvedRoot, absolutePath).replaceAll('\\', '/')
    const collection = id.split('/')[0]
    const provenance = collections[collection]
    if (!provenance) continue
    const entry = {
      id,
      kind,
      format: extension.slice(1),
      name: path.basename(absolutePath),
      collection,
      license: provenance.license,
      sourceUrl: provenance.sourceUrl,
      credit: provenance.credit ?? '',
    }
    entries.push(entry)
    byId.set(id, { ...entry, absolutePath })
  }
  entries.sort((first, second) => first.id.localeCompare(second.id))

  function resolveEntry(id, expectedKind = null) {
    const entry = byId.get(String(id ?? '').replaceAll('\\', '/'))
    if (!entry || (expectedKind && entry.kind !== expectedKind)) {
      throw Object.assign(new Error('Media-library asset not found.'), { status: 404 })
    }
    return entry
  }

  function list({ kind = 'image', query = '', offset = 0, limit = 60 } = {}) {
    if (!['image', 'audio'].includes(kind)) {
      throw Object.assign(new Error('Media kind must be image or audio.'), {
        status: 400,
      })
    }
    const normalizedQuery = String(query).trim().toLowerCase()
    const filtered = entries.filter(
      (entry) =>
        entry.kind === kind &&
        (!normalizedQuery || entry.id.toLowerCase().includes(normalizedQuery)),
    )
    const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0)
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 60))
    return {
      items: filtered.slice(safeOffset, safeOffset + safeLimit),
      offset: safeOffset,
      limit: safeLimit,
      total: filtered.length,
    }
  }

  async function materializeVisual(assetId, destinationBasePath) {
    const entry = resolveEntry(assetId, 'image')
    const sourceStats = await stat(entry.absolutePath)
    if (sourceStats.size > MAX_IMAGE_BYTES) {
      throw Object.assign(new Error('Selected image exceeds 25 MiB.'), { status: 413 })
    }
    await mkdir(path.dirname(destinationBasePath), { recursive: true })
    const outputExtension = entry.format === 'svg' ? '.svg' : '.png'
    const destination = `${destinationBasePath}${outputExtension}`
    const temporary = `${destinationBasePath}.${randomUUID()}.tmp${outputExtension}`
    try {
      if (entry.format === 'png' || entry.format === 'svg') {
        await copyFile(entry.absolutePath, temporary)
      } else {
        if (!ffmpegPath) throw new Error('FFmpeg is required to normalize images.')
        await runFfmpeg(
          ffmpegPath,
          ['-hide_banner', '-loglevel', 'error', '-y', '-i', entry.absolutePath, '-frames:v', '1', temporary],
          'Image conversion failed',
        )
      }
      await validateNormalizedImage(temporary, outputExtension)
      await replaceFile(temporary, destination)
      await rm(`${destinationBasePath}${outputExtension === '.png' ? '.svg' : '.png'}`, {
        force: true,
      })
      return { assetId: entry.id, format: outputExtension.slice(1) }
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  async function materializeAudio(assetId, audioRoot, soundId) {
    const entry = resolveEntry(assetId, 'audio')
    const sourceStats = await stat(entry.absolutePath)
    if (sourceStats.size > MAX_AUDIO_BYTES) {
      throw Object.assign(new Error('Selected audio exceeds 100 MiB.'), { status: 413 })
    }
    if (!ffmpegPath) throw new Error('FFmpeg is required to normalize audio.')
    const sourceRoot = path.join(audioRoot, 'source')
    await mkdir(sourceRoot, { recursive: true })
    const nonce = randomUUID()
    const wavTemporary = path.join(sourceRoot, `${soundId}.${nonce}.tmp.wav`)
    const webmTemporary = path.join(audioRoot, `${soundId}.${nonce}.tmp.webm`)
    const mp3Temporary = path.join(audioRoot, `${soundId}.${nonce}.tmp.mp3`)
    try {
      await runFfmpeg(
        ffmpegPath,
        [
          '-hide_banner', '-loglevel', 'error', '-y', '-i', entry.absolutePath,
          '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', wavTemporary,
        ],
        'WAV normalization failed',
      )
      await runFfmpeg(
        ffmpegPath,
        ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavTemporary, '-vn', '-c:a', 'libopus', '-b:a', '96k', webmTemporary],
        'WebM conversion failed',
      )
      await runFfmpeg(
        ffmpegPath,
        ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavTemporary, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', mp3Temporary],
        'MP3 conversion failed',
      )
      const wavErrors = validateWavBuffer(
        await readFile(wavTemporary),
        'normalized theme WAV',
      )
      if (wavErrors.length) {
        throw Object.assign(new Error('Selected audio did not produce a valid WAV master.'), {
          status: 422,
          details: wavErrors,
        })
      }
      await replaceFile(wavTemporary, path.join(sourceRoot, `${soundId}.wav`))
      await replaceFile(webmTemporary, path.join(audioRoot, `${soundId}.webm`))
      await replaceFile(mp3Temporary, path.join(audioRoot, `${soundId}.mp3`))
      return { assetId: entry.id, sourceFormat: entry.format, normalizedFormat: 'wav' }
    } catch (error) {
      await Promise.all(
        [wavTemporary, webmTemporary, mp3Temporary].map((filePath) =>
          rm(filePath, { force: true }),
        ),
      )
      throw error
    }
  }

  return {
    list,
    materializeAudio,
    materializeVisual,
    resolveEntry,
  }
}

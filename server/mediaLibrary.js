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

/**
 * Maps a lowercase file extension to a supported catalog kind.
 *
 * @pure
 * @param {string} extension Lowercase extension including its leading dot.
 * @returns {'image'|'audio'|null} Supported catalog kind.
 */
function mediaKind(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return null
}

/**
 * Recursively enumerates catalog files without following non-file entries.
 *
 * @param {string} root Absolute catalog root retained for recursive calls.
 * @param {string} [directory=root] Current directory being visited.
 * @returns {Promise<string[]>} Absolute file paths below the catalog root.
 */
async function walkFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkFiles(root, absolute)
    return entry.isFile() ? [absolute] : []
  }))
  return groups.flat()
}

/**
 * Runs one hidden FFmpeg conversion and exposes useful stderr on failure.
 *
 * @param {string} ffmpegPath FFmpeg executable path.
 * @param {string[]} argumentsList Conversion arguments.
 * @param {string} label Diagnostic operation label.
 * @returns {Promise<void>} Completion of the conversion process.
 */
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

/**
 * Replaces a materialized theme file with its same-directory temporary file.
 *
 * @param {string} temporaryPath Completed temporary output path.
 * @param {string} destinationPath Final theme asset path.
 * @returns {Promise<void>} Completion of replacement.
 */
async function replaceFile(temporaryPath, destinationPath) {
  await rm(destinationPath, { force: true })
  await rename(temporaryPath, destinationPath)
}

/** @param {string} filePath Absolute file path. @returns {Promise<number>} Bytes, or zero when absent. */
async function existingFileBytes(filePath) {
  try {
    return (await stat(filePath)).size
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

/** @param {object} entry Resolved catalog or personal entry. @returns {object} Persistable provenance. */
function provenance(entry) {
  return {
    assetId: entry.id,
    name: entry.originalName ?? entry.name,
    license: entry.license,
    sourceUrl: entry.sourceUrl,
    credit: entry.credit,
    uploadedAt: entry.uploadedAt ?? null,
    originalMimeType: entry.originalMimeType ?? null,
    originalFormat: entry.originalFormat ?? entry.format,
  }
}

/**
 * Validates a normalized SVG contract or non-empty PNG dimensions.
 *
 * @param {string} filePath Absolute normalized image path.
 * @param {'.svg'|'.png'} extension Output extension.
 * @returns {Promise<void>} Resolves when the image is valid.
 */
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
export async function createMediaLibrary({
  root,
  ffmpegPath = ffmpegStatic,
  personalMediaStore = null,
  quota = null,
}) {
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

  /**
   * Resolves a catalog ID and optionally enforces its media kind.
   *
   * @param {string} id Stable catalog asset ID.
   * @param {'image'|'audio'|null} [expectedKind=null] Required media kind.
   * @returns {object} Catalog entry.
   */
  async function resolveEntry(id, expectedKind = null, userId = null) {
    if (String(id ?? '').startsWith('uploads/')) {
      if (!userId || !personalMediaStore) {
        throw Object.assign(new Error('Media-library asset not found.'), { status: 404 })
      }
      return personalMediaStore.resolveEntry(userId, id, expectedKind)
    }
    const entry = byId.get(String(id ?? '').replaceAll('\\', '/'))
    if (!entry || (expectedKind && entry.kind !== expectedKind)) {
      throw Object.assign(new Error('Media-library asset not found.'), { status: 404 })
    }
    return entry
  }

  /**
   * Filters and paginates safe catalog metadata for the Workshop browser.
   *
   * @param {object} options Kind, collection, folder, search, and paging filters.
   * @returns {object} Matching entries, folders, and paging metadata.
   */
  async function list({
    kind = 'image',
    collection = '',
    folder = null,
    query = '',
    offset = 0,
    limit = 60,
    userId = null,
  } = {}) {
    if (!['image', 'audio'].includes(kind)) {
      throw Object.assign(new Error('Media kind must be image or audio.'), {
        status: 400,
      })
    }
    const normalizedCollection = String(collection).trim()
    const personalEntries = userId && personalMediaStore
      ? await personalMediaStore.entries(userId)
      : []
    const kindEntries = [...entries, ...personalEntries].filter(
      (entry) => entry.kind === kind,
    )
    const collectionCounts = new Map()
    for (const entry of kindEntries) {
      collectionCounts.set(
        entry.collection,
        (collectionCounts.get(entry.collection) ?? 0) + 1,
      )
    }
    if (normalizedCollection && !collectionCounts.has(normalizedCollection)) {
      throw Object.assign(new Error('Media collection not found.'), { status: 404 })
    }
    const folderMode = folder !== null && folder !== undefined
    const normalizedFolder = String(folder ?? '')
      .replaceAll('\\', '/')
      .replace(/^\/+|\/+$/g, '')
    if (
      normalizedFolder.split('/').includes('..') ||
      (normalizedFolder && !collectionCounts.has(normalizedFolder.split('/')[0]))
    ) {
      throw Object.assign(new Error('Media folder not found.'), { status: 404 })
    }
    const normalizedQuery = String(query).trim().toLowerCase()
    const folderPrefix = normalizedFolder ? `${normalizedFolder}/` : ''
    const folderEntries = folderMode
      ? kindEntries.filter((entry) => entry.id.startsWith(folderPrefix))
      : kindEntries
    const childFolderCounts = new Map()
    if (folderMode) {
      for (const entry of folderEntries) {
        const remainder = entry.id.slice(folderPrefix.length)
        if (!remainder.includes('/')) continue
        const childName = remainder.slice(0, remainder.indexOf('/'))
        const childPath = folderPrefix ? `${normalizedFolder}/${childName}` : childName
        childFolderCounts.set(
          childPath,
          (childFolderCounts.get(childPath) ?? 0) + 1,
        )
      }
    }
    const filtered = folderEntries.filter(
      (entry) =>
        (!normalizedCollection || entry.collection === normalizedCollection) &&
        (!folderMode ||
          normalizedQuery ||
          !entry.id.slice(folderPrefix.length).includes('/')) &&
        (!normalizedQuery || entry.id.toLowerCase().includes(normalizedQuery)),
    )
    const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0)
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 60))
    return {
      items: filtered.slice(safeOffset, safeOffset + safeLimit),
      offset: safeOffset,
      limit: safeLimit,
      total: filtered.length,
      folder: normalizedFolder,
      folders: [...childFolderCounts]
        .map(([folderPath, count]) => ({
          path: folderPath,
          name: folderPath.slice(folderPath.lastIndexOf('/') + 1),
          count,
        }))
        .sort((first, second) => first.name.localeCompare(second.name)),
      collections: [...collectionCounts]
        .map(([id, count]) => ({ id, count }))
        .sort((first, second) => first.id.localeCompare(second.id)),
    }
  }

  /**
   * Copies or normalizes a catalog image into a theme media destination.
   *
   * @param {string} assetId Stable catalog image ID.
   * @param {string} destinationBasePath Extension-free theme path.
   * @returns {Promise<{extension:string,entry:object}>} Materialized format and provenance.
   */
  async function materializeVisual(assetId, destinationBasePath, userId = null) {
    const entry = await resolveEntry(assetId, 'image', userId)
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
      const alternate = `${destinationBasePath}${outputExtension === '.png' ? '.svg' : '.png'}`
      const newBytes = (await stat(temporary)).size
      const oldBytes =
        (await existingFileBytes(destination)) +
        (await existingFileBytes(alternate))
      /** @param {null|((bytes:number)=>Promise<object>)} assertAdditionalBytes Quota assertion. @returns {Promise<void>} Commit completion. */
      const commit = async (assertAdditionalBytes = null) => {
        await assertAdditionalBytes?.(Math.max(0, newBytes - oldBytes))
        await replaceFile(temporary, destination)
        await rm(alternate, { force: true })
      }
      if (quota && userId) await quota.mutate(userId, commit)
      else await commit()
      return {
        assetId: entry.id,
        format: outputExtension.slice(1),
        provenance: provenance(entry),
      }
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  /**
   * Normalizes catalog audio to WAV, WebM, and MP3 theme assets.
   *
   * @param {string} assetId Stable catalog audio ID.
   * @param {string} audioRoot Absolute theme audio directory.
   * @param {string} soundId Registered logical sound ID.
   * @returns {Promise<{entry:object}>} Source provenance for the materialized audio.
   */
  async function materializeAudio(assetId, audioRoot, soundId, userId = null) {
    const entry = await resolveEntry(assetId, 'audio', userId)
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
      const destinations = [
        path.join(sourceRoot, `${soundId}.wav`),
        path.join(audioRoot, `${soundId}.webm`),
        path.join(audioRoot, `${soundId}.mp3`),
      ]
      const temporaryFiles = [wavTemporary, webmTemporary, mp3Temporary]
      /** Total normalized output bytes. @type {number} */
      const newBytes = (await Promise.all(temporaryFiles.map((file) => stat(file))))
        .reduce((sum, value) => sum + value.size, 0)
      const oldBytes = (await Promise.all(destinations.map(existingFileBytes)))
        .reduce((sum, value) => sum + value, 0)
      /** @param {null|((bytes:number)=>Promise<object>)} assertAdditionalBytes Quota assertion. @returns {Promise<void>} Commit completion. */
      const commit = async (assertAdditionalBytes = null) => {
        await assertAdditionalBytes?.(Math.max(0, newBytes - oldBytes))
        for (let index = 0; index < destinations.length; index += 1) {
          await replaceFile(temporaryFiles[index], destinations[index])
        }
      }
      if (quota && userId) await quota.mutate(userId, commit)
      else await commit()
      return {
        assetId: entry.id,
        sourceFormat: entry.format,
        normalizedFormat: 'wav',
        provenance: provenance(entry),
      }
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

import { createWriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Busboy from 'busboy'
import ffmpegStatic from 'ffmpeg-static'
import { validateWavBuffer } from '../scripts/lib/validate-audio.mjs'
import { validateSvgSource } from '../scripts/lib/validate-svg.mjs'

const IMAGE_TYPES = new Map([
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.svg', new Set(['image/svg+xml'])],
])
const AUDIO_TYPES = new Map([
  ['.wav', new Set(['audio/wav', 'audio/x-wav', 'audio/wave'])],
  ['.ogg', new Set(['audio/ogg', 'application/ogg'])],
  ['.mp3', new Set(['audio/mpeg', 'audio/mp3'])],
  ['.aif', new Set(['audio/aiff', 'audio/x-aiff'])],
  ['.aiff', new Set(['audio/aiff', 'audio/x-aiff'])],
])

/** @param {string} executable FFmpeg path. @param {string[]} args Arguments. @returns {Promise<string>} Stderr. */
function ffmpeg(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `FFmpeg exited ${code}`)))
  })
}

/** @param {Buffer} buffer Initial file bytes. @param {string} extension File extension. @returns {boolean} Signature match. */
function signatureMatches(buffer, extension) {
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (extension === '.jpg' || extension === '.jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (extension === '.svg') return /<(?:\?xml[^>]*>\s*)?svg(?:\s|>)/i.test(buffer.toString('utf8', 0, 2048).replace(/^\uFEFF/, ''))
  if (extension === '.wav') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE'
  if (extension === '.ogg') return buffer.subarray(0, 4).toString() === 'OggS'
  if (extension === '.mp3') return buffer.subarray(0, 3).toString() === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  if (extension === '.aif' || extension === '.aiff') return buffer.subarray(0, 4).toString() === 'FORM' && ['AIFF', 'AIFC'].includes(buffer.subarray(8, 12).toString())
  return false
}

/**
 * Streams exactly one multipart upload into quarantine with an early byte cap.
 *
 * @param {import('express').Request} request Incoming multipart request.
 * @param {string} quarantinePath Destination temporary file.
 * @param {number} maximumBytes Maximum transport bytes.
 * @returns {Promise<{filename:string,mimeType:string,size:number}>} Uploaded file metadata.
 */
function receiveUpload(request, quarantinePath, maximumBytes) {
  return new Promise((resolve, reject) => {
    let settled = false
    let received = null
    let output = null
    /** @param {Error} error Upload failure. @returns {void} */
    const fail = (error) => {
      if (settled) return
      settled = true
      output?.destroy()
      reject(error)
    }
    let parser
    try {
      parser = Busboy({ headers: request.headers, limits: { files: 1, fields: 4, fileSize: maximumBytes } })
    } catch {
      fail(Object.assign(new Error('A multipart/form-data upload is required.'), { status: 400 }))
      return
    }
    parser.on('file', (_field, stream, info) => {
      if (received) {
        stream.resume()
        fail(Object.assign(new Error('Upload exactly one media file.'), { status: 400 }))
        return
      }
      received = { filename: path.basename(info.filename), mimeType: String(info.mimeType).toLowerCase(), size: 0 }
      output = createWriteStream(quarantinePath, { flags: 'wx' })
      stream.on('data', (chunk) => { received.size += chunk.length })
      stream.on('limit', () => fail(Object.assign(new Error('Uploaded file exceeds the allowed byte limit.'), { status: 413 })))
      stream.on('error', fail)
      output.on('error', fail)
      stream.pipe(output)
    })
    parser.on('filesLimit', () => fail(Object.assign(new Error('Upload exactly one media file.'), { status: 400 })))
    parser.on('error', fail)
    parser.on('finish', () => {
      if (settled) return
      if (!received || !output) return fail(Object.assign(new Error('A media file is required.'), { status: 400 }))
      output.once('close', () => {
        if (!settled) { settled = true; resolve(received) }
      })
      output.end()
    })
    request.pipe(parser)
  })
}

/**
 * Creates the authenticated personal media repository.
 *
 * @param {object} options Storage, conversion, validation, and quota options.
 * @returns {Promise<object>} Personal upload operations.
 */
export async function createPersonalMediaStore({
  root,
  quota,
  ffmpegPath = ffmpegStatic,
  maxImageBytes = 25 * 1024 * 1024,
  maxAudioBytes = 100 * 1024 * 1024,
  maxImageDimension = 4096,
  maxImagePixels = 16_777_216,
  maxAudioDurationSeconds = 300,
}) {
  for (const [label, value] of Object.entries({
    maxImageBytes,
    maxAudioBytes,
    maxImageDimension,
    maxImagePixels,
    maxAudioDurationSeconds,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be a positive finite number.`)
    }
  }
  const resolvedRoot = path.resolve(root)
  const quarantineRoot = path.join(resolvedRoot, '.quarantine')
  await mkdir(quarantineRoot, { recursive: true })

  /** @param {string} userId Owner UUID. @returns {string} Account media root. */
  const ownerRoot = (userId) => path.join(resolvedRoot, userId)

  /** @param {string} userId Owner UUID. @returns {Promise<object[]>} Uploaded entries. */
  async function entries(userId) {
    const metadataRoot = path.join(ownerRoot(userId), 'metadata')
    let names
    try { names = await readdir(metadataRoot) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const records = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(path.join(metadataRoot, name), 'utf8'))))
    return records
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map(({ storedName: _storedName, ...record }) => record)
  }

  /** @param {string} userId Owner UUID. @param {string} assetId Personal asset ID. @param {string|null} expectedKind Required kind. @returns {Promise<object>} Owned asset. */
  async function resolveEntry(userId, assetId, expectedKind = null) {
    const match = /^uploads\/([0-9a-f-]{36})$/.exec(String(assetId ?? ''))
    if (!match) throw Object.assign(new Error('Media-library asset not found.'), { status: 404 })
    let record
    try { record = JSON.parse(await readFile(path.join(ownerRoot(userId), 'metadata', `${match[1]}.json`), 'utf8')) } catch { throw Object.assign(new Error('Media-library asset not found.'), { status: 404 }) }
    if (expectedKind && record.kind !== expectedKind) throw Object.assign(new Error('Media-library asset not found.'), { status: 404 })
    return { ...record, absolutePath: path.join(ownerRoot(userId), 'assets', record.storedName) }
  }

  /** @param {string} userId Owner UUID. @param {string} assetId Personal asset ID. @returns {Promise<object>} Updated quota. */
  async function remove(userId, assetId) {
    const entry = await resolveEntry(userId, assetId)
    await quota.mutate(userId, async () => {
      await rm(entry.absolutePath, { force: true })
      await rm(
        path.join(ownerRoot(userId), 'metadata', `${entry.id.slice('uploads/'.length)}.json`),
        { force: true },
      )
    })
    return quota.usage(userId)
  }

  /** @param {import('express').Request} request Multipart request. @param {object} user Authenticated user. @param {'image'|'audio'} kind Declared kind. @returns {Promise<object>} Stored entry and quota. */
  async function upload(request, user, kind) {
    if (!['image', 'audio'].includes(kind)) throw Object.assign(new Error('Media kind must be image or audio.'), { status: 400 })
    const maximumBytes = kind === 'image' ? maxImageBytes : maxAudioBytes
    const nonce = randomUUID()
    const quarantinePath = path.join(quarantineRoot, `${nonce}.upload`)
    const normalizedPath = path.join(quarantineRoot, `${nonce}.normalized`)
    try {
      const received = await receiveUpload(request, quarantinePath, maximumBytes)
      const extension = path.extname(received.filename).toLowerCase()
      const types = kind === 'image' ? IMAGE_TYPES : AUDIO_TYPES
      if (!types.has(extension) || !types.get(extension).has(received.mimeType)) {
        throw Object.assign(new Error('File extension and MIME type are not supported for this media kind.'), { status: 415 })
      }
      const header = (await readFile(quarantinePath)).subarray(0, 4096)
      if (!signatureMatches(header, extension)) throw Object.assign(new Error('File signature does not match its declared format.'), { status: 415 })
      if (!ffmpegPath && extension !== '.svg') throw new Error('FFmpeg is required to normalize uploaded media.')

      let normalizedExtension
      let dimensions = null
      let durationSeconds = null
      if (kind === 'image' && extension === '.svg') {
        const source = await readFile(quarantinePath, 'utf8')
        const errors = validateSvgSource(source, received.filename)
        if (errors.length) throw Object.assign(new Error('Uploaded SVG is incompatible with the game.'), { status: 422, details: errors })
        const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(source)
        if (!viewBox) throw Object.assign(new Error('Uploaded SVG requires a finite viewBox.'), { status: 422 })
        dimensions = { width: Number(viewBox[1]), height: Number(viewBox[2]) }
        await rename(quarantinePath, normalizedPath)
        normalizedExtension = 'svg'
      } else if (kind === 'image') {
        await ffmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', quarantinePath, '-frames:v', '1', '-f', 'image2', '-vcodec', 'png', normalizedPath])
        const png = await readFile(normalizedPath)
        if (!signatureMatches(png, '.png') || png.length < 24) throw Object.assign(new Error('Uploaded image could not be normalized.'), { status: 422 })
        dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
        normalizedExtension = 'png'
      } else {
        const probe = await ffmpeg(ffmpegPath, ['-hide_banner', '-i', quarantinePath, '-f', 'null', '-'])
        const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe)
        if (!duration) throw Object.assign(new Error('Uploaded audio duration could not be read.'), { status: 422 })
        durationSeconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
        if (durationSeconds > maxAudioDurationSeconds) throw Object.assign(new Error(`Uploaded audio exceeds ${maxAudioDurationSeconds} seconds.`), { status: 422 })
        await ffmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', quarantinePath, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', normalizedPath])
        const wavErrors = validateWavBuffer(await readFile(normalizedPath), 'uploaded WAV')
        if (wavErrors.length) throw Object.assign(new Error('Uploaded audio could not be normalized.'), { status: 422, details: wavErrors })
        normalizedExtension = 'wav'
      }
      if (dimensions && (dimensions.width > maxImageDimension || dimensions.height > maxImageDimension || dimensions.width * dimensions.height > maxImagePixels)) {
        throw Object.assign(new Error(`Uploaded image exceeds the ${maxImageDimension}px or ${maxImagePixels}-pixel dimension limit.`), { status: 422 })
      }
      const normalizedStats = await stat(normalizedPath)
      if (normalizedStats.size > maximumBytes) {
        throw Object.assign(
          new Error('Normalized media exceeds the allowed byte limit.'),
          { status: 413 },
        )
      }
      const record = {
        id: `uploads/${nonce}`,
        kind,
        format: normalizedExtension,
        name: received.filename,
        collection: 'uploads',
        license: 'User-provided',
        sourceUrl: '',
        credit: user.username,
        uploadedAt: new Date().toISOString(),
        originalName: received.filename,
        originalMimeType: received.mimeType,
        originalFormat: extension.slice(1),
        normalizedFormat: normalizedExtension,
        sizeBytes: normalizedStats.size,
        dimensions,
        durationSeconds,
        storedName: `${nonce}.${normalizedExtension}`,
      }
      await quota.mutate(user.id, async (assertAdditionalBytes) => {
        await assertAdditionalBytes(normalizedStats.size)
        const assetsRoot = path.join(ownerRoot(user.id), 'assets')
        const metadataRoot = path.join(ownerRoot(user.id), 'metadata')
        await mkdir(assetsRoot, { recursive: true })
        await mkdir(metadataRoot, { recursive: true })
        await rename(normalizedPath, path.join(assetsRoot, record.storedName))
        try { await writeFile(path.join(metadataRoot, `${nonce}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' }) } catch (error) { await rm(path.join(assetsRoot, record.storedName), { force: true }); throw error }
      })
      return { item: record, quota: await quota.usage(user.id) }
    } finally {
      await Promise.all([quarantinePath, normalizedPath].map((file) => rm(file, { force: true })))
    }
  }

  return { entries, remove, resolveEntry, upload }
}

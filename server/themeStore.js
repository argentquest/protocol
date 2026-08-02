import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import { generateLevel } from '../src/game/generation/levelGenerator.js'
import { resolveThemeManifest } from '../scripts/lib/media-manifest.mjs'

const THEME_SCHEMA_VERSION = 1
const DEFAULT_THEME_ID = 'default'
const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/
const INTERNAL_ID_PATTERN = /^[a-f0-9-]{36}$/

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'theme'
}

function publicMetadata(metadata) {
  const visible = { ...metadata }
  delete visible.editKey
  delete visible.ownerUserId
  delete visible.levelOrder
  return { ...visible, levelCount: metadata.levelOrder.length }
}

function requireIdentifier(value, pattern, label) {
  if (!pattern.test(String(value))) {
    throw Object.assign(new Error(`Invalid ${label}.`), { status: 400 })
  }
  return String(value)
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function atomicJson(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, filePath)
}

/**
 * Creates the persistent Theme Workshop filesystem service.
 *
 * @param {object} options Store paths.
 * @param {string} options.dataDirectory Writable theme directory.
 * @param {string} options.defaultLevelsDirectory Read-only default level directory.
 * @param {string} options.levelSchemaPath Level JSON Schema path.
 * @param {string} options.mediaRegistryPath Visual-media registry path.
 * @param {string} options.soundRegistryPath Logical-sound registry path.
 * @param {string} options.defaultMediaDirectory Complete default media directory.
 * @param {string} options.defaultAudioSettingsPath Default playback settings path.
 * @param {object} options.mediaLibrary External catalog and conversion service.
 * @returns {Promise<object>} Theme storage operations.
 */
export async function createThemeStore({
  dataDirectory,
  defaultLevelsDirectory,
  levelSchemaPath,
  mediaRegistryPath,
  soundRegistryPath,
  defaultMediaDirectory,
  defaultAudioSettingsPath,
  mediaLibrary,
}) {
  await mkdir(dataDirectory, { recursive: true })
  const levelSchema = await readJson(levelSchemaPath)
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validateSchema = ajv.compile(levelSchema)
  const mediaRegistry = await readJson(mediaRegistryPath)
  const soundRegistry = await readJson(soundRegistryPath)
  const defaultAudioSettings = await readJson(defaultAudioSettingsPath)
  const mediaById = new Map(
    mediaRegistry.media.map((entry) => [entry.mediaId, entry]),
  )
  const soundById = new Map(
    soundRegistry.sounds.map((entry) => [entry.soundId, entry]),
  )

  const themeDirectory = (themeId) =>
    path.join(
      dataDirectory,
      requireIdentifier(themeId, THEME_ID_PATTERN, 'theme ID'),
    )
  const metadataPath = (themeId) => path.join(themeDirectory(themeId), 'theme.json')
  const levelsDirectory = (themeId) => path.join(themeDirectory(themeId), 'levels')
  const mediaDirectory = (themeId) => path.join(themeDirectory(themeId), 'media')
  const levelPath = (themeId, internalId) =>
    path.join(
      levelsDirectory(themeId),
      `${requireIdentifier(internalId, INTERNAL_ID_PATTERN, 'level ID')}.json`,
    )

  function themeMediaFile(themeId, relativePath) {
    const root = path.resolve(mediaDirectory(themeId))
    const relative = String(relativePath ?? '').replaceAll('\\', '/')
    if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) {
      throw Object.assign(new Error('Invalid theme media path.'), { status: 400 })
    }
    const target = path.resolve(root, ...relative.split('/'))
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw Object.assign(new Error('Invalid theme media path.'), { status: 400 })
    }
    return target
  }

  async function defaultLevels() {
    const files = (await readdir(defaultLevelsDirectory))
      .filter((fileName) => /^level-\d+\.json$/.test(fileName))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    return Promise.all(files.map((fileName) => readJson(path.join(defaultLevelsDirectory, fileName))))
  }

  async function readMetadata(themeId) {
    if (themeId === DEFAULT_THEME_ID) {
      const levels = await defaultLevels()
      return {
        schemaVersion: THEME_SCHEMA_VERSION,
        id: DEFAULT_THEME_ID,
        name: 'Default',
        description: 'The read-only source-controlled Path Protocol campaign.',
        public: true,
        readOnly: true,
        createdAt: null,
        updatedAt: null,
        levelOrder: levels.map((level) => level.id),
      }
    }
    try {
      return await readJson(metadataPath(themeId))
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw Object.assign(new Error('Theme not found.'), { status: 404 })
      }
      throw error
    }
  }

  function authorize(metadata, userId) {
    if (metadata.readOnly || !userId || metadata.ownerUserId !== userId) {
      throw Object.assign(new Error('Login as the theme owner to edit it.'), {
        status: 403,
      })
    }
  }

  function canAccess(metadata, userId) {
    return metadata.public || (!metadata.readOnly && metadata.ownerUserId === userId)
  }

  async function readThemeLevels(themeId, metadata = null) {
    if (themeId === DEFAULT_THEME_ID) return defaultLevels()
    const resolved = metadata ?? (await readMetadata(themeId))
    return Promise.all(
      resolved.levelOrder.map((internalId) => readJson(levelPath(themeId, internalId))),
    )
  }

  function validateLevel(level) {
    const schemaValid = validateSchema(level)
    if (!schemaValid) {
      return {
        valid: false,
        errors: validateSchema.errors.map(
          (error) => `${error.instancePath || '/'} ${error.message}`,
        ),
      }
    }
    try {
      generateLevel(level)
      return { valid: true, errors: [] }
    } catch (error) {
      return { valid: false, errors: [error.message] }
    }
  }

  async function listPublicThemes() {
    const themes = [publicMetadata(await readMetadata(DEFAULT_THEME_ID))]
    for (const entry of await readdir(dataDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !THEME_ID_PATTERN.test(entry.name)) continue
      try {
        const metadata = await readMetadata(entry.name)
        if (metadata.public) themes.push(publicMetadata(metadata))
      } catch {
        // Ignore incomplete folders left by interrupted external writes.
      }
    }
    return themes.sort((first, second) => first.name.localeCompare(second.name))
  }

  async function listOwnedThemes(userId) {
    const themes = []
    for (const entry of await readdir(dataDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !THEME_ID_PATTERN.test(entry.name)) continue
      try {
        const metadata = await readMetadata(entry.name)
        if (metadata.ownerUserId === userId) {
          themes.push({ ...publicMetadata(metadata), canEdit: true })
        }
      } catch {
        // Ignore incomplete folders left by interrupted external writes.
      }
    }
    return themes.sort((first, second) => first.name.localeCompare(second.name))
  }

  async function getTheme(themeId, userId) {
    const metadata = await readMetadata(themeId)
    if (!canAccess(metadata, userId)) {
      throw Object.assign(new Error('Theme not found.'), { status: 404 })
    }
    const levels = await readThemeLevels(themeId, metadata)
    return {
      ...publicMetadata(metadata),
      canEdit: !metadata.readOnly && metadata.ownerUserId === userId,
      levels: levels.map(({ internalId, id, number, name, difficulty }) => ({
        internalId: internalId ?? id,
        id,
        number,
        name,
        difficulty,
      })),
    }
  }

  async function getCampaign(themeId, userId) {
    const metadata = await readMetadata(themeId)
    if (!canAccess(metadata, userId)) {
      throw Object.assign(new Error('Theme not found.'), { status: 404 })
    }
    return {
      theme: publicMetadata(metadata),
      levels: await readThemeLevels(themeId, metadata),
    }
  }

  async function cloneTheme(
    { sourceThemeId = DEFAULT_THEME_ID, name, description },
    ownerUserId,
  ) {
    if (!ownerUserId) {
      throw Object.assign(new Error('Login is required to clone a theme.'), {
        status: 401,
      })
    }
    if (!String(name ?? '').trim()) {
      throw Object.assign(new Error('Theme name is required.'), { status: 400 })
    }
    const sourceMetadata = await readMetadata(sourceThemeId)
    if (!sourceMetadata.public && sourceThemeId !== DEFAULT_THEME_ID) {
      throw Object.assign(new Error('Only published themes can be cloned.'), {
        status: 403,
      })
    }
    const sourceLevels = await readThemeLevels(sourceThemeId, sourceMetadata)
    const themeId = `${slugify(name)}-${randomBytes(4).toString('hex')}`
    const now = new Date().toISOString()
    const clonedLevels = sourceLevels.map((source, index) => ({
      ...structuredClone(source),
      internalId: randomUUID(),
      id: `level-${String(index + 1).padStart(2, '0')}`,
      number: index + 1,
    }))
    const metadata = {
      schemaVersion: THEME_SCHEMA_VERSION,
      id: themeId,
      name: String(name).trim().slice(0, 80),
      description: String(description ?? '').trim().slice(0, 500),
      public: false,
      readOnly: false,
      ownerUserId,
      createdAt: now,
      updatedAt: now,
      mediaVersion: 1,
      mediaSources: { visuals: {}, audio: {} },
      levelOrder: clonedLevels.map((level) => level.internalId),
    }
    await mkdir(levelsDirectory(themeId), { recursive: true })
    for (const level of clonedLevels) {
      await atomicJson(levelPath(themeId, level.internalId), level)
    }
    await atomicJson(metadataPath(themeId), metadata)
    return { ...publicMetadata(metadata), canEdit: true }
  }

  async function getLevel(themeId, internalId, userId) {
    const metadata = await readMetadata(themeId)
    if (!canAccess(metadata, userId)) {
      throw Object.assign(new Error('Theme not found.'), { status: 404 })
    }
    if (themeId === DEFAULT_THEME_ID) {
      const levels = await defaultLevels()
      const level = levels.find((item) => item.id === internalId)
      if (!level) throw Object.assign(new Error('Level not found.'), { status: 404 })
      return level
    }
    if (!metadata.levelOrder.includes(internalId)) {
      throw Object.assign(new Error('Level not found.'), { status: 404 })
    }
    return readJson(levelPath(themeId, internalId))
  }

  async function saveLevel(themeId, internalId, userId, level) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    if (!metadata.levelOrder.includes(internalId) || level.internalId !== internalId) {
      throw Object.assign(new Error('Level identity does not match the route.'), {
        status: 400,
      })
    }
    const validation = validateLevel(level)
    if (!validation.valid) {
      throw Object.assign(new Error('Level validation failed.'), {
        status: 422,
        details: validation.errors,
      })
    }
    await atomicJson(levelPath(themeId, internalId), level)
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { level, validation }
  }

  async function addLevel(themeId, userId, sourceInternalId = null) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    if (metadata.levelOrder.length >= 200) {
      throw Object.assign(new Error('Themes support at most 200 levels.'), {
        status: 409,
      })
    }
    const levels = await readThemeLevels(themeId, metadata)
    const source = sourceInternalId
      ? levels.find((level) => level.internalId === sourceInternalId)
      : levels.at(-1)
    if (!source) {
      throw Object.assign(new Error('A source level is required.'), { status: 400 })
    }
    const internalId = randomUUID()
    const position = levels.length + 1
    const level = {
      ...structuredClone(source),
      internalId,
      id: `level-${String(position).padStart(2, '0')}`,
      number: position,
      name: `${source.name} Copy`,
      seed: `${source.seed}-copy-${randomBytes(3).toString('hex')}`,
    }
    metadata.levelOrder.push(internalId)
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(levelPath(themeId, internalId), level)
    await atomicJson(metadataPath(themeId), metadata)
    return level
  }

  async function reorderLevels(themeId, userId, order) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    if (
      !Array.isArray(order) ||
      order.length !== metadata.levelOrder.length ||
      new Set(order).size !== order.length ||
      order.some((internalId) => !metadata.levelOrder.includes(internalId))
    ) {
      throw Object.assign(new Error('Level order must contain every level once.'), {
        status: 400,
      })
    }
    const levelsById = new Map(
      (await readThemeLevels(themeId, metadata)).map((level) => [
        level.internalId,
        level,
      ]),
    )
    for (let index = 0; index < order.length; index += 1) {
      const level = levelsById.get(order[index])
      level.number = index + 1
      level.id = `level-${String(index + 1).padStart(2, '0')}`
      await atomicJson(levelPath(themeId, level.internalId), level)
    }
    metadata.levelOrder = order
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return getTheme(themeId, userId)
  }

  async function deleteLevel(themeId, internalId, userId) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    if (metadata.levelOrder.length <= 1) {
      throw Object.assign(new Error('A theme must contain at least one level.'), {
        status: 409,
      })
    }
    if (!metadata.levelOrder.includes(internalId)) {
      throw Object.assign(new Error('Level not found.'), { status: 404 })
    }
    await rm(levelPath(themeId, internalId))
    const order = metadata.levelOrder.filter((item) => item !== internalId)
    metadata.levelOrder = order
    const levels = await readThemeLevels(themeId, metadata)
    for (let index = 0; index < levels.length; index += 1) {
      levels[index].number = index + 1
      levels[index].id = `level-${String(index + 1).padStart(2, '0')}`
      await atomicJson(levelPath(themeId, levels[index].internalId), levels[index])
    }
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return getTheme(themeId, userId)
  }

  async function setPublished(themeId, userId, published) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    metadata.public = Boolean(published)
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return publicMetadata(metadata)
  }

  async function setVisualMedia(themeId, userId, mediaId, assetId) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    const definition = mediaById.get(String(mediaId))
    if (!definition) {
      throw Object.assign(new Error('Unknown visual media ID.'), { status: 400 })
    }
    const destinationBase = path.join(
      mediaDirectory(themeId),
      definition.category,
      path.parse(definition.fileName).name,
    )
    const result = await mediaLibrary.materializeVisual(assetId, destinationBase)
    metadata.mediaSources ??= { visuals: {}, audio: {} }
    metadata.mediaSources.visuals[definition.mediaId] = {
      assetId: result.assetId,
      appliedAt: new Date().toISOString(),
    }
    metadata.mediaVersion = (metadata.mediaVersion ?? 1) + 1
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { mediaId: definition.mediaId, ...result }
  }

  async function setAudioMedia(themeId, userId, soundId, assetId) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    const definition = soundById.get(String(soundId))
    if (!definition) {
      throw Object.assign(new Error('Unknown sound ID.'), { status: 400 })
    }
    const result = await mediaLibrary.materializeAudio(
      assetId,
      path.join(mediaDirectory(themeId), 'audio'),
      definition.fileName,
    )
    metadata.mediaSources ??= { visuals: {}, audio: {} }
    metadata.mediaSources.audio[definition.soundId] = {
      assetId: result.assetId,
      appliedAt: new Date().toISOString(),
    }
    metadata.mediaVersion = (metadata.mediaVersion ?? 1) + 1
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { soundId: definition.soundId, ...result }
  }

  async function getMediaManifest(themeId, userId) {
    const metadata = await readMetadata(themeId)
    if (!canAccess(metadata, userId)) {
      throw Object.assign(new Error('Theme not found.'), { status: 404 })
    }
    const { manifest } = await resolveThemeManifest({
      themeName: themeId,
      mediaVersion:
        themeId === DEFAULT_THEME_ID
          ? mediaRegistry.mediaVersion
          : (metadata.mediaVersion ?? 1),
      mediaRegistry,
      soundRegistry,
      defaultRoot: defaultMediaDirectory,
      defaultRootUrl: '/media/default',
      themeRoot: themeId === DEFAULT_THEME_ID ? null : mediaDirectory(themeId),
      themeRootUrl: themeId === DEFAULT_THEME_ID ? null : '/theme-media',
      defaultAudioSettings,
    })
    const fileUrl = (relativePath) =>
      `/api/themes/${encodeURIComponent(themeId)}/media-file?path=${encodeURIComponent(relativePath)}`
    const visuals = manifest.visuals.map((entry) => {
      if (entry.sourceScope !== 'theme') return entry
      const source = new URL(entry.src, 'http://path-protocol.local')
      return {
        ...entry,
        src: `${fileUrl(source.pathname.replace('/theme-media/', ''))}&v=${manifest.mediaVersion}`,
      }
    })
    const audio = manifest.audio.map((entry) => ({
      ...entry,
      sources:
        entry.fileSourceScope === 'theme'
          ? entry.sources.map((sourceUrl) => {
              const source = new URL(sourceUrl, 'http://path-protocol.local')
              return `${fileUrl(source.pathname.replace('/theme-media/', ''))}&v=${manifest.mediaVersion}`
            })
          : entry.sources,
    }))
    return {
      ...manifest,
      pixi: {
        bundles: manifest.pixi.bundles.map((bundle) => ({
          ...bundle,
          assets: visuals.map(({ alias, src }) => ({ alias, src })),
        })),
      },
      visuals,
      audio,
    }
  }

  async function resolveMediaFile(themeId, userId, relativePath) {
    const metadata = await readMetadata(themeId)
    if (!canAccess(metadata, userId)) {
      throw Object.assign(new Error('Theme not found.'), { status: 404 })
    }
    const target = themeMediaFile(themeId, relativePath)
    try {
      const fileStats = await stat(target)
      if (!fileStats.isFile()) throw new Error('not a file')
      return target
    } catch {
      throw Object.assign(new Error('Theme media file not found.'), { status: 404 })
    }
  }

  async function deleteTheme(themeId, userId) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    const target = themeDirectory(themeId)
    if (path.dirname(target) !== path.resolve(dataDirectory)) {
      throw Object.assign(new Error('Unsafe theme path.'), { status: 400 })
    }
    await rm(target, { recursive: true })
  }

  return {
    addLevel,
    cloneTheme,
    deleteLevel,
    deleteTheme,
    getLevel,
    getCampaign,
    getMediaManifest,
    getTheme,
    listOwnedThemes,
    listPublicThemes,
    reorderLevels,
    resolveMediaFile,
    saveLevel,
    setAudioMedia,
    setPublished,
    setVisualMedia,
    validateLevel,
  }
}

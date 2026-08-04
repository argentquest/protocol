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
const ENTITY_OVERRIDE_PATTERN = /^entity-(visual|audio)-[a-f0-9-]{36}$/

/**
 * Converts a theme name into a bounded URL-safe ID prefix.
 *
 * @pure
 * @param {unknown} value Theme display name.
 * @returns {string} Lowercase slug of at most 48 characters.
 */
function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'theme'
}

/**
 * Removes private ownership fields and adds the public level count.
 *
 * @pure
 * @param {object} metadata Stored theme metadata.
 * @returns {object} Metadata safe for anonymous API responses.
 */
function publicMetadata(metadata) {
  const visible = { ...metadata }
  delete visible.editKey
  delete visible.ownerUserId
  delete visible.levelOrder
  return { ...visible, levelCount: metadata.levelOrder.length }
}

/**
 * Validates an identifier before it participates in a filesystem path.
 *
 * @pure
 * @param {unknown} value Candidate identifier.
 * @param {RegExp} pattern Allow-list expression.
 * @param {string} label Diagnostic field label.
 * @returns {string} Validated identifier.
 * @throws {Error} HTTP 400 error when the identifier is unsafe.
 */
function requireIdentifier(value, pattern, label) {
  if (!pattern.test(String(value))) {
    throw Object.assign(new Error(`Invalid ${label}.`), { status: 400 })
  }
  return String(value)
}

/**
 * Reads and parses a JSON file.
 *
 * @param {string} filePath Absolute JSON path.
 * @returns {Promise<object>} Parsed JSON value.
 */
async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

/**
 * Persists JSON through a same-directory temporary file and atomic rename.
 *
 * @param {string} filePath Absolute destination path.
 * @param {unknown} value Serializable JSON value.
 * @returns {Promise<void>}
 */
async function atomicJson(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, filePath)
}

/**
 * Removes per-entity media references when cloning levels without media files.
 *
 * @param {unknown} value JSON-compatible level value.
 * @returns {unknown} Detached value without entity override IDs.
 */
function withoutEntityMediaOverrides(value) {
  if (Array.isArray(value)) return value.map(withoutEntityMediaOverrides)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['visualOverrideId', 'audioOverrideId'].includes(key))
      .map(([key, child]) => [key, withoutEntityMediaOverrides(child)]),
  )
}

/**
 * Collects every per-entity media override ID referenced by a level.
 *
 * @param {unknown} value JSON-compatible level value.
 * @param {{visuals: Set<string>, audio: Set<string>}} [ids] Mutable result sets.
 * @returns {{visuals: Set<string>, audio: Set<string>}} Referenced override IDs by kind.
 */
function entityMediaOverrideIds(
  value,
  ids = { visuals: new Set(), audio: new Set() },
) {
  if (Array.isArray(value)) {
    for (const child of value) entityMediaOverrideIds(child, ids)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'visualOverrideId') ids.visuals.add(child)
      else if (key === 'audioOverrideId') ids.audio.add(child)
      else entityMediaOverrideIds(child, ids)
    }
  }
  return ids
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

  /** @param {string} themeId Valid theme ID. @returns {string} Absolute theme directory. */
  const themeDirectory = (themeId) =>
    path.join(
      dataDirectory,
      requireIdentifier(themeId, THEME_ID_PATTERN, 'theme ID'),
    )
  /** @param {string} themeId Theme ID. @returns {string} Absolute metadata path. */
  const metadataPath = (themeId) => path.join(themeDirectory(themeId), 'theme.json')
  /** @param {string} themeId Theme ID. @returns {string} Absolute level directory. */
  const levelsDirectory = (themeId) => path.join(themeDirectory(themeId), 'levels')
  /** @param {string} themeId Theme ID. @returns {string} Absolute media directory. */
  const mediaDirectory = (themeId) => path.join(themeDirectory(themeId), 'media')
  /**
   * Resolves a validated immutable level ID beneath its theme directory.
   *
   * @param {string} themeId Theme ID.
   * @param {string} internalId Immutable level UUID.
   * @returns {string} Absolute level JSON path.
   */
  const levelPath = (themeId, internalId) =>
    path.join(
      levelsDirectory(themeId),
      `${requireIdentifier(internalId, INTERNAL_ID_PATTERN, 'level ID')}.json`,
    )

  /**
   * Resolves a normalized relative media path without allowing traversal.
   *
   * @param {string} themeId Theme ID.
   * @param {string} relativePath Theme-relative media path.
   * @returns {string} Absolute contained media path.
   */
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

  /** @returns {Promise<object[]>} Read-only default campaign levels in file order. */
  async function defaultLevels() {
    const files = (await readdir(defaultLevelsDirectory))
      .filter((fileName) => /^level-\d+\.json$/.test(fileName))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    return Promise.all(files.map((fileName) => readJson(path.join(defaultLevelsDirectory, fileName))))
  }

  /**
   * Reads stored theme metadata or synthesizes the read-only default metadata.
   *
   * @param {string} themeId Theme ID.
   * @returns {Promise<object>} Theme metadata.
   */
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

  /**
   * Enforces authenticated ownership for a mutable theme operation.
   *
   * @param {object} metadata Stored theme metadata.
   * @param {string|null} userId Authenticated account UUID.
   * @returns {void}
   */
  function authorize(metadata, userId) {
    if (metadata.readOnly || !userId || metadata.ownerUserId !== userId) {
      throw Object.assign(new Error('Login as the theme owner to edit it.'), {
        status: 403,
      })
    }
  }

  /** @pure @param {object} metadata Theme metadata. @param {string|null} userId Account UUID. @returns {boolean} Whether private content is readable. */
  function canAccess(metadata, userId) {
    return metadata.public || (!metadata.readOnly && metadata.ownerUserId === userId)
  }

  /**
   * Reads theme levels in authoritative campaign order.
   *
   * @param {string} themeId Theme ID.
   * @param {object|null} [metadata=null] Previously loaded metadata.
   * @returns {Promise<object[]>} Ordered level documents.
   */
  async function readThemeLevels(themeId, metadata = null) {
    if (themeId === DEFAULT_THEME_ID) return defaultLevels()
    const resolved = metadata ?? (await readMetadata(themeId))
    return Promise.all(
      resolved.levelOrder.map((internalId) => readJson(levelPath(themeId, internalId))),
    )
  }

  /**
   * Validates schema, semantic rules, generation, and solvability before writes.
   *
   * @param {object} level Candidate level document.
   * @returns {object} Deterministically generated gameplay layout.
   */
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

  /** @returns {Promise<object[]>} Public metadata for published themes. */
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

  /** @param {string} userId Owner account UUID. @returns {Promise<object[]>} Owner-visible theme metadata. */
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

  /**
   * Reads accessible theme metadata and ordered level summaries.
   *
   * @param {string} themeId Theme ID.
   * @param {string|null} userId Requesting account UUID.
   * @returns {Promise<object>} Theme details.
   */
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

  /**
   * Reads an accessible theme as a playable campaign payload.
   *
   * @param {string} themeId Theme ID.
   * @param {string|null} userId Requesting account UUID.
   * @returns {Promise<object>} Public metadata and complete ordered levels.
   */
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

  /**
   * Clones level JSON into a new private owner theme without copying media.
   *
   * @param {string} sourceThemeId Readable source theme ID.
   * @param {string} ownerUserId New owner account UUID.
   * @param {string} name New display name.
   * @param {string} description New description.
   * @returns {Promise<object>} Created theme details.
   */
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
      ...withoutEntityMediaOverrides(source),
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
      entityMediaOverrides: { visuals: {}, audio: {} },
      levelOrder: clonedLevels.map((level) => level.internalId),
    }
    await mkdir(levelsDirectory(themeId), { recursive: true })
    for (const level of clonedLevels) {
      await atomicJson(levelPath(themeId, level.internalId), level)
    }
    await atomicJson(metadataPath(themeId), metadata)
    return { ...publicMetadata(metadata), canEdit: true }
  }

  /** @param {string} themeId Theme ID. @param {string} internalId Level UUID. @param {string|null} userId Requester UUID. @returns {Promise<object>} Accessible level. */
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

  /**
   * Validates and atomically replaces an owned level while preserving identity.
   *
   * @param {string} themeId Theme ID.
   * @param {string} internalId Immutable level UUID.
   * @param {string} userId Owner account UUID.
   * @param {object} level Candidate level document.
   * @returns {Promise<object>} Saved level.
   */
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
    const referencedOverrides = entityMediaOverrideIds(level)
    const availableVisuals = new Set(
      Object.keys(metadata.entityMediaOverrides?.visuals ?? {}),
    )
    const availableAudio = new Set(
      Object.keys(metadata.entityMediaOverrides?.audio ?? {}),
    )
    const missingOverrides = [
      ...[...referencedOverrides.visuals].filter(
        (overrideId) => !availableVisuals.has(overrideId),
      ),
      ...[...referencedOverrides.audio].filter(
        (overrideId) => !availableAudio.has(overrideId),
      ),
    ]
    if (missingOverrides.length) {
      throw Object.assign(new Error('Level references unavailable media overrides.'), {
        status: 422,
        details: missingOverrides,
      })
    }
    await atomicJson(levelPath(themeId, internalId), level)
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { level, validation }
  }

  /**
   * Appends a new level by duplicating a source or the theme's final level.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner account UUID.
   * @param {string|null} [sourceInternalId=null] Optional source level UUID.
   * @returns {Promise<object>} Newly created level.
   */
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

  /**
   * Applies a complete level UUID order and renumbers campaign-facing IDs.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner account UUID.
   * @param {string[]} order Complete ordered level UUID list.
   * @returns {Promise<object[]>} Renumbered levels.
   */
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

  /**
   * Deletes an owned level while preserving the one-level minimum and renumbering survivors.
   *
   * @param {string} themeId Theme ID.
   * @param {string} internalId Level UUID.
   * @param {string} userId Owner UUID.
   * @returns {Promise<object[]>} Remaining ordered levels.
   */
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

  /** @param {string} themeId Theme ID. @param {string} userId Owner UUID. @param {boolean} published Visibility state. @returns {Promise<object>} Updated metadata. */
  async function setPublished(themeId, userId, published) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    metadata.public = Boolean(published)
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return publicMetadata(metadata)
  }

  /**
   * Materializes a catalog image as one owned theme visual override.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner UUID.
   * @param {string} mediaId Registered visual ID.
   * @param {string} assetId Catalog image ID.
   * @returns {Promise<object>} Updated dynamic manifest.
   */
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
    const result = await mediaLibrary.materializeVisual(
      assetId,
      destinationBase,
      userId,
    )
    metadata.mediaSources ??= { visuals: {}, audio: {} }
    metadata.mediaSources.visuals[definition.mediaId] = {
      assetId: result.assetId,
      appliedAt: new Date().toISOString(),
      provenance: result.provenance,
    }
    metadata.mediaVersion = (metadata.mediaVersion ?? 1) + 1
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { mediaId: definition.mediaId, ...result }
  }

  /**
   * Materializes catalog audio as one complete owned theme sound override.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner UUID.
   * @param {string} soundId Registered logical sound ID.
   * @param {string} assetId Catalog audio ID.
   * @returns {Promise<object>} Updated dynamic manifest.
   */
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
      userId,
    )
    metadata.mediaSources ??= { visuals: {}, audio: {} }
    metadata.mediaSources.audio[definition.soundId] = {
      assetId: result.assetId,
      appliedAt: new Date().toISOString(),
      provenance: result.provenance,
    }
    metadata.mediaVersion = (metadata.mediaVersion ?? 1) + 1
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { soundId: definition.soundId, ...result }
  }

  /**
   * Materializes a catalog asset for one level entity rather than a global ID.
   *
   * Existing override IDs may be replaced only within the same owned theme and
   * media kind. New IDs are generated by the server so level JSON never points
   * directly into PublicMedia.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner UUID.
   * @param {object} request Override selection.
   * @returns {Promise<object>} Stable override ID and copied source metadata.
   */
  async function setEntityMediaOverride(
    themeId,
    userId,
    { kind, baseId, assetId, overrideId = null },
  ) {
    const metadata = await readMetadata(themeId)
    authorize(metadata, userId)
    if (!['visual', 'audio'].includes(kind)) {
      throw Object.assign(new Error('Entity override kind must be visual or audio.'), {
        status: 400,
      })
    }
    const definitions = kind === 'visual' ? mediaById : soundById
    const definition = definitions.get(String(baseId))
    if (!definition) {
      throw Object.assign(new Error(`Unknown base ${kind} ID.`), { status: 400 })
    }
    metadata.entityMediaOverrides ??= { visuals: {}, audio: {} }
    const collection =
      kind === 'visual'
        ? metadata.entityMediaOverrides.visuals
        : metadata.entityMediaOverrides.audio
    let resolvedOverrideId = overrideId
    if (resolvedOverrideId) {
      const match = ENTITY_OVERRIDE_PATTERN.exec(String(resolvedOverrideId))
      if (!match || match[1] !== kind || !collection[resolvedOverrideId]) {
        throw Object.assign(new Error('Unknown entity media override ID.'), {
          status: 400,
        })
      }
    } else {
      resolvedOverrideId = `entity-${kind}-${randomUUID()}`
    }

    let result
    if (kind === 'visual') {
      result = await mediaLibrary.materializeVisual(
        assetId,
        path.join(mediaDirectory(themeId), 'entity-visuals', resolvedOverrideId),
        userId,
      )
    } else {
      result = await mediaLibrary.materializeAudio(
        assetId,
        path.join(mediaDirectory(themeId), 'entity-audio'),
        resolvedOverrideId,
        userId,
      )
    }
    collection[resolvedOverrideId] = {
      assetId: result.assetId,
      baseId: definition.mediaId ?? definition.soundId,
      format: result.format ?? result.normalizedFormat,
      appliedAt: new Date().toISOString(),
      provenance: result.provenance,
    }
    metadata.mediaVersion = (metadata.mediaVersion ?? 1) + 1
    metadata.updatedAt = new Date().toISOString()
    await atomicJson(metadataPath(themeId), metadata)
    return { overrideId: resolvedOverrideId, kind, baseId, ...result }
  }

  /**
   * Resolves an accessible theme's dynamic per-element fallback manifest.
   *
   * @param {string} themeId Theme ID.
   * @param {string|null} userId Requesting account UUID.
   * @returns {Promise<object>} Resolved media manifest.
   */
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
    /** @param {string} relativePath Theme-relative asset path. @returns {string} Same-origin encoded media URL with a loader-visible extension. */
    const fileUrl = (relativePath) => {
      const extension = path.extname(relativePath).toLowerCase()
      return `/api/themes/${encodeURIComponent(themeId)}/media-file/asset${extension}?v=${manifest.mediaVersion}&path=${encodeURIComponent(relativePath)}`
    }
    const visuals = manifest.visuals.map((entry) => {
      if (entry.sourceScope !== 'theme') return entry
      const source = new URL(entry.src, 'http://path-protocol.local')
      return {
        ...entry,
          src: fileUrl(source.pathname.replace('/theme-media/', '')),
      }
    })
    const audio = manifest.audio.map((entry) => ({
      ...entry,
      sources:
        entry.fileSourceScope === 'theme'
          ? entry.sources.map((sourceUrl) => {
              const source = new URL(sourceUrl, 'http://path-protocol.local')
                return fileUrl(source.pathname.replace('/theme-media/', ''))
            })
          : entry.sources,
    }))
    for (const [overrideId, override] of Object.entries(
      metadata.entityMediaOverrides?.visuals ?? {},
    )) {
      const definition = mediaById.get(override.baseId)
      if (!definition || !ENTITY_OVERRIDE_PATTERN.test(overrideId)) continue
      const format = override.format === 'svg' ? 'svg' : 'png'
      visuals.push({
        mediaId: overrideId,
        alias: `${themeId}:${overrideId}:v${manifest.mediaVersion}`,
        src: fileUrl(`entity-visuals/${overrideId}.${format}`),
        category: definition.category,
        renderMode: format === 'svg' ? 'vector' : 'texture',
        sizing: definition.sizing,
        sourceScope: 'entity',
      })
    }
    for (const [overrideId, override] of Object.entries(
      metadata.entityMediaOverrides?.audio ?? {},
    )) {
      const definition = soundById.get(override.baseId)
      const settings = defaultAudioSettings.sounds?.[override.baseId]
      if (!definition || !settings || !ENTITY_OVERRIDE_PATTERN.test(overrideId)) {
        continue
      }
      audio.push({
        soundId: overrideId,
        sources: [
          fileUrl(`entity-audio/${overrideId}.webm`),
          fileUrl(`entity-audio/${overrideId}.mp3`),
        ],
        settings,
        fileSourceScope: 'entity',
        settingsSourceScope: 'default',
      })
    }
    visuals.sort((first, second) => first.mediaId.localeCompare(second.mediaId))
    audio.sort((first, second) => first.soundId.localeCompare(second.soundId))
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

  /**
   * Authorizes and resolves one dynamic theme media file for HTTP delivery.
   *
   * @param {string} themeId Theme ID.
   * @param {string|null} userId Requesting account UUID.
   * @param {string} relativePath Theme-relative media path.
   * @returns {Promise<string>} Absolute existing file path.
   */
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

  /**
   * Permanently removes an owned mutable theme directory.
   *
   * @param {string} themeId Theme ID.
   * @param {string} userId Owner account UUID.
   * @returns {Promise<void>}
   */
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
    setEntityMediaOverride,
    setPublished,
    setVisualMedia,
    validateLevel,
  }
}

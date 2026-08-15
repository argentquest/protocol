import Ajv2020 from 'ajv/dist/2020.js'
import audioSettingsSchema from './schemas/audioSettings.schema.json'
import gameConfigSchema from './schemas/gameConfig.schema.json'
import levelSchema from './schemas/level.schema.json'
import mediaManifestSchema from './schemas/mediaManifest.schema.json'
import mediaRegistrySchema from './schemas/mediaRegistry.schema.json'
import microProtocolsSchema from './schemas/microProtocols.schema.json'
import powerupSchema from './schemas/powerup.schema.json'
import resolvedMediaManifestSchema from './schemas/resolvedMediaManifest.schema.json'
import soundRegistrySchema from './schemas/soundRegistry.schema.json'
import themeSchema from './schemas/theme.schema.json'
import threeMediaManifestSchema from './schemas/threeMediaManifest.schema.json'

const schemaEntries = {
  audioSettings: audioSettingsSchema,
  gameConfig: gameConfigSchema,
  level: levelSchema,
  mediaManifest: mediaManifestSchema,
  mediaRegistry: mediaRegistrySchema,
  microProtocols: microProtocolsSchema,
  powerups: powerupSchema,
  resolvedMediaManifest: resolvedMediaManifestSchema,
  soundRegistry: soundRegistrySchema,
  themes: themeSchema,
  threeMediaManifest: threeMediaManifestSchema,
}

/**
 * Compiles all configuration schemas into reusable AJV validators.
 *
 * @returns {Record<string, import('ajv').ValidateFunction>} Validator by contract name.
 */
function createValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    verbose: true,
  })
  return Object.fromEntries(
    Object.entries(schemaEntries).map(([name, schema]) => [name, ajv.compile(schema)]),
  )
}

let validators

/**
 * Returns the lazily compiled schema-validator cache.
 *
 * @returns {Record<string, import('ajv').ValidateFunction>} Shared validators.
 */
function getValidators() {
  validators ??= createValidators()
  return validators
}

/**
 * Returns the lazily compiled AJV validators keyed by schema name.
 *
 * @returns {Record<string, import('ajv').ValidateFunction>} Compiled validators.
 */
export function getSchemaValidators() {
  return getValidators()
}

/**
 * Converts AJV error objects into actionable scoped messages.
 *
 * @pure
 * @param {string} scope Configuration document label.
 * @param {object[]} [errors=[]] AJV validation errors.
 * @returns {string[]} Human-readable error messages.
 */
function formatAjvErrors(scope, errors = []) {
  return errors.map((error) => {
    const path = error.instancePath || '/'
    return `${scope}${path}: ${error.message}`
  })
}

/**
 * Finds repeated stable IDs in encounter order.
 *
 * @pure
 * @param {string[]} values Candidate IDs.
 * @returns {string[]} Unique duplicate IDs.
 */
function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

/**
 * Collects every theme-neutral visual media ID referenced by a level.
 *
 * @pure
 * @param {object} level Level configuration.
 * @returns {string[]} Referenced media IDs.
 */
function levelMediaIds(level) {
  return [
    level.arena?.mediaId,
    level.token?.mediaId,
    level.start?.mediaId,
    level.mainTarget?.mediaId,
    ...Object.values(level.generation?.mediaByShape ?? {}),
    ...(level.manualObstacles ?? []).map((item) => item.mediaId),
    ...(level.movingObstacles ?? []).map((item) => item.mediaId),
    ...(level.trackingObstacles ?? []).map((item) => item.mediaId),
    ...(level.dynamicObstacles ?? []).map((item) => item.mediaId),
    ...(level.switches ?? []).map((item) => item.mediaId),
    ...(level.forceFields ?? []).map((item) => item.mediaId),
    ...(level.ramps ?? []).map((item) => item.mediaId),
    ...(level.terrainSurfaces ?? []).map((item) => item.mediaId),
    ...(level.walls ?? []).map((item) => item.mediaId),
    ...(level.coins ?? []).map((item) => item.mediaId),
    ...(level.bonuses?.targets ?? []).map((item) => item.mediaId),
  ].filter(Boolean)
}

/**
 * Collects optional 3D model references from every renderable level object.
 *
 * @pure
 * @param {object} level Level configuration.
 * @returns {string[]} Referenced model IDs.
 */
function levelModelIds(level) {
  return [
    level.token,
    level.start,
    level.mainTarget,
    ...(level.terrainSurfaces ?? []),
    ...(level.ramps ?? []),
    ...(level.manualObstacles ?? []),
    ...(level.movingObstacles ?? []),
    ...(level.trackingObstacles ?? []),
    ...(level.dynamicObstacles ?? []),
    ...(level.switches ?? []),
    ...(level.forceFields ?? []),
    ...(level.coins ?? []),
    ...(level.bonuses?.targets ?? []),
    ...(level.walls ?? []),
  ].map((item) => item?.model3dId).filter(Boolean)
}

/**
 * Resolves each level entity to the 3D presentation role its authored
 * `model3dId` must support. Mirror of the renderer's entity roles so the
 * manifest `roles` contract is enforced at validation time.
 *
 * @param {object} level Validated level config.
 * @returns {Array<{modelId:string, role:string, label:string}>} Model assignments.
 */
function levelModelAssignments(level) {
  const assignments = []
  /** @param {object} item Renderable entity. @param {string} role Required catalog role. @param {string} label Validation label. @returns {void} */
  const add = (item, role, label) => {
    if (item?.model3dId) {
      assignments.push({ modelId: item.model3dId, role, label })
    }
  }
  add(level.token, 'token', `${level.id}/token`)
  add(level.mainTarget, 'target', `${level.id}/mainTarget`)
  // Only entities whose renderer role maps cleanly to a manifest role are
  // role-checked. Coins, switches, and force fields use procedural or
  // multi-purpose models and are validated for existence, not role fit.
  for (const group of [
    ['terrainSurfaces', 'terrain'],
    ['ramps', 'ramp'],
    ['manualObstacles', 'obstacle'],
    ['movingObstacles', 'obstacle'],
    ['trackingObstacles', 'obstacle'],
    ['dynamicObstacles', 'obstacle'],
  ]) {
    const [key, role] = group
    for (const item of level[key] ?? []) {
      add(item, role, `${level.id}/${item.id}`)
    }
  }
  for (const wall of level.walls ?? []) {
    if (wall.model3dId) {
      add(wall, 'obstacle', `${level.id}/${wall.id}`)
    }
  }
  for (const target of level.bonuses?.targets ?? []) {
    add(target, 'target', `${level.id}/${target.id}`)
  }
  return assignments
}

/**
 * Validates uniqueness and cross-contract rules in media registries.
 *
 * @param {object} mediaRegistry Visual media registry.
 * @param {object} soundRegistry Logical sound registry.
 * @param {string[]} errors Mutable error collection.
 * @returns {void}
 */
function validateRegistries(mediaRegistry, soundRegistry, errors) {
  const mediaIds = mediaRegistry.media.map((entry) => entry.mediaId)
  const mediaFiles = mediaRegistry.media.map(
    (entry) => `${entry.category}/${entry.fileName}`,
  )
  for (const duplicate of duplicateValues(mediaIds)) {
    errors.push(`mediaRegistry: duplicate mediaId "${duplicate}"`)
  }
  for (const duplicate of duplicateValues(mediaFiles)) {
    errors.push(`mediaRegistry: duplicate default path "${duplicate}"`)
  }

  const soundIds = soundRegistry.sounds.map((entry) => entry.soundId)
  const soundFiles = soundRegistry.sounds.map((entry) => entry.fileName)
  for (const duplicate of duplicateValues(soundIds)) {
    errors.push(`soundRegistry: duplicate soundId "${duplicate}"`)
  }
  for (const duplicate of duplicateValues(soundFiles)) {
    errors.push(`soundRegistry: duplicate fileName "${duplicate}"`)
  }
  if (!soundIds.includes('ambience')) {
    errors.push('soundRegistry: required soundId "ambience" is missing')
  }
}

/**
 * Validates level references and gameplay relationships beyond JSON Schema.
 *
 * @param {object} level Level configuration.
 * @param {Set<string>} mediaIds Registered visual media IDs.
 * @param {string[]} errors Mutable error collection.
 * @param {object} [options] Campaign-specific constraints.
 * @returns {void}
 */
function validateLevelRelationships(
  levels,
  mediaIds,
  errors,
  { requireContiguous = true, modelIds = null, modelRoles = null } = {},
) {
  const levelIds = levels.map((level) => level.id)
  const levelNumbers = levels.map((level) => level.number)
  for (const duplicate of duplicateValues(levelIds)) {
    errors.push(`levels: duplicate id "${duplicate}"`)
  }
  for (const duplicate of duplicateValues(levelNumbers)) {
    errors.push(`levels: duplicate number "${duplicate}"`)
  }

  const sortedNumbers = [...levelNumbers].sort((a, b) => a - b)
  if (requireContiguous) {
    sortedNumbers.forEach((number, index) => {
      if (number !== index + 1) {
        errors.push(`levels: campaign numbers must be contiguous from 1`)
      }
    })
  }

  for (const level of levels) {
    if (level.id !== `level-${String(level.number).padStart(2, '0')}`) {
      errors.push(`${level.id}: id does not match level number ${level.number}`)
    }
    const weightTotal =
      Number(level.scoring?.timeWeight) + Number(level.scoring?.distanceWeight)
    if (Math.abs(weightTotal - 1) > 1e-9) {
      errors.push(`${level.id}: scoring weights must total 1`)
    }
    if (level.generation?.minSize > level.generation?.maxSize) {
      errors.push(`${level.id}: generation minSize cannot exceed maxSize`)
    }
    if (
      level.shotMechanic &&
      level.shotMechanic.minimumLaunchSpeed >
        level.shotMechanic.maximumLaunchSpeed
    ) {
      errors.push(`${level.id}: minimumLaunchSpeed cannot exceed maximumLaunchSpeed`)
    }
    if (
      level.shotMechanic &&
      level.shotMechanic.stopSpeed >= level.shotMechanic.minimumLaunchSpeed
    ) {
      errors.push(`${level.id}: shot stopSpeed must be below minimumLaunchSpeed`)
    }
    if (level.shotGoals && !level.shotMechanic) {
      errors.push(`${level.id}: shotGoals requires shotMechanic`)
    }
    if ((level.ramps?.length ?? 0) > 0 && !level.verticalPhysics) {
      errors.push(`${level.id}: ramps require verticalPhysics`)
    }
    if ((level.terrainSurfaces?.length ?? 0) > 0 && !level.verticalPhysics) {
      errors.push(`${level.id}: terrainSurfaces require verticalPhysics`)
    }
    if (
      level.shotGoals?.perfectShots !== undefined &&
      level.shotGoals?.par === undefined
    ) {
      errors.push(`${level.id}: perfectShots requires shot par`)
    }
    if (
      level.shotGoals?.perfectShots !== undefined &&
      level.shotGoals?.par !== undefined &&
      level.shotGoals.perfectShots > level.shotGoals.par
    ) {
      errors.push(`${level.id}: perfectShots cannot exceed shot par`)
    }
    if (
      level.shotGoals?.maximumShots !== undefined &&
      level.shotGoals?.par !== undefined &&
      level.shotGoals.maximumShots < level.shotGoals.par
    ) {
      errors.push(`${level.id}: maximumShots cannot be below shot par`)
    }
    if (
      level.shotMechanic &&
      [
        ...(level.movingObstacles ?? []),
        ...(level.trackingObstacles ?? []),
        ...(level.dynamicObstacles ?? []),
        ...(level.forceFields ?? []),
      ].length
    ) {
      errors.push(
        `${level.id}: kinetic levels currently support static obstacles only`,
      )
    }
    if (level.bonuses?.maximumTargets > level.bonuses?.targets?.length) {
      errors.push(`${level.id}: maximumTargets exceeds configured bonus targets`)
    }
    const switchIds = new Set((level.switches ?? []).map((item) => item.id))
    for (const obstacle of level.dynamicObstacles ?? []) {
      const behavior = obstacle.behavior
      if (
        behavior.type === 'phase' &&
        behavior.solidMs + behavior.warningMs >= behavior.cycleMs
      ) {
        errors.push(`${level.id}/${obstacle.id}: phase requires an open window`)
      }
      if (
        behavior.type === 'pulse' &&
        behavior.minScale > behavior.maxScale
      ) {
        errors.push(`${level.id}/${obstacle.id}: pulse scales are inverted`)
      }
      if (
        behavior.type === 'switch' &&
        !switchIds.has(behavior.switchId)
      ) {
        errors.push(
          `${level.id}/${obstacle.id}: unknown switch "${behavior.switchId}"`,
        )
      }
    }
    for (const mediaId of levelMediaIds(level)) {
      if (!mediaIds.has(mediaId)) {
        errors.push(`${level.id}: unknown mediaId "${mediaId}"`)
      }
    }
    if (modelIds) {
      for (const modelId of levelModelIds(level)) {
        if (!modelIds.has(modelId)) {
          errors.push(`${level.id}: unknown model3dId "${modelId}"`)
        }
      }
    }
    if (modelRoles) {
      for (const assignment of levelModelAssignments(level)) {
        const supported = modelRoles.get(assignment.modelId)
        if (supported && !supported.includes(assignment.role)) {
          errors.push(
            `${assignment.label}: model3dId "${assignment.modelId}" does not support role "${assignment.role}"`,
          )
        }
      }
    }

    const objectIds = [
      ...(level.manualObstacles ?? []),
      ...(level.movingObstacles ?? []),
      ...(level.trackingObstacles ?? []),
      ...(level.dynamicObstacles ?? []),
      ...(level.switches ?? []),
      ...(level.forceFields ?? []),
      ...(level.ramps ?? []),
      ...(level.terrainSurfaces ?? []),
      ...(level.coins ?? []),
      ...(level.bonuses?.targets ?? []),
    ].map((item) => item.id)
    for (const duplicate of duplicateValues(objectIds)) {
      errors.push(`${level.id}: duplicate object id "${duplicate}"`)
    }
  }
}

/**
 * Validates power visual and audio references against their registries.
 *
 * @param {object} powerupConfig Power configuration.
 * @param {Set<string>} mediaIds Registered visual IDs.
 * @param {Set<string>} soundIds Registered sound IDs.
 * @param {string[]} errors Mutable error collection.
 * @returns {void}
 */
function validatePowerRelationships(powerupConfig, mediaIds, soundIds, errors) {
  const powers = powerupConfig.powerups
  for (const duplicate of duplicateValues(powers.map((power) => power.id))) {
    errors.push(`powerups: duplicate id "${duplicate}"`)
  }
  for (const duplicate of duplicateValues(powers.map((power) => power.key))) {
    errors.push(`powerups: duplicate key "${duplicate}"`)
  }
  for (const power of powers) {
    if (!mediaIds.has(power.mediaId)) {
      errors.push(`powerups/${power.id}: unknown mediaId "${power.mediaId}"`)
    }
    if (!soundIds.has(power.soundId)) {
      errors.push(`powerups/${power.id}: unknown soundId "${power.soundId}"`)
    }
  }
}

/**
 * Validates schema compliance and cross-registry relationships for all config.
 *
 * @param {object} configuration Complete imported configuration set.
 * @returns {{valid: boolean, errors: string[]}} Validation status and actionable errors.
 */
export function validateConfiguration({
  levels,
  microLevels = [],
  microProtocolConfig = null,
  gameConfig,
  powerupConfig,
  themeConfig,
  mediaRegistry,
  soundRegistry,
  threeMediaManifest = null,
}) {
  const validators = getValidators()
  const errors = []
  /**
   * Runs a compiled schema validator and appends scoped diagnostics.
   *
   * @param {string} validatorName Validator cache key.
   * @param {string} scope Configuration document label.
   * @param {unknown} value Candidate configuration.
   * @returns {void}
   */
  const validate = (validatorName, scope, value) => {
    const valid = validators[validatorName](value)
    if (!valid) {
      errors.push(...formatAjvErrors(scope, validators[validatorName].errors))
    }
  }

  validate('gameConfig', 'gameConfig', gameConfig)
  validate('powerups', 'powerups', powerupConfig)
  validate('themes', 'themes', themeConfig)
  validate('mediaRegistry', 'mediaRegistry', mediaRegistry)
  if (microProtocolConfig) {
    validate('microProtocols', 'microProtocols', microProtocolConfig)
  }
  validate('soundRegistry', 'soundRegistry', soundRegistry)
  if (threeMediaManifest) {
    validate('threeMediaManifest', 'threeMediaManifest', threeMediaManifest)
  }
  levels.forEach((level) => validate('level', level.id ?? 'unknown-level', level))
  microLevels.forEach((level) =>
    validate('level', level.id ?? 'unknown-micro-level', level),
  )

  if (!themeConfig.themes?.[themeConfig.activeTheme]) {
    errors.push(`themes: active theme "${themeConfig.activeTheme}" is not defined`)
  }

  if (
    mediaRegistry.mediaVersion !== themeConfig.mediaVersion
  ) {
    errors.push('themes: mediaVersion must match the media registry version')
  }

  validateRegistries(mediaRegistry, soundRegistry, errors)
  const mediaIds = new Set(mediaRegistry.media.map((entry) => entry.mediaId))
  const soundIds = new Set(soundRegistry.sounds.map((entry) => entry.soundId))
  const modelIds = threeMediaManifest
    ? new Set(threeMediaManifest.models.map((entry) => entry.modelId))
    : null
  const modelRoles = threeMediaManifest
    ? new Map(threeMediaManifest.models.map((entry) => [entry.modelId, entry.roles]))
    : null
  validateLevelRelationships(levels, mediaIds, errors, {
    modelIds,
    modelRoles,
  })
  validateLevelRelationships(microLevels, mediaIds, errors, {
    requireContiguous: false,
    modelIds,
    modelRoles,
  })
  if (threeMediaManifest) {
    for (const duplicate of duplicateValues(
      threeMediaManifest.models.map((entry) => entry.modelId),
    )) {
      errors.push(`threeMediaManifest: duplicate modelId "${duplicate}"`)
    }
    for (const [role, modelId] of Object.entries(threeMediaManifest.defaults)) {
      if (!modelIds.has(modelId)) {
        errors.push(`threeMediaManifest: ${role} default references unknown modelId "${modelId}"`)
      }
    }
  }
  const microLevelIds = new Set(microLevels.map((level) => level.id))
  for (const protocol of microProtocolConfig?.protocols ?? []) {
    if (!microLevelIds.has(protocol.levelId)) {
      errors.push(
        `microProtocols/${protocol.id}: unknown levelId "${protocol.levelId}"`,
      )
    }
  }
  validatePowerRelationships(powerupConfig, mediaIds, soundIds, errors)

  return {
    valid: errors.length === 0,
    errors,
  }
}

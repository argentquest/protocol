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
}

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

function formatAjvErrors(scope, errors = []) {
  return errors.map((error) => {
    const path = error.instancePath || '/'
    return `${scope}${path}: ${error.message}`
  })
}

function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

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
    ...(level.coins ?? []).map((item) => item.mediaId),
    ...(level.bonuses?.targets ?? []).map((item) => item.mediaId),
  ].filter(Boolean)
}

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

function validateLevelRelationships(
  levels,
  mediaIds,
  errors,
  { requireContiguous = true } = {},
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

    const objectIds = [
      ...(level.manualObstacles ?? []),
      ...(level.movingObstacles ?? []),
      ...(level.trackingObstacles ?? []),
      ...(level.dynamicObstacles ?? []),
      ...(level.switches ?? []),
      ...(level.coins ?? []),
      ...(level.bonuses?.targets ?? []),
    ].map((item) => item.id)
    for (const duplicate of duplicateValues(objectIds)) {
      errors.push(`${level.id}: duplicate object id "${duplicate}"`)
    }
  }
}

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
}) {
  const validators = getValidators()
  const errors = []
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
  validateLevelRelationships(levels, mediaIds, errors)
  validateLevelRelationships(microLevels, mediaIds, errors, {
    requireContiguous: false,
  })
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

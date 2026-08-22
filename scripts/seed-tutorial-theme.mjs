import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { generateLevel } from '../src/game/generation/levelGenerator.js'

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const THEME_ID = 'aurora-academy'
const THEME_NAME = 'Aurora Academy'
const THEME_DESCRIPTION =
  'A 20-level tutorial campaign introducing every Path Protocol mechanic, one lesson at a time.'
const CREATED_AT = '2026-01-01T00:00:00.000Z'
const SOURCE_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  'src',
  'config',
  'tutorial-levels',
)
const LEVEL_SCHEMA_PATH = path.join(
  REPOSITORY_ROOT,
  'src',
  'config',
  'schemas',
  'level.schema.json',
)
const DATA_DIRECTORY =
  process.env.PATH_PROTOCOL_DATA_DIR ??
  path.join(REPOSITORY_ROOT, 'data', 'themes')

/**
 * Derives a stable RFC-4122-style UUID from an input string so re-seeding the
 * same source produces the same theme package.
 *
 * @pure
 * @param {string} input Stable identity string.
 * @returns {string} Deterministic UUID in 8-4-4-4-12 form.
 */
function deterministicUuid(input) {
  const digest = createHash('sha256').update(input).digest('hex')
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-')
}

/** @returns {Promise<{level: object, sourceFile: string}[]>} Sorted tutorial level documents. */
async function loadSourceLevels() {
  const files = (await readdir(SOURCE_DIRECTORY))
    .filter((fileName) => /^tutorial-\d{2}\.json$/.test(fileName))
    .sort((first, second) =>
      first.localeCompare(second, undefined, { numeric: true }),
    )
  const documents = await Promise.all(
    files.map(async (fileName) => ({
      level: JSON.parse(await readFile(path.join(SOURCE_DIRECTORY, fileName), 'utf8')),
      sourceFile: fileName,
    })),
  )
  return documents.sort((first, second) => first.level.number - second.level.number)
}

/**
 * Validates one level exactly as the Theme Workshop server does: JSON Schema
 * compliance followed by deterministic generation and solvability.
 *
 * @param {object} level Candidate level document.
 * @param {import('ajv').ValidateFunction} validateSchema Compiled level validator.
 * @returns {string[]} Validation errors.
 */
function validateLevel(level, validateSchema) {
  if (!validateSchema(level)) {
    return validateSchema.errors.map(
      (error) => `${error.instancePath || '/'} ${error.message}`,
    )
  }
  try {
    generateLevel(level)
    return []
  } catch (error) {
    return [error.message]
  }
}

/** @returns {Promise<number>} Exit status. */
async function main() {
  const schema = JSON.parse(await readFile(LEVEL_SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validateSchema = ajv.compile(schema)
  const sources = await loadSourceLevels()
  if (sources.length !== 20) {
    throw new Error(
      `Expected exactly 20 tutorial levels in ${SOURCE_DIRECTORY}, found ${sources.length}.`,
    )
  }

  const failures = []
  const levels = sources.map(({ level, sourceFile }, index) => {
    const expectedNumber = index + 1
    if (level.number !== expectedNumber || level.id !== `level-${String(expectedNumber).padStart(2, '0')}`) {
      failures.push(
        `${sourceFile}: expected number ${expectedNumber} and id level-${String(expectedNumber).padStart(2, '0')}.`,
      )
    }
    const errors = validateLevel(level, validateSchema)
    if (errors.length) {
      failures.push(`${sourceFile} (${level.id}): ${errors.join('; ')}`)
    }
    return { ...level, internalId: deterministicUuid(`tutorial-${String(expectedNumber).padStart(2, '0')}`) }
  })
  if (failures.length) {
    console.error(`Aurora Academy seeding failed (${failures.length} issue(s)):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return 1
  }

  const themeDirectory = path.join(DATA_DIRECTORY, THEME_ID)
  const levelsDirectory = path.join(themeDirectory, 'levels')
  await rm(levelsDirectory, { recursive: true, force: true })
  await mkdir(levelsDirectory, { recursive: true })

  const theme = {
    schemaVersion: 1,
    id: THEME_ID,
    name: THEME_NAME,
    description: THEME_DESCRIPTION,
    public: true,
    disabled: false,
    readOnly: false,
    ownerUserId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    mediaVersion: 1,
    mediaSources: { visuals: {}, audio: {} },
    entityMediaOverrides: { visuals: {}, audio: {} },
    levelOrder: levels.map((level) => level.internalId),
  }
  for (const level of levels) {
    await writeFile(
      path.join(levelsDirectory, `${level.internalId}.json`),
      `${JSON.stringify(level, null, 2)}\n`,
    )
  }
  await writeFile(
    path.join(themeDirectory, 'theme.json'),
    `${JSON.stringify(theme, null, 2)}\n`,
  )

  console.log(`Seeded "${THEME_NAME}" (${THEME_ID}) with ${levels.length} levels:`)
  console.log(`  theme: ${path.join(themeDirectory, 'theme.json')}`)
  console.log(`  levels: ${path.join(levelsDirectory, '<uuid>.json')}`)
  for (const level of levels) {
    console.log(
      `  ${String(level.number).padStart(2, '0')} · ${level.name.padEnd(16)} ${level.briefing.slice(0, 72)}${level.briefing.length > 72 ? '…' : ''}`,
    )
  }
  return 0
}

main().catch((error) => {
  console.error(`Aurora Academy seeding failed: ${error.message}`)
  process.exitCode = 1
})

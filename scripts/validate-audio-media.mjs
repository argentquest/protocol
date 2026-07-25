import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { validateDefaultAudioLibrary } from './lib/validate-audio.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (...segments) =>
  JSON.parse(await readFile(path.join(projectRoot, ...segments), 'utf8'))

const registry = await readJson('src', 'config', 'soundRegistry.json')
const settings = await readJson('public', 'media', 'default', 'audio.json')
const schema = await readJson(
  'src',
  'config',
  'schemas',
  'audioSettings.schema.json',
)
const validateSettings = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
const errors = []

if (!validateSettings(settings)) {
  errors.push(
    ...validateSettings.errors.map(
      (error) => `audio.json${error.instancePath || '/'}: ${error.message}`,
    ),
  )
}
errors.push(
  ...(await validateDefaultAudioLibrary({
    audioRoot: path.join(projectRoot, 'public', 'media', 'default', 'audio'),
    registry,
    settings,
  })),
)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Validated ${registry.sounds.length} default audio source and delivery sets.`)
}

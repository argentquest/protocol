import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packRoot = path.join(projectRoot, 'public', 'media', '3d', 'kenney-minigolf')
const generatedRoot = path.join(projectRoot, 'src', 'config', 'generated')
const publicManifestPath = path.join(packRoot, 'manifest.json')
const sourceManifestPath = path.join(generatedRoot, 'threeMediaManifest.json')
const checkOnly = process.argv.includes('--check')

/** @pure @param {string} baseName Filename without extension. @returns {string} Human-readable model name. */
function displayName(baseName) {
  return baseName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** @pure @param {string} name Model basename. @returns {string} Stable catalog category. */
function categoryFor(name) {
  if (name.startsWith('ball-')) return 'ball'
  if (name.startsWith('club-')) return 'club'
  if (name.startsWith('flag-')) return 'flag'
  if (name.startsWith('hole-')) return 'hole'
  if (/^(?:ramp|hill|bump)/.test(name)) return 'ramp'
  if (/^(?:obstacle|castle|structure|tunnel|windmill)/.test(name)) return 'obstacle'
  if (/^supports?/.test(name)) return 'support'
  return 'course'
}

/** @pure @param {string} category Catalog category. @returns {string[]} Recommended editor roles. */
function rolesFor(category) {
  const roles = {
    ball: ['token'],
    club: ['decoration'],
    flag: ['target', 'decoration'],
    hole: ['target', 'terrain'],
    ramp: ['ramp', 'terrain'],
    obstacle: ['obstacle', 'decoration'],
    support: ['terrain', 'decoration'],
    course: ['terrain', 'decoration'],
  }
  return roles[category]
}

const files = (await readdir(packRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.glb'))
  .map((entry) => entry.name)
  .sort((first, second) => first.localeCompare(second))
const previewFiles = new Set(
  (await readdir(path.join(packRoot, 'previews'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => entry.name),
)

const models = files.map((fileName) => {
  const baseName = path.basename(fileName, '.glb')
  const previewName = `${baseName}.png`
  if (!previewFiles.has(previewName)) {
    throw new Error(`Missing preview for 3D model ${fileName}`)
  }
  const category = categoryFor(baseName)
  return {
    modelId: `kenney-minigolf-${baseName}`,
    name: displayName(baseName),
    category,
    roles: rolesFor(category),
    src: `media/3d/kenney-minigolf/${fileName}`,
    previewSrc: `media/3d/kenney-minigolf/previews/${previewName}`,
  }
})

if (models.length !== 126) {
  throw new Error(`Expected 126 Kenney Minigolf GLB models, found ${models.length}`)
}

const manifest = {
  schemaVersion: 1,
  packId: 'kenney-minigolf',
  packVersion: '3.1',
  license: 'CC0-1.0',
  sourceUrl: 'https://kenney.nl/assets/minigolf-kit',
  defaults: {
    token: 'kenney-minigolf-ball-blue',
    target: 'kenney-minigolf-flag-blue',
    ramp: 'kenney-minigolf-ramp',
    obstacle: 'kenney-minigolf-obstacle-block',
  },
  models,
}
const output = `${JSON.stringify(manifest, null, 2)}\n`

if (checkOnly) {
  for (const manifestPath of [publicManifestPath, sourceManifestPath]) {
    const existing = await readFile(manifestPath, 'utf8')
    if (existing !== output) {
      throw new Error(`${path.relative(projectRoot, manifestPath)} is stale`)
    }
  }
  console.log(`Validated deterministic 3D manifest with ${models.length} models.`)
} else {
  await mkdir(generatedRoot, { recursive: true })
  await writeFile(publicManifestPath, output)
  await writeFile(sourceManifestPath, output)
  console.log(`Generated 3D manifest with ${models.length} Kenney models.`)
}

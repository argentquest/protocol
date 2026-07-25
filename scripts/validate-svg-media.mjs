import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSvgSource } from './lib/validate-svg.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = path.join(projectRoot, 'src', 'config', 'mediaRegistry.json')
const defaultRoot = path.join(projectRoot, 'public', 'media', 'default')
const registry = JSON.parse(await readFile(registryPath, 'utf8'))
const errors = []

for (const entry of registry.media) {
  const relativePath = path.join(entry.category, entry.fileName)
  const filePath = path.join(defaultRoot, relativePath)
  try {
    const source = await readFile(filePath, 'utf8')
    errors.push(...validateSvgSource(source, relativePath.replaceAll('\\', '/')))
  } catch (error) {
    if (error.code === 'ENOENT') {
      errors.push(`${relativePath.replaceAll('\\', '/')}: required default asset is missing`)
    } else {
      errors.push(`${relativePath.replaceAll('\\', '/')}: ${error.message}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Validated ${registry.media.length} default vector SVG assets.`)
}

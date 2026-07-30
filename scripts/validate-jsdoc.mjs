import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const SOURCE_ROOT = path.resolve('src')
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx'])

/**
 * Recursively finds production JavaScript modules in stable path order.
 *
 * @param {string} directory Absolute directory path.
 * @returns {Promise<string[]>} Absolute module paths.
 */
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(entryPath)
      if (
        SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
        !entry.name.includes('.test.')
      ) {
        return [entryPath]
      }
      return []
    }),
  )
  return nested.flat().sort()
}

/**
 * Tests whether a declaration is immediately preceded by a JSDoc block.
 *
 * @pure
 * @param {string[]} lines Module source lines.
 * @param {number} declarationIndex Zero-based declaration line index.
 * @returns {boolean} Whether the nearest non-empty line closes JSDoc.
 */
function hasLeadingJsdoc(lines, declarationIndex) {
  for (let index = declarationIndex - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (!line) continue
    return line === '*/'
  }
  return false
}

/**
 * Finds exported functions and classes without a leading JSDoc contract.
 *
 * @pure
 * @param {string} source Module source text.
 * @returns {{line: number, declaration: string}[]} Missing documentation.
 */
function undocumentedExports(source) {
  const lines = source.split(/\r?\n/)
  const declaration =
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+[A-Za-z_$]/
  return lines.flatMap((line, index) => {
    if (!declaration.test(line.trim()) || hasLeadingJsdoc(lines, index)) return []
    return [{ line: index + 1, declaration: line.trim() }]
  })
}

const failures = []
for (const filePath of await sourceFiles(SOURCE_ROOT)) {
  const source = await readFile(filePath, 'utf8')
  for (const missing of undocumentedExports(source)) {
    failures.push(
      `${path.relative(process.cwd(), filePath)}:${missing.line} ${missing.declaration}`,
    )
  }
}

if (failures.length) {
  throw new Error(
    `Exported production declarations require JSDoc:\n${failures.join('\n')}`,
  )
}

console.log('Validated JSDoc on exported production declarations.')

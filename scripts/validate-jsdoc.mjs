import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const SOURCE_ROOTS = ['src', 'server', 'scripts'].map((directory) =>
  path.resolve(directory),
)
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs'])

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
      if (entry.isDirectory()) {
        return entry.name === 'tests' ? [] : sourceFiles(entryPath)
      }
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
    return line === '*/' || (line.startsWith('/**') && line.endsWith('*/'))
  }
  return false
}

/**
 * Finds named production declarations without a leading JSDoc contract.
 *
 * The matcher intentionally covers declarations that form maintainable module
 * contracts: functions, classes, class/object methods, and named arrow
 * functions. Anonymous callbacks are documented through the function that owns
 * their behavior instead of receiving repetitive comments at every call site.
 *
 * @pure
 * @param {string} source Module source text.
 * @returns {{line: number, declaration: string}[]} Missing documentation.
 */
function undocumentedDeclarations(source) {
  const lines = source.split(/\r?\n/)
  const declarations = [
    /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+[A-Za-z_$]/,
    /^\s*(?:export\s+(?:default\s+)?)?class\s+[A-Za-z_$]/,
    /^\s*(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    /^\s*(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*useCallback\(/,
    /^\s{2,}(?:async\s+)?(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\([^;]*\)\s*\{/,
  ]
  return lines.flatMap((line, index) => {
    if (
      !declarations.some((declaration) => declaration.test(line)) ||
      hasLeadingJsdoc(lines, index)
    ) {
      return []
    }
    return [{ line: index + 1, declaration: line.trim() }]
  })
}

const failures = []
const files = (await Promise.all(SOURCE_ROOTS.map(sourceFiles))).flat().sort()
for (const filePath of files) {
  const source = await readFile(filePath, 'utf8')
  for (const missing of undocumentedDeclarations(source)) {
    failures.push(
      `${path.relative(process.cwd(), filePath)}:${missing.line} ${missing.declaration}`,
    )
  }
}

if (failures.length) {
  throw new Error(
    `Named production declarations require JSDoc:\n${failures.join('\n')}`,
  )
}

console.log(`Validated JSDoc on named declarations in ${files.length} modules.`)

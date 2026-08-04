import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_ACCOUNT_MEDIA_QUOTA_BYTES = 500 * 1024 * 1024

/**
 * Totals regular-file bytes below a directory without following symlinks.
 *
 * @param {string} directory Absolute directory path.
 * @returns {Promise<number>} Stored bytes, or zero when the directory is absent.
 */
async function directoryBytes(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const sizes = await Promise.all(entries.map(async (entry) => {
    const itemPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return directoryBytes(itemPath)
    if (!entry.isFile()) return 0
    return (await stat(itemPath)).size
  }))
  return sizes.reduce((total, size) => total + size, 0)
}

/**
 * Creates serialized account-wide accounting for uploaded and theme media.
 * Metadata and quarantined files do not consume the published account quota.
 *
 * @param {object} options Quota paths and byte ceiling.
 * @returns {object} Usage reporting and guarded mutation operations.
 */
export function createAccountStorageQuota({
  themesDirectory,
  uploadsDirectory,
  limitBytes = DEFAULT_ACCOUNT_MEDIA_QUOTA_BYTES,
}) {
  const queues = new Map()
  const safeLimit = Number(limitBytes)
  if (!Number.isSafeInteger(safeLimit) || safeLimit < 1) {
    throw new Error('Account media quota must be a positive whole number of bytes.')
  }

  /** @param {string} userId Account UUID. @returns {Promise<number>} Theme-media bytes. */
  async function ownedThemeBytes(userId) {
    let entries
    try {
      entries = await readdir(themesDirectory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return 0
      throw error
    }
    let total = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const metadata = JSON.parse(
          await readFile(path.join(themesDirectory, entry.name, 'theme.json'), 'utf8'),
        )
        if (metadata.ownerUserId === userId) {
          total += await directoryBytes(path.join(themesDirectory, entry.name, 'media'))
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return total
  }

  /** @param {string} userId Account UUID. @returns {Promise<object>} Current quota. */
  async function usage(userId) {
    const usedBytes =
      (await directoryBytes(path.join(uploadsDirectory, userId, 'assets'))) +
      (await ownedThemeBytes(userId))
    return {
      usedBytes,
      limitBytes: safeLimit,
      remainingBytes: Math.max(0, safeLimit - usedBytes),
    }
  }

  /**
   * Serializes a storage mutation for one account and supplies a fresh quota check.
   *
   * @param {string} userId Account UUID.
   * @param {(assertAdditionalBytes:(bytes:number)=>Promise<object>)=>Promise<unknown>} operation Mutation callback.
   * @returns {Promise<unknown>} Callback result.
   */
  function mutate(userId, operation) {
    const previous = queues.get(userId) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(() => operation(async (bytes) => {
      const additionalBytes = Math.max(0, Number(bytes) || 0)
      const currentUsage = await usage(userId)
      if (currentUsage.usedBytes + additionalBytes > safeLimit) {
        throw Object.assign(
          new Error('Account custom-media storage quota exceeded.'),
          { status: 413, code: 'MEDIA_QUOTA_EXCEEDED', quota: currentUsage },
        )
      }
      return currentUsage
    }))
    queues.set(userId, current)
    current.finally(() => {
      if (queues.get(userId) === current) queues.delete(userId)
    }).catch(() => {})
    return current
  }

  return { limitBytes: safeLimit, mutate, usage }
}

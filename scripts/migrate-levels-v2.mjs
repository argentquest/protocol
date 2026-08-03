import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const levelDirectory = path.join(projectRoot, 'src', 'config', 'levels')

/**
 * Builds the registered media ID for an obstacle kind and shape.
 *
 * @pure
 * @param {string} kind Obstacle motion category.
 * @param {string} shape Authoritative collision shape.
 * @returns {string} Theme-neutral obstacle media ID.
 */
const mediaFor = (kind, shape) => `obstacle-${kind}-${shape}`

/**
 * Mutates a legacy level document into the V2 configuration contract.
 *
 * @param {object} level Parsed legacy level configuration.
 * @returns {object} The migrated level object.
 */
function migrateLevel(level) {
  level.schemaVersion = 2
  level.arena.mediaId =
    level.arena.shape === 'polygon'
      ? 'arena-polygon'
      : level.arena.shape === 'ellipse'
        ? 'arena-ellipse'
        : 'arena-standard'
  level.token.mediaId = `token-${level.token.shape}`
  level.movement = {
    maximumSpeed: 360,
    acceleration: 1400,
    deceleration: 1800,
    keyboardSpeed: 280,
  }
  level.start.mediaId = 'start-pad'
  level.mainTarget.mediaId = 'target-main'
  level.generation.mediaByShape = {
    circle: 'obstacle-static-circle',
    rect: 'obstacle-static-rect',
    diamond: 'obstacle-static-diamond',
  }

  level.manualObstacles = (level.manualObstacles ?? []).map((obstacle) => ({
    ...obstacle,
    mediaId: mediaFor('static', obstacle.shape),
  }))
  level.movingObstacles = (level.movingObstacles ?? []).map((obstacle) => ({
    ...obstacle,
    mediaId: mediaFor('moving', obstacle.shape),
  }))
  level.trackingObstacles = (level.trackingObstacles ?? []).map((obstacle) => ({
    ...obstacle,
    mediaId: mediaFor('tracking', obstacle.shape),
    turnRateDegreesPerSecond: obstacle.turnRateDegreesPerSecond ?? 160,
  }))
  level.coins = (level.coins ?? []).map((coin) => ({
    ...coin,
    mediaId: 'coin-standard',
  }))
  level.bonuses.targets = level.bonuses.targets.map((target) => ({
    ...target,
    mediaId: 'target-bonus',
  }))

  return level
}

const fileNames = (await readdir(levelDirectory))
  .filter((fileName) => /^level-\d{2}\.json$/.test(fileName))
  .sort()

for (const fileName of fileNames) {
  const filePath = path.join(levelDirectory, fileName)
  const level = JSON.parse(await readFile(filePath, 'utf8'))
  await writeFile(filePath, `${JSON.stringify(migrateLevel(level), null, 2)}\n`)
}

console.log(`Migrated ${fileNames.length} levels to schema version 2.`)

import { readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createSeededRandom,
  randomBetween,
  randomItem,
} from '../src/game/generation/seededRandom.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const levelsDirectory = path.join(repositoryRoot, 'src', 'config', 'levels')
const microLevelsDirectory = path.join(
  repositoryRoot,
  'src',
  'config',
  'micro-levels',
)

const tierNames = [
  'Foundation',
  'Kinetics',
  'Phase',
  'Pulse',
  'Orbit',
  'Switch',
  'Current',
  'Gravity',
  'Rotation',
  'Convergence',
]
const playableBounds = { left: 80, right: 1520, top: 80, bottom: 820 }

/** @pure @param {number} value Numeric value. @returns {number} Nearest integer. */
function rounded(value) {
  return Math.round(value)
}

/**
 * Builds padded axis-aligned bounds in world units.
 *
 * @pure
 * @param {number} x Center x-coordinate in world units.
 * @param {number} y Center y-coordinate in world units.
 * @param {number} width Width in world units.
 * @param {number} height Height in world units.
 * @param {number} [padding=0] Additional clearance in world units.
 * @returns {{left:number,right:number,top:number,bottom:number}} Bounds.
 */
function box(x, y, width, height, padding = 0) {
  return {
    left: x - width / 2 - padding,
    right: x + width / 2 + padding,
    top: y - height / 2 - padding,
    bottom: y + height / 2 + padding,
  }
}

/**
 * Tests two axis-aligned placement envelopes for overlap.
 *
 * @pure
 * @param {object} first First envelope in world units.
 * @param {object} second Second envelope in world units.
 * @returns {boolean} Whether the envelopes overlap.
 */
function boxesOverlap(first, second) {
  return !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  )
}

/**
 * Measures Euclidean distance between world points.
 *
 * @pure
 * @param {{x:number,y:number}} first First world point.
 * @param {{x:number,y:number}} second Second world point.
 * @returns {number} Distance in world units.
 */
function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/**
 * Finds a deterministic, non-overlapping entity center within playable bounds.
 *
 * @param {() => number} random Seeded random source.
 * @param {object[]} reserved Mutable occupied envelopes.
 * @param {number} width Entity or motion-envelope width in world units.
 * @param {number} height Entity or motion-envelope height in world units.
 * @param {object} [options] Clearance and endpoint-distance constraints.
 * @returns {{x:number,y:number}} Reserved center in world units.
 * @throws {Error} When 500 deterministic candidates cannot be placed.
 */
function place(
  random,
  reserved,
  width,
  height,
  { padding = 35, minimumDistanceFrom = null, minimumDistance = 0 } = {},
) {
  const minimumX = playableBounds.left + width / 2
  const maximumX = playableBounds.right - width / 2
  const minimumY = playableBounds.top + height / 2
  const maximumY = playableBounds.bottom - height / 2
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const point = {
      x: rounded(randomBetween(random, minimumX, maximumX)),
      y: rounded(randomBetween(random, minimumY, maximumY)),
    }
    if (
      minimumDistanceFrom &&
      distance(point, minimumDistanceFrom) < minimumDistance
    ) {
      continue
    }
    const bounds = box(point.x, point.y, width, height, padding)
    if (!reserved.some((item) => boxesOverlap(bounds, item))) {
      reserved.push(bounds)
      return point
    }
  }
  throw new Error(`Unable to place ${width} × ${height} entity safely.`)
}

/**
 * Creates the tier-scaled static-obstacle set for a campaign level.
 *
 * @param {() => number} random Seeded random source.
 * @param {number} number One-based campaign level number.
 * @param {number} tier One-based mechanic tier.
 * @param {object[]} reserved Mutable placement envelopes.
 * @returns {object[]} Authored static obstacle configurations.
 */
function placeStaticObstacles(random, number, tier, reserved) {
  const count = 2 + ((number * 7 + tier) % 5)
  return Array.from({ length: count }, (_, index) => {
    const shape = randomItem(random, ['circle', 'rect', 'diamond'])
    const width = rounded(randomBetween(random, 58, 96 + tier * 4))
    const height =
      shape === 'rect'
        ? rounded(randomBetween(random, 52, 175))
        : width
    const point = place(random, reserved, width, height, {
      padding: Math.max(34, 62 - tier * 2),
    })
    return {
      id: `barrier-${index + 1}`,
      mediaId: `obstacle-static-${shape}`,
      shape,
      ...point,
      width,
      height,
    }
  })
}

/**
 * Creates deterministic oscillating obstacles for tiers that support motion.
 *
 * @param {() => number} random Seeded random source.
 * @param {number} number One-based campaign level number.
 * @param {number} tier One-based mechanic tier.
 * @param {object[]} reserved Mutable placement envelopes.
 * @returns {object[]} Moving obstacle configurations with millisecond periods.
 */
function placeMovingObstacles(random, number, tier, reserved) {
  if (tier < 2) return []
  const count = tier === 2 ? 1 + (number % 2) : number % 3 === 0 ? 2 : 1
  return Array.from({ length: count }, (_, index) => {
    const axis = random() < 0.5 ? 'x' : 'y'
    const size = rounded(randomBetween(random, 38, 58))
    const amplitude = rounded(randomBetween(random, 75, 145 + tier * 3))
    const envelopeWidth = axis === 'x' ? size + amplitude * 2 : size
    const envelopeHeight = axis === 'y' ? size + amplitude * 2 : size
    const point = place(
      random,
      reserved,
      envelopeWidth,
      envelopeHeight,
      { padding: 32 },
    )
    return {
      id: `sweeper-${index + 1}`,
      mediaId: 'obstacle-moving-circle',
      shape: 'circle',
      ...point,
      size,
      axis,
      amplitude,
      periodMs: rounded(randomBetween(random, 2600, 5400)),
      phase: Number(randomBetween(random, 0, Math.PI * 2).toFixed(3)),
    }
  })
}

/**
 * Chooses the mechanic mixture and counts for a campaign level.
 *
 * @pure
 * @param {number} number One-based campaign level number.
 * @param {number} tier One-based mechanic tier.
 * @returns {Record<string, number>} Entity count by mechanic name.
 */
function mechanicCounts(number, tier) {
  if (tier < 3) return {}
  if (tier < 10) {
    const primary = ['phase', 'pulse', 'orbit', 'switch', 'conveyor', 'radial', 'rotate'][
      tier - 3
    ]
    const counts = { [primary]: 1 + (number % 3 === 0 ? 1 : 0) }
    if (tier >= 4 && number % 2 === 0) {
      const prior = ['phase', 'pulse', 'orbit', 'switch', 'conveyor', 'radial'][
        (number + tier) % (tier - 3)
      ]
      if (prior) counts[prior] = 1
    }
    return counts
  }
  const mechanics = ['phase', 'pulse', 'orbit', 'switch', 'conveyor', 'radial', 'rotate']
  const counts = {}
  const total = 4 + (number % 3)
  for (let index = 0; index < total; index += 1) {
    const mechanic = mechanics[(number * 3 + index * 5) % mechanics.length]
    counts[mechanic] = (counts[mechanic] ?? 0) + 1
  }
  return counts
}

/**
 * Places non-solid conveyor and radial force fields.
 *
 * @param {() => number} random Seeded random source.
 * @param {Record<string, number>} counts Mechanic counts.
 * @param {number} tier One-based mechanic tier.
 * @param {object[]} reserved Existing solid placement envelopes.
 * @returns {object[]} Force-field configurations using world units and units/s².
 */
function placeForceFields(random, counts, tier, reserved) {
  const fields = []
  const fieldReserved = [...reserved]
  for (let index = 0; index < (counts.conveyor ?? 0); index += 1) {
    const width = rounded(randomBetween(random, 210, 350))
    const height = rounded(randomBetween(random, 105, 190))
    const point = place(random, fieldReserved, width, height, { padding: 18 })
    fields.push({
      id: `current-${index + 1}`,
      mediaId: 'field-conveyor',
      type: 'conveyor',
      ...point,
      width,
      height,
      directionDegrees: rounded(randomBetween(random, -180, 180)),
      force: rounded(randomBetween(random, 250, 320 + tier * 16)),
    })
  }
  for (let index = 0; index < (counts.radial ?? 0); index += 1) {
    const radius = rounded(randomBetween(random, 100, 145))
    const point = place(random, fieldReserved, radius * 2, radius * 2, {
      padding: 18,
    })
    fields.push({
      id: `radial-${index + 1}`,
      mediaId: 'field-radial',
      type: random() < 0.5 ? 'repulsor' : 'attractor',
      ...point,
      radius,
      force: rounded(randomBetween(random, 480, 610 + tier * 18)),
    })
  }
  return fields
}

/**
 * Places contact switches linked to generated switch barriers.
 *
 * @param {() => number} random Seeded random source.
 * @param {Record<string, number>} counts Mechanic counts.
 * @param {object[]} reserved Mutable placement envelopes.
 * @returns {object[]} Contact-switch configurations.
 */
function placeSwitches(random, counts, reserved) {
  const switches = []
  for (let index = 0; index < (counts.switch ?? 0); index += 1) {
    const point = place(random, reserved, 44, 44, { padding: 50 })
    switches.push({
      id: `switch-${index + 1}`,
      mediaId: 'switch-pad',
      ...point,
      size: 44,
      activation: index % 2 ? 'timed' : 'once',
      durationMs: index % 2 ? 4500 : 0,
    })
  }
  return switches
}

/**
 * Places phase, pulse, orbit, switch, and rotating obstacles.
 *
 * @param {() => number} random Seeded random source.
 * @param {Record<string, number>} counts Mechanic counts.
 * @param {number} tier One-based mechanic tier.
 * @param {object[]} reserved Mutable placement envelopes.
 * @returns {object[]} Dynamic obstacle configurations.
 */
function placeDynamicObstacles(random, counts, tier, reserved) {
  const obstacles = []
  for (let index = 0; index < (counts.phase ?? 0); index += 1) {
    const vertical = random() < 0.5
    const width = vertical ? rounded(randomBetween(random, 28, 42)) : rounded(randomBetween(random, 170, 255))
    const height = vertical ? rounded(randomBetween(random, 170, 255)) : rounded(randomBetween(random, 28, 42))
    const point = place(random, reserved, width, height, { padding: 22 })
    obstacles.push({
      id: `phase-${index + 1}`,
      mediaId: 'obstacle-phase-gate',
      shape: 'rect',
      ...point,
      width,
      height,
      behavior: {
        type: 'phase',
        cycleMs: rounded(randomBetween(random, 3000, 4700)),
        solidMs: rounded(randomBetween(random, 1200, 1700)),
        warningMs: 450,
        offsetMs: rounded(randomBetween(random, 0, 1900)),
      },
    })
  }
  for (let index = 0; index < (counts.pulse ?? 0); index += 1) {
    const width = rounded(randomBetween(random, 105, 175))
    const height = rounded(randomBetween(random, 30, 58))
    const maximumScale = Number(randomBetween(random, 1.15, 1.48).toFixed(2))
    const point = place(
      random,
      reserved,
      width * maximumScale,
      height * maximumScale,
      { padding: 20 },
    )
    obstacles.push({
      id: `pulse-${index + 1}`,
      mediaId: 'obstacle-pulse-block',
      shape: 'rect',
      ...point,
      width,
      height,
      behavior: {
        type: 'pulse',
        minScale: Number(randomBetween(random, 0.38, 0.62).toFixed(2)),
        maxScale: maximumScale,
        periodMs: rounded(randomBetween(random, 2600, 4400)),
        phase: Number(randomBetween(random, -Math.PI, Math.PI).toFixed(3)),
      },
    })
  }
  for (let index = 0; index < (counts.orbit ?? 0); index += 1) {
    const size = rounded(randomBetween(random, 36, 48))
    const radiusX = rounded(randomBetween(random, 60, 118))
    const radiusY = rounded(randomBetween(random, 60, 138))
    const point = place(
      random,
      reserved,
      size + radiusX * 2,
      size + radiusY * 2,
      { padding: 14 },
    )
    obstacles.push({
      id: `orbiter-${index + 1}`,
      mediaId: 'obstacle-orbiter',
      shape: 'circle',
      ...point,
      size,
      behavior: {
        type: 'orbit',
        radiusX,
        radiusY,
        periodMs: rounded(randomBetween(random, 3000, 5300)),
        phase: Number(randomBetween(random, 0, Math.PI * 2).toFixed(3)),
      },
    })
  }
  for (let index = 0; index < (counts.switch ?? 0); index += 1) {
    const vertical = random() < 0.5
    const width = vertical ? 34 : rounded(randomBetween(random, 190, 285))
    const height = vertical ? rounded(randomBetween(random, 190, 285)) : 34
    const point = place(random, reserved, width, height, { padding: 22 })
    obstacles.push({
      id: `switch-barrier-${index + 1}`,
      mediaId: 'obstacle-switch-barrier',
      shape: 'rect',
      ...point,
      width,
      height,
      behavior: {
        type: 'switch',
        switchId: `switch-${index + 1}`,
        initiallySolid: true,
      },
    })
  }
  for (let index = 0; index < (counts.rotate ?? 0); index += 1) {
    const width = rounded(randomBetween(random, 175, 260))
    const height = rounded(randomBetween(random, 22, 34))
    const envelope = Math.hypot(width, height)
    const point = place(random, reserved, envelope, envelope, { padding: 14 })
    obstacles.push({
      id: `spinner-${index + 1}`,
      mediaId: 'obstacle-spinner',
      shape: 'rect',
      ...point,
      width,
      height,
      behavior: {
        type: 'rotate',
        speedDegreesPerSecond: rounded(randomBetween(random, 55, 115 + tier * 3)),
        initialDegrees: rounded(randomBetween(random, 0, 180)),
      },
    })
  }
  return obstacles
}

/**
 * Places convergence-tier tracking hazards and their containment zones.
 *
 * @param {() => number} random Seeded random source.
 * @param {number} tier One-based mechanic tier.
 * @param {number} number One-based campaign level number.
 * @param {object[]} reserved Mutable placement envelopes.
 * @returns {object[]} Tracking obstacle configurations.
 */
function placeTrackingObstacles(random, tier, number, reserved) {
  if (tier < 10) return []
  const count = 1 + (number % 2)
  return Array.from({ length: count }, (_, index) => {
    const zoneWidth = rounded(randomBetween(random, 180, 250))
    const zoneHeight = rounded(randomBetween(random, 160, 230))
    const size = rounded(randomBetween(random, 34, 42))
    const point = place(random, reserved, size, size, { padding: 32 })
    const zoneX = rounded(
      Math.max(
        playableBounds.left,
        Math.min(playableBounds.right - zoneWidth, point.x - zoneWidth / 2),
      ),
    )
    const zoneY = rounded(
      Math.max(
        playableBounds.top,
        Math.min(playableBounds.bottom - zoneHeight, point.y - zoneHeight / 2),
      ),
    )
    return {
      id: `tracker-${index + 1}`,
      mediaId: 'obstacle-tracking-circle',
      shape: 'circle',
      x: point.x,
      y: point.y,
      width: size,
      height: size,
      zone: {
        x: zoneX,
        y: zoneY,
        width: zoneWidth,
        height: zoneHeight,
      },
      maxSpeed: rounded(randomBetween(random, 100, 135)),
      acceleration: rounded(randomBetween(random, 165, 210)),
      turnRateDegreesPerSecond: rounded(randomBetween(random, 105, 145)),
    }
  })
}

/**
 * Builds one complete deterministic campaign level document.
 *
 * @param {number} number One-based campaign level number.
 * @returns {object} Schema-ready level configuration.
 */
function createLevel(number) {
  const tier = Math.ceil(number / 10)
  const tierName = tierNames[tier - 1]
  const seed = `path-protocol-16x9-${String(number).padStart(3, '0')}-v2`
  const random = createSeededRandom(seed)
  const tokenSize = Math.max(34, 46 - Math.floor(tier / 3) * 2)
  const reserved = []
  const start = place(random, reserved, tokenSize, tokenSize, { padding: 70 })
  const targetSize = 58
  const target = place(random, reserved, targetSize, targetSize, {
    padding: 70,
    minimumDistanceFrom: start,
    minimumDistance: 560,
  })
  const coin = place(random, reserved, 30, 30, { padding: 45 })
  const bonus =
    tier >= 3 ? place(random, reserved, 48, 48, { padding: 60 }) : null
  const counts = mechanicCounts(number, tier)
  const switches = placeSwitches(random, counts, reserved)
  const forceFields = placeForceFields(random, counts, tier, reserved)
  const dynamicObstacles = placeDynamicObstacles(
    random,
    counts,
    tier,
    reserved,
  )
  const trackingObstacles = placeTrackingObstacles(
    random,
    tier,
    number,
    reserved,
  )
  const movingObstacles = placeMovingObstacles(random, number, tier, reserved)
  const manualObstacles = placeStaticObstacles(random, number, tier, reserved)

  return {
    schemaVersion: 2,
    id: `level-${String(number).padStart(2, '0')}`,
    number,
    name: `${tierName} ${String(((number - 1) % 10) + 1).padStart(2, '0')}`,
    seed,
    difficulty: tier,
    briefing:
      `Tier ${tier}: ${tierName}. ` +
      [
        'Learn efficient lines through stable geometry.',
        'Read moving hazards before committing.',
        'Cross phase gates during their open window.',
        'Use the breathing rhythm to preserve space.',
        'Predict orbiting hazards rather than chasing them.',
        'Activate the remote pad before crossing its barrier.',
        'Counter-steer through directional currents.',
        'Shape a route around radial push and pull.',
        'Time movement around a swept rotating arm.',
        'Combine every protocol under tighter timing.',
      ][tier - 1],
    arena: {
      shape: 'rect',
      mediaId: 'arena-standard',
      margin: 35,
      cornerRadius: 38,
    },
    token: {
      shape: number % 9 === 0 ? 'diamond' : number % 7 === 0 ? 'rect' : 'circle',
      size: tokenSize,
      mediaId:
        number % 9 === 0
          ? 'token-diamond'
          : number % 7 === 0
            ? 'token-rect'
            : 'token-circle',
    },
    movement: {
      maximumSpeed: 470 + tier * 18,
      acceleration: 1200 + tier * 80,
      deceleration: 1450 + tier * 85,
      keyboardSpeed: 310 + tier * 14,
    },
    start: {
      mode: 'manual',
      mediaId: 'start-pad',
      ...start,
    },
    mainTarget: {
      mode: 'manual',
      mediaId: 'target-main',
      ...target,
      size: targetSize,
    },
    generation: {
      obstacleCount: Math.min(3, Math.ceil(tier / 3)),
      allowedShapes: ['circle', 'rect', 'diamond'],
      mediaByShape: {
        circle: 'obstacle-static-circle',
        rect: 'obstacle-static-rect',
        diamond: 'obstacle-static-diamond',
      },
      minSize: 50,
      maxSize: 100 + tier * 2,
      minimumGap: Math.max(45, 72 - tier * 2),
      pathGrid: 20,
    },
    manualObstacles,
    movingObstacles,
    trackingObstacles,
    dynamicObstacles,
    switches,
    forceFields,
    coins: [
      {
        id: `coin-${number}`,
        mediaId: 'coin-standard',
        ...coin,
        size: 30,
        value: 1,
      },
    ],
    rewards: {
      completionCoins: Math.ceil(tier / 2),
      bonusCoinsPerTarget: Math.max(1, Math.floor(tier / 3)),
    },
    scoring: {
      baseMaximum: 5000 + number * 500,
      parTimeMs: 9000 + tier * 1000,
      parDistance: rounded(distance(start, target)),
      timeWeight: 0.5,
      distanceWeight: 0.5,
      collisionPenaltyRate: 0.2,
      maximumCollisions: 3,
    },
    bonuses: {
      maximumTargets: bonus ? 1 : 0,
      rewardPerTarget: 400 + tier * 100,
      offerChanceMode: 'currentScorePercent',
      failurePenaltyRate: 0.1,
      targets: bonus
        ? [
            {
              id: 'bonus-a',
              mediaId: 'target-bonus',
              ...bonus,
              size: 48,
            },
          ]
        : [],
    },
  }
}

for (const fileName of await readdir(levelsDirectory)) {
  if (/^level-\d+\.json$/.test(fileName)) {
    await unlink(path.join(levelsDirectory, fileName))
  }
}

for (let number = 1; number <= 100; number += 1) {
  const level = createLevel(number)
  await writeFile(
    path.join(levelsDirectory, `level-${String(number).padStart(2, '0')}.json`),
    `${JSON.stringify(level, null, 2)}\n`,
  )
}

console.log(
  'Generated 100 deterministic full-board layouts across 10 mechanic tiers.',
)

const microDefinitions = [
  [201, 3, 'Phase Window', 'phase'],
  [202, 4, 'Pulse Thread', 'pulse'],
  [203, 5, 'Orbit Lock', 'orbit'],
  [204, 6, 'Switchback', 'switch'],
  [205, 7, 'Crosscurrent', 'conveyor'],
  [206, 8, 'Gravity Well', 'radial'],
  [207, 9, 'Spinner Sync', 'rotate'],
]

for (const fileName of await readdir(microLevelsDirectory)) {
  if (/^level-\d+\.json$/.test(fileName)) {
    await unlink(path.join(microLevelsDirectory, fileName))
  }
}

for (const [number, tier, name, mechanic] of microDefinitions) {
  const level = createLevel(tier * 10)
  level.id = `level-${number}`
  level.number = number
  level.name = name
  level.seed = `path-protocol-micro-${mechanic}-v2`
  level.difficulty = tier
  level.briefing = `Focused ${mechanic} mastery challenge.`
  level.generation.obstacleCount = 0
  level.manualObstacles = level.manualObstacles.slice(0, 2)
  level.movingObstacles = []
  level.trackingObstacles = []
  level.dynamicObstacles = level.dynamicObstacles.filter(
    (item) => item.behavior.type === mechanic,
  )
  level.switches = mechanic === 'switch' ? level.switches : []
  level.forceFields = level.forceFields.filter((item) =>
    mechanic === 'radial'
      ? ['repulsor', 'attractor'].includes(item.type)
      : item.type === mechanic,
  )
  level.coins = []
  level.rewards = { completionCoins: 0, bonusCoinsPerTarget: 0 }
  level.bonuses = {
    maximumTargets: 0,
    rewardPerTarget: 0,
    offerChanceMode: 'currentScorePercent',
    failurePenaltyRate: 0,
    targets: [],
  }
  level.scoring.baseMaximum = 1500
  level.scoring.parTimeMs = 8500
  await writeFile(
    path.join(microLevelsDirectory, `level-${number}.json`),
    `${JSON.stringify(level, null, 2)}\n`,
  )
}

console.log('Generated 7 mechanic-matched Micro Protocol levels.')

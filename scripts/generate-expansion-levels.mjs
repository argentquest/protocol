import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const levelsDirectory = path.join(repositoryRoot, 'src', 'config', 'levels')

const distributedNames = [
  'Vector Primer',
  'Offset Lesson',
  'Needle Gate',
  'Corner Logic',
  'Transit Arc',
  'Form Factor',
  'Sweep Entry',
  'Signal Weave',
  'Pressure Cell',
  'Nexus Trial',
  'Quiet Vector',
  'Split Calibration',
  'Fine Margin',
  'Polygon Turn',
  'Extended Relay',
  'Shape Relay',
  'Motion Lattice',
  'Crossing Matrix',
  'Containment Ring',
  'Protocol Zenith',
  'Clean Line',
  'Double Deflection',
  'Precision Slot',
  'Angled Passage',
  'Distance Circuit',
  'Geometry Shift',
  'Scanner Array',
  'Interlock Field',
  'Pursuit Vault',
  'Master Sequence',
]

const apexNames = [
  'Singularity Gate',
  'Overclock Grid',
  'Predator Lattice',
  'Event Horizon',
  'Quantum Pursuit',
  'Critical Vector',
  'Zero Margin',
  'Cascade Core',
  'Terminal Convergence',
  'Omega Protocol',
]

const safeSeedVersions = new Map([
  [35, 2],
  [49, 2],
])

function levelFilename(number) {
  return path.join(
    levelsDirectory,
    `level-${String(number).padStart(2, '0')}.json`,
  )
}

function seedSlug(name) {
  return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}

async function readLevel(number) {
  return JSON.parse(await readFile(levelFilename(number), 'utf8'))
}

function retuneRewards(level, difficulty) {
  level.rewards.completionCoins =
    difficulty === 15 ? 10 : Math.max(1, Math.ceil(difficulty / 2))
  level.rewards.bonusCoinsPerTarget =
    difficulty === 15 ? 5 : Math.max(1, Math.ceil(difficulty / 4))
}

function retuneApexHazards(level) {
  level.generation.obstacleCount = Math.min(
    12,
    level.generation.obstacleCount + 2,
  )
  level.generation.minimumGap = Math.max(
    52,
    level.generation.minimumGap - 8,
  )
  level.movingObstacles = level.movingObstacles.map((obstacle) => ({
    ...obstacle,
    periodMs: Math.max(1800, Math.round(obstacle.periodMs * 0.78)),
  }))
  level.trackingObstacles = level.trackingObstacles.map((obstacle) => ({
    ...obstacle,
    maxSpeed: Math.round(obstacle.maxSpeed * 1.35),
    acceleration: Math.round(obstacle.acceleration * 1.35),
    turnRateDegreesPerSecond: Math.min(
      240,
      obstacle.turnRateDegreesPerSecond + 30,
    ),
  }))
}

function phaseGate(x, y, width, height, cycleMs, solidMs, warningMs, offsetMs) {
  return {
    id: 'phase-gate-a',
    mediaId: 'obstacle-phase-gate',
    shape: 'rect',
    x,
    y,
    width,
    height,
    behavior: {
      type: 'phase',
      cycleMs,
      solidMs,
      warningMs,
      offsetMs,
    },
  }
}

/**
 * Applies authored mechanic overrides that distinguish selected expansion
 * chambers from their original seed templates.
 *
 * @param {object} level Generated expansion configuration.
 * @param {number} number Campaign level number.
 * @returns {void}
 */
function applyExpansionVariety(level, number) {
  if (number === 33) {
    level.briefing =
      'A phase gate alternates between a solid barrier and a brief crossing window.'
    level.dynamicObstacles = [
      phaseGate(500, 500, 190, 30, 4000, 1700, 600, 1900),
    ]
  } else if (number === 37) {
    level.briefing =
      'An offset phase gate interrupts the scanner route and rewards deliberate timing.'
    level.dynamicObstacles = [
      phaseGate(400, 650, 200, 28, 3600, 1600, 500, 2100),
    ]
  } else if (number === 43) {
    level.briefing =
      'An elliptical orbiter turns the center line into a prediction lesson.'
    level.dynamicObstacles = [
      {
        id: 'orbiter-a',
        mediaId: 'obstacle-orbiter',
        shape: 'circle',
        x: 560,
        y: 500,
        size: 36,
        behavior: {
          type: 'orbit',
          radiusX: 25,
          radiusY: 80,
          periodMs: 4400,
          phase: 0.8,
        },
      },
    ]
  } else if (number === 47) {
    level.briefing =
      'A pulsing vertical block changes the scanner crossing from wide to exact.'
    level.dynamicObstacles = [
      {
        id: 'pulse-block-a',
        mediaId: 'obstacle-pulse-block',
        shape: 'rect',
        x: 400,
        y: 590,
        width: 30,
        height: 180,
        behavior: {
          type: 'pulse',
          minScale: 0.45,
          maxScale: 1.25,
          periodMs: 3400,
          phase: -Math.PI / 2,
        },
      },
    ]
  } else if (number === 53) {
    level.briefing =
      'A fast phase gate tests whether the shortest route is worth waiting for.'
    level.dynamicObstacles = [
      phaseGate(520, 500, 180, 28, 3000, 1350, 450, 1500),
    ]
  } else if (number === 54) {
    level.briefing =
      'An orbiter circles the final approach and turns a static route into a prediction test.'
    level.dynamicObstacles = [
      {
        id: 'orbiter-a',
        mediaId: 'obstacle-orbiter',
        shape: 'circle',
        x: 620,
        y: 650,
        size: 36,
        behavior: {
          type: 'orbit',
          radiusX: 70,
          radiusY: 60,
          periodMs: 4400,
          phase: 0.5,
        },
      },
    ]
  } else if (number === 56) {
    level.briefing =
      'A pulse block repeatedly narrows the direct center passage.'
    level.dynamicObstacles = [
      {
        id: 'pulse-block-a',
        mediaId: 'obstacle-pulse-block',
        shape: 'rect',
        x: 480,
        y: 540,
        width: 140,
        height: 24,
        behavior: {
          type: 'pulse',
          minScale: 0.45,
          maxScale: 1.4,
          periodMs: 3600,
          phase: -Math.PI / 2,
        },
      },
    ]
  } else if (number === 59) {
    level.briefing =
      'A remote switch opens the direct upper passage while pursuit hazards close in.'
    level.dynamicObstacles = [
      {
        id: 'switch-barrier-a',
        mediaId: 'obstacle-switch-barrier',
        shape: 'rect',
        x: 550,
        y: 300,
        width: 240,
        height: 28,
        behavior: {
          type: 'switch',
          switchId: 'switch-a',
          initiallySolid: true,
        },
      },
    ]
    level.switches = [
      {
        id: 'switch-a',
        mediaId: 'switch-pad',
        x: 300,
        y: 650,
        size: 48,
        activation: 'once',
        durationMs: 0,
      },
    ]
  }
}

/**
 * Creates a released expansion level from an existing validated archetype.
 *
 * @param {object} template Existing schema-complete level configuration.
 * @param {number} number New contiguous campaign number.
 * @param {string} name Unique display name.
 * @param {number} difficulty Difficulty band (1–10 or apex tier 15).
 * @returns {object} Complete deterministic level configuration.
 */
function createExpansionLevel(template, number, name, difficulty) {
  const level = structuredClone(template)
  const paddedNumber = String(number).padStart(2, '0')
  level.id = `level-${paddedNumber}`
  level.number = number
  level.name = name
  level.seed = `path-protocol-${seedSlug(name)}-v${
    safeSeedVersions.get(number) ?? 1
  }`
  level.difficulty = difficulty
  level.briefing =
    difficulty === 15
      ? `Apex-tier chamber ${number - 60}: denser geometry and overclocked hazards demand complete control.`
      : `Expansion chamber ${number}: a difficulty-${difficulty} variation with a new deterministic layout.`
  level.scoring.baseMaximum = 15000 + (number - 30) * 500
  retuneRewards(level, difficulty)
  if (difficulty === 15) {
    retuneApexHazards(level)
    level.scoring.parTimeMs = Math.round(level.scoring.parTimeMs * 1.15)
    level.scoring.parDistance = Math.round(level.scoring.parDistance * 1.1)
    level.bonuses.rewardPerTarget = Math.max(
      1800,
      level.bonuses.rewardPerTarget,
    )
  }
  applyExpansionVariety(level, number)
  return level
}

for (let offset = 0; offset < distributedNames.length; offset += 1) {
  const number = 31 + offset
  const difficulty = (offset % 10) + 1
  const template = await readLevel(difficulty)
  const level = createExpansionLevel(
    template,
    number,
    distributedNames[offset],
    difficulty,
  )
  await writeFile(levelFilename(number), `${JSON.stringify(level, null, 2)}\n`)
}

for (let offset = 0; offset < apexNames.length; offset += 1) {
  const number = 61 + offset
  const template = await readLevel(21 + offset)
  const level = createExpansionLevel(
    template,
    number,
    apexNames[offset],
    15,
  )
  await writeFile(levelFilename(number), `${JSON.stringify(level, null, 2)}\n`)
}

console.log('Generated Levels 31–70: 30 distributed and 10 apex-tier levels.')

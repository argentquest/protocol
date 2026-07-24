const STORAGE_KEY = 'path-protocol.progress'
const SCHEMA_VERSION = 1

export function createInitialProgress() {
  return {
    schemaVersion: SCHEMA_VERSION,
    player: {
      highestUnlockedLevel: 1,
    },
    levels: {},
    settings: {
      musicEnabled: true,
      musicVolume: 0.22,
      effectsEnabled: true,
      effectsVolume: 0.55,
      reducedMotion: false,
    },
  }
}

function sanitizeProgress(value) {
  const initial = createInitialProgress()
  if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION) {
    return initial
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    player: {
      highestUnlockedLevel: Math.max(
        1,
        Math.min(10, Number(value.player?.highestUnlockedLevel) || 1),
      ),
    },
    levels: value.levels && typeof value.levels === 'object' ? value.levels : {},
    settings: {
      ...initial.settings,
      ...(value.settings ?? {}),
    },
  }
}

export function loadProgress(storage = window.localStorage) {
  try {
    const saved = storage.getItem(STORAGE_KEY)
    return saved ? sanitizeProgress(JSON.parse(saved)) : createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

export function saveProgress(progress, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProgress(progress)))
}

export function recordLevelResult(progress, level, result) {
  const previous = progress.levels[level.id] ?? {
    completed: false,
    bestScore: 0,
    bestTimeMs: null,
    bestDistance: null,
    attempts: 0,
  }
  const improved = result.finalScore > previous.bestScore
  const levelRecord = {
    completed: true,
    bestScore: improved ? result.finalScore : previous.bestScore,
    bestTimeMs:
      previous.bestTimeMs === null
        ? result.elapsedMs
        : Math.min(previous.bestTimeMs, result.elapsedMs),
    bestDistance:
      previous.bestDistance === null
        ? result.actualDistance
        : Math.min(previous.bestDistance, result.actualDistance),
    attempts: previous.attempts + 1,
  }

  return {
    progress: {
      ...progress,
      player: {
        highestUnlockedLevel: Math.max(
          progress.player.highestUnlockedLevel,
          Math.min(10, level.number + 1),
        ),
      },
      levels: {
        ...progress.levels,
        [level.id]: levelRecord,
      },
    },
    improved,
  }
}

export function recordFailedAttempt(progress, levelId) {
  const previous = progress.levels[levelId] ?? {
    completed: false,
    bestScore: 0,
    bestTimeMs: null,
    bestDistance: null,
    attempts: 0,
  }
  return {
    ...progress,
    levels: {
      ...progress.levels,
      [levelId]: { ...previous, attempts: previous.attempts + 1 },
    },
  }
}

export function cumulativeScore(progress) {
  return Object.values(progress.levels).reduce(
    (total, level) => total + (Number(level.bestScore) || 0),
    0,
  )
}

export function resetProgress(storage = window.localStorage) {
  const initial = createInitialProgress()
  saveProgress(initial, storage)
  return initial
}

export { STORAGE_KEY }

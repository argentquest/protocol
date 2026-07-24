export const PLAYTEST_STORAGE_KEY = 'path-protocol.playtest-runs'
const MAX_RUNS = 200

export function loadPlaytestRuns(storage = window.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function recordPlaytestRun(level, result, storage = window.localStorage) {
  const run = {
    recordedAt: new Date().toISOString(),
    levelId: level.id,
    levelNumber: level.number,
    levelName: level.name,
    seed: level.seed,
    score: result.finalScore,
    attainableMaximum: result.attainableMaximum,
    elapsedMs: Math.round(result.elapsedMs),
    actualDistance: Math.round(result.actualDistance),
    timeFactor: result.timeFactor,
    routeFactor: result.routeFactor,
    collisions: result.collisions,
    earnedBonuses: result.earnedBonuses,
    bonusFailed: result.bonusFailed,
  }
  const runs = [run, ...loadPlaytestRuns(storage)].slice(0, MAX_RUNS)
  storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(runs))
  return run
}

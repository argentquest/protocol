import { describe, expect, it } from 'vitest'
import {
  loadPlaytestRuns,
  PLAYTEST_STORAGE_KEY,
  recordPlaytestRun,
} from './playtestLog.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('playtestLog', () => {
  it('records developer runs in its own local storage collection', () => {
    const storage = createMemoryStorage()
    const level = {
      id: 'level-03',
      number: 3,
      name: 'Vector Split',
      seed: 'shared-seed-03',
    }
    const result = {
      finalScore: 720,
      attainableMaximum: 1000,
      elapsedMs: 3467.8,
      actualDistance: 901.2,
      timeFactor: 0.8,
      routeFactor: 0.9,
      collisions: 1,
      earnedBonuses: 0,
      bonusFailed: false,
    }

    const recorded = recordPlaytestRun(level, result, storage)

    expect(recorded).toEqual(
      expect.objectContaining({
        levelId: 'level-03',
        score: 720,
        elapsedMs: 3468,
        actualDistance: 901,
      }),
    )
    expect(loadPlaytestRuns(storage)).toEqual([recorded])
    expect(storage.getItem(PLAYTEST_STORAGE_KEY)).toContain('"levelId":"level-03"')
  })

  it('recovers from malformed stored data', () => {
    const storage = createMemoryStorage()
    storage.setItem(PLAYTEST_STORAGE_KEY, '{broken')
    expect(loadPlaytestRuns(storage)).toEqual([])
  })
})

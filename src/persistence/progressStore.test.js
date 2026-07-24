import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  createInitialProgress,
  cumulativeScore,
  loadProgress,
  recordLevelResult,
  saveProgress,
} from './progressStore.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('progressStore', () => {
  it('retains only an improved level score', () => {
    const initial = createInitialProgress()
    const level = { id: 'level-01', number: 1 }
    const first = recordLevelResult(initial, level, {
      finalScore: 700,
      elapsedMs: 5000,
      actualDistance: 800,
    }).progress
    const replay = recordLevelResult(first, level, {
      finalScore: 500,
      elapsedMs: 4500,
      actualDistance: 700,
    }).progress

    expect(replay.levels['level-01'].bestScore).toBe(700)
    expect(cumulativeScore(replay)).toBe(700)
    expect(replay.player.highestUnlockedLevel).toBe(2)
  })

  it('round trips valid browser storage', () => {
    const storage = memoryStorage()
    const progress = createInitialProgress()
    progress.player.highestUnlockedLevel = 4
    saveProgress(progress, storage)
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy()
    expect(loadProgress(storage).player.highestUnlockedLevel).toBe(4)
  })

  it('recovers safely from malformed storage', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{broken')
    expect(loadProgress(storage)).toEqual(createInitialProgress())
  })
})

import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  collectCourseCoin,
  consumePowerup,
  createInitialProgress,
  cumulativeScore,
  loadProgress,
  purchasePowerup,
  recordLevelResult,
  recordMicroProtocolResult,
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

  it('supports progression through the expanded 70-level campaign', () => {
    const progress = createInitialProgress()
    progress.player.highestUnlockedLevel = 70
    const storage = memoryStorage()
    saveProgress(progress, storage)
    expect(loadProgress(storage).player.highestUnlockedLevel).toBe(70)

    const completed = recordLevelResult(
      progress,
      { id: 'level-70', number: 70 },
      { finalScore: 35000, elapsedMs: 30000, actualDistance: 2400 },
    ).progress
    expect(completed.player.highestUnlockedLevel).toBe(70)
  })

  it('recovers safely from malformed storage', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{broken')
    expect(loadProgress(storage)).toEqual(createInitialProgress())
  })

  it('migrates version-one progress without losing scores, coins, or settings', () => {
    const storage = memoryStorage()
    const legacy = createInitialProgress()
    legacy.schemaVersion = 1
    legacy.player.coins = 17
    legacy.levels['level-01'] = { completed: true, bestScore: 8123 }
    legacy.settings.reducedMotion = true
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))

    const migrated = loadProgress(storage)
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.player.coins).toBe(17)
    expect(migrated.levels['level-01'].bestScore).toBe(8123)
    expect(migrated.settings.reducedMotion).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion).toBe(3)
    expect(migrated.microProtocols).toEqual({})
  })

  it('collects each configured course coin only once', () => {
    const initial = createInitialProgress()
    const coin = { id: 'coin-a', value: 2 }
    const first = collectCourseCoin(initial, 'level-11', coin)
    const replay = collectCourseCoin(first.progress, 'level-11', coin)

    expect(first.collected).toBe(true)
    expect(first.progress.player.coins).toBe(2)
    expect(replay.collected).toBe(false)
    expect(replay.progress.player.coins).toBe(2)
  })

  it('purchases and permanently consumes a power-up charge', () => {
    const initial = createInitialProgress()
    initial.player.coins = 10
    initial.levels['level-01'] = { bestScore: 6000 }
    const powerup = { id: 'obstacle-shield', coinCost: 4, unlockScore: 5000 }

    const purchase = purchasePowerup(initial, powerup)
    const use = consumePowerup(purchase.progress, powerup.id)
    const secondUse = consumePowerup(use.progress, powerup.id)

    expect(purchase.purchased).toBe(true)
    expect(purchase.progress.player.coins).toBe(6)
    expect(use.consumed).toBe(true)
    expect(use.progress.player.inventory[powerup.id]).toBe(0)
    expect(secondUse.consumed).toBe(false)
  })

  it('records Micro Protocol results separately and grants one-time coins', () => {
    const initial = createInitialProgress()
    const protocol = { id: 'phase-window', rewardCoins: 3 }
    const first = recordMicroProtocolResult(initial, protocol, {
      finalScore: 850,
      elapsedMs: 9000,
    })
    const replay = recordMicroProtocolResult(first.progress, protocol, {
      finalScore: 900,
      elapsedMs: 8500,
    })

    expect(first.coinsEarned).toBe(3)
    expect(replay.coinsEarned).toBe(0)
    expect(replay.progress.player.coins).toBe(3)
    expect(replay.progress.microProtocols['phase-window']).toMatchObject({
      completed: true,
      bestScore: 900,
      bestTimeMs: 8500,
      attempts: 2,
      rewardClaimed: true,
    })
    expect(cumulativeScore(replay.progress)).toBe(0)
  })
})

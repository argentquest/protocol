const STORAGE_KEY = 'path-protocol.progress'
const SCHEMA_VERSION = 2
const MAX_LEVEL = 70

export function createInitialProgress() {
  return {
    schemaVersion: SCHEMA_VERSION,
    player: {
      highestUnlockedLevel: 1,
      coins: 0,
      inventory: {},
      collectedCoins: {},
      claimedCompletionRewards: {},
      claimedBonusRewards: {},
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

function migrateProgress(value) {
  if (value?.schemaVersion === 1) {
    return { ...value, schemaVersion: SCHEMA_VERSION }
  }
  return value
}

function sanitizeProgress(savedValue) {
  const initial = createInitialProgress()
  const value = migrateProgress(savedValue)
  if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION) {
    return initial
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    player: {
      highestUnlockedLevel: Math.max(
        1,
        Math.min(MAX_LEVEL, Number(value.player?.highestUnlockedLevel) || 1),
      ),
      coins: Math.max(0, Number(value.player?.coins) || 0),
      inventory:
        value.player?.inventory && typeof value.player.inventory === 'object'
          ? value.player.inventory
          : {},
      collectedCoins:
        value.player?.collectedCoins && typeof value.player.collectedCoins === 'object'
          ? value.player.collectedCoins
          : {},
      claimedCompletionRewards:
        value.player?.claimedCompletionRewards &&
        typeof value.player.claimedCompletionRewards === 'object'
          ? value.player.claimedCompletionRewards
          : {},
      claimedBonusRewards:
        value.player?.claimedBonusRewards &&
        typeof value.player.claimedBonusRewards === 'object'
          ? value.player.claimedBonusRewards
          : {},
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
    if (!saved) return createInitialProgress()
    const parsed = JSON.parse(saved)
    const progress = sanitizeProgress(parsed)
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      storage.setItem(STORAGE_KEY, JSON.stringify(progress))
    }
    return progress
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
  const completionAlreadyClaimed = Boolean(
    progress.player.claimedCompletionRewards[level.id],
  )
  const completionCoins = completionAlreadyClaimed
    ? 0
    : Number(level.rewards?.completionCoins) || 0
  const claimedBonusRewards = { ...progress.player.claimedBonusRewards }
  let bonusCoins = 0
  for (const target of (level.bonusTargets ?? []).slice(0, result.earnedBonuses ?? 0)) {
    const rewardKey = `${level.id}:${target.id}`
    if (claimedBonusRewards[rewardKey]) continue
    claimedBonusRewards[rewardKey] = true
    bonusCoins += Number(level.rewards?.bonusCoinsPerTarget) || 0
  }

  return {
    progress: {
      ...progress,
      player: {
        ...progress.player,
        highestUnlockedLevel: Math.max(
          progress.player.highestUnlockedLevel,
          Math.min(MAX_LEVEL, level.number + 1),
        ),
        coins: progress.player.coins + completionCoins + bonusCoins,
        claimedCompletionRewards: completionAlreadyClaimed
          ? progress.player.claimedCompletionRewards
          : { ...progress.player.claimedCompletionRewards, [level.id]: true },
        claimedBonusRewards,
      },
      levels: {
        ...progress.levels,
        [level.id]: levelRecord,
      },
    },
    improved,
  }
}

export function collectCourseCoin(progress, levelId, coin) {
  const collectionKey = `${levelId}:${coin.id}`
  if (progress.player.collectedCoins[collectionKey]) {
    return { progress, collected: false }
  }
  return {
    collected: true,
    progress: {
      ...progress,
      player: {
        ...progress.player,
        coins: progress.player.coins + (Number(coin.value) || 1),
        collectedCoins: {
          ...progress.player.collectedCoins,
          [collectionKey]: true,
        },
      },
    },
  }
}

export function purchasePowerup(progress, powerup, score = cumulativeScore(progress)) {
  const owned = Number(progress.player.inventory[powerup.id]) || 0
  if (score < powerup.unlockScore || progress.player.coins < powerup.coinCost) {
    return { progress, purchased: false }
  }
  return {
    purchased: true,
    progress: {
      ...progress,
      player: {
        ...progress.player,
        coins: progress.player.coins - powerup.coinCost,
        inventory: {
          ...progress.player.inventory,
          [powerup.id]: owned + 1,
        },
      },
    },
  }
}

export function consumePowerup(progress, powerupId) {
  const owned = Number(progress.player.inventory[powerupId]) || 0
  if (owned <= 0) return { progress, consumed: false }
  return {
    consumed: true,
    progress: {
      ...progress,
      player: {
        ...progress.player,
        inventory: {
          ...progress.player.inventory,
          [powerupId]: owned - 1,
        },
      },
    },
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

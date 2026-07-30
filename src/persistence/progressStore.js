const STORAGE_KEY = 'path-protocol.progress'
const SCHEMA_VERSION = 3
const MAX_LEVEL = 70

/**
 * @typedef {object} PlayerProgress
 * @property {number} schemaVersion Persistence schema version.
 * @property {object} player Coins, inventory, unlocks, and one-time claims.
 * @property {Record<string, object>} levels Per-level best results.
 * @property {Record<string, object>} microProtocols Optional challenge records.
 * @property {object} settings Audio and accessibility settings.
 */

/**
 * Creates a fresh versioned browser-local progress record.
 *
 * @returns {PlayerProgress} Default progress.
 */
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
    microProtocols: {},
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
  if ([1, 2].includes(value?.schemaVersion)) {
    return {
      ...value,
      schemaVersion: SCHEMA_VERSION,
      microProtocols: value.microProtocols ?? {},
    }
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
    microProtocols:
      value.microProtocols && typeof value.microProtocols === 'object'
        ? value.microProtocols
        : {},
    settings: {
      ...initial.settings,
      ...(value.settings ?? {}),
    },
  }
}

/**
 * Loads, migrates, and sanitizes progress from browser storage.
 *
 * @param {Storage} [storage=window.localStorage] Storage implementation.
 * @returns {PlayerProgress} Valid current-version progress.
 */
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

/**
 * Sanitizes and writes progress to browser storage.
 *
 * @param {PlayerProgress} progress Progress to persist.
 * @param {Storage} [storage=window.localStorage] Storage implementation.
 * @returns {void}
 */
export function saveProgress(progress, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProgress(progress)))
}

/**
 * Records completion, best score, best time, distance, and one-time rewards.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {object} level Completed level configuration.
 * @param {object} result Final score, milliseconds, world distance, and bonuses.
 * @returns {{progress: PlayerProgress, improved: boolean}} Updated record and best-score flag.
 */
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

/**
 * Records a Micro Protocol best result and grants its reward only once.
 *
 * Micro scores remain separate from campaign cumulative score.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {object} protocol Micro Protocol metadata.
 * @param {object} result Completed engine result.
 * @returns {{progress: PlayerProgress, improved: boolean, coinsEarned: number}} Updated progress.
 */
export function recordMicroProtocolResult(progress, protocol, result) {
  const previous = progress.microProtocols[protocol.id] ?? {
    completed: false,
    bestScore: 0,
    bestTimeMs: null,
    attempts: 0,
    rewardClaimed: false,
  }
  const improved = result.finalScore > previous.bestScore
  const coinsEarned = previous.rewardClaimed
    ? 0
    : Number(protocol.rewardCoins) || 0
  return {
    improved,
    coinsEarned,
    progress: {
      ...progress,
      player: {
        ...progress.player,
        coins: progress.player.coins + coinsEarned,
      },
      microProtocols: {
        ...progress.microProtocols,
        [protocol.id]: {
          completed: true,
          bestScore: improved ? result.finalScore : previous.bestScore,
          bestTimeMs:
            previous.bestTimeMs === null
              ? result.elapsedMs
              : Math.min(previous.bestTimeMs, result.elapsedMs),
          attempts: previous.attempts + 1,
          rewardClaimed: true,
        },
      },
    },
  }
}

/**
 * Awards a course coin once for a player.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {string} levelId Stable level ID.
 * @param {object} coin Coin definition and point value.
 * @returns {{progress: PlayerProgress, collected: boolean}} Immutable collection result.
 */
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

/**
 * Exchanges coins for one consumable power when score requirements are met.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {object} powerup Power definition.
 * @param {number} [score=cumulativeScore(progress)] Cumulative score in points.
 * @returns {{progress: PlayerProgress, purchased: boolean}} Immutable purchase result.
 */
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

/**
 * Removes one consumable power charge.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {string} powerupId Stable power ID.
 * @returns {{progress: PlayerProgress, consumed: boolean}} Immutable consumption result.
 */
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

/**
 * Increments the attempt count without recording completion.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {string} levelId Stable level ID.
 * @returns {PlayerProgress} Updated progress.
 */
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

/**
 * Recalculates the campaign score from per-level best scores.
 *
 * @pure
 * @param {PlayerProgress} progress Current progress.
 * @returns {number} Cumulative score in points.
 */
export function cumulativeScore(progress) {
  return Object.values(progress.levels).reduce(
    (total, level) => total + (Number(level.bestScore) || 0),
    0,
  )
}

/**
 * Replaces persisted progress with a fresh record.
 *
 * @param {Storage} [storage=window.localStorage] Storage implementation.
 * @returns {PlayerProgress} Fresh progress.
 */
export function resetProgress(storage = window.localStorage) {
  const initial = createInitialProgress()
  saveProgress(initial, storage)
  return initial
}

export { STORAGE_KEY }

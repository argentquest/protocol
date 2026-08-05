const STORAGE_KEY = 'path-protocol.progress'
const SCHEMA_VERSION = 4
const MAX_STORED_LEVEL = 200

/**
 * Builds the versioned browser-storage namespace for a campaign theme.
 *
 * @pure
 * @param {string} themeId Stable theme ID.
 * @returns {string} Local-storage key.
 */
function storageKeyForTheme(themeId) {
  return themeId === 'default'
    ? STORAGE_KEY
    : `${STORAGE_KEY}.theme.${encodeURIComponent(themeId)}`
}

/**
 * Selects the immutable progress identifier for default or Workshop levels.
 *
 * @pure
 * @param {object} level Level configuration.
 * @returns {string} Internal level ID when present, otherwise campaign ID.
 */
function levelProgressId(level) {
  return level.internalId ?? level.id
}

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
      claimedMicroTierRewards: {},
      totalShotsLaunched: 0,
    },
    levels: {},
    microProtocols: {},
    settings: {
      musicEnabled: true,
      musicVolume: 0.22,
      effectsEnabled: true,
      effectsVolume: 0.55,
      reducedMotion: false,
      controlMode: 'guided',
    },
  }
}

/**
 * Upgrades supported legacy progress records to the current schema version.
 *
 * @pure
 * @param {unknown} value Parsed persisted value.
 * @returns {unknown} Migrated value, or the original unsupported value.
 */
function migrateProgress(value) {
  if ([1, 2, 3].includes(value?.schemaVersion)) {
    return {
      ...value,
      schemaVersion: SCHEMA_VERSION,
      microProtocols: value.microProtocols ?? {},
    }
  }
  return value
}

/**
 * Projects untrusted persisted data onto a valid current progress record.
 *
 * @pure
 * @param {unknown} savedValue Parsed browser-storage value.
 * @returns {PlayerProgress} Bounded progress with safe defaults.
 */
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
        Math.min(
          MAX_STORED_LEVEL,
          Number(value.player?.highestUnlockedLevel) || 1,
        ),
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
      claimedMicroTierRewards:
        value.player?.claimedMicroTierRewards &&
        typeof value.player.claimedMicroTierRewards === 'object'
          ? value.player.claimedMicroTierRewards
          : {},
      totalShotsLaunched: Math.max(
        0,
        Number(value.player?.totalShotsLaunched) || 0,
      ),
    },
    levels: value.levels && typeof value.levels === 'object' ? value.levels : {},
    microProtocols:
      value.microProtocols && typeof value.microProtocols === 'object'
        ? value.microProtocols
        : {},
    settings: {
      ...initial.settings,
      ...(value.settings ?? {}),
      controlMode:
        value.settings?.controlMode === 'kinetic' ? 'kinetic' : 'guided',
    },
  }
}

/**
 * Loads, migrates, and sanitizes progress from browser storage.
 *
 * @param {Storage} [storage=window.localStorage] Storage implementation.
 * @param {string} [themeId='default'] Campaign theme namespace.
 * @returns {PlayerProgress} Valid current-version progress.
 */
export function loadProgress(storage = window.localStorage, themeId = 'default') {
  try {
    const storageKey = storageKeyForTheme(themeId)
    const saved = storage.getItem(storageKey)
    if (!saved) return createInitialProgress()
    const parsed = JSON.parse(saved)
    const progress = sanitizeProgress(parsed)
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      storage.setItem(storageKey, JSON.stringify(progress))
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
 * @param {string} [themeId='default'] Campaign theme namespace.
 * @returns {void}
 */
export function saveProgress(
  progress,
  storage = window.localStorage,
  themeId = 'default',
) {
  storage.setItem(
    storageKeyForTheme(themeId),
    JSON.stringify(sanitizeProgress(progress)),
  )
}

/**
 * Records completion, best score, best time, distance, and one-time rewards.
 *
 * @pure
 * @param {PlayerProgress} progress Existing progress.
 * @param {object} level Completed level configuration.
 * @param {object} result Final score, milliseconds, world distance, and bonuses.
 * @param {number} [totalLevels=100] Active campaign level count.
 * @returns {{progress: PlayerProgress, improved: boolean}} Updated record and best-score flag.
 */
export function recordLevelResult(progress, level, result, totalLevels = 100) {
  const progressId = levelProgressId(level)
  const previous = progress.levels[progressId] ?? {
    completed: false,
    bestScore: 0,
    bestTimeMs: null,
    bestDistance: null,
    attempts: 0,
  }
  const improved = result.finalScore > previous.bestScore
  const shotsTaken = Math.max(0, Math.floor(Number(result.shotsTaken) || 0))
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
    lastShots: shotsTaken,
    bestShots:
      shotsTaken > 0
        ? previous.bestShots == null
          ? shotsTaken
          : Math.min(previous.bestShots, shotsTaken)
        : previous.bestShots ?? null,
  }
  const completionAlreadyClaimed = Boolean(
    progress.player.claimedCompletionRewards[progressId],
  )
  const completionCoins = completionAlreadyClaimed
    ? 0
    : Number(level.rewards?.completionCoins) || 0
  const claimedBonusRewards = { ...progress.player.claimedBonusRewards }
  let bonusCoins = 0
  for (const target of (level.bonusTargets ?? []).slice(0, result.earnedBonuses ?? 0)) {
    const rewardKey = `${progressId}:${target.id}`
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
          Math.min(totalLevels, level.number + 1),
        ),
        coins: progress.player.coins + completionCoins + bonusCoins,
        claimedCompletionRewards: completionAlreadyClaimed
          ? progress.player.claimedCompletionRewards
          : { ...progress.player.claimedCompletionRewards, [progressId]: true },
        claimedBonusRewards,
        totalShotsLaunched:
          (Number(progress.player.totalShotsLaunched) || 0) + shotsTaken,
      },
      levels: {
        ...progress.levels,
        [progressId]: levelRecord,
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
  const shotsTaken = Math.max(0, Math.floor(Number(result.shotsTaken) || 0))
  const coinsEarned = previous.rewardClaimed
    ? 0
    : Number(protocol.rewardCoins) || 0
  const tierKey = `tier-${protocol.tier}`
  const tierCoinsEarned = progress.player.claimedMicroTierRewards?.[tierKey]
    ? 0
    : Number(protocol.tierRewardCoins) || 0
  const totalCoinsEarned = coinsEarned + tierCoinsEarned
  return {
    improved,
    coinsEarned: totalCoinsEarned,
    progress: {
      ...progress,
      player: {
        ...progress.player,
        coins: progress.player.coins + totalCoinsEarned,
        claimedMicroTierRewards: {
          ...(progress.player.claimedMicroTierRewards ?? {}),
          [tierKey]: true,
        },
        totalShotsLaunched:
          (Number(progress.player.totalShotsLaunched) || 0) + shotsTaken,
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
          lastShots: shotsTaken,
          bestShots:
            shotsTaken > 0
              ? previous.bestShots == null
                ? shotsTaken
                : Math.min(previous.bestShots, shotsTaken)
              : previous.bestShots ?? null,
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
 * Sums the fewest recorded kinetic shots for every completed campaign level.
 *
 * @pure
 * @param {PlayerProgress} progress Current progress.
 * @returns {number} Campaign-best shot total across completed kinetic levels.
 */
export function cumulativeShots(progress) {
  return Object.values(progress.levels).reduce(
    (total, level) => total + (Number(level.bestShots) || 0),
    0,
  )
}

/**
 * Replaces persisted progress with a fresh record.
 *
 * @param {Storage} [storage=window.localStorage] Storage implementation.
 * @param {string} [themeId='default'] Campaign theme namespace.
 * @returns {PlayerProgress} Fresh progress.
 */
export function resetProgress(
  storage = window.localStorage,
  themeId = 'default',
) {
  const initial = createInitialProgress()
  saveProgress(initial, storage, themeId)
  return initial
}

export { STORAGE_KEY, storageKeyForTheme }

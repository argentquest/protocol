/**
 * Hashes an arbitrary released seed into an unsigned 32-bit state.
 *
 * @pure
 * @param {string} seed Stable seed string.
 * @returns {number} Unsigned 32-bit hash.
 */
function hashSeed(seed) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Creates the shared deterministic pseudo-random number generator.
 *
 * @param {string|number} seed Stable released seed.
 * @returns {() => number} Generator returning values from 0 inclusive to 1 exclusive.
 */
export function createSeededRandom(seed) {
  let state = hashSeed(String(seed))

  return function random() {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Selects a deterministic floating-point value within a range.
 *
 * @pure
 * @param {() => number} random Seeded random generator.
 * @param {number} minimum Inclusive lower bound.
 * @param {number} maximum Exclusive upper bound.
 * @returns {number} Selected value.
 */
export function randomBetween(random, minimum, maximum) {
  return minimum + random() * (maximum - minimum)
}

/**
 * Selects one deterministic array item.
 *
 * @template T
 * @pure
 * @param {() => number} random Seeded random generator.
 * @param {T[]} items Non-empty candidate list.
 * @returns {T} Selected item.
 */
export function randomItem(random, items) {
  return items[Math.floor(random() * items.length)]
}

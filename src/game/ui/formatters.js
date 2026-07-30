/**
 * Formats milliseconds as a compact seconds label.
 *
 * @pure
 * @param {number} milliseconds Duration in milliseconds.
 * @returns {string} Seconds with one decimal place.
 */
export function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`
}

/**
 * Formats logical world distance for the HUD.
 *
 * @pure
 * @param {number} value Distance in logical world units.
 * @returns {string} Rounded localized distance.
 */
export function formatDistance(value) {
  return `${Math.round(value)}u`
}

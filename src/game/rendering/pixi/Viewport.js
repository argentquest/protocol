export const WORLD_SIZE = 1000

/**
 * @typedef {object} Viewport
 * @property {number} width Canvas width in CSS pixels.
 * @property {number} height Canvas height in CSS pixels.
 * @property {number} worldSize Square world extent in logical units.
 * @property {number} scale CSS pixels per logical world unit.
 * @property {number} offsetX Horizontal letterbox offset in CSS pixels.
 * @property {number} offsetY Vertical letterbox offset in CSS pixels.
 */

/**
 * Computes uniform, centered world scaling without object distortion.
 *
 * @pure
 * @param {number} width Canvas width in CSS pixels.
 * @param {number} height Canvas height in CSS pixels.
 * @param {number} [worldSize=1000] Logical world size.
 * @returns {Viewport} Immutable viewport transform.
 */
export function calculateViewport(width, height, worldSize = WORLD_SIZE) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const scale = Math.min(safeWidth / worldSize, safeHeight / worldSize)
  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    worldSize,
    scale,
    offsetX: (safeWidth - worldSize * scale) / 2,
    offsetY: (safeHeight - worldSize * scale) / 2,
  })
}

/**
 * Converts a canvas position from CSS pixels to logical world units.
 *
 * @pure
 * @param {import('../../types.js').Point} point Canvas point in CSS pixels.
 * @param {Viewport} viewport Active viewport transform.
 * @returns {import('../../types.js').Point} Point in logical world units.
 */
export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

/**
 * Converts logical world coordinates to canvas CSS pixels.
 *
 * @pure
 * @param {import('../../types.js').Point} point Point in logical world units.
 * @param {Viewport} viewport Active viewport transform.
 * @returns {import('../../types.js').Point} Canvas point in CSS pixels.
 */
export function worldToScreen(point, viewport) {
  return {
    x: viewport.offsetX + point.x * viewport.scale,
    y: viewport.offsetY + point.y * viewport.scale,
  }
}

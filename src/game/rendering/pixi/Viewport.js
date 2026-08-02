import { WORLD_HEIGHT, WORLD_WIDTH } from '../../world.js'

/**
 * @typedef {object} Viewport
 * @property {number} width Canvas width in CSS pixels.
 * @property {number} height Canvas height in CSS pixels.
 * @property {number} worldWidth World width in logical units.
 * @property {number} worldHeight World height in logical units.
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
 * @param {number} [worldWidth=1600] Logical world width.
 * @param {number} [worldHeight=900] Logical world height.
 * @returns {Viewport} Immutable viewport transform.
 */
export function calculateViewport(
  width,
  height,
  worldWidth = WORLD_WIDTH,
  worldHeight = WORLD_HEIGHT,
) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const scale = Math.min(safeWidth / worldWidth, safeHeight / worldHeight)
  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    worldWidth,
    worldHeight,
    scale,
    offsetX: (safeWidth - worldWidth * scale) / 2,
    offsetY: (safeHeight - worldHeight * scale) / 2,
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

import { Graphics } from 'pixi.js'

const UNIFORM_CATEGORIES = new Set([
  'tokens',
  'targets',
  'bonus',
  'coins',
  'powers',
])

/**
 * Calculates SVG-to-world scale while preserving aspect ratio where required.
 *
 * @pure
 * @param {number} width Entity width in logical world units.
 * @param {number} height Entity height in logical world units.
 * @param {string} category Manifest media category.
 * @param {number} [sourceSize=100] Standard SVG viewBox extent.
 * @returns {{x: number, y: number}} Pixi scale factors.
 */
export function entityScale(width, height, category, sourceSize = 100) {
  if (UNIFORM_CATEGORIES.has(category)) {
    const uniform = Math.min(width, height) / sourceSize
    return { x: uniform, y: uniform }
  }
  return { x: width / sourceSize, y: height / sourceSize }
}

/**
 * Creates a stable Pixi display object from a cached vector context.
 *
 * @param {object} options Factory inputs.
 * @param {object} options.context Parsed vector context.
 * @param {object} options.item Entity configuration in logical world units.
 * @param {string} options.category Manifest media category.
 * @param {typeof Graphics} [options.GraphicsClass] Injectable Pixi class.
 * @returns {Graphics} Positioned display object.
 */
export function createVectorEntity({
  context,
  item,
  category,
  GraphicsClass = Graphics,
}) {
  const display = new GraphicsClass({ context })
  const width = item.width ?? item.size
  const height = item.height ?? item.size
  const scale = entityScale(width, height, category)
  display.position.set(item.x, item.y)
  display.scale.set(scale.x, scale.y)
  display.pivot.set(50, 50)
  display.label = item.id ?? item.mediaId
  return display
}

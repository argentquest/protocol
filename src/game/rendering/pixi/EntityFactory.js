import { Graphics, Sprite } from 'pixi.js'

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

/**
 * Creates a stable Pixi sprite from a cached PNG texture.
 *
 * @param {object} options Factory inputs.
 * @param {object} options.texture Loaded Pixi texture.
 * @param {object} options.item Entity configuration in logical world units.
 * @param {string} options.category Manifest media category.
 * @param {'contain'|'stretch'} options.sizing Theme sizing rule.
 * @param {typeof Sprite} [options.SpriteClass] Injectable Pixi class.
 * @returns {Sprite} Centered and positioned display object.
 */
export function createTextureEntity({
  texture,
  item,
  category,
  sizing,
  SpriteClass = Sprite,
}) {
  const display = new SpriteClass({ texture })
  const width = item.width ?? item.size
  const height = item.height ?? item.size
  const sourceWidth = texture.width || width
  const sourceHeight = texture.height || height
  const preserveAspect = sizing === 'contain' || UNIFORM_CATEGORIES.has(category)
  if (preserveAspect) {
    const scale = Math.min(width / sourceWidth, height / sourceHeight)
    display.scale.set(scale, scale)
  } else {
    display.scale.set(width / sourceWidth, height / sourceHeight)
  }
  display.position.set(item.x, item.y)
  display.anchor.set(0.5)
  display.label = item.id ?? item.mediaId
  return display
}

/**
 * Creates the correct stable display object for a resolved visual definition.
 *
 * @param {object} options Loaded resource, definition, and entity configuration.
 * @returns {Graphics|Sprite} Pixi display object.
 */
export function createMediaEntity({
  resource,
  definition,
  item,
  GraphicsClass = Graphics,
  SpriteClass = Sprite,
}) {
  if (definition.renderMode === 'texture') {
    return createTextureEntity({
      texture: resource,
      item,
      category: definition.category,
      sizing: definition.sizing,
      SpriteClass,
    })
  }
  return createVectorEntity({
    context: resource,
    item,
    category: definition.category,
    GraphicsClass,
  })
}

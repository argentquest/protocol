import { Graphics } from 'pixi.js'

const UNIFORM_CATEGORIES = new Set([
  'tokens',
  'targets',
  'bonus',
  'coins',
  'powers',
])

export function entityScale(width, height, category, sourceSize = 100) {
  if (UNIFORM_CATEGORIES.has(category)) {
    const uniform = Math.min(width, height) / sourceSize
    return { x: uniform, y: uniform }
  }
  return { x: width / sourceSize, y: height / sourceSize }
}

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

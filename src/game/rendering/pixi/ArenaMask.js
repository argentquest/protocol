import { Graphics } from 'pixi.js'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../world.js'

/**
 * Creates the Pixi mask matching the configured logical arena boundary.
 *
 * @param {object} arena Arena shape in the 1600 × 900 logical world.
 * @param {typeof Graphics} [GraphicsClass] Injectable Pixi class.
 * @returns {Graphics} Filled arena mask.
 */
export function createArenaMask(arena, GraphicsClass = Graphics) {
  const mask = new GraphicsClass()
  if (arena.shape === 'ellipse') {
    mask.ellipse(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_WIDTH / 2 - (arena.margin ?? 0),
      WORLD_HEIGHT / 2 - (arena.margin ?? 0),
    )
  } else if (arena.shape === 'polygon') {
    const [first, ...remaining] = arena.points
    mask.moveTo(first[0], first[1])
    for (const point of remaining) mask.lineTo(point[0], point[1])
    mask.closePath()
  } else {
    const margin = arena.margin ?? 0
    mask.roundRect(
      margin,
      margin,
      WORLD_WIDTH - margin * 2,
      WORLD_HEIGHT - margin * 2,
      arena.cornerRadius ?? 0,
    )
  }
  mask.fill({ color: 0xffffff })
  mask.label = 'arena-mask'
  return mask
}

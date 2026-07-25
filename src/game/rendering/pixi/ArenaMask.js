import { Graphics } from 'pixi.js'

export function createArenaMask(arena, GraphicsClass = Graphics) {
  const mask = new GraphicsClass()
  if (arena.shape === 'ellipse') {
    mask.ellipse(500, 500, 500 - (arena.margin ?? 0), 500 - (arena.margin ?? 0))
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
      1000 - margin * 2,
      1000 - margin * 2,
      arena.cornerRadius ?? 0,
    )
  }
  mask.fill({ color: 0xffffff })
  mask.label = 'arena-mask'
  return mask
}

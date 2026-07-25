export const WORLD_SIZE = 1000

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

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

export function worldToScreen(point, viewport) {
  return {
    x: viewport.offsetX + point.x * viewport.scale,
    y: viewport.offsetY + point.y * viewport.scale,
  }
}

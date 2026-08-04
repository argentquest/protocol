const GRID_SIZE = 10
const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 900

/**
 * Snaps a coordinate or dimension to the Workshop grid.
 *
 * @pure
 * @param {number|string} value Value in world units.
 * @returns {number} Nearest 10-world-unit increment.
 */
export function snapToEditorGrid(value) {
  return Math.round(Number(value) / GRID_SIZE) * GRID_SIZE
}

/**
 * Resolves editor display dimensions from radius, width, height, or size.
 *
 * @pure
 * @param {object} entity Editable entity.
 * @returns {{width:number,height:number}} Dimensions in world units.
 */
export function entitySize(entity) {
  if (Object.hasOwn(entity, 'radius')) {
    return { width: entity.radius * 2, height: entity.radius * 2 }
  }
  return {
    width: entity.width ?? entity.size ?? 50,
    height: entity.height ?? entity.size ?? 50,
  }
}

/**
 * Reports whether an entity owns schema-backed resizable dimensions.
 *
 * @pure
 * @param {object} entity Editable entity.
 * @returns {boolean} Whether resize handles should be displayed.
 */
export function isResizableEntity(entity) {
  return (
    Object.hasOwn(entity, 'radius') ||
    Object.hasOwn(entity, 'size') ||
    (Object.hasOwn(entity, 'width') && Object.hasOwn(entity, 'height'))
  )
}

/**
 * Clamps a number between inclusive bounds.
 *
 * @pure
 * @param {number} value Candidate value.
 * @param {number} minimum Inclusive minimum.
 * @param {number} maximum Inclusive maximum.
 * @returns {number} Clamped value.
 */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Resizes a rectangular entity while anchoring the opposite edges.
 *
 * @pure
 * @param {object} entity Entity at pointer-down time.
 * @param {string} handle Resize handle (`n`, `ne`, `e`, and so on).
 * @param {{x:number,y:number}} point Pointer position in world units.
 * @returns {object} Entity with snapped center and dimensions.
 */
function resizeRectangle(entity, handle, point) {
  const dimensions = entitySize(entity)
  let left = entity.x - dimensions.width / 2
  let right = entity.x + dimensions.width / 2
  let top = entity.y - dimensions.height / 2
  let bottom = entity.y + dimensions.height / 2

  if (handle.includes('w')) left = clamp(point.x, 0, right - GRID_SIZE)
  if (handle.includes('e')) right = clamp(point.x, left + GRID_SIZE, WORLD_WIDTH)
  if (handle.includes('n')) top = clamp(point.y, 0, bottom - GRID_SIZE)
  if (handle.includes('s')) bottom = clamp(point.y, top + GRID_SIZE, WORLD_HEIGHT)

  const width = Math.max(GRID_SIZE, snapToEditorGrid(right - left))
  const height = Math.max(GRID_SIZE, snapToEditorGrid(bottom - top))
  return {
    ...entity,
    x: clamp(snapToEditorGrid((left + right) / 2), width / 2, WORLD_WIDTH - width / 2),
    y: clamp(snapToEditorGrid((top + bottom) / 2), height / 2, WORLD_HEIGHT - height / 2),
    width,
    height,
  }
}

/**
 * Resizes a square or circle while preserving its one-dimensional size contract.
 *
 * @pure
 * @param {object} entity Entity at pointer-down time.
 * @param {string} handle Resize handle (`n`, `ne`, `e`, and so on).
 * @param {{x:number,y:number}} point Pointer position in world units.
 * @returns {object} Entity with snapped center and size or radius.
 */
function resizeProportionally(entity, handle, point) {
  const dimensions = entitySize(entity)
  const half = dimensions.width / 2
  const left = entity.x - half
  const right = entity.x + half
  const top = entity.y - half
  const bottom = entity.y + half
  const horizontalSize = handle.includes('w')
    ? right - clamp(point.x, 0, right - GRID_SIZE)
    : handle.includes('e')
      ? clamp(point.x, left + GRID_SIZE, WORLD_WIDTH) - left
      : dimensions.width
  const verticalSize = handle.includes('n')
    ? bottom - clamp(point.y, 0, bottom - GRID_SIZE)
    : handle.includes('s')
      ? clamp(point.y, top + GRID_SIZE, WORLD_HEIGHT) - top
      : dimensions.height
  const requestedSize =
    handle.length === 2
      ? Math.max(horizontalSize, verticalSize)
      : handle.includes('w') || handle.includes('e')
        ? horizontalSize
        : verticalSize
  const maximumWidth = handle.includes('w')
    ? right
    : handle.includes('e')
      ? WORLD_WIDTH - left
      : Math.min(entity.x, WORLD_WIDTH - entity.x) * 2
  const maximumHeight = handle.includes('n')
    ? bottom
    : handle.includes('s')
      ? WORLD_HEIGHT - top
      : Math.min(entity.y, WORLD_HEIGHT - entity.y) * 2
  const boundedSize = Math.max(
    GRID_SIZE,
    snapToEditorGrid(Math.min(requestedSize, maximumWidth, maximumHeight)),
  )
  const radius = Object.hasOwn(entity, 'radius')
    ? Math.max(GRID_SIZE, Math.floor(boundedSize / (GRID_SIZE * 2)) * GRID_SIZE)
    : null
  const size = radius === null ? boundedSize : radius * 2
  const anchoredLeft = handle.includes('w') ? right - size : handle.includes('e') ? left : entity.x - size / 2
  const anchoredTop = handle.includes('n') ? bottom - size : handle.includes('s') ? top : entity.y - size / 2
  const x = handle.includes('w') || handle.includes('e')
    ? anchoredLeft + size / 2
    : entity.x
  const y = handle.includes('n') || handle.includes('s')
    ? anchoredTop + size / 2
    : entity.y

  const snappedX = clamp(snapToEditorGrid(x), size / 2, WORLD_WIDTH - size / 2)
  const snappedY = clamp(snapToEditorGrid(y), size / 2, WORLD_HEIGHT - size / 2)

  if (radius !== null) {
    return {
      ...entity,
      x: snappedX,
      y: snappedY,
      radius,
    }
  }
  return {
    ...entity,
    x: snappedX,
    y: snappedY,
    size,
  }
}

/**
 * Resizes an entity from one editor edge or corner in logical world units.
 *
 * @pure
 * @param {object} entity Entity at pointer-down time.
 * @param {string} handle Resize handle (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, or `nw`).
 * @param {{x:number,y:number}} point Pointer position in world units.
 * @returns {object} Resized entity, or the original entity when it has no dimensions.
 */
export function resizeEntity(entity, handle, point) {
  if (!isResizableEntity(entity)) return entity
  const snappedPoint = {
    x: snapToEditorGrid(point.x),
    y: snapToEditorGrid(point.y),
  }
  if (Object.hasOwn(entity, 'radius') || Object.hasOwn(entity, 'size')) {
    return resizeProportionally(entity, handle, snappedPoint)
  }
  return resizeRectangle(entity, handle, snappedPoint)
}

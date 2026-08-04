const GRID_SIZE = 10
const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 900

const DEFAULT_POLYGON_POINTS = [
  [10, 15],
  [420, 5],
  [800, 20],
  [1200, 5],
  [1590, 15],
  [1595, 450],
  [1585, 890],
  [1100, 895],
  [700, 885],
  [250, 895],
  [5, 875],
  [15, 400],
]

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
 * Converts an arena to a schema-ready boundary of the requested shape.
 *
 * @pure
 * @param {object} arena Current arena, used to preserve its registered media ID.
 * @param {'rect'|'ellipse'|'polygon'} shape Requested boundary type.
 * @returns {object} Converted arena configuration.
 */
export function convertArenaShape(arena, shape) {
  const media = {
    mediaId: {
      rect: 'arena-standard',
      ellipse: 'arena-ellipse',
      polygon: 'arena-polygon',
    }[shape],
    ...(arena.visualOverrideId
      ? { visualOverrideId: arena.visualOverrideId }
      : {}),
    ...(arena.audioOverrideId ? { audioOverrideId: arena.audioOverrideId } : {}),
  }
  if (shape === 'polygon') {
    return {
      shape,
      ...media,
      points: DEFAULT_POLYGON_POINTS.map((point) => [...point]),
    }
  }
  if (shape === 'ellipse') return { shape, ...media, margin: 50 }
  return { shape: 'rect', ...media, margin: 40, cornerRadius: 30 }
}

/**
 * Moves one polygon arena corner on the 10-unit grid and within world bounds.
 *
 * @pure
 * @param {object} arena Polygon arena configuration.
 * @param {number} index Zero-based corner index.
 * @param {{x:number,y:number}} point Pointer position in world units.
 * @returns {object} Arena with the moved corner.
 */
export function moveArenaPoint(arena, index, point) {
  if (arena.shape !== 'polygon' || !arena.points[index]) return arena
  const points = arena.points.map((item) => [...item])
  points[index] = [
    clamp(snapToEditorGrid(point.x), 0, WORLD_WIDTH),
    clamp(snapToEditorGrid(point.y), 0, WORLD_HEIGHT),
  ]
  return { ...arena, points }
}

/**
 * Inserts a corner at the midpoint of the polygon's longest edge.
 *
 * @pure
 * @param {object} arena Polygon arena configuration.
 * @returns {{arena:object,index:number}} Updated arena and inserted corner index.
 */
export function addArenaPoint(arena) {
  if (arena.shape !== 'polygon') return { arena, index: -1 }
  let longestIndex = 0
  let longestDistance = -1
  for (let index = 0; index < arena.points.length; index += 1) {
    const point = arena.points[index]
    const next = arena.points[(index + 1) % arena.points.length]
    const distance = (next[0] - point[0]) ** 2 + (next[1] - point[1]) ** 2
    if (distance > longestDistance) {
      longestDistance = distance
      longestIndex = index
    }
  }
  const nextIndex = (longestIndex + 1) % arena.points.length
  const point = arena.points[longestIndex]
  const next = arena.points[nextIndex]
  const inserted = [
    snapToEditorGrid((point[0] + next[0]) / 2),
    snapToEditorGrid((point[1] + next[1]) / 2),
  ]
  const points = [...arena.points]
  const insertionIndex = longestIndex + 1
  points.splice(insertionIndex, 0, inserted)
  return { arena: { ...arena, points }, index: insertionIndex }
}

/**
 * Removes one polygon corner while preserving the three-corner minimum.
 *
 * @pure
 * @param {object} arena Polygon arena configuration.
 * @param {number} index Zero-based selected corner index.
 * @returns {object} Updated or unchanged arena.
 */
export function removeArenaPoint(arena, index) {
  if (
    arena.shape !== 'polygon' ||
    arena.points.length <= 3 ||
    !arena.points[index]
  ) {
    return arena
  }
  return {
    ...arena,
    points: arena.points.filter((_point, pointIndex) => pointIndex !== index),
  }
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

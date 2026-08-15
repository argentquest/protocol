/** Logical world width in authored gameplay units. */
export const WORLD_WIDTH = 1600

/** Logical world height in authored gameplay units. */
export const WORLD_HEIGHT = 900

/** Immutable dimensions shared by the pure engine and Three.js adapter. */
export const WORLD_BOUNDS = Object.freeze({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
})

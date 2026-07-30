/**
 * A position in the 1000 × 1000 logical game world.
 *
 * @typedef {object} Point
 * @property {number} x Horizontal position in logical world units.
 * @property {number} y Vertical position in logical world units.
 */

/**
 * Dimensions in the logical game world.
 *
 * @typedef {object} Dimensions
 * @property {number} width Width in logical world units.
 * @property {number} height Height in logical world units.
 */

/**
 * Collision geometry positioned in the logical game world.
 *
 * @typedef {object} GameShape
 * @property {'circle'|'rectangle'|'polygon'|'diamond'} shape Geometry kind.
 * @property {number} x Center x-coordinate in logical world units.
 * @property {number} y Center y-coordinate in logical world units.
 * @property {number} [radius] Circle radius in logical world units.
 * @property {number} [width] Width in logical world units.
 * @property {number} [height] Height in logical world units.
 * @property {Point[]} [points] Polygon vertices in logical world coordinates.
 */

/**
 * Mutable state populated only by raw input handlers and consumed by the
 * fixed-step engine.
 *
 * @typedef {object} GameInputState
 * @property {boolean} active Whether an attempt is accepting movement input.
 * @property {'pointer'|'keyboard'|null} mode Active input mode.
 * @property {Point} desiredPosition Desired token-center position in world units.
 * @property {Set<string>} directions Currently pressed arrow keys.
 * @property {string|null} requestedPowerKey Pending numeric power key.
 */

/**
 * Serializable values sent from the engine to the React HUD.
 *
 * @typedef {object} HudSnapshot
 * @property {string} levelId Stable level identifier.
 * @property {string} phase Current engine state-machine phase.
 * @property {number} elapsedMs Attempt duration in milliseconds.
 * @property {number} distance Actual token-center travel in logical world units.
 * @property {number} collisions Number of discrete collision events.
 * @property {number} score Current calculated score in points.
 */

/**
 * Result returned after advancing a fixed-step simulation loop.
 *
 * @typedef {object} FrameAdvanceResult
 * @property {number} updates Number of fixed simulation updates performed.
 * @property {number} interpolation Fraction from the last update to the next.
 * @property {number} [frameDelta] Clamped rendered-frame duration in milliseconds.
 */

export {}

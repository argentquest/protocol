/**
 * Projects one validated level into the explicitly selected movement session.
 *
 * @pure
 * @param {object} level Validated authored level configuration.
 * @param {'guided'|'kinetic'} mode Player-selected control mode.
 * @param {object} kineticDefaults Global kinetic shot configuration.
 * @returns {object} Level configuration used to create the engine session.
 */
export function levelForControlMode(level, mode, kineticDefaults) {
  if (mode === 'kinetic') {
    return {
      ...level,
      shotMechanic: level.shotMechanic ?? { ...kineticDefaults },
    }
  }
  if (!level.shotMechanic) return level
  const projected = { ...level }
  delete projected.shotMechanic
  return projected
}

import { shapesIntersect } from '../geometry/geometry.js'
import { verticalRangesOverlap } from './VerticalMovementSystem.js'

/**
 * Converts a force-field configuration into overlap geometry.
 *
 * @pure
 * @param {object} field Force-field configuration in world units.
 * @returns {object} Circle or rectangle collision shape.
 */
function fieldShape(field) {
  if (field.type === 'conveyor') {
    return { ...field, shape: 'rect' }
  }
  return {
    ...field,
    shape: 'circle',
    width: field.radius * 2,
    height: field.radius * 2,
  }
}

/**
 * Resolves combined environmental acceleration at a complete token shape.
 *
 * Force is returned in logical world units/second². Overlapping fields add
 * deterministically in configuration order.
 *
 * @pure
 * @param {object[]} fields Validated force-field configurations.
 * @param {object} token Complete token collision shape.
 * @returns {import('../types.js').Point} Combined acceleration vector.
 */
export function resolveForceFieldAcceleration(fields, token) {
  const acceleration = { x: 0, y: 0 }
  for (const field of fields ?? []) {
    if (
      Number.isFinite(token.elevation) &&
      !verticalRangesOverlap(
        token.elevation,
        token.collisionHeight ?? token.size,
        field,
      )
    ) {
      continue
    }
    if (!shapesIntersect(token, fieldShape(field))) continue
    if (field.type === 'conveyor') {
      const angle = (field.directionDegrees * Math.PI) / 180
      acceleration.x += Math.cos(angle) * field.force
      acceleration.y += Math.sin(angle) * field.force
      continue
    }
    const dx = token.x - field.x
    const dy = token.y - field.y
    const distance = Math.hypot(dx, dy)
    const direction = field.type === 'attractor' ? -1 : 1
    const strength = field.force * Math.max(0, 1 - distance / field.radius)
    if (distance > 0.0001) {
      acceleration.x += (dx / distance) * strength * direction
      acceleration.y += (dy / distance) * strength * direction
    }
  }
  return acceleration
}

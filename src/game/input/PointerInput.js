/**
 * Registers lightweight pointer listeners that only update input intent.
 *
 * @param {object} options Pointer dependencies and callbacks.
 * @param {HTMLElement} options.element Arena canvas.
 * @param {(point: import('../types.js').Point) => import('../types.js').Point} options.toWorld CSS-pixel to world transform.
 * @param {Function} options.onPress Press callback.
 * @param {Function} options.onMove Move callback.
 * @param {Function} options.onRelease Toggle-release callback.
 * @param {Function} options.onInterrupt Cancellation callback.
 * @param {() => boolean} [options.isActive] Active-attempt accessor.
 * @returns {() => void} Listener cleanup function.
 */
export function attachPointerInput({
  element,
  toWorld,
  onPress,
  onMove,
  onRelease,
  onInterrupt,
  isActive = () => false,
}) {
  /** @param {PointerEvent} event Browser pointer event. @returns {{x:number,y:number}} Logical world point. */
  const pointFor = (event) => toWorld({ x: event.clientX, y: event.clientY })
  /** @param {PointerEvent} event Browser pointer-down event. @returns {void} */
  const pointerDown = (event) => {
    const worldPoint = pointFor(event)
    if (isActive()) {
      onRelease(worldPoint, 'pointer-toggle', event)
      event.preventDefault()
      return
    }
    if (!onPress(worldPoint, event)) return
    event.preventDefault()
  }
  /** @param {PointerEvent} event Browser pointer-move event. @returns {void} */
  const pointerMove = (event) => {
    if (!isActive()) return
    onMove(pointFor(event), event)
    event.preventDefault()
  }
  /** @param {PointerEvent} event Browser pointer cancellation event. @returns {void} */
  const pointerCancel = (event) => {
    if (!isActive()) return
    onInterrupt('pointer-cancel')
    event.preventDefault()
  }

  element.addEventListener('pointerdown', pointerDown)
  element.addEventListener('pointermove', pointerMove)
  element.addEventListener('pointercancel', pointerCancel)

  return () => {
    element.removeEventListener('pointerdown', pointerDown)
    element.removeEventListener('pointermove', pointerMove)
    element.removeEventListener('pointercancel', pointerCancel)
  }
}

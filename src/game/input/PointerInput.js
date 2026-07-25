export function attachPointerInput({
  element,
  toWorld,
  onPress,
  onMove,
  onRelease,
  onInterrupt,
  isActive = () => false,
}) {
  const pointFor = (event) => toWorld({ x: event.clientX, y: event.clientY })
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
  const pointerMove = (event) => {
    if (!isActive()) return
    onMove(pointFor(event), event)
    event.preventDefault()
  }
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

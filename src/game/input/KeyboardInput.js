export function attachKeyboardInput({
  target,
  controller,
  visibilityTarget = null,
}) {
  const keyDown = (event) => {
    const result = controller.keyDown(event.key, event.repeat)
    if (result.handled) event.preventDefault()
  }
  const keyUp = (event) => {
    if (controller.keyUp(event.key)) event.preventDefault()
  }
  const blur = () => controller.interrupt('window-blur')
  const visibilityChange = () => {
    if (visibilityTarget?.hidden) controller.interrupt('document-hidden')
  }

  target.addEventListener('keydown', keyDown)
  target.addEventListener('keyup', keyUp)
  target.addEventListener('blur', blur)
  visibilityTarget?.addEventListener('visibilitychange', visibilityChange)

  return () => {
    target.removeEventListener('keydown', keyDown)
    target.removeEventListener('keyup', keyUp)
    target.removeEventListener('blur', blur)
    visibilityTarget?.removeEventListener('visibilitychange', visibilityChange)
  }
}

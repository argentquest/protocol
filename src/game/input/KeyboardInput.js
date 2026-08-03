/**
 * Registers keyboard, focus, and visibility listeners for gameplay intent.
 *
 * @param {object} options Keyboard dependencies.
 * @param {Window|HTMLElement} options.target Keyboard event target.
 * @param {object} options.controller Input controller.
 * @param {Document|null} [options.visibilityTarget=null] Visibility event source.
 * @returns {() => void} Listener cleanup function.
 */
export function attachKeyboardInput({
  target,
  controller,
  visibilityTarget = null,
}) {
  /** @param {KeyboardEvent} event Browser keydown event. @returns {void} */
  const keyDown = (event) => {
    const result = controller.keyDown(event.key, event.repeat)
    if (result.handled) event.preventDefault()
  }
  /** @param {KeyboardEvent} event Browser keyup event. @returns {void} */
  const keyUp = (event) => {
    if (controller.keyUp(event.key)) event.preventDefault()
  }
  /** Interrupts active input when the browser window loses focus. */
  const blur = () => controller.interrupt('window-blur')
  /** Interrupts active input when the document becomes hidden. */
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

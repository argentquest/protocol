const directionKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

/**
 * @typedef {object} InputCallbacks
 * @property {(mode: 'pointer'|'keyboard') => void} [onActivate] Attempt-start callback.
 * @property {(reason: string) => void} [onRelease] Attempt-release callback.
 * @property {() => void} [onRestart] Manual-restart callback.
 * @property {(key: string) => void} [onPower] Power-key callback.
 * @property {(reason: string, wasActive: boolean) => void} [onInterrupt] Focus-loss callback.
 */

/**
 * Translates raw pointer and keyboard intent into mutable engine input state.
 *
 * No simulation, collision, scoring, or rendering work occurs in this layer.
 *
 * @param {import('../types.js').GameInputState|(() => import('../types.js').GameInputState)} inputState State or current-state accessor.
 * @param {InputCallbacks} [callbacks] Intent callbacks.
 * @returns {object} Input-controller operations.
 */
export function createInputController(inputState, callbacks = {}) {
  const getInputState =
    typeof inputState === 'function' ? inputState : () => inputState
  const {
    onActivate = () => {},
    onRelease = () => {},
    onRestart = () => {},
    onPower = () => {},
    onInterrupt = () => {},
  } = callbacks

  /** @param {'pointer'|'keyboard'} mode Requested control mode. @returns {void} */
  function activate(mode) {
    const inputState = getInputState()
    if (inputState.active) return false
    inputState.active = true
    inputState.mode = mode
    onActivate(mode)
    return true
  }

  /** @param {string} [reason='released'] Stable release reason. @returns {void} */
  function release(reason = 'released') {
    const inputState = getInputState()
    if (!inputState.active) return false
    inputState.active = false
    inputState.mode = null
    inputState.directions.clear()
    onRelease(reason)
    return true
  }

  /** @param {{x:number,y:number}} position Desired center in world units. @returns {void} */
  function setPointer(position) {
    const inputState = getInputState()
    inputState.desiredPosition.x = position.x
    inputState.desiredPosition.y = position.y
  }

  /** @param {string} key Normalized keyboard key. @param {boolean} [repeat=false] Auto-repeat state. @returns {void} */
  function keyDown(key, repeat = false) {
    const inputState = getInputState()
    if (directionKeys.has(key)) {
      inputState.directions.add(key)
      return { handled: true, action: 'direction' }
    }
    if (key === ' ') {
      if (repeat) return { handled: true, action: 'ignored-repeat' }
      if (inputState.active) release('keyboard-toggle')
      else activate('keyboard')
      return { handled: true, action: 'toggle' }
    }
    if (key.toLowerCase() === 'r') {
      onRestart()
      return { handled: true, action: 'restart' }
    }
    if (/^[1-9]$/.test(key)) {
      inputState.requestedPowerKey = key
      onPower(key)
      return { handled: true, action: 'power' }
    }
    return { handled: false, action: null }
  }

  /** @param {string} key Normalized keyboard key. @returns {void} */
  function keyUp(key) {
    const inputState = getInputState()
    if (!directionKeys.has(key)) return false
    inputState.directions.delete(key)
    return true
  }

  /** @param {string} reason Focus or visibility interruption reason. @returns {void} */
  function interrupt(reason) {
    const inputState = getInputState()
    const wasActive = release(reason)
    inputState.requestedPowerKey = null
    onInterrupt(reason, wasActive)
  }

  return {
    activate,
    release,
    setPointer,
    keyDown,
    keyUp,
    interrupt,
  }
}

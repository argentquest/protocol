const directionKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

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

  function activate(mode) {
    const inputState = getInputState()
    if (inputState.active) return false
    inputState.active = true
    inputState.mode = mode
    onActivate(mode)
    return true
  }

  function release(reason = 'released') {
    const inputState = getInputState()
    if (!inputState.active) return false
    inputState.active = false
    inputState.mode = null
    inputState.directions.clear()
    onRelease(reason)
    return true
  }

  function setPointer(position) {
    const inputState = getInputState()
    inputState.desiredPosition.x = position.x
    inputState.desiredPosition.y = position.y
  }

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

  function keyUp(key) {
    const inputState = getInputState()
    if (!directionKeys.has(key)) return false
    inputState.directions.delete(key)
    return true
  }

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

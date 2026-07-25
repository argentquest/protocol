import { describe, expect, it, vi } from 'vitest'
import { createInputController } from './InputController.js'
import { attachKeyboardInput } from './KeyboardInput.js'
import { attachPointerInput } from './PointerInput.js'

function inputState() {
  return {
    mode: null,
    active: false,
    desiredPosition: { x: 0, y: 0 },
    directions: new Set(),
    requestedPowerKey: null,
  }
}

function eventWith(type, properties) {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, properties)
  return event
}

describe('V2 input adapters', () => {
  it('toggles keyboard control with Space and tracks normalized direction state', () => {
    const state = inputState()
    const onActivate = vi.fn()
    const onRelease = vi.fn()
    const controller = createInputController(state, { onActivate, onRelease })

    controller.keyDown(' ', false)
    controller.keyDown('ArrowRight')
    controller.keyDown('ArrowDown')
    expect(state.active).toBe(true)
    expect(state.mode).toBe('keyboard')
    expect(state.directions).toEqual(new Set(['ArrowRight', 'ArrowDown']))

    controller.keyUp('ArrowRight')
    controller.keyDown(' ', false)
    expect(state.active).toBe(false)
    expect(state.directions.size).toBe(0)
    expect(onActivate).toHaveBeenCalledWith('keyboard')
    expect(onRelease).toHaveBeenCalledWith('keyboard-toggle')
  })

  it('maps restart and numbered powers without activating movement', () => {
    const state = inputState()
    const onRestart = vi.fn()
    const onPower = vi.fn()
    const controller = createInputController(state, { onRestart, onPower })

    expect(controller.keyDown('r').handled).toBe(true)
    expect(controller.keyDown('3').handled).toBe(true)
    expect(onRestart).toHaveBeenCalledOnce()
    expect(onPower).toHaveBeenCalledWith('3')
    expect(state.requestedPowerKey).toBe('3')
    expect(state.active).toBe(false)
  })

  it('interrupts active input on blur and document visibility loss', () => {
    const state = inputState()
    const onInterrupt = vi.fn()
    const controller = createInputController(state, { onInterrupt })
    const target = new EventTarget()
    const visibilityTarget = new EventTarget()
    Object.defineProperty(visibilityTarget, 'hidden', {
      configurable: true,
      value: true,
    })
    const detach = attachKeyboardInput({
      target,
      controller,
      visibilityTarget,
    })

    controller.activate('keyboard')
    target.dispatchEvent(new Event('blur'))
    controller.activate('keyboard')
    visibilityTarget.dispatchEvent(new Event('visibilitychange'))
    detach()

    expect(onInterrupt).toHaveBeenNthCalledWith(1, 'window-blur', true)
    expect(onInterrupt).toHaveBeenNthCalledWith(2, 'document-hidden', true)
    expect(state.active).toBe(false)
  })

  it('toggles pointer control on clicks and ignores button release', () => {
    const element = new EventTarget()
    let active = false
    const onPress = vi.fn(() => {
      active = true
      return true
    })
    const onMove = vi.fn()
    const onRelease = vi.fn(() => {
      active = false
    })
    const detach = attachPointerInput({
      element,
      toWorld: ({ x, y }) => ({ x: x / 2, y: y / 2 }),
      onPress,
      onMove,
      onRelease,
      onInterrupt: vi.fn(),
      isActive: () => active,
    })

    element.dispatchEvent(
      eventWith('pointerdown', { pointerId: 7, clientX: 100, clientY: 80 }),
    )
    element.dispatchEvent(
      eventWith('pointerup', { pointerId: 7, clientX: 100, clientY: 80 }),
    )
    element.dispatchEvent(
      eventWith('pointermove', { pointerId: 7, clientX: 120, clientY: 90 }),
    )
    element.dispatchEvent(
      eventWith('pointerdown', { pointerId: 7, clientX: 120, clientY: 90 }),
    )
    detach()

    expect(onPress).toHaveBeenCalledWith(
      { x: 50, y: 40 },
      expect.any(Event),
    )
    expect(onMove).toHaveBeenCalledWith(
      { x: 60, y: 45 },
      expect.any(Event),
    )
    expect(onRelease).toHaveBeenCalledWith(
      { x: 60, y: 45 },
      'pointer-toggle',
      expect.any(Event),
    )
    expect(active).toBe(false)
  })
})

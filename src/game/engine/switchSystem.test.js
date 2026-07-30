import { describe, expect, it, vi } from 'vitest'
import { microProtocols } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { GameEngine } from './GameEngine.js'
import { isSwitchActive, updateContactSwitches } from './SwitchSystem.js'

function sessionFor(activation = 'once') {
  const item = {
    id: 'switch-a',
    mediaId: 'switch-pad',
    shape: 'circle',
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    size: 40,
    activation,
    durationMs: 1000,
  }
  return {
    level: {
      token: { shape: 'circle', width: 20, height: 20, size: 20 },
      switches: [item],
      dynamicObstacles: [
        {
          id: 'barrier',
          mediaId: 'obstacle-switch-barrier',
          shape: 'rect',
          x: 300,
          y: 100,
          width: 30,
          height: 100,
          behavior: {
            type: 'switch',
            switchId: 'switch-a',
            initiallySolid: true,
          },
        },
      ],
    },
    token: { position: { x: 100, y: 100 } },
    collisions: { tokenToleranceUnits: 0 },
    hazardTimeMs: 500,
    switchStates: new Map([
      [
        'switch-a',
        { active: false, openUntilMs: null, contacting: false },
      ],
    ]),
    dynamicObstacles: [],
  }
}

describe('contact switch system', () => {
  it('edge-triggers one-shot switches and immediately opens linked barriers', () => {
    const session = sessionFor('once')

    expect(updateContactSwitches(session)).toHaveLength(1)
    expect(session.switchStates.get('switch-a')).toMatchObject({
      active: true,
      contacting: true,
    })
    expect(session.dynamicObstacles[0]).toMatchObject({
      state: 'open',
      solid: false,
    })
    expect(updateContactSwitches(session)).toHaveLength(0)
  })

  it('expires timed switch state using hazard simulation milliseconds', () => {
    const session = sessionFor('timed')
    updateContactSwitches(session)
    const state = session.switchStates.get('switch-a')

    expect(state.openUntilMs).toBe(1500)
    expect(isSwitchActive(state, 1499)).toBe(true)
    expect(isSwitchActive(state, 1500)).toBe(false)
  })

  it('toggles only after contact is released and entered again', () => {
    const session = sessionFor('toggle')
    updateContactSwitches(session)
    session.token.position = { x: 10, y: 10 }
    updateContactSwitches(session)
    session.token.position = { x: 100, y: 100 }
    updateContactSwitches(session)

    expect(session.switchStates.get('switch-a').active).toBe(false)
    expect(session.dynamicObstacles[0].solid).toBe(true)
  })

  it('emits switch activation from the complete engine flow', () => {
    const protocol = microProtocols.find((item) => item.id === 'switchback')
    const generated = generateLevel(protocol.level)
    const engine = new GameEngine(generated, {
      generate: (level) => level,
    })
    const listener = vi.fn()
    engine.events.subscribe('switch.activated', listener)
    const item = generated.switches[0]
    engine.session.token.position = { x: item.x, y: item.y }
    engine.session.token.previousPosition = { x: item.x, y: item.y }
    engine.session.token.lastSafePosition = { x: item.x, y: item.y }
    engine.session.input.desiredPosition = { x: item.x, y: item.y }
    engine.startAttempt('pointer')
    engine.step(1000 / 60)

    expect(listener).toHaveBeenCalledOnce()
    expect(engine.session.dynamicObstacles[0].solid).toBe(false)
  })
})

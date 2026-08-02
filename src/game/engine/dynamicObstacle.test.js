import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import {
  dynamicObstacleEnvelope,
  resolveDynamicObstacle,
} from './DynamicObstacleSystem.js'
import { GameEngine } from './GameEngine.js'

function obstacle(behavior, overrides = {}) {
  return {
    id: 'dynamic-a',
    mediaId: 'obstacle-phase-gate',
    shape: 'rect',
    x: 500,
    y: 500,
    width: 100,
    height: 20,
    behavior,
    ...overrides,
  }
}

describe('dynamic obstacle behaviors', () => {
  it('resolves deterministic phase states with an explicit warning window', () => {
    const gate = obstacle({
      type: 'phase',
      cycleMs: 4000,
      solidMs: 1500,
      warningMs: 500,
      offsetMs: 0,
    })

    expect(resolveDynamicObstacle(gate, 0)).toMatchObject({
      state: 'solid',
      solid: true,
    })
    expect(resolveDynamicObstacle(gate, 2000)).toMatchObject({
      state: 'open',
      solid: false,
    })
    expect(resolveDynamicObstacle(gate, 3700)).toMatchObject({
      state: 'warning',
      solid: false,
    })
    expect(resolveDynamicObstacle(gate, 4000)).toMatchObject({
      state: 'solid',
      solid: true,
    })
  })

  it('moves orbiters around configured elliptical radii', () => {
    const orbiter = obstacle(
      {
        type: 'orbit',
        radiusX: 120,
        radiusY: 60,
        periodMs: 4000,
        phase: 0,
      },
      { shape: 'circle', width: 30, height: 30 },
    )

    expect(resolveDynamicObstacle(orbiter, 0)).toMatchObject({
      x: 620,
      y: 500,
      solid: true,
    })
    expect(resolveDynamicObstacle(orbiter, 1000).x).toBeCloseTo(500)
    expect(resolveDynamicObstacle(orbiter, 1000).y).toBeCloseTo(560)
  })

  it('pulses authoritative collision dimensions within configured bounds', () => {
    const pulse = obstacle({
      type: 'pulse',
      minScale: 0.5,
      maxScale: 1.5,
      periodMs: 4000,
      phase: -Math.PI / 2,
    })

    expect(resolveDynamicObstacle(pulse, 0)).toMatchObject({
      width: 50,
      height: 10,
    })
    expect(resolveDynamicObstacle(pulse, 2000)).toMatchObject({
      width: 150,
      height: 30,
    })
    expect(dynamicObstacleEnvelope(pulse)[0]).toMatchObject({
      width: 150,
      height: 30,
    })
  })

  it('opens switch barriers from engine-owned switch state', () => {
    const barrier = obstacle({
      type: 'switch',
      switchId: 'switch-a',
      initiallySolid: true,
    })

    expect(resolveDynamicObstacle(barrier, 1000).solid).toBe(true)
    expect(
      resolveDynamicObstacle(
        barrier,
        1000,
        new Map([
          ['switch-a', { active: true, openUntilMs: null }],
        ]),
      ),
    ).toMatchObject({ state: 'open', solid: false })
  })

  it('validates full orbit extents through deterministic envelope shapes', () => {
    const orbiter = obstacle({
      type: 'orbit',
      radiusX: 120,
      radiusY: 60,
      periodMs: 4000,
      phase: 0,
    })

    expect(dynamicObstacleEnvelope(orbiter)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 380, y: 500 }),
        expect.objectContaining({ x: 620, y: 500 }),
        expect.objectContaining({ x: 500, y: 440 }),
        expect.objectContaining({ x: 500, y: 560 }),
      ]),
    )
  })

  it('keeps open phase gates non-solid and collides when they phase in', () => {
    const generated = generateLevel(levels[32])
    generated.dynamicObstacles = [
      {
        ...generated.dynamicObstacles[0],
        behavior: {
          type: 'phase',
          cycleMs: 3000,
          solidMs: 1000,
          warningMs: 200,
          offsetMs: 1000,
        },
      },
    ]
    const gate = generated.dynamicObstacles[0]
    const engine = new GameEngine(generated, {
      generate: (level) => level,
    })
    engine.session.token.position = { x: gate.x, y: gate.y }
    engine.session.token.previousPosition = { x: gate.x, y: gate.y }
    engine.session.token.lastSafePosition = { x: gate.x, y: gate.y }
    engine.session.input.desiredPosition = { x: gate.x, y: gate.y }
    engine.startAttempt('pointer')

    expect(engine.step(1000).collision).toBe(false)
    expect(engine.session.dynamicObstacles[0].state).toBe('open')

    expect(engine.step(1200).collision).toBe(true)
    expect(engine.session.dynamicObstacles[0].state).toBe('solid')
  })
})

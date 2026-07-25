import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { FixedStepLoop } from './FixedStepLoop.js'
import { GameEngine } from './GameEngine.js'
import { createGameEventBus } from './GameEvents.js'
import { createGameStateMachine } from './GameStateMachine.js'
import { createLevelSession } from './createLevelSession.js'

describe('V2 engine foundation', () => {
  it('emits discrete events and supports unsubscription and disposal', () => {
    const bus = createGameEventBus()
    const listener = vi.fn()
    const unsubscribe = bus.subscribe('collision', listener)
    bus.emit('collision', { count: 1 })
    unsubscribe()
    bus.emit('collision', { count: 2 })
    bus.dispose()
    bus.emit('collision', { count: 3 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0]).toEqual({
      type: 'collision',
      payload: { count: 1 },
    })
    expect(() => bus.subscribe('collision', listener)).toThrow(/disposed/)
  })

  it('enforces explicit gameplay transitions and pause restoration', () => {
    const transitions = []
    const machine = createGameStateMachine('loading', (transition) =>
      transitions.push(transition),
    )

    machine.transition('loaded')
    machine.transition('activate')
    machine.transition('pause')
    expect(machine.state).toBe('paused')
    machine.transition('resume')
    expect(machine.state).toBe('active-main')
    machine.transition('main-reached')
    machine.transition('bonus-offered')
    machine.transition('pursue')
    machine.transition('activate')
    machine.transition('bonus-reached')
    machine.transition('no-bonus')

    expect(machine.state).toBe('completed')
    expect(transitions.map((transition) => transition.state)).toContain('bonus-ready')
    expect(() => machine.transition('activate')).toThrow(/Invalid game transition/)
  })

  it('runs fixed updates independently from render frames and clamps long gaps', () => {
    const updates = []
    const renders = []
    const loop = new FixedStepLoop({
      updatesPerSecond: 60,
      maximumFrameDeltaMs: 100,
      update: (step) => updates.push(step),
      render: (interpolation) => renders.push(interpolation),
    })
    loop.start(0)

    const first = loop.advance(50)
    const clamped = loop.advance(1050)

    expect(first.updates).toBe(3)
    expect(clamped.frameDelta).toBe(100)
    expect(clamped.updates).toBe(6)
    expect(updates.every((step) => step === 1000 / 60)).toBe(true)
    expect(renders).toHaveLength(2)
  })

  it('creates isolated sessions from one deterministic generated layout', () => {
    const generated = generateLevel(levels[0])
    const first = createLevelSession(generated, { generatedLevel: generated })
    const second = createLevelSession(generated, {
      generatedLevel: generated,
      attemptNumber: 2,
    })

    first.token.position.x += 10
    first.input.directions.add('ArrowRight')

    expect(second.token.position).toEqual(generated.startPoint)
    expect(second.input.directions.size).toBe(0)
    expect(first.level.obstacles).toEqual(second.level.obstacles)
    expect(second.attemptNumber).toBe(2)
  })

  it('starts, snapshots, and restarts without regenerating the course', () => {
    let now = 1000
    const engine = new GameEngine(levels[0], { clock: () => now })
    const events = []
    engine.events.subscribe('*', (event) => events.push(event.type))
    const obstacleLayout = structuredClone(engine.session.level.obstacles)

    engine.startAttempt('keyboard')
    now = 2250
    expect(engine.snapshot()).toMatchObject({
      phase: 'active-main',
      elapsedMs: 1250,
      collisions: 0,
    })
    engine.restart('manual')

    expect(engine.machine.state).toBe('ready')
    expect(engine.session.attemptNumber).toBe(2)
    expect(engine.session.level.obstacles).toEqual(obstacleLayout)
    expect(events).toContain('attempt.started')
    expect(events).toContain('attempt.restarted')
  })

  it('disposes sessions and event listeners idempotently', () => {
    const engine = new GameEngine(levels[0])
    const disposed = vi.fn()
    engine.events.subscribe('engine.disposed', disposed)
    engine.dispose()
    engine.dispose()

    expect(disposed).toHaveBeenCalledOnce()
    expect(engine.session.disposed).toBe(true)
  })

  it('applies collision penalties and restarts after the configured maximum', () => {
    const generated = generateLevel(levels[0])
    generated.obstacles = [
      {
        id: 'test-wall',
        shape: 'rect',
        x: generated.startPoint.x + 45,
        y: generated.startPoint.y,
        width: 4,
        height: 100,
        mediaId: 'obstacle-static-rect',
      },
    ]
    generated.movement = {
      maximumSpeed: 1000,
      acceleration: 100000,
      deceleration: 100000,
      keyboardSpeed: 1000,
    }
    const engine = new GameEngine(generated, {
      generate: (level) => level,
    })
    const collisions = []
    engine.events.subscribe('collision.started', (event) =>
      collisions.push(event.payload),
    )
    engine.startAttempt('pointer')
    engine.session.input.desiredPosition = {
      x: generated.startPoint.x + 100,
      y: generated.startPoint.y,
    }

    for (let hit = 0; hit < 3; hit += 1) {
      const result = engine.step(100)
      if (hit < 2) {
        expect(result.restarted).toBe(false)
        engine.session.collisions.latched = false
      } else {
        expect(result.restarted).toBe(true)
      }
    }

    expect(collisions.map((collision) => collision.scoreMultiplier)).toEqual([
      0.8, 0.6, 0.4,
    ])
    expect(engine.machine.state).toBe('ready')
    expect(engine.session.attemptNumber).toBe(2)
    expect(engine.session.collisions.count).toBe(0)
  })

  it('keeps the engine boundary free of UI, renderer, audio, and DOM imports', async () => {
    const engineDirectory = path.resolve('src', 'game', 'engine')
    const files = (await readdir(engineDirectory)).filter(
      (fileName) => fileName.endsWith('.js') && !fileName.endsWith('.test.js'),
    )
    const sources = await Promise.all(
      files.map((fileName) => readFile(path.join(engineDirectory, fileName), 'utf8')),
    )

    for (const source of sources) {
      expect(source).not.toMatch(/from ['"](?:react|pixi\.js|howler)/)
      expect(source).not.toMatch(/\b(?:window|document|localStorage)\b/)
    }
  })
})

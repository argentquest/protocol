import { describe, expect, it, vi } from 'vitest'
import { levels, powerups } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { advanceTrackingObstacle, currentMovingObstacle } from '../geometry/geometry.js'
import { GameEngine } from './GameEngine.js'
import {
  advanceHazards,
  validateHazardEnvelopes,
} from './HazardSystem.js'
import {
  activatePower,
  collectContactCoins,
  expirePowers,
} from './PowerSystem.js'
import { createLevelSession } from './createLevelSession.js'

function poweredLevel() {
  const generated = generateLevel(levels[0])
  return {
    ...generated,
    obstacles: [],
    movingObstacles: [
      {
        id: 'scanner',
        shape: 'circle',
        x: 700,
        y: 700,
        width: 30,
        height: 30,
        axis: 'x',
        amplitude: 80,
        periodMs: 1000,
        phase: 0,
        mediaId: 'obstacle-moving-circle',
      },
    ],
    trackingObstacles: [],
    coins: [
      {
        id: 'nearby',
        shape: 'circle',
        x: generated.startPoint.x + 150,
        y: generated.startPoint.y,
        width: 30,
        height: 30,
        size: 30,
        value: 2,
        mediaId: 'coin-standard',
      },
    ],
  }
}

describe('V2 hazards, coins, and powers', () => {
  it('derives deterministic moving hazards from scaled simulation time', () => {
    const obstacle = poweredLevel().movingObstacles[0]
    expect(currentMovingObstacle(obstacle, 250).x).toBe(780)
    expect(currentMovingObstacle(obstacle, 1250).x).toBeCloseTo(780)

    const level = poweredLevel()
    const first = createLevelSession(level, { generatedLevel: level })
    const second = createLevelSession(level, { generatedLevel: level })
    expect(advanceHazards(first, 100, 0.35)).toEqual(
      advanceHazards(second, 100, 0.35),
    )
    expect(first.hazardTimeMs).toBe(35)
  })

  it('turns tracking hazards gradually and keeps them inside their zone', () => {
    const obstacle = {
      id: 'hunter',
      x: 50,
      y: 50,
      width: 20,
      height: 20,
      maxSpeed: 100,
      acceleration: 1000,
      turnRateDegreesPerSecond: 90,
      zone: { x: 0, y: 0, width: 100, height: 100 },
    }
    const state = advanceTrackingObstacle(
      obstacle,
      { x: 50, y: 50, velocityX: 100, velocityY: 0, headingRadians: 0 },
      { x: 50, y: 0 },
      100,
    )
    expect(state.headingRadians).toBeCloseTo(-Math.PI / 40)
    let bounded = state
    for (let index = 0; index < 200; index += 1) {
      bounded = advanceTrackingObstacle(obstacle, bounded, { x: 1000, y: 1000 }, 50)
    }
    expect(bounded.x).toBeGreaterThanOrEqual(10)
    expect(bounded.x).toBeLessThanOrEqual(90)
    expect(bounded.y).toBeGreaterThanOrEqual(10)
    expect(bounded.y).toBeLessThanOrEqual(90)
  })

  it('collides across the complete moving-hazard sweep for each fixed step', () => {
    const level = poweredLevel()
    level.startPoint = { x: 500, y: 500 }
    level.movingObstacles = [
      {
        id: 'crossing',
        shape: 'circle',
        x: 500,
        y: 500,
        width: 20,
        height: 20,
        axis: 'x',
        amplitude: 100,
        periodMs: 200,
        phase: -Math.PI / 2,
        mediaId: 'obstacle-moving-circle',
      },
    ]

    const clearEngine = new GameEngine(level, { generate: (value) => value })
    clearEngine.startAttempt('pointer')
    clearEngine.session.input.desiredPosition = { ...level.startPoint }

    const clearResult = clearEngine.step(100)
    expect(clearEngine.session.movingObstacles[0].currentX).toBeCloseTo(600)
    expect(clearResult.collision).toBe(true)

    const contactEngine = new GameEngine(level, { generate: (value) => value })
    contactEngine.startAttempt('pointer')
    contactEngine.session.input.desiredPosition = { ...level.startPoint }

    const contactResult = contactEngine.step(50)
    expect(contactEngine.session.movingObstacles[0].currentX).toBeCloseTo(500)
    expect(contactResult.collision).toBe(true)
  })

  it('validates every configured hazard movement envelope', () => {
    for (const level of levels) {
      expect(validateHazardEnvelopes(level), level.id).toEqual([])
    }
  })

  it('claims course coins once and supports configured magnet range', () => {
    const level = poweredLevel()
    const session = createLevelSession(level, { generatedLevel: level })
    expect(collectContactCoins(session, 190).map((coin) => coin.id)).toEqual([
      'nearby',
    ])
    expect(collectContactCoins(session, 190)).toEqual([])
  })

  it('consumes configured power charges and expires route scan state', () => {
    const level = poweredLevel()
    const session = createLevelSession(level, { generatedLevel: level })
    session.powerInventory = new Map([['route-scan', 1]])
    const activated = activatePower(session, powerups, '5', 1000)
    expect(activated).toMatchObject({ activated: true, remaining: 0 })
    expect(session.routeScanPath.length).toBeGreaterThan(1)
    expect(activatePower(session, powerups, '5', 1001).activated).toBe(false)
    expect(expirePowers(session, 6000, [])).toHaveLength(1)
    expect(session.routeScanPath).toBeNull()
  })

  it('applies shields, Slow Field, Coin Magnet, and per-power events in engine', () => {
    let now = 1000
    const level = poweredLevel()
    level.obstacles = [
      {
        id: 'wall',
        shape: 'rect',
        x: level.startPoint.x + 45,
        y: level.startPoint.y,
        width: 4,
        height: 100,
        mediaId: 'obstacle-static-rect',
      },
    ]
    const engine = new GameEngine(level, {
      clock: () => now,
      generate: (value) => value,
      powerups,
      inventory: {
        'obstacle-shield': 1,
        'slow-field': 1,
        'coin-magnet': 1,
      },
    })
    const coinClaimed = vi.fn()
    engine.events.subscribe('coin.claimed', coinClaimed)
    engine.startAttempt('pointer')
    expect(engine.activatePowerByKey('1').activated).toBe(true)
    expect(engine.activatePowerByKey('3').activated).toBe(true)
    expect(engine.activatePowerByKey('4').activated).toBe(true)
    engine.session.input.desiredPosition = {
      x: level.startPoint.x + 100,
      y: level.startPoint.y,
    }
    const result = engine.step(100)
    expect(result.collision).toBe(false)
    expect(engine.session.hazardTimeMs).toBe(35)
    expect(coinClaimed).toHaveBeenCalledOnce()

    engine.restart('manual')
    engine.startAttempt('keyboard')
    engine.step(16)
    expect(coinClaimed).toHaveBeenCalledOnce()
  })

  it('allows boundary passage during Full Shield and recovers safely on expiration', () => {
    let now = 1000
    const level = poweredLevel()
    level.startPoint = { x: 1540, y: 500 }
    const engine = new GameEngine(level, {
      clock: () => now,
      generate: (value) => value,
      powerups,
      inventory: { 'full-shield': 1 },
    })
    engine.startAttempt('pointer')
    expect(engine.activatePowerByKey('2').activated).toBe(true)
    engine.session.input.desiredPosition = { x: 1700, y: 500 }
    expect(engine.step(100).collision).toBe(false)
    expect(engine.session.token.position.x).toBeGreaterThan(1549)

    engine.session.input.active = false
    now = 4000
    engine.step(16)
    expect(engine.session.token.position).toEqual(
      engine.session.token.lastSafePosition,
    )
    expect(engine.session.token.position.x).toBe(1540)
  })

  it('emits completion and bonus coin rewards only once per engine campaign', () => {
    const level = poweredLevel()
    level.bonusTargets = [
      {
        id: 'relay-a',
        shape: 'circle',
        x: 500,
        y: 500,
        width: 30,
        height: 30,
      },
    ]
    const engine = new GameEngine(level, { generate: (value) => value })
    const reward = vi.fn()
    engine.events.subscribe('reward.claimed', reward)
    engine.session.targets.earnedBonuses = 1
    const score = { finalScore: 100, attainableMaximum: 100 }
    engine.finishCompletion(score, false)
    engine.finishCompletion(score, false)
    expect(reward).toHaveBeenCalledTimes(2)
    expect(reward.mock.calls[0][0].payload.kind).toBe('completion')
    expect(reward.mock.calls[1][0].payload.kind).toBe('bonus')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { GameEngine } from './GameEngine.js'
import {
  advanceKineticToken,
  launchVelocity,
  reflectVelocity,
} from './KineticMovementSystem.js'
import { rateShotResult, resolveShotGoals } from './ShotGoalSystem.js'

const shotMechanic = {
  minimumLaunchSpeed: 200,
  maximumLaunchSpeed: 800,
  aimDistanceForMaximumSpeed: 200,
  dragPerSecond: 100,
  stopSpeed: 36,
  restitution: 0.8,
  maximumImpactsPerStep: 4,
}

/** @returns {object} Minimal generated kinetic level for engine integration tests. */
function engineLevel(overrides = {}) {
  return {
    id: 'level-999',
    number: 999,
    name: 'Kinetic test',
    seed: 'kinetic-test',
    startPoint: { x: 100, y: 450 },
    arena: { shape: 'rect', margin: 0, cornerRadius: 0 },
    token: { shape: 'circle', size: 20, width: 20, height: 20 },
    movement: {
      maximumSpeed: 800,
      acceleration: 1000,
      deceleration: 1000,
      keyboardSpeed: 400,
    },
    shotMechanic,
    mainTarget: {
      id: 'main-target',
      mediaId: 'target-main',
      shape: 'circle',
      x: 1500,
      y: 450,
      size: 40,
      width: 40,
      height: 40,
    },
    obstacles: [],
    movingObstacles: [],
    trackingObstacles: [],
    dynamicObstacles: [],
    forceFields: [],
    switches: [],
    coins: [],
    bonusTargets: [],
    scoring: {
      baseMaximum: 1000,
      parTimeMs: 10000,
      parDistance: 1400,
      timeWeight: 0.5,
      distanceWeight: 0.5,
      collisionPenaltyRate: 0.2,
      maximumCollisions: 3,
    },
    bonuses: {
      maximumTargets: 0,
      rewardPerTarget: 0,
      failurePenaltyRate: 0,
    },
    rewards: { completionCoins: 0, bonusCoinsPerTarget: 0 },
    ...overrides,
  }
}

/**
 * Creates the minimum mutable session needed by the pure kinetic resolver.
 * Coordinates and velocities use logical world units and units/second.
 *
 * @param {object} [options] Session overrides.
 * @returns {object} Kinetic test session.
 */
function kineticSession({
  position = { x: 100, y: 100 },
  velocity = { x: 300, y: 0 },
  obstacles = [],
} = {}) {
  return {
    level: {
      arena: { shape: 'rect', margin: 0, cornerRadius: 0 },
      token: { shape: 'circle', size: 20, width: 20, height: 20 },
      shotMechanic,
    },
    token: {
      position: { ...position },
      previousPosition: { ...position },
      lastSafePosition: { ...position },
      lastRestPosition: { ...position },
      velocity: { ...velocity },
    },
    input: { active: true, mode: 'pointer' },
    kinetic: { phase: 'in-flight' },
    collisions: { tokenToleranceUnits: 0 },
    distance: { actual: 0 },
    obstacles,
  }
}

describe('kinetic shot movement', () => {
  it('builds bounded launch velocity and reflects around a normal', () => {
    expect(launchVelocity({ x: 0, y: 0 }, shotMechanic)).toBeNull()
    expect(launchVelocity({ x: 400, y: 0 }, shotMechanic)).toEqual({
      x: 800,
      y: 0,
    })
    expect(reflectVelocity({ x: 100, y: 0 }, { x: -1, y: 0 }, 0.8)).toEqual({
      x: -80,
      y: 0,
    })
  })

  it('rolls downhill only when projected gravity exceeds surface friction', () => {
    const session = kineticSession({ velocity: { x: 0, y: 0 } })
    session.level.verticalPhysics = {
      gravity: 900,
      maximumFallSpeed: 1400,
      groundHeight: 0,
      maximumStepHeight: 12,
    }
    session.level.terrainSurfaces = [
      {
        id: 'slope',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        cornerElevations: {
          northWest: 0,
          northEast: 100,
          southEast: 100,
          southWest: 0,
        },
        friction: 40,
      },
    ]
    session.token.elevation = 50
    session.token.previousElevation = 50
    session.vertical = { grounded: true, surfaceId: 'slope' }
    session.kinetic.phase = 'resting'

    const result = advanceKineticToken(session, 1000 / 60, [])

    expect(result.moved).toBe(true)
    expect(session.token.position.x).toBeLessThan(100)
    expect(session.kinetic.phase).toBe('in-flight')
  })

  it('ricochets from the arena boundary without a penalty collision', () => {
    const session = kineticSession({
      position: { x: 1580, y: 450 },
      velocity: { x: 500, y: 0 },
    })
    const result = advanceKineticToken(session, 100, [])

    expect(result.impacts).toHaveLength(1)
    expect(result.impacts[0]).toMatchObject({ kind: 'boundary', response: 'rebound' })
    expect(session.token.velocity.x).toBeLessThan(0)
    expect(session.token.position.x).toBeLessThanOrEqual(1590)
    expect(result.collision).toBe(false)
  })

  it('supports arrestors and snaps low speed to exact zero without sliding', () => {
    const arrestor = {
      id: 'catch',
      shape: 'rect',
      x: 150,
      y: 100,
      width: 10,
      height: 100,
      kineticResponse: { type: 'stop' },
    }
    const caught = kineticSession({
      velocity: { x: 600, y: 0 },
      obstacles: [arrestor],
    })
    const caughtResult = advanceKineticToken(caught, 100, [arrestor])
    expect(caughtResult.impacts[0]).toMatchObject({
      obstacleId: 'catch',
      response: 'stop',
    })
    expect(caught.token.velocity).toEqual({ x: 0, y: 0 })
    expect(caught.kinetic.phase).toBe('resting')

    const slowing = kineticSession({ velocity: { x: 40, y: 0 } })
    advanceKineticToken(slowing, 100, [])
    expect(slowing.token.velocity).toEqual({ x: 0, y: 0 })
  })

  it('resets hazards to the last resting checkpoint and stops exactly', () => {
    const resetter = {
      id: 'pit',
      shape: 'rect',
      x: 150,
      y: 100,
      width: 10,
      height: 100,
      kineticResponse: { type: 'reset' },
    }
    const session = kineticSession({
      position: { x: 100, y: 100 },
      velocity: { x: 600, y: 0 },
      obstacles: [resetter],
    })
    session.token.lastRestPosition = { x: 70, y: 80 }
    const result = advanceKineticToken(session, 100, [resetter])

    expect(result.impacts[0].response).toBe('reset')
    expect(session.token.position).toEqual({ x: 70, y: 80 })
    expect(session.token.velocity).toEqual({ x: 0, y: 0 })
    expect(session.token.lastRestPosition).toEqual({ x: 70, y: 80 })
  })

  it('rates authored shot goals deterministically', () => {
    const goals = resolveShotGoals({
      shotGoals: { perfectShots: 2, par: 4, maximumShots: 8 },
    })
    expect(rateShotResult(2, goals)).toBe('perfect')
    expect(rateShotResult(3, goals)).toBe('under-par')
    expect(rateShotResult(4, goals)).toBe('par')
    expect(rateShotResult(5, goals)).toBe('over-par')
  })

  it('queues launch intent and consumes it on the next engine step', () => {
    const level = {
      id: 'level-999',
      number: 999,
      name: 'Kinetic test',
      startPoint: { x: 100, y: 450 },
      arena: { shape: 'rect', margin: 0, cornerRadius: 0 },
      token: { shape: 'circle', size: 20, width: 20, height: 20 },
      movement: {
        maximumSpeed: 800,
        acceleration: 1000,
        deceleration: 1000,
        keyboardSpeed: 400,
      },
      shotMechanic,
      mainTarget: {
        id: 'main-target',
        mediaId: 'target-main',
        shape: 'circle',
        x: 1500,
        y: 450,
        size: 40,
        width: 40,
        height: 40,
      },
      obstacles: [],
      movingObstacles: [],
      trackingObstacles: [],
      dynamicObstacles: [],
      forceFields: [],
      switches: [],
      coins: [],
      bonusTargets: [],
      scoring: {
        baseMaximum: 1000,
        parTimeMs: 10000,
        timeWeight: 0.5,
        distanceWeight: 0.5,
        collisionPenaltyRate: 0.2,
        maximumCollisions: 3,
      },
      bonuses: {
        maximumTargets: 0,
        rewardPerTarget: 0,
        failurePenaltyRate: 0,
      },
      rewards: { completionCoins: 0, bonusCoinsPerTarget: 0 },
    }
    const engine = new GameEngine(level, { generate: (value) => value })
    const launched = vi.fn()
    engine.events.subscribe('shot.launched', launched)

    expect(engine.beginKineticAim('keyboard')).toBe(true)
    expect(engine.queueKineticShot({ x: 200, y: 0 }, 'keyboard')).toBe(true)
    expect(engine.session.token.velocity).toEqual({ x: 0, y: 0 })
    engine.step(1000 / 60)

    expect(launched).toHaveBeenCalledOnce()
    expect(engine.session.kinetic.shotsTaken).toBe(1)
    expect(engine.session.token.position.x).toBeGreaterThan(100)
    expect(engine.session.collisions.count).toBe(0)
    expect(engine.activatePowerByKey('1')).toEqual({
      activated: false,
      reason: 'kinetic-mode',
    })
  })

  it('waits for the final shot to settle before restarting an exhausted attempt', () => {
    const engine = new GameEngine(
      engineLevel({
        shotMechanic: { ...shotMechanic, dragPerSecond: 1000 },
        shotGoals: { par: 1, perfectShots: 1, maximumShots: 1 },
      }),
      { generate: (value) => value },
    )
    const restarted = vi.fn()
    engine.events.subscribe('attempt.restarted', restarted)

    engine.beginKineticAim('keyboard')
    engine.queueKineticShot({ x: 200, y: 0 }, 'keyboard')
    engine.step(1000)

    expect(restarted).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ reason: 'maximum-shots' }) }),
    )
    expect(engine.machine.state).toBe('ready')
    expect(engine.session.attemptNumber).toBe(2)
  })

  it('allows the final permitted shot to complete before applying the limit', () => {
    const engine = new GameEngine(
      engineLevel({
        shotMechanic: { ...shotMechanic, dragPerSecond: 1000 },
        shotGoals: { par: 1, perfectShots: 1, maximumShots: 1 },
        mainTarget: {
          id: 'main-target',
          mediaId: 'target-main',
          shape: 'circle',
          x: 200,
          y: 450,
          size: 40,
          width: 40,
          height: 40,
        },
      }),
      { generate: (value) => value },
    )
    const completed = vi.fn()
    engine.events.subscribe('attempt.completed', completed)

    engine.beginKineticAim('keyboard')
    engine.queueKineticShot({ x: 200, y: 0 }, 'keyboard')
    const result = engine.step(1000)

    expect(result.targetReached).toBe(true)
    expect(engine.machine.state).toBe('completed')
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          shotsTaken: 1,
          shotPar: 1,
          shotRating: 'perfect',
        }),
      }),
    )
  })
})

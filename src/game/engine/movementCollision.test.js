import { describe, expect, it } from 'vitest'
import {
  advanceTokenWithCollisions,
  tokenContainsPoint,
} from './CollisionSystem.js'
import { advanceTokenMotion } from './MovementSystem.js'

const movement = {
  maximumSpeed: 300,
  acceleration: 600,
  deceleration: 900,
  keyboardSpeed: 240,
}

function createSession({
  position = { x: 20, y: 50 },
  obstacles = [],
  maximumCollisions = 3,
  collisionTolerance = 0,
} = {}) {
  return {
    level: {
      arena: { shape: 'rect', margin: 0, cornerRadius: 0 },
      token: {
        shape: 'circle',
        width: 20,
        height: 20,
        size: 20,
      },
      movement: {
        maximumSpeed: 1000,
        acceleration: 100000,
        deceleration: 100000,
        keyboardSpeed: 1000,
      },
      obstacles,
      scoring: { maximumCollisions },
    },
    token: {
      position: { ...position },
      previousPosition: { ...position },
      lastSafePosition: { ...position },
      velocity: { x: 0, y: 0 },
    },
    input: {
      active: true,
      mode: 'pointer',
      desiredPosition: { x: 90, y: position.y },
      directions: new Set(),
    },
    collisions: {
      count: 0,
      latched: false,
      tokenToleranceUnits: collisionTolerance,
    },
    distance: { actual: 0 },
  }
}

describe('V2 movement and collision', () => {
  it('accelerates toward the pointer instead of snapping', () => {
    const first = advanceTokenMotion({
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      input: {
        mode: 'pointer',
        desiredPosition: { x: 500, y: 0 },
        directions: new Set(),
      },
      movement,
      stepMs: 1000 / 60,
    })
    const second = advanceTokenMotion({
      position: first.position,
      velocity: first.velocity,
      input: {
        mode: 'pointer',
        desiredPosition: { x: 500, y: 0 },
        directions: new Set(),
      },
      movement,
      stepMs: 1000 / 60,
    })

    expect(first.position.x).toBeGreaterThan(0)
    expect(first.position.x).toBeLessThan(1)
    expect(second.velocity.x).toBeGreaterThan(first.velocity.x)
    expect(second.velocity.x).toBeLessThanOrEqual(movement.maximumSpeed)
  })

  it('uses the same accelerated model for diagonal keyboard steering', () => {
    const result = advanceTokenMotion({
      position: { x: 50, y: 50 },
      velocity: { x: 0, y: 0 },
      input: {
        mode: 'keyboard',
        desiredPosition: { x: 50, y: 50 },
        directions: new Set(['ArrowRight', 'ArrowDown']),
      },
      movement,
      stepMs: 100,
    })

    expect(result.velocity.x).toBeCloseTo(result.velocity.y)
    expect(Math.hypot(result.velocity.x, result.velocity.y)).toBeLessThanOrEqual(
      movement.keyboardSpeed,
    )
  })

  it('does not move an inactive token', () => {
    const session = createSession()
    session.input.active = false
    const result = advanceTokenWithCollisions(session, 100)
    expect(result.moved).toBe(false)
    expect(session.token.position).toEqual({ x: 20, y: 50 })
  })

  it('detects a thin obstacle along swept movement and restores last safe position', () => {
    const obstacle = {
      shape: 'rect',
      x: 50,
      y: 50,
      width: 4,
      height: 80,
    }
    const session = createSession({ obstacles: [obstacle] })
    const result = advanceTokenWithCollisions(session, 100)

    expect(result.collision).toBe(true)
    expect(result.collisionType).toBe('obstacle')
    expect(session.token.position).toEqual({ x: 20, y: 50 })
    expect(session.collisions.count).toBe(1)
  })

  it('detects a dynamic obstacle crossing the token between fixed steps', () => {
    const previousObstacle = {
      id: 'fast-sweeper',
      shape: 'circle',
      x: 50,
      y: 20,
      width: 8,
      height: 8,
    }
    const currentObstacle = {
      ...previousObstacle,
      y: 80,
    }
    const session = createSession({ position: { x: 50, y: 50 } })
    session.input.desiredPosition = { x: 50, y: 50 }

    const result = advanceTokenWithCollisions(session, 1000 / 60, {
      obstacles: [currentObstacle],
      previousObstacles: [previousObstacle],
    })

    expect(result.collision).toBe(true)
    expect(result.collisionType).toBe('obstacle')
    expect(session.collisions.count).toBe(1)
  })

  it('uses the configured inset as collision tolerance', () => {
    const obstacle = {
      shape: 'circle',
      x: 59,
      y: 50,
      width: 4,
      height: 4,
    }
    const exactSession = createSession({
      position: { x: 50, y: 50 },
      obstacles: [obstacle],
    })
    exactSession.input.desiredPosition = { x: 50, y: 50 }
    expect(advanceTokenWithCollisions(exactSession, 16).collision).toBe(true)

    const tolerantSession = createSession({
      position: { x: 50, y: 50 },
      obstacles: [obstacle],
      collisionTolerance: 4,
    })
    tolerantSession.input.desiredPosition = { x: 50, y: 50 }
    expect(advanceTokenWithCollisions(tolerantSession, 16).collision).toBe(false)
  })

  it('latches continuous collision and rearms after safe movement', () => {
    const obstacle = {
      shape: 'rect',
      x: 50,
      y: 50,
      width: 4,
      height: 80,
    }
    const session = createSession({ obstacles: [obstacle] })
    advanceTokenWithCollisions(session, 100)
    const repeated = advanceTokenWithCollisions(session, 100)
    expect(repeated.collisionStarted).toBe(false)
    expect(session.collisions.count).toBe(1)

    session.input.desiredPosition = { x: 12, y: 50 }
    advanceTokenWithCollisions(session, 8)
    expect(session.collisions.latched).toBe(false)
    session.input.desiredPosition = { x: 90, y: 50 }
    const next = advanceTokenWithCollisions(session, 100)
    expect(next.collisionStarted).toBe(true)
    expect(session.collisions.count).toBe(2)
  })

  it('reports the configured maximum collision count', () => {
    const obstacle = {
      shape: 'rect',
      x: 50,
      y: 50,
      width: 4,
      height: 80,
    }
    const session = createSession({ obstacles: [obstacle] })
    for (let collision = 0; collision < 3; collision += 1) {
      const result = advanceTokenWithCollisions(session, 100)
      if (collision === 2) expect(result.maximumCollisions).toBe(true)
      session.collisions.latched = false
    }
    expect(session.collisions.count).toBe(3)
  })

  it('applies obstacle-only and full shield scopes independently', () => {
    const obstacle = {
      shape: 'rect',
      x: 50,
      y: 50,
      width: 4,
      height: 80,
    }
    const obstacleSession = createSession({ obstacles: [obstacle] })
    expect(
      advanceTokenWithCollisions(obstacleSession, 100, {
        obstacles: [obstacle],
        obstacleShield: true,
      }).collision,
    ).toBe(false)

    const boundarySession = createSession({ position: { x: 1585, y: 50 } })
    boundarySession.input.desiredPosition = { x: 1630, y: 50 }
    expect(
      advanceTokenWithCollisions(boundarySession, 100, {
        obstacleShield: true,
      }).collisionType,
    ).toBe('boundary')

    const fullShieldSession = createSession({ position: { x: 1585, y: 50 } })
    fullShieldSession.input.desiredPosition = { x: 1630, y: 50 }
    expect(
      advanceTokenWithCollisions(fullShieldSession, 100, {
        fullShield: true,
      }).collision,
    ).toBe(false)
  })

  it('tests activation against the complete token shape', () => {
    const token = {
      shape: 'circle',
      x: 50,
      y: 50,
      width: 20,
      height: 20,
    }
    expect(tokenContainsPoint(token, { x: 59.9, y: 50 })).toBe(true)
    expect(tokenContainsPoint(token, { x: 61, y: 50 })).toBe(false)
  })
})

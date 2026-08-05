import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { createLevelSession } from './createLevelSession.js'
import { GameEngine } from './GameEngine.js'
import {
  activateContactRamp,
  advanceVerticalMotion,
  verticalRangesOverlap,
} from './VerticalMovementSystem.js'

describe('V3 vertical movement', () => {
  it('preserves infinite-height collision for obstacles without V3 metadata', () => {
    expect(verticalRangesOverlap(500, 40, { elevation: 0 })).toBe(true)
    expect(
      verticalRangesOverlap(80, 40, {
        elevation: 0,
        collisionHeight: 60,
      }),
    ).toBe(false)
  })

  it('launches from the Round Green ramp and lands exactly', () => {
    const session = createLevelSession(levels[99])
    const ramp = session.level.ramps[0]
    const radians = (ramp.directionDegrees * Math.PI) / 180
    session.token.position = { x: ramp.x, y: ramp.y }
    session.token.velocity = {
      x: Math.cos(radians) * 400,
      y: Math.sin(radians) * 400,
    }

    expect(activateContactRamp(session)?.id).toBe(ramp.id)
    expect(session.token.verticalVelocity).toBe(ramp.launchVelocity)

    advanceVerticalMotion(session, 100)
    advanceVerticalMotion(session, 100)
    expect(session.token.elevation).toBeGreaterThan(62)

    let landed = false
    for (let step = 0; step < 30 && !landed; step += 1) {
      landed = advanceVerticalMotion(session, 100).landed
    }
    expect(landed).toBe(true)
    expect(session.token.elevation).toBe(0)
    expect(session.token.verticalVelocity).toBe(0)
    expect(session.vertical.grounded).toBe(true)
  })

  it('reaches the authored Round Green ramp from its keyboard run-up', () => {
    const generated = generateLevel(levels[99])
    delete generated.shotMechanic
    delete generated.shotGoals
    const engine = new GameEngine(generated, { generate: (level) => level })
    let launched = false
    engine.events.subscribe('vertical.launched', () => {
      launched = true
    })
    engine.startAttempt('keyboard')
    engine.session.input.directions.add('ArrowRight')

    for (let step = 0; step < 180 && !launched; step += 1) {
      engine.step(1000 / 60)
    }

    expect(engine.session.distance.actual).toBeGreaterThan(0)
    expect(launched).toBe(true)
    expect(engine.session.token.elevation).toBeGreaterThanOrEqual(0)
  })

  it('follows connected slopes, leaves a platform edge, and lands on ground', () => {
    const generated = structuredClone(createLevelSession(levels[99]).level)
    generated.terrainSurfaces = [
      {
        id: 'test-platform',
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        cornerElevations: {
          northWest: 100,
          northEast: 100,
          southEast: 100,
          southWest: 100,
        },
      },
    ]
    generated.startPoint = { x: 200, y: 200 }
    const session = createLevelSession(generated, { generatedLevel: generated })
    expect(session.token.elevation).toBe(100)

    session.token.position = { x: 300, y: 200 }
    const falling = advanceVerticalMotion(session, 100)
    expect(falling.surface).toBeNull()
    expect(session.vertical.grounded).toBe(false)
    expect(session.token.elevation).toBeLessThan(100)

    let landed = false
    for (let step = 0; step < 20 && !landed; step += 1) {
      landed = advanceVerticalMotion(session, 100).landed
    }
    expect(landed).toBe(true)
    expect(session.token.elevation).toBe(0)
  })
})

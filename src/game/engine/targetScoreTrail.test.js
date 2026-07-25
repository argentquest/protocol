import { describe, expect, it } from 'vitest'
import { levels } from '../../config/loadConfig.js'
import { generateLevel } from '../generation/levelGenerator.js'
import { GameEngine } from './GameEngine.js'
import { calculateSessionScore } from './ScoringSystem.js'
import { selectBonusOffer, touchesActiveTarget } from './TargetSystem.js'
import { appendTrailSample, retainGhostTrail } from './TrailSystem.js'
import { createLevelSession } from './createLevelSession.js'

function relayLevel() {
  const level = generateLevel(levels.find((item) => item.bonuses.maximumTargets > 0))
  const start = { x: 200, y: 500 }
  return {
    ...level,
    startPoint: start,
    token: { ...level.token, shape: 'circle', width: 20, height: 20, size: 20 },
    mainTarget: {
      ...level.mainTarget,
      shape: 'circle',
      x: 250,
      y: 500,
      width: 20,
      height: 20,
      size: 20,
    },
    bonusTargets: [
      {
        ...level.bonusTargets[0],
        shape: 'circle',
        x: 300,
        y: 500,
        width: 20,
        height: 20,
        size: 20,
      },
    ],
    obstacles: [],
    movingObstacles: [],
    trackingObstacles: [],
    coins: [],
    movement: {
      maximumSpeed: 1000,
      acceleration: 100000,
      deceleration: 100000,
      keyboardSpeed: 1000,
    },
    bonuses: {
      ...level.bonuses,
      maximumTargets: 1,
      targets: level.bonuses.targets.slice(0, 1),
    },
    scoring: {
      ...level.scoring,
      parTimeMs: 10000,
      parDistance: 100,
    },
  }
}

describe('V2 targets, scoring, bonuses, and trails', () => {
  it('recognizes edge contact using the complete token shape', () => {
    const session = createLevelSession(relayLevel(), {
      generatedLevel: relayLevel(),
    })
    session.token.position = { x: 230, y: 500 }
    expect(touchesActiveTarget(session, 'active-main')).toBe(true)
    session.token.position = { x: 229.9, y: 500 }
    expect(touchesActiveTarget(session, 'active-main')).toBe(false)
  })

  it('offers bonuses deterministically from score percentage and order', () => {
    const level = relayLevel()
    const first = createLevelSession(level, { generatedLevel: level })
    const second = createLevelSession(level, { generatedLevel: level })
    const perfectScore = { finalScore: 1000, attainableMaximum: 1000 }

    expect(selectBonusOffer(first, perfectScore)?.id).toBe(level.bonusTargets[0].id)
    expect(selectBonusOffer(second, perfectScore)?.id).toBe(level.bonusTargets[0].id)
    first.targets.earnedBonuses = 1
    expect(selectBonusOffer(first, perfectScore)).toBeNull()
  })

  it('runs an ordered relay while preserving clock and route distance', () => {
    let now = 1000
    const level = relayLevel()
    const engine = new GameEngine(level, {
      clock: () => now,
      generate: (value) => value,
    })
    const events = []
    engine.events.subscribe('*', (event) => events.push(event.type))
    engine.startAttempt('pointer')
    engine.session.input.desiredPosition = { x: 250, y: 500 }
    now = 1100
    const main = engine.step(100)

    expect(main.targetReached).toBe(true)
    expect(main.bonusOffered).toBe(true)
    expect(engine.machine.state).toBe('bonus-offer')
    expect(engine.session.token.position).toEqual({ x: 250, y: 500 })
    expect(engine.session.startedAtMs).toBe(1000)

    engine.pursueBonus()
    engine.startAttempt('keyboard')
    expect(engine.session.startedAtMs).toBe(1000)
    engine.session.input.directions.add('ArrowRight')
    now = 1250
    const bonus = engine.step(100)

    expect(bonus.targetReached).toBe(true)
    expect(engine.machine.state).toBe('completed')
    expect(engine.session.targets.earnedBonuses).toBe(1)
    expect(engine.session.elapsedMs).toBe(250)
    expect(engine.session.distance.actual).toBeGreaterThan(0)
    expect(events).toContain('bonus.offered')
    expect(events).toContain('attempt.completed')
  })

  it('banks voluntarily or penalizes a released bonus pursuit', () => {
    const level = relayLevel()
    const banked = new GameEngine(level, { generate: (value) => value })
    banked.startAttempt('pointer')
    banked.session.input.desiredPosition = { x: 250, y: 500 }
    banked.step(100)
    const bankedScore = banked.bankBonus()
    expect(banked.machine.state).toBe('completed')
    expect(bankedScore.bonusPenalty).toBe(0)

    const failed = new GameEngine(level, { generate: (value) => value })
    failed.startAttempt('pointer')
    failed.session.input.desiredPosition = { x: 250, y: 500 }
    failed.step(100)
    failed.pursueBonus()
    failed.startAttempt('keyboard')
    const result = failed.releaseAttempt('released')
    expect(result.completed).toBe(true)
    expect(result.score.bonusPenalty).toBeGreaterThan(0)
  })

  it('bounds active samples and retains only the configured ghost count', () => {
    const trail = [{ x: 0, y: 0 }]
    for (let index = 1; index < 100; index += 1) {
      appendTrailSample(trail, { x: index, y: index }, 16)
    }
    expect(trail.length).toBeLessThanOrEqual(16)
    expect(trail[0]).toEqual({ x: 0, y: 0 })
    expect(trail.at(-1)).toEqual({ x: 99, y: 99 })

    const ghosts = retainGhostTrail(
      [[{ x: 8, y: 8 }, { x: 9, y: 9 }], [{ x: 7, y: 7 }, { x: 8, y: 8 }]],
      [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      2,
    )
    expect(ghosts).toHaveLength(2)
    expect(ghosts[0][0]).toEqual({ x: 0, y: 0 })
  })

  it('uses reached checkpoints for direct distance and clamps the maximum', () => {
    const level = relayLevel()
    const session = createLevelSession(level, { generatedLevel: level })
    session.elapsedMs = 1
    session.distance.reachedPoints.push({ x: 250, y: 500 })
    session.distance.actual = 10
    const score = calculateSessionScore(session)
    expect(score.routeFactor).toBe(1)
    expect(score.finalScore).toBeLessThanOrEqual(score.attainableMaximum)
  })
})

import { describe, expect, it } from 'vitest'
import { calculateScore, directDistance } from './scoreCalculator.js'

const scoring = {
  baseMaximum: 1000,
  parTimeMs: 5000,
  timeWeight: 0.5,
  distanceWeight: 0.5,
  collisionPenaltyRate: 0.2,
}

describe('scoreCalculator', () => {
  it('awards but never exceeds the maximum score', () => {
    const score = calculateScore({
      scoring,
      elapsedMs: 2500,
      actualDistance: 400,
      benchmarkDistance: 500,
    })

    expect(score.finalScore).toBe(1000)
    expect(score.attainableMaximum).toBe(1000)
  })

  it('applies a fixed percentage of attainable maximum per collision', () => {
    const score = calculateScore({
      scoring,
      elapsedMs: 5000,
      actualDistance: 500,
      benchmarkDistance: 500,
      collisions: 2,
    })

    expect(score.collisionPenalty).toBe(400)
    expect(score.finalScore).toBe(600)
  })

  it('adds earned bonus capacity before calculating penalties', () => {
    const score = calculateScore({
      scoring,
      elapsedMs: 5000,
      actualDistance: 500,
      benchmarkDistance: 500,
      earnedBonusMaximum: 300,
      collisions: 1,
    })

    expect(score.attainableMaximum).toBe(1300)
    expect(score.finalScore).toBe(1040)
  })

  it('sums direct ordered target segments', () => {
    expect(
      directDistance([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 6, y: 8 },
      ]),
    ).toBe(10)
  })
})

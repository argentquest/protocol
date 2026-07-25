import { createGameEventBus } from './GameEvents.js'
import { createGameStateMachine } from './GameStateMachine.js'
import { createHudSnapshot } from './EngineSnapshot.js'
import { createLevelSession } from './createLevelSession.js'
import { advanceTokenWithCollisions } from './CollisionSystem.js'
import { calculateSessionScore } from './ScoringSystem.js'
import {
  activeTarget,
  checkpointAtTarget,
  selectBonusOffer,
  touchesActiveTarget,
} from './TargetSystem.js'
import { appendTrailSample, retainGhostTrail } from './TrailSystem.js'
import {
  advanceHazards,
  validateHazardEnvelopes,
} from './HazardSystem.js'
import {
  activatePower,
  collectContactCoins,
  expirePowers,
  isPowerActive,
} from './PowerSystem.js'

export class GameEngine {
  constructor(
    levelConfig,
    {
      clock = () => 0,
      generate,
      powerups = [],
      inventory = {},
      claimedCourseCoinIds = [],
      claimedRewardKeys = [],
      tokenCollisionTolerance = 0,
    } = {},
  ) {
    this.clock = clock
    this.powerups = powerups
    this.claimedRewardKeys = new Set(claimedRewardKeys)
    this.events = createGameEventBus()
    this.machine = createGameStateMachine('loading', (transition) => {
      this.events.emit('state.changed', transition)
    })
    this.session = createLevelSession(levelConfig, {
      generate,
      tokenCollisionTolerance,
    })
    const envelopeErrors = validateHazardEnvelopes(this.session.level)
    if (envelopeErrors.length) {
      throw new Error(
        `${this.session.levelId}: invalid hazard envelope: ${envelopeErrors.join('; ')}`,
      )
    }
    this.session.powerInventory = new Map(Object.entries(inventory))
    this.session.collectedCoinIds = new Set(
      claimedCourseCoinIds
        .filter((id) => this.session.level.coins.some((coin) => coin.id === id))
        .map(String),
    )
    this.machine.transition('loaded')
    this.events.emit('level.ready', { levelId: this.session.levelId })
  }

  startAttempt(inputMode) {
    if (!['pointer', 'keyboard'].includes(inputMode)) {
      throw new Error(`Unsupported input mode "${inputMode}".`)
    }
    this.machine.transition('activate', { inputMode })
    if (this.session.startedAtMs === null) {
      this.session.startedAtMs = this.clock()
    }
    this.session.input.active = true
    this.session.input.mode = inputMode
    this.events.emit('attempt.started', {
      levelId: this.session.levelId,
      attemptNumber: this.session.attemptNumber,
      inputMode,
    })
  }

  updateElapsed() {
    if (this.session.startedAtMs !== null) {
      this.session.elapsedMs = Math.max(0, this.clock() - this.session.startedAtMs)
    }
  }

  step(stepMs, collisionOptions = {}) {
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      throw new Error('Engine step must be a positive number of milliseconds.')
    }
    if (!['active-main', 'active-bonus'].includes(this.machine.state)) {
      return { updated: false, collision: false }
    }

    this.session.simulationTimeMs += stepMs
    const nowMs = this.clock()
    const currentDynamicObstacles = [
      ...this.session.movingObstacles.map((obstacle) => ({
        ...obstacle,
        x: obstacle.currentX,
        y: obstacle.currentY,
      })),
      ...this.session.trackingObstacles.map((state, index) => ({
        ...this.session.level.trackingObstacles[index],
        x: state.x,
        y: state.y,
      })),
    ]
    for (const power of expirePowers(this.session, nowMs, [
      ...this.session.level.obstacles,
      ...currentDynamicObstacles,
    ])) {
      this.events.emit('power.expired', { power })
    }
    const slowPower = this.session.activePowers.get('slowField')
    const slowScale = isPowerActive(this.session, 'slowField', nowMs)
      ? slowPower.slowMultiplier
      : 1
    const hazards = advanceHazards(this.session, stepMs, slowScale)
    const allObstacles = [...this.session.level.obstacles, ...hazards.current]
    const obstacleShield =
      Boolean(collisionOptions.obstacleShield) ||
      isPowerActive(this.session, 'obstacleShield', nowMs)
    const fullShield =
      Boolean(collisionOptions.fullShield) ||
      isPowerActive(this.session, 'fullShield', nowMs)
    const result = advanceTokenWithCollisions(
      this.session,
      stepMs,
      {
        ...collisionOptions,
        obstacles: collisionOptions.obstacles ?? allObstacles,
        obstacleShield,
        fullShield,
      },
    )
    if (result.collisionStarted) {
      appendTrailSample(
        this.session.trails.active,
        result.point,
        this.session.trails.maximumSamples,
      )
      appendTrailSample(
        this.session.trails.active,
        this.session.token.position,
        this.session.trails.maximumSamples,
      )
    } else if (result.moved) {
      appendTrailSample(
        this.session.trails.active,
        this.session.token.position,
        this.session.trails.maximumSamples,
      )
    }
    if (result.collisionStarted) {
      const penaltyRate = this.session.level.scoring.collisionPenaltyRate
      this.session.collisions.scoreMultiplier =
        Math.round(
          Math.max(0, 1 - this.session.collisions.count * penaltyRate) * 1e6,
        ) / 1e6
      this.events.emit('collision.started', {
        levelId: this.session.levelId,
        attemptNumber: this.session.attemptNumber,
        count: this.session.collisions.count,
        collisionType: result.collisionType,
        scoreMultiplier: this.session.collisions.scoreMultiplier,
      })
    }
    if (result.maximumCollisions) {
      this.machine.transition('maximum-collisions', {
        collisionType: result.collisionType,
      })
      this.restart('maximum-collisions')
      return { ...result, updated: true, restarted: true }
    }
    const magnetPower = this.session.activePowers.get('coinMagnet')
    const magnetRadius = isPowerActive(this.session, 'coinMagnet', nowMs)
      ? magnetPower.radius
      : 0
    for (const coin of collectContactCoins(this.session, magnetRadius)) {
      this.events.emit('coin.claimed', {
        levelId: this.session.levelId,
        coin,
      })
    }
    if (!result.collision && touchesActiveTarget(this.session, this.machine.state)) {
      const phase = this.machine.state
      const target = activeTarget(this.session, phase)
      const isBonus = phase === 'active-bonus'
      this.session.input.active = false
      this.session.input.mode = null
      this.session.input.directions.clear()
      checkpointAtTarget(this.session, target, isBonus)
      appendTrailSample(
        this.session.trails.active,
        this.session.token.position,
        this.session.trails.maximumSamples,
      )
      this.machine.transition(isBonus ? 'bonus-reached' : 'main-reached', {
        targetId: target.id ?? (isBonus ? `bonus-${this.session.targets.earnedBonuses}` : 'main'),
      })
      this.updateElapsed()
      const score = calculateSessionScore(this.session)
      const bonus = selectBonusOffer(this.session, score)
      this.events.emit('target.reached', {
        target,
        isBonus,
        score,
      })
      if (bonus) {
        this.machine.transition('bonus-offered', { targetId: bonus.id })
        this.events.emit('bonus.offered', { target: bonus, score })
      } else {
        this.machine.transition('no-bonus')
        this.finishCompletion(score, false)
      }
      return {
        ...result,
        updated: true,
        restarted: false,
        targetReached: true,
        bonusOffered: Boolean(bonus),
      }
    }
    return { ...result, updated: true, restarted: false }
  }

  activatePowerByKey(key) {
    if (this.session.startedAtMs === null) {
      return { activated: false, reason: 'attempt-not-started' }
    }
    const result = activatePower(
      this.session,
      this.powerups,
      key,
      this.clock(),
    )
    this.events.emit(
      result.activated ? 'power.activated' : 'power.unavailable',
      result,
    )
    return result
  }

  pursueBonus() {
    this.machine.transition('pursue')
    this.events.emit('bonus.accepted', {
      target: activeTarget(this.session, 'active-bonus') ??
        this.session.level.bonusTargets[this.session.targets.activeBonusIndex],
    })
  }

  bankBonus() {
    this.updateElapsed()
    const score = calculateSessionScore(this.session)
    this.machine.transition('bank')
    this.events.emit('bonus.banked', { score })
    this.finishCompletion(score, false)
    return score
  }

  releaseAttempt(reason = 'released') {
    this.session.input.active = false
    this.session.input.mode = null
    this.session.input.directions.clear()
    if (this.machine.state === 'active-main') {
      this.restart(reason)
      return { restarted: true, completed: false }
    }
    if (this.machine.state === 'active-bonus') {
      this.updateElapsed()
      this.session.targets.bonusFailures += 1
      const score = calculateSessionScore(this.session)
      this.machine.transition('bonus-failed', { reason })
      this.finishCompletion(score, true)
      return { restarted: false, completed: true, score }
    }
    return { restarted: false, completed: this.machine.state === 'completed' }
  }

  finishCompletion(score, bonusFailed) {
    const rewards = []
    const completionKey = `${this.session.levelId}:completion`
    if (!this.claimedRewardKeys.has(completionKey)) {
      this.claimedRewardKeys.add(completionKey)
      rewards.push({
        key: completionKey,
        kind: 'completion',
        coins: this.session.level.rewards.completionCoins,
      })
    }
    for (const target of this.session.level.bonusTargets.slice(
      0,
      this.session.targets.earnedBonuses,
    )) {
      const key = `${this.session.levelId}:bonus:${target.id}`
      if (this.claimedRewardKeys.has(key)) continue
      this.claimedRewardKeys.add(key)
      rewards.push({
        key,
        kind: 'bonus',
        targetId: target.id,
        coins: this.session.level.rewards.bonusCoinsPerTarget,
      })
    }
    for (const reward of rewards) this.events.emit('reward.claimed', reward)
    this.events.emit('attempt.completed', {
      score,
      earnedBonuses: this.session.targets.earnedBonuses,
      bonusFailed,
      rewards,
    })
  }

  restart(reason = 'manual') {
    const previous = this.session
    const attemptNumber = previous.attemptNumber + 1
    if (this.machine.state !== 'restarting') {
      const restartEvent =
        this.machine.state === 'active-main'
          ? 'release-early'
          : this.machine.state === 'active-bonus'
            ? 'maximum-collisions'
            : null
      if (restartEvent) this.machine.transition(restartEvent, { reason })
      else if (this.machine.can('restart')) {
        this.machine.transition('restart', { reason })
      }
    }
    if (this.machine.state !== 'restarting') {
      throw new Error(`Cannot restart from "${this.machine.state}".`)
    }
    previous.disposed = true
    const ghosts = retainGhostTrail(
      previous.trails.ghosts,
      previous.trails.active,
      previous.trails.maximumGhosts,
    )
    const inventory = new Map(previous.powerInventory)
    const collectedCoinIds = new Set(previous.collectedCoinIds)
    this.session = createLevelSession(previous.level, {
      attemptNumber,
      generatedLevel: previous.level,
      tokenCollisionTolerance: previous.collisions.tokenToleranceUnits,
    })
    this.session.trails.ghosts = ghosts
    this.session.powerInventory = inventory
    this.session.collectedCoinIds = collectedCoinIds
    this.machine.transition('reset', { reason })
    this.events.emit('attempt.restarted', {
      levelId: this.session.levelId,
      attemptNumber,
      reason,
    })
  }

  snapshot() {
    this.updateElapsed()
    return createHudSnapshot(this.session, this.machine.state)
  }

  dispose() {
    if (this.session.disposed) return
    this.session.disposed = true
    this.events.emit('engine.disposed', { levelId: this.session.levelId })
    this.events.dispose()
  }
}

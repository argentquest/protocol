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
import { updateContactSwitches } from './SwitchSystem.js'

/**
 * Owns one deterministic level session and exposes intent-oriented game actions.
 *
 * The engine is framework-neutral: callers supply real-time clock values in
 * milliseconds and render the resulting session state independently.
 */
export class GameEngine {
  /**
   * @param {object} levelConfig Validated level configuration.
   * @param {object} [options] Session dependencies and persisted player state.
   * @param {() => number} [options.clock] Monotonic real-time clock returning milliseconds.
   * @param {(level: object) => object} [options.generate] Deterministic level generator.
   * @param {object[]} [options.powerups] Validated consumable-power definitions.
   * @param {Record<string, number>} [options.inventory] Power quantities by ID.
   * @param {string[]} [options.claimedCourseCoinIds] Previously collected course-coin IDs.
   * @param {string[]} [options.claimedRewardKeys] Previously awarded reward keys.
   * @param {number} [options.tokenCollisionTolerance=0] Collision inset in logical world units.
   */
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

  /**
   * Activates movement for the current attempt.
   *
   * @param {'pointer'|'keyboard'} inputMode Active control mode.
   * @returns {void}
   */
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

  /** Updates elapsed attempt time from the monotonic clock, in milliseconds. */
  updateElapsed() {
    if (this.session.startedAtMs !== null) {
      this.session.elapsedMs = Math.max(0, this.clock() - this.session.startedAtMs)
    }
  }

  /**
   * Advances gameplay by one fixed simulation step.
   *
   * @param {number} stepMs Fixed duration in milliseconds.
   * @param {object} [collisionOptions] Test-only or power-derived collision overrides.
   * @returns {object} Serializable movement, collision, and target outcome flags.
   */
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
      ...this.session.dynamicObstacles.filter((obstacle) => obstacle.solid),
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
    const previousObstacles = [
      ...this.session.level.obstacles,
      ...hazards.previous,
    ]
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
        previousObstacles:
          collisionOptions.previousObstacles ??
          (collisionOptions.obstacles ? collisionOptions.obstacles : previousObstacles),
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
    for (const change of updateContactSwitches(this.session)) {
      this.events.emit('switch.activated', {
        levelId: this.session.levelId,
        ...change,
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

  /**
   * Consumes the power assigned to a numeric key when it is available.
   *
   * @param {string} key Numeric keyboard key.
   * @returns {object} Activation result and optional failure reason.
   */
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

  /** Accepts the currently offered bonus and prepares its control checkpoint. */
  pursueBonus() {
    this.machine.transition('pursue')
    this.events.emit('bonus.accepted', {
      target: activeTarget(this.session, 'active-bonus') ??
        this.session.level.bonusTargets[this.session.targets.activeBonusIndex],
    })
  }

  /**
   * Ends bonus pursuit voluntarily and preserves the current score.
   *
   * @returns {number} Banked score in points.
   */
  bankBonus() {
    this.updateElapsed()
    const score = calculateSessionScore(this.session)
    this.machine.transition('bank')
    this.events.emit('bonus.banked', { score })
    this.finishCompletion(score, false)
    return score
  }

  /**
   * Ends active input, restarting main play or failing active bonus pursuit.
   *
   * @param {string} [reason='released'] Stable release reason for events and diagnostics.
   * @returns {object} Completion or restart outcome.
   */
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

  /**
   * Emits completion and one-time reward events.
   *
   * @param {number} score Final score in points.
   * @param {boolean} bonusFailed Whether optional bonus pursuit failed.
   * @returns {void}
   */
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

  /**
   * Recreates the current deterministic layout while retaining eligible state.
   *
   * @param {string} [reason='manual'] Stable restart reason.
   * @returns {void}
   */
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

  /**
   * Produces the throttled, serializable React HUD view.
   *
   * @returns {import('../types.js').HudSnapshot} Current HUD snapshot.
   */
  snapshot() {
    this.updateElapsed()
    return createHudSnapshot(this.session, this.machine.state)
  }

  /** Permanently releases event subscriptions for this engine instance. */
  dispose() {
    if (this.session.disposed) return
    this.session.disposed = true
    this.events.emit('engine.disposed', { levelId: this.session.levelId })
    this.events.dispose()
  }
}

import { FixedStepLoop } from '../../engine/FixedStepLoop.js'

/**
 * Bridges requestAnimationFrame rendering to the engine's fixed 60 Hz updates.
 */
export class PixiEngineAdapter {
  /**
   * @param {object} options Adapter dependencies.
   * @param {import('../../engine/GameEngine.js').GameEngine} options.engine Active game engine.
   * @param {object} options.renderer Pixi scene renderer.
   * @param {number} [options.updatesPerSecond=60] Engine update frequency in hertz.
   * @param {(callback: FrameRequestCallback) => number} [options.requestFrame] Frame scheduler.
   * @param {(frameId: number) => void} [options.cancelFrame] Frame cancellation function.
   */
  constructor({
    engine,
    renderer,
    updatesPerSecond = 60,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  }) {
    this.engine = engine
    this.renderer = renderer
    this.requestFrame = requestFrame
    this.cancelFrame = cancelFrame
    this.frameId = null
    this.loop = new FixedStepLoop({
      updatesPerSecond,
      update: (stepMs) => engine.step(stepMs),
      render: () => renderer.update(engine.session, engine.machine.state),
    })
    this.onFrame = (timestamp) => {
      this.loop.advance(timestamp)
      this.recordFrame(timestamp)
      this.frameId = this.requestFrame?.(this.onFrame) ?? null
    }
  }

  /**
   * Updates the rolling render-frame rate displayed by development diagnostics.
   *
   * @param {number} timestamp Monotonic frame timestamp in milliseconds.
   * @returns {void}
   */
  recordFrame(timestamp) {
    const performance = this.engine.session.performance
    performance.renderedFrames += 1
    if (performance.windowStartedAt === null) {
      performance.windowStartedAt = timestamp
      return
    }
    const elapsed = timestamp - performance.windowStartedAt
    if (elapsed < 500) return
    performance.fps = Math.round((performance.renderedFrames * 1000) / elapsed)
    performance.renderedFrames = 0
    performance.windowStartedAt = timestamp
    this.renderer.app.canvas.dataset.fps = String(performance.fps)
  }

  /**
   * Starts simulation and rendering.
   *
   * @param {number} [timestamp=performance.now()] Monotonic time in milliseconds.
   */
  start(timestamp = performance.now()) {
    this.loop.start(timestamp)
    this.frameId = this.requestFrame?.(this.onFrame) ?? null
  }

  /**
   * Advances a frame manually, primarily for deterministic tests.
   *
   * @param {number} timestamp Monotonic time in milliseconds.
   * @returns {import('../../types.js').FrameAdvanceResult} Loop result.
   */
  advance(timestamp) {
    return this.loop.advance(timestamp)
  }

  /** Resets loop time and redraws the newly restarted attempt. */
  resetAttempt() {
    this.loop.reset()
    this.renderer.update(this.engine.session, this.engine.machine.state)
  }

  /** Stops requesting browser animation frames. */
  stop() {
    if (this.frameId !== null) this.cancelFrame?.(this.frameId)
    this.frameId = null
    this.loop.stop()
  }

  /** Stops the adapter and destroys all Pixi renderer resources. */
  destroy() {
    this.stop()
    this.renderer.destroy()
  }
}

import { FixedStepLoop } from '../../engine/FixedStepLoop.js'

export class PixiEngineAdapter {
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

  start(timestamp = performance.now()) {
    this.loop.start(timestamp)
    this.frameId = this.requestFrame?.(this.onFrame) ?? null
  }

  advance(timestamp) {
    return this.loop.advance(timestamp)
  }

  resetAttempt() {
    this.loop.reset()
    this.renderer.update(this.engine.session, this.engine.machine.state)
  }

  stop() {
    if (this.frameId !== null) this.cancelFrame?.(this.frameId)
    this.frameId = null
    this.loop.stop()
  }

  destroy() {
    this.stop()
    this.renderer.destroy()
  }
}

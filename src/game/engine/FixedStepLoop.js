export class FixedStepLoop {
  constructor({
    updatesPerSecond = 60,
    maximumFrameDeltaMs = 250,
    update = () => {},
    render = () => {},
  } = {}) {
    if (!(updatesPerSecond > 0)) {
      throw new RangeError('updatesPerSecond must be positive.')
    }
    this.stepMs = 1000 / updatesPerSecond
    this.maximumFrameDeltaMs = maximumFrameDeltaMs
    this.update = update
    this.render = render
    this.accumulatorMs = 0
    this.lastTimestamp = null
    this.running = false
    this.simulationTimeMs = 0
  }

  start(timestamp = null) {
    this.running = true
    this.lastTimestamp = timestamp
  }

  stop() {
    this.running = false
    this.lastTimestamp = null
    this.accumulatorMs = 0
  }

  reset() {
    this.lastTimestamp = null
    this.accumulatorMs = 0
    this.simulationTimeMs = 0
  }

  advance(timestamp) {
    if (!this.running) return { updates: 0, interpolation: 0 }
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp
      this.render(0)
      return { updates: 0, interpolation: 0 }
    }

    const rawDelta = Math.max(0, timestamp - this.lastTimestamp)
    const frameDelta = Math.min(rawDelta, this.maximumFrameDeltaMs)
    this.lastTimestamp = timestamp
    this.accumulatorMs += frameDelta
    let updates = 0

    while (this.accumulatorMs >= this.stepMs - 1e-7) {
      this.update(this.stepMs)
      this.simulationTimeMs += this.stepMs
      this.accumulatorMs = Math.max(0, this.accumulatorMs - this.stepMs)
      updates += 1
    }

    const interpolation = this.accumulatorMs / this.stepMs
    this.render(interpolation)
    return { updates, interpolation, frameDelta }
  }
}

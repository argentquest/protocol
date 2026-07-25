import { describe, expect, it, vi } from 'vitest'
import { createAudioManager } from './audioManager.js'

class FakeHowl {
  static instances = []

  constructor(options) {
    this.options = options
    this.handlers = new Map()
    this.currentVolume = options.volume
    this.play = vi.fn(() => this.play.mock.calls.length)
    this.fade = vi.fn()
    this.unload = vi.fn()
    FakeHowl.instances.push(this)
  }

  once(event, handler) {
    this.handlers.set(event, handler)
  }

  off(event) {
    this.handlers.delete(event)
  }

  load() {
    this.handlers.get('load')?.()
  }

  volume(value) {
    if (value === undefined || typeof value !== 'number') return this.currentVolume
    this.currentVolume = value
    return this
  }
}

const effect = {
  soundId: 'collision',
  sources: ['collision.webm', 'collision.mp3'],
  settings: {
    volume: 0.8,
    cooldownMs: 100,
    loop: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    channel: 'effects',
  },
}

const ambience = {
  soundId: 'ambience',
  sources: ['ambience.webm', 'ambience.mp3'],
  settings: {
    volume: 0.5,
    cooldownMs: 0,
    loop: true,
    fadeInMs: 1200,
    fadeOutMs: 800,
    channel: 'ambience',
  },
}

describe('Howler audio manager', () => {
  it('loads fallback sources and only starts looping ambience after unlock', async () => {
    FakeHowl.instances = []
    const resume = vi.fn()
    const manager = createAudioManager(
      { musicEnabled: true, musicVolume: 0.4 },
      {
        HowlClass: FakeHowl,
        howler: { ctx: { state: 'suspended', resume } },
      },
    )
    await manager.loadSound(ambience)
    const howl = FakeHowl.instances[0]

    expect(howl.options.src).toEqual(['ambience.webm'])
    expect(howl.options.loop).toBe(true)
    expect(howl.play).not.toHaveBeenCalled()
    await manager.unlock()
    expect(resume).toHaveBeenCalledOnce()
    expect(howl.play).toHaveBeenCalledOnce()
    expect(howl.fade).toHaveBeenCalledWith(0, 0.2, 1200, 1)
  })

  it('retries the MP3 source when a browser fails to decode advertised WebM', async () => {
    class FallbackHowl extends FakeHowl {
      load() {
        const event = this.options.src[0].endsWith('.webm') ? 'loaderror' : 'load'
        this.handlers.get(event)?.(null, 4)
      }
    }
    FakeHowl.instances = []
    const manager = createAudioManager(
      {},
      { HowlClass: FallbackHowl, howler: {} },
    )
    await manager.loadSound(ambience)

    expect(FakeHowl.instances.map((howl) => howl.options.src)).toEqual([
      ['ambience.webm'],
      ['ambience.mp3'],
    ])
    expect(FakeHowl.instances[0].unload).toHaveBeenCalledOnce()
  })

  it('applies effect volume, permits overlap, and enforces configured cooldowns', async () => {
    FakeHowl.instances = []
    let timestamp = 1000
    const manager = createAudioManager(
      { effectsEnabled: true, effectsVolume: 0.5 },
      {
        HowlClass: FakeHowl,
        howler: {},
        now: () => timestamp,
      },
    )
    await manager.loadSound(effect)
    await manager.unlock()
    const howl = FakeHowl.instances[0]

    expect(manager.play('collision')).toBe(1)
    expect(manager.play('collision')).toBeNull()
    timestamp += 100
    expect(manager.play('collision')).toBe(2)
    expect(howl.currentVolume).toBe(0.4)
  })

  it('updates channel settings and unloads every sound', async () => {
    FakeHowl.instances = []
    const manager = createAudioManager(
      { effectsEnabled: true, effectsVolume: 1 },
      { HowlClass: FakeHowl, howler: {} },
    )
    await manager.loadSound(effect)
    await manager.unlock()
    const howl = FakeHowl.instances[0]
    manager.updateSettings({ effectsEnabled: false })

    expect(howl.currentVolume).toBe(0)
    expect(manager.play('collision')).toBeNull()
    manager.dispose()
    expect(howl.unload).toHaveBeenCalledOnce()
  })
})

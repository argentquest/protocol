import { Howl, Howler } from 'howler'

const defaults = {
  musicEnabled: true,
  musicVolume: 0.22,
  effectsEnabled: true,
  effectsVolume: 0.55,
}

export function createAudioManager(
  initialSettings = defaults,
  { HowlClass = Howl, howler = Howler, now = () => performance.now() } = {},
) {
  let settings = { ...defaults, ...initialSettings }
  let unlocked = false
  let disposed = false
  const sounds = new Map()
  const lastPlayedAt = new Map()

  const channelVolume = (entry) => {
    const ambience = entry.settings.channel === 'ambience'
    const enabled = ambience ? settings.musicEnabled : settings.effectsEnabled
    const master = ambience ? settings.musicVolume : settings.effectsVolume
    return enabled ? entry.settings.volume * master : 0
  }

  function loadSound(entry) {
    if (disposed) return Promise.reject(new Error('Audio manager was disposed.'))
    if (sounds.has(entry.soundId)) return sounds.get(entry.soundId).loadPromise
    const record = { entry, howl: null, playingId: null, loadPromise: null }
    sounds.set(entry.soundId, record)
    record.loadPromise = new Promise((resolve, reject) => {
      const attempts = [
        ...entry.sources.map((source) => ({ source, html5: false })),
        { source: entry.sources.at(-1), html5: true },
      ]
      const trySource = (attemptIndex) => {
        const attempt = attempts[attemptIndex]
        const howl = new HowlClass({
          src: [attempt.source],
          preload: false,
          loop: entry.settings.loop,
          volume: 0,
          html5: attempt.html5,
        })
        record.howl = howl
        const loaded = () => {
          howl.off?.('loaderror', failed)
          howl.volume(channelVolume(entry))
          resolve(howl)
        }
        const failed = (_id, error) => {
          howl.off?.('load', loaded)
          howl.unload()
          if (attemptIndex + 1 < attempts.length) {
            trySource(attemptIndex + 1)
            return
          }
          sounds.delete(entry.soundId)
          reject(
            new Error(
              `Unable to load sound "${entry.soundId}": ${error ?? 'unknown error'}`,
            ),
          )
        }
        howl.once('load', loaded)
        howl.once('loaderror', failed)
        howl.load()
      }
      trySource(0)
    })
    return record.loadPromise
  }

  async function ensureContext() {
    if (howler.ctx?.state === 'suspended') await howler.ctx.resume()
    return howler.ctx ?? null
  }

  function startAmbience() {
    if (!unlocked || disposed) return false
    const record = sounds.get('ambience')
    if (!record || record.playingId !== null) return false
    const target = channelVolume(record.entry)
    record.howl.volume(record.entry.settings.fadeInMs > 0 ? 0 : target)
    record.playingId = record.howl.play()
    if (record.entry.settings.fadeInMs > 0 && target > 0) {
      record.howl.fade(0, target, record.entry.settings.fadeInMs, record.playingId)
    }
    return true
  }

  async function unlock() {
    await ensureContext()
    unlocked = true
    startAmbience()
  }

  function play(soundId) {
    if (!unlocked || disposed) return null
    const record = sounds.get(soundId)
    if (!record || record.entry.settings.channel === 'ambience') return null
    if (!settings.effectsEnabled) return null
    const timestamp = now()
    const previous = lastPlayedAt.get(soundId) ?? -Infinity
    if (timestamp - previous < record.entry.settings.cooldownMs) return null
    lastPlayedAt.set(soundId, timestamp)
    record.howl.volume(channelVolume(record.entry))
    return record.howl.play()
  }

  function updateSettings(nextSettings) {
    settings = { ...settings, ...nextSettings }
    for (const record of sounds.values()) {
      const target = channelVolume(record.entry)
      if (
        record.entry.settings.channel === 'ambience' &&
        record.playingId !== null &&
        record.entry.settings.fadeOutMs > 0
      ) {
        record.howl.fade(
          record.howl.volume(record.playingId),
          target,
          record.entry.settings.fadeOutMs,
          record.playingId,
        )
      } else {
        record.howl.volume(target)
      }
    }
    if (unlocked) startAmbience()
  }

  function dispose() {
    disposed = true
    for (const record of sounds.values()) record.howl.unload()
    sounds.clear()
    lastPlayedAt.clear()
  }

  return {
    ensureContext,
    loadSound,
    play,
    startAmbience,
    startMusic: unlock,
    unlock,
    updateSettings,
    dispose,
  }
}

export function createAudioManager(themeAudio, initialSettings) {
  let context = null
  let master = null
  let musicGain = null
  let effectsGain = null
  let ambientNodes = []
  let settings = { ...initialSettings }
  let lastCollisionAt = 0

  function ensureContext() {
    if (context) {
      if (context.state === 'suspended') context.resume()
      return context
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    context = new AudioContextClass()
    master = context.createGain()
    musicGain = context.createGain()
    effectsGain = context.createGain()
    master.gain.value = 0.7
    musicGain.gain.value = settings.musicEnabled ? settings.musicVolume : 0
    effectsGain.gain.value = settings.effectsEnabled ? settings.effectsVolume : 0
    musicGain.connect(master)
    effectsGain.connect(master)
    master.connect(context.destination)
    return context
  }

  function startMusic() {
    const audioContext = ensureContext()
    if (!audioContext || ambientNodes.length) return
    const frequencies = [55, 82.5, 110]
    ambientNodes = frequencies.map((frequency, index) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.value = index === 0 ? 0.07 : 0.025
      oscillator.connect(gain)
      gain.connect(musicGain)
      oscillator.start()
      return { oscillator, gain }
    })
  }

  function updateSettings(nextSettings) {
    settings = { ...settings, ...nextSettings }
    if (musicGain) {
      musicGain.gain.setTargetAtTime(
        settings.musicEnabled ? settings.musicVolume : 0,
        context.currentTime,
        0.03,
      )
    }
    if (effectsGain) {
      effectsGain.gain.setTargetAtTime(
        settings.effectsEnabled ? settings.effectsVolume : 0,
        context.currentTime,
        0.03,
      )
    }
  }

  function play(name) {
    const audioContext = ensureContext()
    if (!audioContext || !settings.effectsEnabled) return
    if (name === 'collision') {
      const now = performance.now()
      if (now - lastCollisionAt < 90) return
      lastCollisionAt = now
    }
    const baseFrequency = themeAudio.effects[name] ?? 440
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const powerSound = name.startsWith('power')
    const duration = name === 'levelComplete' ? 0.45 : powerSound ? 0.28 : 0.16
    const powerWaveforms = {
      powerObstacleShield: 'triangle',
      powerFullShield: 'sine',
      powerSlowField: 'sawtooth',
      powerCoinMagnet: 'square',
      powerRouteScan: 'triangle',
    }
    oscillator.type =
      powerWaveforms[name] ??
      (name === 'collision' || name === 'attemptFailed' ? 'sawtooth' : 'sine')
    oscillator.frequency.setValueAtTime(baseFrequency, audioContext.currentTime)
    const targetMultiplier =
      name === 'powerSlowField'
        ? 0.5
        : name === 'powerCoinMagnet'
          ? 1.8
          : name === 'collision'
            ? 0.45
            : 1.35
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(45, baseFrequency * targetMultiplier),
      audioContext.currentTime + duration,
    )
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration)
    oscillator.connect(gain)
    gain.connect(effectsGain)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + duration)
  }

  function dispose() {
    for (const node of ambientNodes) node.oscillator.stop()
    ambientNodes = []
    context?.close()
    context = null
  }

  return { ensureContext, startMusic, updateSettings, play, dispose }
}

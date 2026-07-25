import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(
  projectRoot,
  'public',
  'media',
  'default',
  'audio',
  'source',
)
const force = process.argv.includes('--force')
const sampleRate = 22050

const soundDesigns = {
  'drag-start': { frequency: 420, endMultiplier: 1.35, duration: 0.18, wave: 'sine' },
  collision: { frequency: 130, endMultiplier: 0.45, duration: 0.22, wave: 'saw' },
  'attempt-failed': { frequency: 90, endMultiplier: 0.5, duration: 0.42, wave: 'saw' },
  'target-reached': { frequency: 780, endMultiplier: 1.45, duration: 0.34, wave: 'sine' },
  'bonus-offered': { frequency: 980, endMultiplier: 1.3, duration: 0.4, wave: 'triangle' },
  'bonus-accepted': { frequency: 1050, endMultiplier: 1.55, duration: 0.3, wave: 'triangle' },
  'coin-collected': { frequency: 1180, endMultiplier: 1.8, duration: 0.2, wave: 'sine' },
  'power-obstacle-shield': { frequency: 520, endMultiplier: 1.35, duration: 0.4, wave: 'triangle' },
  'power-full-shield': { frequency: 610, endMultiplier: 1.5, duration: 0.48, wave: 'sine' },
  'power-slow-field': { frequency: 240, endMultiplier: 0.5, duration: 0.5, wave: 'saw' },
  'power-coin-magnet': { frequency: 1320, endMultiplier: 1.8, duration: 0.36, wave: 'square' },
  'power-route-scan': { frequency: 860, endMultiplier: 1.35, duration: 0.46, wave: 'triangle' },
  'power-unavailable': { frequency: 170, endMultiplier: 0.72, duration: 0.22, wave: 'square' },
  'level-complete': { frequency: 620, endMultiplier: 1.6, duration: 0.72, wave: 'sine' },
}

function waveValue(wave, phase) {
  const normalized = phase / (Math.PI * 2)
  if (wave === 'square') return Math.sin(phase) >= 0 ? 1 : -1
  if (wave === 'saw') return 2 * (normalized - Math.floor(normalized + 0.5))
  if (wave === 'triangle') {
    return 2 * Math.abs(2 * (normalized - Math.floor(normalized + 0.5))) - 1
  }
  return Math.sin(phase)
}

function encodeMonoWav(samples) {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2)
  })
  return buffer
}

function createEffect(design) {
  const sampleCount = Math.ceil(design.duration * sampleRate)
  const samples = new Float64Array(sampleCount)
  let phase = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / Math.max(1, sampleCount - 1)
    const frequency =
      design.frequency * Math.pow(design.endMultiplier, progress)
    phase += (Math.PI * 2 * frequency) / sampleRate
    const attack = Math.min(1, progress / 0.08)
    const release = Math.min(1, (1 - progress) / 0.28)
    const envelope = Math.sin(Math.min(1, attack) * Math.PI * 0.5) * release
    const fundamental = waveValue(design.wave, phase)
    const harmonic = Math.sin(phase * 2.01) * 0.18
    samples[index] = (fundamental * 0.7 + harmonic) * envelope * 0.55
  }
  return encodeMonoWav(samples)
}

function createAmbience() {
  const duration = 8
  const sampleCount = duration * sampleRate
  const samples = new Float64Array(sampleCount)
  const frequencies = [55, 82.5, 110]
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const pulse = 0.78 + Math.sin(Math.PI * 2 * 0.25 * time) * 0.12
    const tone =
      Math.sin(Math.PI * 2 * frequencies[0] * time) * 0.5 +
      Math.sin(Math.PI * 2 * frequencies[1] * time) * 0.22 +
      Math.sin(Math.PI * 2 * frequencies[2] * time) * 0.12
    const scanner = Math.sin(Math.PI * 2 * 2 * time) * 0.03
    samples[index] = (tone * pulse + scanner) * 0.28
  }
  return encodeMonoWav(samples)
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

await mkdir(sourceDirectory, { recursive: true })
const generated = []
const skipped = []

for (const [soundId, design] of Object.entries(soundDesigns)) {
  const filePath = path.join(sourceDirectory, `${soundId}.wav`)
  if (!force && (await exists(filePath))) {
    skipped.push(soundId)
    continue
  }
  await writeFile(filePath, createEffect(design))
  generated.push(soundId)
}

const ambiencePath = path.join(sourceDirectory, 'ambience.wav')
if (!force && (await exists(ambiencePath))) {
  skipped.push('ambience')
} else {
  await writeFile(ambiencePath, createAmbience())
  generated.push('ambience')
}

console.log(
  `Default WAV masters: ${generated.length} generated, ${skipped.length} preserved.`,
)

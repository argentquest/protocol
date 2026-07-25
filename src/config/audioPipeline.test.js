import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildConversionPlan,
  convertAudioDirectory,
  ffmpegArguments,
} from '../../scripts/lib/audio-pipeline.mjs'
import {
  validateDefaultAudioLibrary,
  validateWavBuffer,
} from '../../scripts/lib/validate-audio.mjs'
import audioSettings from '../../public/media/default/audio.json'
import soundRegistry from './soundRegistry.json'

const defaultAudioRoot = path.resolve('public', 'media', 'default', 'audio')

async function temporaryAudioDirectories() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'path-protocol-audio-'))
  const sourceDirectory = path.join(root, 'source')
  const outputDirectory = path.join(root, 'output')
  await mkdir(sourceDirectory)
  await mkdir(outputDirectory)
  await writeFile(path.join(sourceDirectory, 'test.wav'), Buffer.from('source'))
  return { sourceDirectory, outputDirectory }
}

describe('audio preparation pipeline', () => {
  it('validates every default WAV, WebM, MP3, and playback entry', async () => {
    expect(
      await validateDefaultAudioLibrary({
        audioRoot: defaultAudioRoot,
        registry: soundRegistry,
        settings: audioSettings,
      }),
    ).toEqual([])
  })

  it('uses RIFF/WAVE canonical masters', async () => {
    const ambience = await readFile(
      path.join(defaultAudioRoot, 'source', 'ambience.wav'),
    )
    expect(validateWavBuffer(ambience, 'ambience.wav')).toEqual([])
    expect(validateWavBuffer(Buffer.from('invalid'), 'invalid.wav')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('header'),
        expect.stringContaining('RIFF'),
        expect.stringContaining('WAVE'),
      ]),
    )
  })

  it('creates only missing formats during normal conversion', async () => {
    const directories = await temporaryAudioDirectories()
    await writeFile(path.join(directories.outputDirectory, 'test.webm'), 'existing')

    const plan = await buildConversionPlan({
      ...directories,
      soundIds: ['test'],
    })

    expect(plan.jobs.map((job) => job.format)).toEqual(['mp3'])
  })

  it('plans both formats during forced conversion', async () => {
    const directories = await temporaryAudioDirectories()
    await writeFile(path.join(directories.outputDirectory, 'test.webm'), 'existing')
    await writeFile(path.join(directories.outputDirectory, 'test.mp3'), 'existing')

    const plan = await buildConversionPlan({
      ...directories,
      soundIds: ['test'],
      force: true,
    })

    expect(plan.jobs.map((job) => job.format)).toEqual(['webm', 'mp3'])
  })

  it('fails clearly when conversion is needed without FFmpeg', async () => {
    const directories = await temporaryAudioDirectories()

    await expect(
      convertAudioDirectory({
        ffmpegPath: null,
        ...directories,
        soundIds: ['test'],
      }),
    ).rejects.toThrow(/FFmpeg is required/)
  })

  it('builds WebM Opus and MP3 LAME conversion arguments', () => {
    const webm = ffmpegArguments({
      soundId: 'test',
      format: 'webm',
      source: 'test.wav',
      output: 'test.webm',
    })
    const mp3 = ffmpegArguments({
      soundId: 'test',
      format: 'mp3',
      source: 'test.wav',
      output: 'test.mp3',
    })

    expect(webm).toEqual(expect.arrayContaining(['libopus', '96k']))
    expect(mp3).toEqual(expect.arrayContaining(['libmp3lame', '4']))
  })

  it('defines WebM before MP3 for Howler delivery', () => {
    const soundId = 'collision'
    const sources = [`${soundId}.webm`, `${soundId}.mp3`]
    expect(sources).toEqual(['collision.webm', 'collision.mp3'])
  })
})

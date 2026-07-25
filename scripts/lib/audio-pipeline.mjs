import { access, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

export async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function buildConversionPlan({
  sourceDirectory,
  outputDirectory,
  soundIds,
  force = false,
}) {
  const jobs = []
  const missingSources = []
  for (const soundId of soundIds) {
    const source = path.join(sourceDirectory, `${soundId}.wav`)
    if (!(await fileExists(source))) {
      missingSources.push(soundId)
      continue
    }
    for (const format of ['webm', 'mp3']) {
      const output = path.join(outputDirectory, `${soundId}.${format}`)
      if (force || !(await fileExists(output))) {
        jobs.push({ soundId, format, source, output })
      }
    }
  }
  return { jobs, missingSources }
}

export function ffmpegArguments(job) {
  const codecArguments =
    job.format === 'webm'
      ? ['-c:a', 'libopus', '-b:a', '96k']
      : ['-c:a', 'libmp3lame', '-q:a', '4']
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    job.source,
    '-vn',
    ...codecArguments,
    job.output,
  ]
}

export function runFfmpeg(ffmpegPath, job) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ffmpegArguments(job), {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let standardError = ''
    child.stderr.on('data', (chunk) => {
      standardError += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else {
        reject(
          new Error(
            `FFmpeg failed for ${job.soundId}.${job.format}: ${standardError.trim()}`,
          ),
        )
      }
    })
  })
}

export async function convertAudioDirectory({
  ffmpegPath,
  sourceDirectory,
  outputDirectory,
  soundIds,
  force = false,
  requireAllSources = false,
}) {
  await mkdir(outputDirectory, { recursive: true })
  const plan = await buildConversionPlan({
    sourceDirectory,
    outputDirectory,
    soundIds,
    force,
  })
  if (requireAllSources && plan.missingSources.length) {
    throw new Error(
      `Missing required WAV masters: ${plan.missingSources.join(', ')}`,
    )
  }
  if (plan.jobs.length && !ffmpegPath) {
    throw new Error(
      'FFmpeg is required to create missing WebM or MP3 files. Install FFmpeg or set PATH_PROTOCOL_FFMPEG.',
    )
  }
  for (const job of plan.jobs) {
    await runFfmpeg(ffmpegPath, job)
    const outputStats = await stat(job.output)
    if (!outputStats.isFile() || outputStats.size === 0) {
      throw new Error(`FFmpeg produced an empty output: ${job.output}`)
    }
  }
  return plan
}

export async function discoverThemeNames(themeRoot) {
  try {
    const entries = await readdir(themeRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

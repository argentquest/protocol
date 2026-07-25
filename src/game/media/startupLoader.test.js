import { describe, expect, it, vi } from 'vitest'
import {
  createStartupProgressReporter,
  loadStartupMedia,
  resolveManifestUrls,
} from './startupLoader.js'

describe('startup media loader', () => {
  it('reports weighted monotonic progress ending at 100 percent', () => {
    const snapshots = []
    const reporter = createStartupProgressReporter((snapshot) =>
      snapshots.push(snapshot),
    )

    reporter.report('configuration', 1)
    reporter.report('manifest', 1)
    reporter.report('visuals', 0.5)
    reporter.report('visuals', 1)
    reporter.report('audio', 1)

    expect(snapshots.at(-1).percentage).toBe(100)
    expect(snapshots.map((snapshot) => snapshot.progress)).toEqual(
      [...snapshots.map((snapshot) => snapshot.progress)].sort((a, b) => a - b),
    )
  })

  it('loads configuration, manifest, visuals, and audio in order', async () => {
    const calls = []
    const progress = []
    const manifest = {
      visuals: [{ mediaId: 'one' }, { mediaId: 'two' }],
      audio: [{ soundId: 'ambience' }, { soundId: 'collision' }],
    }
    const validateConfiguration = vi.fn(async () => calls.push('configuration'))
    const fetchManifest = vi.fn(async (url) => {
      calls.push(url)
      return manifest
    })
    const loadVisual = vi.fn(async (entry) =>
      calls.push(`visual:${entry.mediaId}`),
    )
    const loadAudio = vi.fn(async (entry) => calls.push(`audio:${entry.soundId}`))

    const result = await loadStartupMedia({
      themeName: 'future-lab',
      fetchManifest,
      loadVisual,
      loadAudio,
      validateConfiguration,
      onProgress: (snapshot) => progress.push(snapshot),
    })

    expect(result).toBe(manifest)
    expect(calls).toEqual([
      'configuration',
      '/media/manifests/future-lab.json',
      'visual:one',
      'visual:two',
      'audio:ambience',
      'audio:collision',
    ])
    expect(progress.at(-1).percentage).toBe(100)
  })

  it('rejects unknown progress phases', () => {
    const reporter = createStartupProgressReporter()
    expect(() => reporter.report('unknown', 1)).toThrow(/Unknown startup phase/)
  })

  it('resolves manifests and every media source beneath a deployment subpath', async () => {
    const manifest = {
      pixi: {
        bundles: [
          {
            name: 'visuals',
            assets: [{ alias: 'token', src: '/media/default/token.svg?v=1' }],
          },
        ],
      },
      visuals: [
        { mediaId: 'token', src: '/media/default/token.svg?v=1' },
      ],
      audio: [
        {
          soundId: 'start',
          sources: [
            '/media/default/start.webm?v=1',
            '/media/default/start.mp3?v=1',
          ],
        },
      ],
    }

    const resolved = resolveManifestUrls(manifest, '/protocol/')

    expect(resolved.pixi.bundles[0].assets[0].src).toBe(
      '/protocol/media/default/token.svg?v=1',
    )
    expect(resolved.visuals[0].src).toBe(
      '/protocol/media/default/token.svg?v=1',
    )
    expect(resolved.audio[0].sources).toEqual([
      '/protocol/media/default/start.webm?v=1',
      '/protocol/media/default/start.mp3?v=1',
    ])
  })

  it('fetches the theme manifest beneath the configured deployment subpath', async () => {
    const fetchManifest = vi.fn(async () => ({ visuals: [], audio: [] }))

    await loadStartupMedia({
      themeName: 'future-lab',
      baseUrl: '/protocol/',
      fetchManifest,
      loadVisual: vi.fn(),
      loadAudio: vi.fn(),
      validateConfiguration: vi.fn(),
    })

    expect(fetchManifest).toHaveBeenCalledWith(
      '/protocol/media/manifests/future-lab.json',
    )
  })
})

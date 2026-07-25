import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findUnknownMediaFiles,
  resolveThemeManifest,
} from '../../scripts/lib/media-manifest.mjs'
import defaultAudioSettings from '../../public/media/default/audio.json'
import mediaRegistry from './mediaRegistry.json'
import soundRegistry from './soundRegistry.json'
import { getSchemaValidators } from './validateConfig.js'

const defaultRoot = path.resolve('public', 'media', 'default')
const manifestRoot = path.resolve('public', 'media', 'manifests')

async function temporaryTheme() {
  return mkdtemp(path.join(os.tmpdir(), 'path-protocol-theme-'))
}

function resolutionOptions(themeRoot = null) {
  return {
    themeName: themeRoot ? 'future-lab' : 'default',
    mediaVersion: mediaRegistry.mediaVersion,
    mediaRegistry,
    soundRegistry,
    defaultRoot,
    defaultRootUrl: '/media/default',
    themeRoot,
    themeRootUrl: themeRoot ? '/media/themes/future-lab' : null,
    defaultAudioSettings,
  }
}

describe('generated media manifests', () => {
  it('generates schema-valid deterministic default and Future Lab manifests', async () => {
    const defaultManifest = JSON.parse(
      await readFile(path.join(manifestRoot, 'default.json'), 'utf8'),
    )
    const futureLabManifest = JSON.parse(
      await readFile(path.join(manifestRoot, 'future-lab.json'), 'utf8'),
    )

    const schemaValidators = getSchemaValidators()
    expect(schemaValidators.resolvedMediaManifest(defaultManifest)).toBe(true)
    expect(schemaValidators.resolvedMediaManifest(futureLabManifest)).toBe(true)
    expect(futureLabManifest.visuals.every((entry) => entry.sourceScope === 'default')).toBe(
      true,
    )
    expect(
      futureLabManifest.audio.every(
        (entry) =>
          entry.fileSourceScope === 'default' &&
          entry.settingsSourceScope === 'default',
      ),
    ).toBe(true)

    const first = await resolveThemeManifest(resolutionOptions())
    const second = await resolveThemeManifest(resolutionOptions())
    expect(first).toEqual(second)
  })

  it('versions aliases and URLs while preserving WebM-first audio order', async () => {
    const { manifest } = await resolveThemeManifest(resolutionOptions())
    expect(manifest.visuals[0].alias).toContain(':v1')
    expect(manifest.visuals[0].src).toMatch(/\?v=1$/)
    expect(manifest.audio[0].sources[0]).toMatch(/\.webm\?v=1$/)
    expect(manifest.audio[0].sources[1]).toMatch(/\.mp3\?v=1$/)
  })

  it('accepts exactly one valid Future Lab visual override', async () => {
    const themeRoot = await temporaryTheme()
    await mkdir(path.join(themeRoot, 'tokens'), { recursive: true })
    await copyFile(
      path.join(defaultRoot, 'tokens', 'token-circle.svg'),
      path.join(themeRoot, 'tokens', 'token-circle.svg'),
    )

    const { manifest, warnings } = await resolveThemeManifest(
      resolutionOptions(themeRoot),
    )

    expect(warnings).toEqual([])
    expect(
      manifest.visuals.find((entry) => entry.mediaId === 'token-circle')
        .sourceScope,
    ).toBe('theme')
    expect(
      manifest.visuals.filter((entry) => entry.sourceScope === 'theme'),
    ).toHaveLength(1)
  })

  it('falls back from invalid visual and playback overrides with warnings', async () => {
    const themeRoot = await temporaryTheme()
    await mkdir(path.join(themeRoot, 'tokens'), { recursive: true })
    await writeFile(
      path.join(themeRoot, 'tokens', 'token-circle.svg'),
      '<svg><filter/></svg>',
    )
    await writeFile(
      path.join(themeRoot, 'audio.json'),
      JSON.stringify({
        schemaVersion: 1,
        sounds: { collision: { volume: 0.2 } },
      }),
    )

    const { manifest, warnings } = await resolveThemeManifest(
      resolutionOptions(themeRoot),
    )

    expect(
      manifest.visuals.find((entry) => entry.mediaId === 'token-circle')
        .sourceScope,
    ).toBe('default')
    expect(
      manifest.audio.find((entry) => entry.soundId === 'collision')
        .settingsSourceScope,
    ).toBe('default')
    expect(warnings.some((warning) => warning.includes('token-circle.svg'))).toBe(
      true,
    )
    expect(warnings.some((warning) => warning.includes('collision'))).toBe(true)
  })

  it('can override audio files and complete settings independently', async () => {
    const themeRoot = await temporaryTheme()
    const themeAudioRoot = path.join(themeRoot, 'audio')
    await mkdir(path.join(themeAudioRoot, 'source'), { recursive: true })
    for (const relativePath of [
      path.join('source', 'collision.wav'),
      'collision.webm',
      'collision.mp3',
    ]) {
      await copyFile(
        path.join(defaultRoot, 'audio', relativePath),
        path.join(themeAudioRoot, relativePath),
      )
    }
    const collisionSettings = {
      ...defaultAudioSettings.sounds.collision,
      volume: 0.25,
    }
    await writeFile(
      path.join(themeRoot, 'audio.json'),
      JSON.stringify({
        schemaVersion: 1,
        sounds: { collision: collisionSettings },
      }),
    )

    const { manifest } = await resolveThemeManifest(resolutionOptions(themeRoot))
    const collision = manifest.audio.find((entry) => entry.soundId === 'collision')

    expect(collision.fileSourceScope).toBe('theme')
    expect(collision.settingsSourceScope).toBe('theme')
    expect(collision.settings.volume).toBe(0.25)
  })

  it('treats invalid default media as fatal', async () => {
    await expect(
      resolveThemeManifest({
        ...resolutionOptions(),
        mediaRegistry: {
          schemaVersion: 1,
          mediaVersion: 1,
          media: [
            {
              mediaId: 'missing',
              category: 'tokens',
              fileName: 'missing.svg',
              renderMode: 'vector',
              sizing: 'contain',
            },
          ],
        },
      }),
    ).rejects.toThrow(/required asset is missing/)
  })

  it('detects unknown standardized media files', async () => {
    const themeRoot = await temporaryTheme()
    await mkdir(path.join(themeRoot, 'tokens'), { recursive: true })
    await writeFile(
      path.join(themeRoot, 'tokens', 'not-registered.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
    )

    expect(
      await findUnknownMediaFiles(themeRoot, mediaRegistry, soundRegistry),
    ).toEqual(['tokens/not-registered.svg'])
  })
})

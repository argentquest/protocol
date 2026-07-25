import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateSvgSource } from '../../scripts/lib/validate-svg.mjs'
import mediaRegistry from './mediaRegistry.json'

const defaultMediaRoot = path.resolve('public', 'media', 'default')

describe('default vector SVG media', () => {
  it('provides one compatible default file for every registered media ID', async () => {
    const results = await Promise.all(
      mediaRegistry.media.map(async (entry) => {
        const relativePath = path.join(entry.category, entry.fileName)
        const source = await readFile(path.join(defaultMediaRoot, relativePath), 'utf8')
        return validateSvgSource(source, relativePath)
      }),
    )

    expect(results.flat()).toEqual([])
  })

  it('covers contain and stretch sizing fixtures', () => {
    const sizingModes = new Set(mediaRegistry.media.map((entry) => entry.sizing))
    expect(sizingModes).toEqual(new Set(['contain', 'stretch']))
  })

  it('rejects unsupported and externally dependent SVG features', () => {
    const invalid = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90">
        <filter id="blur"></filter>
        <image href="https://example.test/image.png"/>
        <text>Unsafe</text>
      </svg>
    `

    expect(validateSvgSource(invalid, 'invalid.svg')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('viewBox'),
        expect.stringContaining('<filter>'),
        expect.stringContaining('<image>'),
        expect.stringContaining('<text>'),
        expect.stringContaining('referenced resources'),
      ]),
    )
  })

  it('rejects fixed root dimensions and opaque full-canvas backgrounds', () => {
    const invalid = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100">
        <rect x="0" y="0" width="100" height="100" fill="#000000"/>
      </svg>
    `

    expect(validateSvgSource(invalid, 'background.svg')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fixed width or height'),
        expect.stringContaining('transparent-background'),
      ]),
    )
  })
})

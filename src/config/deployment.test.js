import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest from '../../public/media/manifests/future-lab.json'

describe('production deployment contract', () => {
  it('builds media with FFmpeg but keeps the Nginx runtime minimal', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    expect(dockerfile).toContain('apt-get install --yes --no-install-recommends ffmpeg')
    expect(dockerfile).toContain('RUN npm run build')
    expect(dockerfile).toContain('FROM nginx:1.27-alpine AS runtime')
    expect(dockerfile.split('FROM nginx:1.27-alpine AS runtime')[1]).not.toMatch(
      /node|ffmpeg|npm/,
    )
  })

  it('supports a configurable Vite base and the protocol proxy prefix', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    const compose = readFileSync('docker-compose.yml', 'utf8')
    const nginx = readFileSync('docker/nginx.conf', 'utf8')
    const vite = readFileSync('vite.config.js', 'utf8')

    expect(dockerfile).toContain('ARG VITE_BASE_PATH=/')
    expect(compose).toContain('VITE_BASE_PATH: ${VITE_BASE_PATH:-/}')
    expect(vite).toContain('base: normalizeBasePath(process.env.VITE_BASE_PATH)')
    expect(nginx).toMatch(/location \^~ \/protocol\/[\s\S]*rewrite/)
  })

  it('separates immutable application/media caching from mutable manifests', () => {
    const nginx = readFileSync('docker/nginx.conf', 'utf8')
    expect(nginx).toMatch(/location \/assets\/[\s\S]*expires 1y/)
    expect(nginx).toMatch(/location \/media\/manifests\/[\s\S]*expires -1/)
    expect(nginx).toMatch(/location \/media\/[\s\S]*expires 1y/)
    for (const visual of manifest.visuals) expect(visual.src).toMatch(/\?v=1$/)
    for (const audio of manifest.audio) {
      expect(audio.sources.every((source) => source.endsWith('?v=1'))).toBe(true)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest from '../../public/media/manifests/future-lab.json'

describe('production deployment contract', () => {
  it('builds media with FFmpeg and runs the API through production Node', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(dockerfile).toContain('apt-get install --yes --no-install-recommends ffmpeg')
    expect(dockerfile).toContain('RUN npm run build')
    expect(dockerfile).toContain('FROM node:20.19-bookworm-slim AS runtime')
    expect(dockerfile).toContain('RUN npm ci --omit=dev')
    expect(dockerfile).toContain('CMD ["node", "server/index.js"]')
    expect(packageManifest.dependencies['ffmpeg-static']).toBeDefined()
    expect(dockerfile).toContain('/app/scripts ./scripts')
    expect(dockerfile).toContain('/app/public ./public')
    expect(dockerfile).toContain('/app/PublicMedia ./PublicMedia')
  })

  it('supports a configurable Vite base and persistent application volume', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    const compose = readFileSync('docker-compose.yml', 'utf8')
    const vite = readFileSync('vite.config.js', 'utf8')

    expect(dockerfile).toContain('ARG VITE_BASE_PATH=/')
    expect(compose).toContain('VITE_BASE_PATH: ${VITE_BASE_PATH:-/}')
    expect(vite).toContain('base: normalizeBasePath(process.env.VITE_BASE_PATH)')
    expect(compose).toContain('path-protocol-data:/app/data')
    expect(dockerfile).toContain('PATH_PROTOCOL_DATA_DIR=/app/data/themes')
    expect(dockerfile).toContain(
      'PATH_PROTOCOL_DB_PATH=/app/data/path-protocol.sqlite',
    )
  })

  it('separates immutable application/media caching from mutable manifests', () => {
    const server = readFileSync('server/app.js', 'utf8')
    expect(server).toContain("normalized.includes('/media/manifests/')")
    expect(server).toContain("'cache-control', 'no-cache'")
    expect(server).toContain('public, max-age=31536000, immutable')
    for (const visual of manifest.visuals) expect(visual.src).toMatch(/\?v=1$/)
    for (const audio of manifest.audio) {
      expect(audio.sources.every((source) => source.endsWith('?v=1'))).toBe(true)
    }
  })
})

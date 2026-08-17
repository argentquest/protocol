import { existsSync, readFileSync } from 'node:fs'
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

  it('documents the production server and marks the remote-development image', () => {
    const readme = readFileSync('README.md', 'utf8')
    const developmentDockerfile = readFileSync('Dockerfile.dev', 'utf8')
    const developmentEntrypoint = readFileSync('entrypoint.sh', 'utf8')

    expect(readme).toContain('production Node/Express server')
    expect(readme).toContain('http://localhost:8080/api/health')
    expect(readme).not.toContain('http://localhost:8080/healthz')
    expect(developmentDockerfile).toContain('DEVELOPMENT ONLY')
    expect(developmentEntrypoint).toContain('must not be used in production')
  })

  it('pins and bounds required GitHub Actions workflows', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    const codeql = readFileSync('.github/workflows/codeql.yml', 'utf8')

    for (const workflow of [ci, codeql]) {
      expect(workflow).toContain('cancel-in-progress: true')
      expect(workflow).toContain('timeout-minutes:')
      expect(workflow).not.toMatch(/uses: [^\n]+@(v|main|master)\d*\s*$/m)
    }
  })

  it('keeps the branch-published GitHub Pages landing site complete', () => {
    const page = readFileSync('docs/index.html', 'utf8')
    const styles = readFileSync('docs/assets/site.css', 'utf8')

    expect(existsSync('docs/.nojekyll')).toBe(true)
    expect(page).toContain('<html lang="en">')
    expect(page).toContain('https://argentquest.github.io/protocol/')
    expect(page).toContain('https://app.inkandquill.io/protocol/')
    expect(page).toContain('https://github.com/argentquest/protocol')
    expect(page).toContain('class="skip-link"')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')

    for (const asset of [
      'path-protocol-social-preview.jpg',
      'path-protocol-origin-story.jpg',
      'path-protocol-theme-workshop.jpg',
    ]) {
      expect(existsSync(`docs/assets/${asset}`)).toBe(true)
      expect(page).toContain(`assets/${asset}`)
    }
  })
})

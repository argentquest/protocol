import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testDataRoot = await mkdtemp(path.join(os.tmpdir(), 'path-protocol-e2e-'))
const testPort = 42_000 + (process.pid % 2_000)
const previewUrl = `http://127.0.0.1:${testPort}`

const preview = spawn(
  process.execPath,
  ['server/index.js'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH_PROTOCOL_DATA_DIR: path.join(testDataRoot, 'themes'),
      PATH_PROTOCOL_DB_PATH: path.join(testDataRoot, 'accounts.sqlite'),
      PORT: String(testPort),
    },
    stdio: 'ignore',
    windowsHide: true,
  },
)

/**
 * Polls the isolated production server until it accepts HTTP requests.
 *
 * @returns {Promise<void>} Resolves when the preview is ready.
 * @throws {Error} If the server is not ready within 15,000 milliseconds.
 */
async function waitForPreview() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(previewUrl)
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Production server did not become ready within 15 seconds.')
}

/** Stops the child preview server when it is still running. */
function stopPreview() {
  if (preview.exitCode === null && !preview.killed) preview.kill()
}

process.once('SIGINT', () => {
  stopPreview()
  process.exitCode = 130
})
process.once('SIGTERM', stopPreview)

try {
  await waitForPreview()
  const playwright = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      ...process.argv.slice(2),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: previewUrl,
        PLAYWRIGHT_EXTERNAL_SERVER: '1',
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  const exitCode = await new Promise((resolve) => {
    playwright.once('exit', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  const previewStopped =
    preview.exitCode === null
      ? new Promise((resolve) => preview.once('exit', resolve))
      : Promise.resolve()
  stopPreview()
  await previewStopped
  await rm(testDataRoot, { recursive: true, force: true })
}

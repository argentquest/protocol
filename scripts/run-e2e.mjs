import { spawn } from 'node:child_process'

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  },
)

async function waitForPreview() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4173')
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Vite preview did not become ready within 15 seconds.')
}

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
    ['node_modules/@playwright/test/cli.js', 'test'],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: '1' },
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  const exitCode = await new Promise((resolve) => {
    playwright.once('exit', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  stopPreview()
}

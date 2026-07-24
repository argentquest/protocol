import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1',
        port: 4173,
        reuseExistingServer: true,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

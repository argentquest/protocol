import { expect, test } from '@playwright/test'
import { dismissAnalytics, selectDefaultTheme } from './appSetup.js'

async function boot(page) {
  await page.goto('/')
  await dismissAnalytics(page)
  await page.getByRole('button', { name: /start game/i }).click()
  await selectDefaultTheme(page)
  await expect(page.getByRole('heading', { name: /find the line/i })).toBeVisible()
}

test('keeps the home and gameplay composition stable at desktop viewports', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium' || process.platform !== 'win32',
    'Visual baselines use Chromium on Windows.',
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page)
  await expect(page).toHaveScreenshot('home-1440x900.png', {
    animations: 'disabled',
    fullPage: true,
    timeout: 20_000,
  })

  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = page.locator('.three-arena canvas')
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  })
  await expect(page).toHaveScreenshot('level-01-1440x900.png', {
    animations: 'disabled',
    fullPage: true,
    timeout: 20_000,
  })

  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect(page.locator('.game-layout')).toBeVisible()
  await expect(page.locator('.hud-panel')).toBeVisible()
  await expect(page.locator('.three-arena')).toBeVisible()
})

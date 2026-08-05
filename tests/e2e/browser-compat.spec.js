import { expect, test } from '@playwright/test'

test('starts WebGL gameplay and keyboard input in a supported desktop engine', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /start game/i }).click()
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = page.locator('.three-arena canvas')
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  })
  await page.keyboard.press('Space')
  await expect(page.getByText(/keyboard link active/i)).toBeVisible()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowRight')
  expect(Number(await canvas.getAttribute('data-token-x'))).toBeGreaterThan(0)
})

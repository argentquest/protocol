import { expect, test } from '@playwright/test'

test('navigates from the home screen to the first playable level', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /find the line/i })).toBeVisible()
  await page.getByRole('button', { name: /select level/i }).click()
  await expect(page.getByRole('heading', { name: /select a chamber/i })).toBeVisible()
  await page.getByRole('button', { name: /01.*calibration/i }).click()
  await expect(page.getByRole('application', { name: /calibration obstacle course/i })).toBeVisible()
  await expect(page.getByText(/press and hold the token/i)).toBeVisible()

  const centers = await page.evaluate(() => {
    const center = (selector) => {
      const matrix = document.querySelector(selector).getScreenCTM()
      return { x: matrix.e, y: matrix.f }
    }
    return { token: center('.token'), target: center('.target--main') }
  })
  await page.mouse.move(centers.token.x, centers.token.y)
  await page.mouse.down()
  await page.mouse.move(centers.target.x, centers.target.y, { steps: 90 })
  await expect(page.getByText(/release to bank your score/i)).toBeVisible()
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: /new chamber record/i })).toBeVisible()
  await expect(page.getByText(/protocol 01 complete/i)).toBeVisible()
})

test('opens the field guide and settings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /field guide/i }).click()
  await expect(page.getByRole('heading', { name: /one drag/i })).toBeVisible()
  await page.getByRole('button', { name: /controls/i }).click()
  await expect(page.getByRole('heading', { name: /operator settings/i })).toBeVisible()
})

test('counts a continuous invalid position as one collision', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const token = await page.evaluate(() => {
    const matrix = document.querySelector('.token').getScreenCTM()
    return { x: matrix.e, y: matrix.f }
  })
  const arena = await page.locator('.game-arena').boundingBox()

  await page.mouse.move(token.x, token.y)
  await page.mouse.down()
  await page.mouse.move(arena.x - 40, token.y, { steps: 35 })
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(1)
  await expect(page.getByText(/2 remaining/i)).toBeVisible()
  await page.mouse.up()
})

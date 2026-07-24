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

test('manually restarts an active attempt with the restart shortcut', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const token = await page.evaluate(() => {
    const matrix = document.querySelector('.token').getScreenCTM()
    return { x: matrix.e, y: matrix.f }
  })

  await page.mouse.move(token.x, token.y)
  await page.mouse.down()
  await page.mouse.move(token.x + 35, token.y - 25, { steps: 8 })
  await expect(page.getByText(/main protocol target active/i)).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByText(/attempt restarted.*layout preserved/i)).toBeVisible()
  await page.mouse.up()
  await expect(page.getByText(/press and hold the token to try again/i)).toBeVisible()
  await expect(page.locator('.ghost-trail')).toHaveCount(1)
})

test('opens any level with route diagnostics in developer playtest mode', async ({ page }) => {
  await page.goto('/?dev=1')
  await expect(page.getByText(/dev playtest/i)).toBeVisible()
  await page.getByRole('button', { name: /select level/i }).click()

  const finalLevel = page.getByRole('button', { name: /10.*final protocol/i })
  await expect(finalLevel).toBeEnabled()
  await finalLevel.click()

  await expect(page.getByTestId('playtest-diagnostics')).toContainText(/seed/i)
  await expect(page.locator('.debug-route')).toBeVisible()
  await expect(page.getByRole('button', { name: /next playtest level/i })).toBeDisabled()
  await page.getByRole('button', { name: /previous playtest level/i }).click()
  await expect(page.getByRole('application', { name: /containment obstacle course/i })).toBeVisible()
})

test('keeps moving obstacles animated while the held token is stationary', async ({ page }) => {
  await page.goto('/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /07.*motion detected/i }).click()

  const token = await page.evaluate(() => {
    const matrix = document.querySelector('.token').getScreenCTM()
    return { x: matrix.e, y: matrix.f }
  })
  await page.mouse.move(token.x, token.y)
  await page.mouse.down()

  const movingObstacle = page.locator('.obstacle--moving').first()
  const firstTransform = await movingObstacle.getAttribute('transform')
  await page.waitForTimeout(350)
  const secondTransform = await movingObstacle.getAttribute('transform')

  expect(secondTransform).not.toBe(firstTransform)
  await page.mouse.up()
})

test('restarts a pursued bonus drag from the reached target while time continues', async ({
  page,
}) => {
  await page.goto('/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /03.*tight tolerances/i }).click()
  const route = await page.evaluate(() => {
    const svg = document.querySelector('.game-arena')
    const matrix = svg.getScreenCTM()
    const routePoints = document.querySelector('.debug-route').points
    return Array.from(routePoints).map((point) => ({
      x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    }))
  })

  await page.mouse.move(route[0].x, route[0].y)
  await page.mouse.down()
  for (const point of route.slice(1)) {
    await page.mouse.move(point.x, point.y)
  }
  await page.mouse.up()

  const dialog = page.getByRole('dialog', { name: /bonus target available/i })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: /ok.*pursue bonus/i }).click()
  await expect(page.getByText(/press and hold the token to continue/i)).toBeVisible()

  const checkpoint = await page.evaluate(() => {
    const center = (selector) => {
      const matrix = document.querySelector(selector).getScreenCTM()
      return { x: matrix.e, y: matrix.f }
    }
    return { token: center('.token'), target: center('.target--main') }
  })
  expect(checkpoint.token.x).toBeCloseTo(checkpoint.target.x, 1)
  expect(checkpoint.token.y).toBeCloseTo(checkpoint.target.y, 1)

  const elapsedBefore = await page.locator('.hud-readout').filter({ hasText: 'Time' }).innerText()
  await page.waitForTimeout(250)
  const elapsedAfter = await page.locator('.hud-readout').filter({ hasText: 'Time' }).innerText()
  expect(elapsedAfter).not.toBe(elapsedBefore)

  await page.mouse.move(checkpoint.token.x, checkpoint.token.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: /playtest run captured/i })).toBeVisible()
})

import { expect, test } from '@playwright/test'

async function boot(page, url = '/') {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: /starting up/i })).toBeVisible()
  await page.getByRole('button', { name: /start game/i }).click()
}

async function readyCanvas(page) {
  const canvas = page.locator('.pixi-arena canvas')
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  })
  await canvas.scrollIntoViewIfNeeded()
  return canvas
}

async function worldToPage(canvas, point) {
  const box = await canvas.boundingBox()
  const scale = Math.min(box.width, box.height) / 1000
  return {
    x: box.x + (box.width - 1000 * scale) / 2 + point.x * scale,
    y: box.y + (box.height - 1000 * scale) / 2 + point.y * scale,
  }
}

async function dataPoint(canvas, prefix) {
  return worldToPage(canvas, {
    x: Number(await canvas.getAttribute(`data-${prefix}-x`)),
    y: Number(await canvas.getAttribute(`data-${prefix}-y`)),
  })
}

test('navigates from the home screen to the first playable level', async ({ page }) => {
  await boot(page)
  await expect(page.getByRole('heading', { name: /find the line/i })).toBeVisible()
  await page.getByRole('button', { name: /select level/i }).click()
  await expect(page.getByRole('heading', { name: /select a chamber/i })).toBeVisible()
  await page.getByRole('button', { name: /01.*calibration/i }).click()
  const canvas = await readyCanvas(page)
  await expect(
    page.getByRole('application', { name: /calibration obstacle course/i }).first(),
  ).toBeVisible()
  const start = await dataPoint(canvas, 'token')
  const next = await worldToPage(
    canvas,
    JSON.parse(await canvas.getAttribute('data-validated-path'))[1],
  )
  await page.mouse.click(start.x, start.y)
  await page.mouse.move(next.x, next.y)
  await expect(page.getByText(/token linked/i)).toBeVisible()
})

test('opens the field guide and settings', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: /field guide/i }).click()
  await expect(page.getByRole('heading', { name: /one route/i })).toBeVisible()
  await page.getByRole('button', { name: /controls/i }).click()
  await expect(page.getByRole('heading', { name: /operator settings/i })).toBeVisible()
})

test('counts a continuous invalid position as one collision', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  await canvas.evaluate((element) => {
    window.__pathProtocolReleaseCanvas = element
  })
  const token = await dataPoint(canvas, 'token')
  const outsideArena = await worldToPage(canvas, {
    x: 5,
    y: Number(await canvas.getAttribute('data-token-y')),
  })
  await page.mouse.click(token.x, token.y)
  await page.mouse.move(outsideArena.x, outsideArena.y, { steps: 35 })
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(1)
  await expect(page.getByText(/2 remaining/i)).toBeVisible()
  await page.mouse.click(outsideArena.x, outsideArena.y)
  await expect(page.getByText(/attempt restarted/i)).toBeVisible()
  expect(
    await canvas.evaluate(
      (element) => element === window.__pathProtocolReleaseCanvas,
    ),
  ).toBe(true)
  await expect(page.locator('.pixi-arena canvas')).toHaveCount(1)
})

test('keeps the play area mounted when collecting a course coin', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'path-protocol.progress',
      JSON.stringify({
        schemaVersion: 2,
        player: {
          highestUnlockedLevel: 5,
          coins: 0,
          inventory: { 'coin-magnet': 1 },
          collectedCoins: {},
          claimedCompletionRewards: {},
          claimedBonusRewards: {},
        },
        levels: {},
        settings: {
          musicEnabled: false,
          musicVolume: 0.22,
          effectsEnabled: false,
          effectsVolume: 0.55,
          reducedMotion: false,
        },
      }),
    )
  })
  await boot(page)
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /05.*long route/i }).click()
  const canvas = await readyCanvas(page)
  await canvas.evaluate((element) => {
    window.__pathProtocolCoinCanvas = element
  })
  const token = await dataPoint(canvas, 'token')

  await page.mouse.click(token.x, token.y)
  await page.keyboard.press('4')
  await expect(canvas).toHaveAttribute('data-active-powers', /coinMagnet/)
  await expect(page.getByText(/coin collected.*\+1 gold/i)).toBeVisible({
    timeout: 5000,
  })

  expect(
    await canvas.evaluate(
      (element) => element === window.__pathProtocolCoinCanvas,
    ),
  ).toBe(true)
  await expect(page.locator('.pixi-arena canvas')).toHaveCount(1)
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true')
  await page.mouse.click(token.x, token.y)
})

test('manually restarts an active attempt with the restart shortcut', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  const token = await dataPoint(canvas, 'token')
  const initialToken = {
    x: await canvas.getAttribute('data-token-x'),
    y: await canvas.getAttribute('data-token-y'),
  }
  await page.mouse.click(token.x, token.y)
  await page.mouse.move(token.x + 35, token.y - 25, { steps: 8 })
  await expect(page.getByText(/token linked/i)).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByText(/attempt restarted/i)).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ghost-count', '1')
  await expect(canvas).toHaveAttribute('data-token-x', initialToken.x)
  await expect(canvas).toHaveAttribute('data-token-y', initialToken.y)
  await expect(canvas).toHaveAttribute('data-trail-samples', '1')
  await expect(canvas).toHaveAttribute('data-phase', 'ready')
})

test('opens any level with route diagnostics in developer playtest mode', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  const finalLevel = page.getByRole('button', { name: /70.*omega protocol/i })
  await expect(finalLevel).toBeEnabled()
  await finalLevel.click()
  const canvas = await readyCanvas(page)
  await expect(page.getByTestId('playtest-diagnostics')).toContainText(/seed/i)
  expect(JSON.parse(await canvas.getAttribute('data-validated-path')).length).toBeGreaterThan(1)
  await expect(page.getByRole('button', { name: /next playtest level/i })).toBeDisabled()
  await page.getByRole('button', { name: /previous playtest level/i }).click()
  await readyCanvas(page)
  await expect(
    page
      .getByRole('application', {
        name: /terminal convergence obstacle course/i,
      })
      .first(),
  ).toBeVisible()
})

test('toggles developer playtest mode from the home screen', async ({ page }) => {
  await boot(page, '/?dev=0')
  const toggle = page.getByRole('button', { name: 'Dev mode' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\?dev=1$/)

  await page.getByRole('button', { name: /select level/i }).click()
  await expect(
    page.getByRole('button', { name: /70.*omega protocol/i }),
  ).toBeEnabled()
})

test('keeps moving obstacles animated while mouse control is active', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /07.*motion detected/i }).click()
  const canvas = await readyCanvas(page)
  const token = await dataPoint(canvas, 'token')
  await page.mouse.click(token.x, token.y)
  const first = await canvas.getAttribute('data-moving-positions')
  await page.waitForTimeout(350)
  expect(await canvas.getAttribute('data-moving-positions')).not.toBe(first)
  await page.mouse.click(token.x, token.y)
})

test('smooths token response instead of snapping to a fast mouse jump', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  const start = await dataPoint(canvas, 'token')
  const startWorldX = Number(await canvas.getAttribute('data-token-x'))
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await page.mouse.move(start.x + 120, start.y)
  await page.waitForTimeout(30)
  const shortlyAfter = Number(await canvas.getAttribute('data-token-x'))
  expect(shortlyAfter).toBeGreaterThan(startWorldX)
  expect(shortlyAfter).toBeLessThan(startWorldX + 200)
  await page.waitForTimeout(450)
  expect(Number(await canvas.getAttribute('data-token-x'))).toBeGreaterThan(shortlyAfter)
  await page.mouse.click(start.x + 120, start.y)
})

test('toggles keyboard control with Space and steers with arrow keys', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  const startX = Number(await canvas.getAttribute('data-token-x'))
  await page.keyboard.press('Space')
  await expect(page.getByText(/keyboard link active/i)).toBeVisible()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(300)
  await page.keyboard.up('ArrowRight')
  expect(Number(await canvas.getAttribute('data-token-x'))).toBeGreaterThan(startX)
  await page.keyboard.press('Space')
  await expect(page.getByText(/attempt restarted/i)).toBeVisible()
})

test('restarts a pursued bonus drag from the reached target while time continues', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /03.*tight tolerances/i }).click()
  const canvas = await readyCanvas(page)
  const start = await dataPoint(canvas, 'token')
  const target = await dataPoint(canvas, 'target')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await page.keyboard.press('1')
  await page.keyboard.press('2')
  await page.mouse.move(target.x, target.y)
  const dialog = page.getByRole('dialog', { name: /bonus target available/i })
  for (let attempt = 0; attempt < 10 && !(await dialog.isVisible()); attempt += 1) {
    await page.waitForTimeout(1500)
    await page.keyboard.press(attempt % 2 === 0 ? '2' : '1')
  }
  await expect(dialog).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /ok.*pursue bonus/i }).click()
  await expect(page.getByText(/reactivate at the checkpoint/i)).toBeVisible()
  const tokenX = Number(await canvas.getAttribute('data-token-x'))
  const targetX = Number(await canvas.getAttribute('data-target-x'))
  expect(tokenX).toBeCloseTo(targetX, 1)
  const before = await page.locator('.hud-readout').filter({ hasText: 'Time' }).innerText()
  await page.waitForTimeout(250)
  const after = await page.locator('.hud-readout').filter({ hasText: 'Time' }).innerText()
  expect(after).not.toBe(before)
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.getByRole('heading', { name: /playtest run captured/i })).toBeVisible()
})

test('starts gradual tracking and activates numbered powers after play begins', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /11.*pursuit vector/i }).click()
  const canvas = await readyCanvas(page)
  const resting = await canvas.getAttribute('data-tracking-positions')
  await page.waitForTimeout(300)
  expect(await canvas.getAttribute('data-tracking-positions')).toBe(resting)
  const token = await dataPoint(canvas, 'token')
  await page.mouse.move(token.x, token.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await page.keyboard.press('5')
  await expect(canvas).toHaveAttribute('data-route-scan-visible', 'true')
  await page.waitForTimeout(350)
  expect(await canvas.getAttribute('data-tracking-positions')).not.toBe(resting)
  await page.mouse.click(token.x, token.y)
})

test('applies obstacle-only and full-shield boundary rules', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  let canvas = await readyCanvas(page)
  let token = await dataPoint(canvas, 'token')
  let outsideArena = await worldToPage(canvas, {
    x: 5,
    y: Number(await canvas.getAttribute('data-token-y')),
  })
  await page.mouse.click(token.x, token.y)
  await page.keyboard.press('1')
  await page.mouse.move(outsideArena.x, outsideArena.y, { steps: 20 })
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(1)
  await page.keyboard.press('r')

  canvas = await readyCanvas(page)
  token = await dataPoint(canvas, 'token')
  outsideArena = await worldToPage(canvas, {
    x: 5,
    y: Number(await canvas.getAttribute('data-token-y')),
  })
  await page.mouse.click(token.x, token.y)
  await page.keyboard.press('2')
  await expect(canvas).toHaveAttribute(
    'data-active-powers',
    /fullShield/,
  )
  await page.mouse.move(outsideArena.x, outsideArena.y)
  await page.waitForTimeout(700)
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(0)
  await page.mouse.click(outsideArena.x, outsideArena.y)
})

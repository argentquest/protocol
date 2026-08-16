import { expect, test } from '@playwright/test'
import { dismissAnalytics, selectDefaultTheme } from './appSetup.js'

async function boot(page, url = '/') {
  await page.goto(url)
  await dismissAnalytics(page)
  await expect(page.getByRole('heading', { name: /starting up/i })).toBeVisible()
  await page.getByRole('button', { name: /start game/i }).click()
  await selectDefaultTheme(page)
}

async function readyCanvas(page) {
  const canvas = page.locator('.three-arena canvas')
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  })
  await canvas.scrollIntoViewIfNeeded()
  return canvas
}

async function worldToPage(canvas, point) {
  const box = await canvas.boundingBox()
  const projected = await canvas.evaluate(
    (element, worldPoint) => element.__pathProtocolWorldToScreen(worldPoint),
    point,
  )
  return {
    x: box.x + projected.x,
    y: box.y + projected.y,
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
  await page.getByRole('button', { name: /01.*foundation 01/i }).click()
  const canvas = await readyCanvas(page)
  await expect(
    page.getByRole('application', { name: /foundation 01 obstacle course/i }).first(),
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

test('selects the visible 3D ball and changes the camera angle', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  const visibleBall = await worldToPage(canvas, {
    x: Number(await canvas.getAttribute('data-token-x')),
    y: Number(await canvas.getAttribute('data-token-y')),
    elevation: 23,
  })
  await page.mouse.click(visibleBall.x, visibleBall.y)
  await expect(page.getByText(/token linked/i)).toBeVisible()

  await page.getByRole('button', { name: /rotate camera right/i }).click()
  await expect(canvas).toHaveAttribute('data-camera-azimuth', '15')
  await page.getByRole('button', { name: /raise camera/i }).click()
  await expect(canvas).toHaveAttribute('data-camera-elevation', '56.2')
  await page.getByRole('button', { name: /reset camera angle/i }).click()
  await expect(canvas).toHaveAttribute('data-camera-azimuth', '0')
  await expect(canvas).toHaveAttribute('data-camera-elevation', '48.2')
})

test('opens the field guide and settings', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: /field guide/i }).click()
  await expect(page.getByRole('heading', { name: /one route/i })).toBeVisible()
  await page.getByRole('button', { name: /controls/i }).click()
  await expect(page.getByRole('heading', { name: /operator settings/i })).toBeVisible()
})

test('stops Guided movement at a perimeter wall without a hazard penalty', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  await canvas.evaluate((element) => {
    window.__pathProtocolReleaseCanvas = element
  })
  const token = await worldToPage(canvas, {
    x: Number(await canvas.getAttribute('data-token-x')),
    y: Number(await canvas.getAttribute('data-token-y')),
    elevation: 23,
  })
  const outsideArena = await worldToPage(canvas, {
    x: 5,
    y: Number(await canvas.getAttribute('data-token-y')),
  })
  await page.mouse.click(token.x, token.y)
  await page.mouse.move(outsideArena.x, outsideArena.y, { steps: 35 })
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(0)
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-token-x')))
    .toBeGreaterThan(20)
  expect(
    await canvas.evaluate(
      (element) => element === window.__pathProtocolReleaseCanvas,
    ),
  ).toBe(true)
  await expect(page.locator('.three-arena canvas')).toHaveCount(1)
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
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /82.*rotation 02/i }).click()
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
  await expect(page.locator('.three-arena canvas')).toHaveCount(1)
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
  const finalLevel = page.getByRole('button', { name: /100.*round green/i })
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
        name: /kenney test hole 1 obstacle course/i,
      })
      .first(),
  ).toBeVisible()
})

test('launches into deterministic height from the level 100 ramp', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: 'Ricochet' }).click()
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /100.*round green/i }).click()
  const canvas = await readyCanvas(page)
  await expect(canvas).toHaveAttribute('data-renderer', 'three-webgl')
  const tokenWorldX = Number(await canvas.getAttribute('data-token-x'))
  const tokenWorldY = Number(await canvas.getAttribute('data-token-y'))
  const token = await worldToPage(canvas, {
    x: tokenWorldX,
    y: tokenWorldY,
    elevation: 23,
  })
  const pull = await worldToPage(canvas, {
    x: tokenWorldX - 240,
    y: tokenWorldY,
    elevation: 23,
  })
  await page.mouse.move(token.x, token.y)
  await page.mouse.down()
  await page.mouse.move(pull.x, pull.y, { steps: 8 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-shots-taken', '1')
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-token-elevation')), {
      timeout: 5000,
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-token-x')), {
      timeout: 5000,
    })
    .toBeGreaterThan(300)
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
    page.getByRole('button', { name: /100.*round green/i }),
  ).toBeEnabled()
})

test('keeps moving obstacles animated while mouse control is active', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /11.*kinetics 01/i }).click()
  const canvas = await readyCanvas(page)
  const token = await dataPoint(canvas, 'token')
  await page.mouse.click(token.x, token.y)
  const first = await canvas.getAttribute('data-moving-positions')
  await page.waitForTimeout(350)
  expect(await canvas.getAttribute('data-moving-positions')).not.toBe(first)
  await page.mouse.click(token.x, token.y)
})

test('offers a Micro Protocol after completion and loads it in one Three.js canvas', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /21.*phase 01/i }).click()
  let canvas = await readyCanvas(page)
  const token = await dataPoint(canvas, 'token')
  const target = await dataPoint(canvas, 'target')

  await page.mouse.click(token.x, token.y)
  await page.keyboard.press('2')
  await page.mouse.move(target.x, target.y)
  const captured = page.getByRole('heading', {
    name: /playtest run captured/i,
  })
  const bankScore = page.getByRole('button', { name: /bank score/i })
  for (let attempt = 0; attempt < 8 && !(await captured.isVisible()); attempt += 1) {
    await page.waitForTimeout(1000)
    if (await bankScore.isVisible()) {
      await bankScore.click()
      break
    }
    await page.keyboard.press('2')
  }
  await expect(
    captured,
  ).toBeVisible({ timeout: 15_000 })

  await expect(
    page.getByRole('heading', { name: /micro protocols/i }),
  ).toBeVisible()
  await page.getByRole('button', { name: /phase window/i }).click()
  canvas = await readyCanvas(page)

  await expect(page.getByText(/micro protocol.*timing/i)).toBeVisible()
  await expect(page.locator('.three-arena canvas')).toHaveCount(1)
  const dynamicStates = JSON.parse(
    await canvas.getAttribute('data-dynamic-states'),
  )
  expect(dynamicStates.length).toBeGreaterThan(0)
  expect(dynamicStates.every((item) => item[0].startsWith('phase-'))).toBe(true)
})

test('uses the persistent home toggle for kinetic campaign movement', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  const guided = page.getByRole('button', { name: 'Guided' })
  const ricochet = page.getByRole('button', { name: 'Ricochet' })
  await expect(guided).toHaveAttribute('aria-pressed', 'true')
  await ricochet.click()
  await expect(ricochet).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  await expect(page.getByText('Shots launched')).toBeVisible()
  const shotStart = await dataPoint(canvas, 'token')
  const startWorldX = Number(await canvas.getAttribute('data-token-x'))

  await page.mouse.move(shotStart.x, shotStart.y)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-kinetic-phase', 'aiming')
  await page.mouse.move(shotStart.x - 120, shotStart.y + 20)
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-shot-power')))
    .toBeGreaterThan(0)
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole('progressbar', { name: /shot power/i })
          .getAttribute('aria-valuenow'),
      ),
    )
    .toBeGreaterThan(0)
  await page.mouse.up()

  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await expect(canvas).toHaveAttribute('data-shots-taken', '1')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-token-x')))
    .toBeGreaterThan(startWorldX)

  await page.keyboard.press('r')
  await expect(canvas).toHaveAttribute('data-phase', 'ready')
  await expect(canvas).toHaveAttribute('data-shots-taken', '0')
  await page.keyboard.press('Space')
  await expect(canvas).toHaveAttribute('data-kinetic-phase', 'aiming')
  await page.keyboard.down('ArrowRight')
  await page.keyboard.press('Space')
  await page.keyboard.up('ArrowRight')
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await expect(canvas).toHaveAttribute('data-shots-taken', '1')
})

test('smooths token response instead of snapping to a fast mouse jump', async ({ page }) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /begin calibration/i }).click()
  const canvas = await readyCanvas(page)
  const start = await dataPoint(canvas, 'token')
  const startWorldX = Number(await canvas.getAttribute('data-token-x'))
  const desiredWorldX = startWorldX + 120
  const desired = await worldToPage(canvas, {
    x: desiredWorldX,
    y: Number(await canvas.getAttribute('data-token-y')),
  })
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-phase', 'active-main')
  await page.mouse.move(desired.x, desired.y)
  await page.waitForTimeout(30)
  const shortlyAfter = Number(await canvas.getAttribute('data-token-x'))
  expect(shortlyAfter).toBeGreaterThan(startWorldX)
  expect(shortlyAfter).toBeLessThan(startWorldX + 200)
  await page.waitForTimeout(450)
  const settled = Number(await canvas.getAttribute('data-token-x'))
  // The fixed-step controller may cross the exact desired coordinate between
  // browser samples. Verify bounded settling instead of comparing two
  // timing-sensitive samples around that crossing.
  expect(Math.abs(settled - desiredWorldX)).toBeLessThan(5)
  await page.mouse.click(desired.x, desired.y)
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
  await page.getByRole('button', { name: /21.*phase 01/i }).click()
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
  await page.getByRole('button', { name: /91.*convergence 01/i }).click()
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

test('applies obstacle-only and full-shield perimeter-wall rules', async ({ page }) => {
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
  await expect(page.locator('.collision-pips .is-hit')).toHaveCount(0)
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

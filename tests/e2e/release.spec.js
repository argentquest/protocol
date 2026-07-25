import { expect, test } from '@playwright/test'

async function boot(page, url = '/') {
  await page.goto(url)
  const start = page.getByRole('button', { name: /start game/i })
  await expect(start).toBeVisible()
  await start.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: /find the line/i })).toBeVisible()
}

async function readyCanvas(page) {
  const canvas = page.locator('.pixi-arena canvas')
  await expect(canvas).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  })
  return canvas
}

test('supports keyboard navigation, named controls, and persisted reduced motion', async ({
  page,
}) => {
  await boot(page)
  const settings = page.getByRole('button', { name: /controls/i })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: /operator settings/i })).toBeVisible()
  await expect(page.getByRole('switch', { name: /ambient music/i })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('switch', { name: /sound effects/i })).toBeVisible()
  const reducedMotion = page.getByRole('switch', { name: /reduced motion/i })
  await reducedMotion.click()
  await expect(reducedMotion).toHaveAttribute('aria-checked', 'true')

  await page.reload()
  await page.getByRole('button', { name: /start game/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')
})

test('profiles WebGL frame rate with four tracking hazards', async ({
  page,
}) => {
  await boot(page, '/?dev=1')
  await page.getByRole('button', { name: /select level/i }).click()
  await page.getByRole('button', { name: /23.*vector swarm/i }).click()
  const canvas = await readyCanvas(page)
  await page.keyboard.press('Space')
  const measuredFps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0
        const started = performance.now()
        const frame = (timestamp) => {
          frames += 1
          if (timestamp - started >= 1500) {
            resolve((frames * 1000) / (timestamp - started))
            return
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
  )

  const renderer = await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2') ?? element.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : 'WebGL renderer unavailable'
  })
  test.info().annotations.push({
    type: 'performance',
    description: `${measuredFps.toFixed(1)} FPS on ${renderer}`,
  })
  // Headless CI commonly uses a software WebGL renderer. This threshold catches
  // stalls; the hardware-accelerated desktop target is recorded in PERFORMANCE.md.
  expect(measuredFps).toBeGreaterThanOrEqual(5)
  await expect.poll(async () => Number(await canvas.getAttribute('data-fps'))).toBeGreaterThan(0)
  expect(Number(await canvas.getAttribute('data-trail-samples'))).toBeLessThanOrEqual(512)
  await expect(canvas).not.toHaveAttribute('data-tracking-positions', '[]')
})

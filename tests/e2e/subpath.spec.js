import { expect, test } from '@playwright/test'

test('loads startup media from the configured protocol subpath', async ({
  page,
}) => {
  test.skip(
    process.env.PATH_PROTOCOL_SUBPATH_TEST !== '1',
    'Runs only against a VITE_BASE_PATH=/protocol/ production build.',
  )

  // Vite preview does not apply the runtime Nginx rewrite. Mirror the
  // container's /protocol/* → /* internal mapping for this browser test.
  await page.route('**/protocol/**', async (route) => {
    const target = new URL(route.request().url())
    target.pathname = target.pathname.replace(/^\/protocol/, '') || '/'
    const response = await page.request.fetch(target.href)
    await route.fulfill({ response })
  })

  const manifestRequest = page.waitForRequest((request) =>
    request.url().includes(
      '/protocol/media/manifests/future-lab.json',
    ),
  )
  await page.goto('/protocol/')
  await expect(
    page.getByRole('heading', { name: /starting up the game/i }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /start game/i }),
  ).toBeVisible({ timeout: 30_000 })
  expect((await manifestRequest).url()).toContain(
    '/protocol/media/manifests/future-lab.json',
  )
})

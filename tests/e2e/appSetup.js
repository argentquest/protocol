/**
 * Declines optional analytics so unrelated browser journeys remain isolated.
 *
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves after the notice is dismissed when present.
 */
export async function dismissAnalytics(page) {
  const decline = page.getByRole('button', { name: /^decline$/i })
  if (await decline.isVisible()) await decline.click()
}

/**
 * Selects the official campaign when a clean browser reaches first-visit setup.
 *
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves after any theme choice is complete.
 */
export async function selectDefaultTheme(page) {
  const chooser = page.getByRole('heading', { name: /pick a public theme/i })
  if (await chooser.isVisible()) {
    await page.getByRole('button', { name: /play default/i }).click()
  }
}

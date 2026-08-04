import { expect, test } from '@playwright/test'

async function boot(page) {
  await page.goto('/')
  await page.getByRole('button', { name: /start game/i }).click()
  await expect(page.getByRole('heading', { name: /find the line/i })).toBeVisible()
}

test('clones, edits, playtests, publishes, and deletes a server theme', async ({
  page,
}) => {
  await boot(page)
  await page.getByRole('button', { name: /theme workshop/i }).click()
  await expect(
    page.getByRole('heading', { name: 'Theme Workshop' }),
  ).toBeVisible()

  const username = `browser_${Date.now()}`
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email address').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill('browser-password-42')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()

  const themeName = `Browser Workshop ${Date.now()}`
  await page.getByLabel('Theme name').fill(themeName)
  await page.getByLabel('Description').fill('Created by the browser release test.')
  await page.getByRole('button', { name: /clone campaign/i }).click()

  const editableCard = page
    .getByRole('heading', { name: themeName })
    .locator('..')
  await expect(editableCard).toBeVisible({ timeout: 30_000 })
  await editableCard.getByRole('button', { name: /open editor/i }).click()
  await expect(page.getByRole('heading', { name: themeName })).toBeVisible()
  await expect(page.locator('.workshop-level-list article')).toHaveCount(100)

  const mediaPanel = page.locator('.theme-media-editor')
  await expect(
    mediaPanel.getByText(/choose a theme element above to open/i),
  ).toBeVisible()
  await mediaPanel.getByLabel('Theme element').selectOption('arena-standard')
  await expect(mediaPanel.getByText(/folders and .* image files/i)).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    mediaPanel.getByRole('complementary', { name: 'PublicMedia folders' }),
  ).toBeVisible()
  await expect(mediaPanel.getByText(/used · .* remaining of 500\.0 MiB/i)).toBeVisible()
  await mediaPanel.locator('.theme-media-upload input[type="file"]').setInputFiles(
    'public/media/themes/celestial-foundry/tokens/token-circle.png',
  )
  await expect(
    mediaPanel.getByRole('button', { name: /my uploads/i }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    mediaPanel.getByRole('button', { name: /token-circle\.png/i }).last(),
  ).toBeVisible({ timeout: 30_000 })
  const mediaFiles = mediaPanel.locator('.theme-media-grid button[aria-pressed]')
  for (let depth = 0; depth < 10 && (await mediaFiles.count()) === 0; depth += 1) {
    const folders = mediaPanel.locator('.theme-media-folder-tile')
    await expect(folders.first()).toBeVisible()
    await folders.first().click()
    await expect(mediaPanel.getByRole('status')).not.toHaveText(
      /loading media folder/i,
    )
  }
  await expect(mediaFiles.first()).toBeVisible()
  await mediaFiles.first().click()
  await expect(
    mediaPanel.getByRole('region', { name: 'Selected media preview' }),
  ).toBeVisible()
  await mediaPanel.getByRole('button', { name: /use selected image/i }).click()
  await expect(mediaPanel.getByRole('status')).toContainText(
    `Saved arena-standard in ${themeName}.`,
    { timeout: 30_000 },
  )

  await page
    .locator('.workshop-level-list article')
    .first()
    .getByRole('button', { name: /edit level/i })
    .click()
  await expect(
    page.getByRole('application', { name: /10-unit level placement grid/i }),
  ).toBeVisible()

  const coin = page.locator('.editor-entity--coins').first()
  await coin.click()
  const selectedEntityJson = page.getByLabel('Selected entity JSON')
  const originalCoinSize = await selectedEntityJson.evaluate((element) =>
    JSON.parse(element.value).size,
  )
  const eastHandle = coin.locator('[data-resize-handle="e"]')
  await expect(eastHandle).toBeVisible()
  const handleBox = await eastHandle.boundingBox()
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 36, handleBox.y + handleBox.height / 2)
  await page.mouse.up()
  await expect.poll(() =>
    selectedEntityJson.evaluate((element) => JSON.parse(element.value).size),
  ).toBeGreaterThan(originalCoinSize)

  await coin.click({ button: 'right' })
  const objectMenu = page.getByRole('menu', { name: 'Selected object actions' })
  await expect(objectMenu.getByRole('menuitem', { name: /change image/i })).toBeVisible()
  await expect(objectMenu.getByRole('menuitem', { name: /change sound/i })).toBeEnabled()
  await objectMenu.getByRole('menuitem', { name: /show object json/i }).click()
  const objectJsonEditor = page.getByRole('dialog', { name: /object json:/i })
  const objectJson = objectJsonEditor.getByLabel('Selected object JSON')
  await expect(objectJson).toHaveValue(/"mediaId"/)
  expect(await objectJson.inputValue()).not.toContain('"schemaVersion"')
  await objectJsonEditor.getByRole('button', { name: /close object json editor/i }).click()

  await coin.click({ button: 'right' })
  await objectMenu.getByRole('menuitem', { name: /change sound/i }).click()
  const soundDialog = page.getByRole('dialog', { name: /coin-.* media/i })
  await expect(soundDialog.getByLabel('Override type')).toHaveValue('audio')
  await expect(
    soundDialog.getByRole('complementary', { name: 'PublicMedia folders' }),
  ).toBeVisible()
  await expect(soundDialog.getByRole('navigation', { name: 'Media folder path' })).toBeVisible()
  await expect(soundDialog.getByRole('status')).not.toHaveText(/loading media library/i)
  await soundDialog.getByRole('button', { name: /close media override/i }).click()

  await coin.click({ button: 'right' })
  await objectMenu.getByRole('menuitem', { name: /change image/i }).click()
  const imageDialog = page.getByRole('dialog', { name: /coin-.* media/i })
  await expect(imageDialog.getByLabel('Override type')).toHaveValue('visual')
  await expect(imageDialog.locator('.theme-media-browser')).toBeVisible()
  await expect(imageDialog.locator('.theme-media-folder-tile').first()).toBeVisible()
  await imageDialog.getByRole('button', { name: /close media override/i }).click()

  await page.getByRole('button', { name: /open full-level json editor/i }).click()
  const jsonEditor = page.getByRole('dialog', { name: 'Full level JSON' })
  await expect(jsonEditor.getByLabel('Full level JSON')).toBeVisible()
  const referencePopupPromise = page.waitForEvent('popup')
  await jsonEditor
    .getByRole('button', { name: 'Open node and property guide' })
    .click()
  const referencePopup = await referencePopupPromise
  await expect(referencePopup).toHaveTitle('Theme Workshop JSON Reference')
  await expect(referencePopup.locator('body')).toContainText(
    'Theme Workshop JSON Reference',
  )
  await expect(
    referencePopup.getByRole('complementary', {
      name: 'Designer reference navigation',
    }),
  ).toBeVisible()
  await expect(referencePopup.locator('main table').first()).toBeVisible()
  await referencePopup.close()
  await jsonEditor.getByRole('button', { name: 'Validate JSON' }).click()
  await expect(
    jsonEditor.getByText('Schema and gameplay validation passed.'),
  ).toBeVisible({ timeout: 30_000 })
  await jsonEditor.getByRole('button', { name: 'Cancel' }).click()
  await expect(jsonEditor).not.toBeVisible()

  await page.getByLabel('Level name').fill('')
  await expect(page.getByText(/not saved: level validation failed/i)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('button', { name: 'Playtest' })).toBeDisabled()

  await page.getByLabel('Level name').fill('Workshop Foundation')
  await expect(page.getByText('Autosaved.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /validate and save/i }).click()
  await expect(page.getByText(/valid save completed/i)).toBeVisible()

  await page.getByRole('button', { name: 'Playtest' }).click()
  await expect(page.locator('.pixi-arena canvas')).toHaveAttribute(
    'data-engine-ready',
    'true',
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: /return to editor/i }).click()
  await page.getByRole('button', { name: /close editor/i }).click()

  await page.getByRole('button', { name: /publish theme/i }).click()
  await expect(page.getByRole('button', { name: /make private/i })).toBeVisible()
  await page.getByRole('button', { name: /back to themes/i }).click()

  const publishedGallery = page
    .locator('.theme-gallery')
    .filter({ has: page.getByRole('heading', { name: 'Published themes' }) })
  await publishedGallery
    .getByRole('heading', { name: themeName })
    .locator('..')
    .getByRole('button', { name: /play theme/i })
    .click()
  await expect(page.getByText(`Protocol archive // ${themeName}`)).toBeVisible()

  await page.getByRole('button', { name: /theme workshop/i }).click()
  const ownedGallery = page
    .locator('.theme-gallery')
    .filter({ has: page.getByRole('heading', { name: 'Your editable themes' }) })
  await ownedGallery
    .getByRole('heading', { name: themeName })
    .locator('..')
    .getByRole('button', { name: /open editor/i })
    .click()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /delete theme/i }).click()
  await expect(
    page.getByRole('heading', { name: 'Theme Workshop' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible()
})

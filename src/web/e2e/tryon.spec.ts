import type { Page } from '@playwright/test'
import { expect, openApp, settle, test } from './fixtures'

/**
 * Build a stand-in "photo": the app's own bare 3D mannequin, screenshotted front-on.
 * Hiding and re-showing every layer leaves the shared "hidden layers" state exactly as it was found,
 * since that state is shared between the 3D and photo views.
 */
async function makePersonPhoto(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await settle(page, 1200)
  await page.addStyleTag({ content: '.stage .views,.stage .tag,.stage .hint,.stage .ruler{visibility:hidden!important}' })
  const hide = page.getByRole('button', { name: /^Hide / })
  while (await hide.count()) await hide.first().click()
  await settle(page, 500)
  const photo = await page.locator('.stage canvas').screenshot()
  // undo both changes: restore each layer, and remove the style tag so the view controls work again later
  const show = page.getByRole('button', { name: /^Show / })
  while (await show.count()) await show.first().click()
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.stage .views') && s.remove()))
  return photo
}

async function openPhotoTab(page: Page) {
  await page.getByRole('button', { name: 'My photo' }).click()
}
const upload = (page: Page, buf: Buffer, name = 'me.png') => page.locator('#try-photo').setInputFiles({ name, mimeType: 'image/png', buffer: buf })

test.describe('BAT-13 photo try-on', () => {
  test('starts empty, with the privacy note, and offers to choose a photo', async ({ page }) => {
    await openApp(page)
    await openPhotoTab(page)
    await expect(page.getByRole('heading', { name: /put the outfit on your photo/i })).toBeVisible()
    await expect(page.getByText(/never uploaded/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
  })

  test('a real full-body photo is analysed and the outfit appears on it', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await expect(page.locator('.try-canvas')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Show original' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
  })

  test('Show original toggles between the photo alone and the dressed photo', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await settle(page, 400)
    const dressed = await page.locator('.try-canvas').screenshot()
    await page.getByRole('button', { name: 'Show original' }).click()
    await settle(page, 200)
    const original = await page.locator('.try-canvas').screenshot()
    // A soft edge blur means re-renders of the outfit aren't byte-identical, so compare against the plain photo instead.
    expect(original.equals(dressed)).toBe(false)
    await page.getByRole('button', { name: 'Show outfit' }).click()
    await settle(page, 200)
    expect((await page.locator('.try-canvas').screenshot()).equals(original)).toBe(false)
  })

  test('changing the occasion redraws the photo with the new outfit', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await settle(page, 400)
    const summer = await page.locator('.try-canvas').screenshot()
    await page.getByRole('button', { name: 'Winter' }).click()
    await settle(page, 600)
    const winter = await page.locator('.try-canvas').screenshot()
    expect(winter.equals(summer)).toBe(false)
  })

  test('hiding a layer removes it from the photo too', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await settle(page, 400)
    const withHat = await page.locator('.try-canvas').screenshot()
    await page.getByRole('button', { name: /Hide Hat/ }).click()
    await settle(page, 300)
    expect((await page.locator('.try-canvas').screenshot()).equals(withHat)).toBe(false)
  })

  test('a photo with nobody in it is rejected, with a reason, and nothing is saved', async ({ page }) => {
    const blank = await page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 400; c.height = 600
      c.getContext('2d')!.fillRect(0, 0, 400, 600)
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    })
    await openApp(page)
    await openPhotoTab(page)
    await upload(page, Buffer.from(blank))
    await expect(page.getByRole('alert')).toContainText(/couldn't find a person/i, { timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
  })

  test('a side-on photo is rejected: try-on needs to face the camera', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Side', exact: true }).click()
    await settle(page, 1200)
    await page.addStyleTag({ content: '.stage .views,.stage .tag,.stage .hint,.stage .ruler{visibility:hidden!important}' })
    const side = await page.locator('.stage canvas').screenshot()
    await openPhotoTab(page)
    await upload(page, side)
    await expect(page.getByRole('alert')).toContainText(/face the camera/i, { timeout: 60_000 })
  })

  test('the photo is remembered on this device and survives a reload', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await page.reload()
    await openPhotoTab(page)
    await expect(page.locator('.try-canvas')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toHaveCount(0)
  })

  test('Remove photo clears it, including after a reload', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Remove photo' }).click()
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
    await page.reload()
    await openPhotoTab(page)
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
  })

  test('Change photo replaces it with a new analysis', async ({ page }) => {
    await openApp(page)
    const front = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, front, 'first.png')
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await settle(page, 400)
    const first = await page.locator('.try-canvas').screenshot()

    await page.getByRole('button', { name: '3D figure' }).click()
    await page.getByRole('button', { name: 'Shuffle look' }).click()
    const second = await makePersonPhoto(page)
    await openPhotoTab(page)
    await page.getByRole('button', { name: 'Change photo' }).click()
    await upload(page, second, 'second.png')
    await settle(page, 800)
    expect((await page.locator('.try-canvas').screenshot()).equals(first)).toBe(false)
  })

  test('Save image downloads a picture', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save image' }).click()])
    expect(download.suggestedFilename()).toBe('head2toe-look.png')
  })

  test('a non-image file is handled without crashing the page', async ({ page }) => {
    await openApp(page)
    await openPhotoTab(page)
    await upload(page, Buffer.from('not a picture'), 'notes.png')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
  })

  test('switching between My photo and 3D figure keeps each view working', async ({ page }) => {
    await openApp(page)
    const person = await makePersonPhoto(page)
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    await page.getByRole('button', { name: '3D figure' }).click()
    await expect(page.locator('.stage canvas')).toBeVisible()
    await openPhotoTab(page)
    await expect(page.locator('.try-canvas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toHaveCount(0)
  })

  test('photos never reach the server: no upload traffic while analysing or saving', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (r) => r.method() !== 'GET' && posts.push(`${r.method()} ${new URL(r.url()).pathname}`))
    await openApp(page)
    const person = await makePersonPhoto(page)
    posts.length = 0
    await openPhotoTab(page)
    await upload(page, person)
    await page.locator('.try-canvas').waitFor({ timeout: 60_000 })
    expect(posts).toEqual([])
  })
})

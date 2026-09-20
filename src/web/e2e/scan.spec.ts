import type { Page, Request } from '@playwright/test'
import { avatarShot, expect, openApp, register, settle, signInAs, test } from './fixtures'

const dialog = (page: Page) => page.getByRole('dialog')
const uniqueEmail = () => `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`

interface Photos { front: Buffer; side: Buffer }

/** "Photos of a person": the app's own avatar, photographed front-on and side-on. */
async function capturePhotos(page: Page): Promise<Photos> {
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await settle(page, 1500)
  const front = await avatarShot(page)
  await page.getByRole('button', { name: 'Side', exact: true }).click()
  await settle(page, 1500)
  const side = await avatarShot(page)
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  return { front, side }
}

const png = (buffer: Buffer, name: string) => ({ name, mimeType: 'image/png', buffer })

async function openScan(page: Page) {
  await page.getByRole('button', { name: /^(Scan yourself|Re-scan)$/ }).click()
  await expect(dialog(page)).toBeVisible()
}
async function setup(page: Page, height = '178', weight = '75') {
  await dialog(page).getByLabel('Height (cm)').fill(height)
  await dialog(page).getByLabel('Weight (kg)').fill(weight)
  await dialog(page).getByRole('checkbox').check()
  await dialog(page).getByRole('button', { name: 'Start' }).click()
}
async function photosAndBuild(page: Page, p: Photos) {
  await dialog(page).locator('#p-front').setInputFiles(png(p.front, 'front.png'))
  await dialog(page).getByRole('button', { name: 'Next' }).click()
  await dialog(page).locator('#p-side').setInputFiles(png(p.side, 'side.png'))
  await dialog(page).getByRole('button', { name: 'Build my avatar' }).click()
}
async function runScan(page: Page, p: Photos, height = '178', weight = '75') {
  await openScan(page)
  await setup(page, height, weight)
  await photosAndBuild(page, p)
  await expect(dialog(page).getByRole('heading', { name: 'Your avatar is ready' })).toBeVisible({ timeout: 60_000 })
}
async function fact(page: Page, name: string) {
  return (await dialog(page).locator('.facts div').filter({ hasText: name }).locator('dd').textContent())!
}
/** Save, and wait for the dialog to close, which only happens once the scan is stored (on the server when signed in). */
async function save(page: Page) {
  await dialog(page).getByRole('button', { name: /save and see my avatar/i }).click()
  await expect(dialog(page)).toHaveCount(0)
}

test.describe('BAT-8 one-time body scan', () => {
  test('cannot begin without consent, or with impossible numbers', async ({ page }) => {
    await openApp(page)
    await openScan(page)
    const start = dialog(page).getByRole('button', { name: 'Start' })
    await expect(start).toBeDisabled()
    await dialog(page).getByRole('checkbox').check()
    await expect(start).toBeEnabled()
    for (const [h, w] of [['50', '75'], ['300', '75'], ['178', '10'], ['178', '500'], ['', '75']]) {
      await dialog(page).getByLabel('Height (cm)').fill(h)
      await dialog(page).getByLabel('Weight (kg)').fill(w)
      await expect(start, `${h} cm / ${w} kg`).toBeDisabled()
    }
    await dialog(page).getByLabel('Height (cm)').fill('178')
    await dialog(page).getByLabel('Weight (kg)').fill('75')
    await expect(start).toBeEnabled()
  })

  test('walks through the steps in order and Back keeps the photo', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await openScan(page)
    await expect(dialog(page).getByText('Step 1 of 4')).toBeVisible()
    await setup(page)
    await expect(dialog(page).getByRole('heading', { name: 'Front photo' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Next' })).toBeDisabled()
    await dialog(page).locator('#p-front').setInputFiles(png(photos.front, 'front.png'))
    await expect(dialog(page).getByAltText('front photo preview')).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Next' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Side photo' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Build my avatar' })).toBeDisabled()
    await dialog(page).getByRole('button', { name: 'Back' }).click()
    await expect(dialog(page).getByAltText('front photo preview')).toBeVisible()
  })

  test('a picture with nobody in it is rejected with advice, and nothing is saved', async ({ page }) => {
    await openApp(page)
    const blank = await page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 600; c.height = 900
      const g = c.getContext('2d')!
      g.fillStyle = '#cfd5da'; g.fillRect(0, 0, 600, 900)
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    })
    const b = Buffer.from(blank)
    await openScan(page)
    await setup(page)
    await photosAndBuild(page, { front: b, side: b })
    await expect(dialog(page).getByRole('alert')).toContainText(/couldn't find a person/i, { timeout: 60_000 })
    await expect(dialog(page).getByRole('heading', { name: 'Front photo' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('h2t-guest-scan'))).toBeNull()
  })

  test('a real full-body photo pair is measured, saved on this device, and the avatar takes the saved height', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '183', '82')
    // measured from the photos, not just estimated
    await expect(dialog(page).getByText(/Measured from your photos/i)).toBeVisible()
    expect(await fact(page, 'Height')).toBe('183 cm')
    expect(await fact(page, 'Shoulders')).toMatch(/^~\d+ cm$/)
    expect(await fact(page, 'Hips')).toMatch(/^~\d+ cm$/)
    const shoulders = parseInt((await fact(page, 'Shoulders')).replace(/\D/g, ''))
    expect(shoulders).toBeGreaterThan(25)
    expect(shoulders).toBeLessThan(60)
    const build = parseInt(await fact(page, 'Build'))
    expect(build).toBeGreaterThanOrEqual(85)
    expect(build).toBeLessThanOrEqual(125)

    await save(page)
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.badge.ok').filter({ hasText: /Your scan · saved/ }).first()).toBeVisible()
    await expect(page.getByText('183 cm')).toBeVisible()
    await expect(page.locator('#build')).toHaveValue(String(build))
    await expect(page.getByRole('button', { name: 'Re-scan' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete my scan' })).toBeVisible()

    // only measurements were stored, never any image data
    const stored = await page.evaluate(() => localStorage.getItem('h2t-guest-scan')!)
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['buildPct', 'heightCm', 'savedAt', 'skinTone'])
    expect(stored.length).toBeLessThan(200)

    await page.reload()
    await expect(page.locator('.badge.ok').filter({ hasText: /Your scan · saved/ }).first()).toBeVisible()
    await expect(page.getByText('183 cm')).toBeVisible()
  })

  test('photos never leave the device: no upload, no image data in any request or in storage', async ({ page }) => {
    const sent: Request[] = []
    page.on('request', (r) => sent.push(r))
    await openApp(page)
    const photos = await capturePhotos(page)
    sent.length = 0
    await runScan(page, photos)
    await save(page)
    await expect(dialog(page)).toHaveCount(0)

    for (const r of sent) {
      const url = r.url()
      const body = r.postDataBuffer()
      if (r.method() !== 'GET') expect(body?.length ?? 0, `${r.method()} ${url} must not carry image data`).toBeLessThan(200)
      expect(r.headers()['content-type'] ?? '', url).not.toMatch(/^(multipart|image)/)
    }
    const posts = sent.filter((r) => r.method() !== 'GET').map((r) => `${r.method()} ${new URL(r.url()).pathname}`)
    expect(posts).toEqual([]) // a guest scan makes no server writes at all
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(storage).not.toMatch(/data:image|base64|blob:/)
    // the preview images are gone from the page
    await expect(page.locator('img[src^="blob:"]')).toHaveCount(0)
  })

  test('the model failing to load still gives an avatar from height and weight, and says so', async ({ page, allow }) => {
    allow(/pose_landmarker|ERR_FAILED/)
    await page.route('**/pose_landmarker_lite.task', (r) => r.abort())
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '170', '60')
    await expect(dialog(page).getByText(/estimated from height and weight/i)).toBeVisible()
    await expect(dialog(page).locator('.facts').getByText('Shoulders')).toHaveCount(0)
    await save(page)
    await expect(page.getByText('170 cm')).toBeVisible()
  })

  test('heavier and lighter people get different builds from the same photos', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '178', '55')
    const light = parseInt(await fact(page, 'Build'))
    await dialog(page).getByRole('button', { name: 'Close scan' }).click()
    await runScan(page, photos, '178', '110')
    const heavy = parseInt(await fact(page, 'Build'))
    expect(heavy).toBeGreaterThan(light + 10)
  })

  test('closing halfway saves nothing, and the next scan starts fresh', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await openScan(page)
    await setup(page)
    await dialog(page).locator('#p-front').setInputFiles(png(photos.front, 'front.png'))
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('h2t-guest-scan'))).toBeNull()
    await openScan(page)
    await expect(dialog(page).getByText('Step 1 of 4')).toBeVisible()
    await expect(dialog(page).getByRole('checkbox')).not.toBeChecked()
  })

  test('very tall heights beyond the slider range are still honoured', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '210', '110')
    await save(page)
    await expect(page.getByText('210 cm')).toBeVisible()
    await expect(page.locator('.stage canvas')).toBeVisible()
  })
})

test.describe('BAT-9 the scan follows the account', () => {
  test('a signed-in scan is saved on the server and is there after a reload', async ({ page, user, request }) => {
    await signInAs(page, user)
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '181', '78')
    const build = parseInt(await fact(page, 'Build'))
    await save(page)
    await expect(page.locator('.badge.ok').filter({ hasText: /saved/ }).first()).toContainText('Your scan · saved')

    const res = await request.get('/api/scan', { headers: { Authorization: `Bearer ${user.token}` } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ heightCm: 181, buildPct: build })
    expect(await page.evaluate(() => localStorage.getItem('h2t-guest-scan'))).toBeNull()

    await page.reload()
    await expect(page.getByText('181 cm')).toBeVisible()
    await expect(page.locator('#build')).toHaveValue(String(build))
  })

  test('sign in on another device or browser and the same avatar is there', async ({ page, user, browser }) => {
    await signInAs(page, user)
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '176', '70')
    await save(page)
    await expect(dialog(page)).toHaveCount(0)

    const other = await browser.newContext({ baseURL: 'http://localhost:5081' })
    const p2 = await other.newPage()
    await p2.goto('/')
    await p2.getByRole('button', { name: 'Sign in', exact: true }).click()
    await p2.getByRole('dialog').getByRole('button', { name: 'I have an account' }).click()
    await p2.getByRole('dialog').getByLabel('Email').fill(user.email)
    await p2.getByRole('dialog').getByLabel('Password').fill(user.password)
    await p2.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(p2.getByText('176 cm')).toBeVisible()
    await expect(p2.locator('.badge.ok').filter({ hasText: /saved/ }).first()).toContainText('Your scan · saved')
    await other.close()
  })

  test('re-scanning replaces the old scan', async ({ page, user, request }) => {
    await signInAs(page, user)
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '170', '65')
    await save(page)
    await expect(page.getByText('170 cm')).toBeVisible()
    await runScan(page, photos, '190', '90')
    await save(page)
    await expect(page.getByText('190 cm')).toBeVisible()
    const res = await request.get('/api/scan', { headers: { Authorization: `Bearer ${user.token}` } })
    expect((await res.json()).heightCm).toBe(190)
  })

  test('deleting asks first; cancelling keeps the scan, confirming removes it everywhere', async ({ page, user, request }) => {
    await signInAs(page, user)
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '175', '70')
    await save(page)
    await expect(page.getByRole('button', { name: 'Delete my scan' })).toBeVisible()

    page.once('dialog', (d) => d.dismiss())
    await page.getByRole('button', { name: 'Delete my scan' }).click()
    await expect(page.getByText('175 cm')).toBeVisible()
    expect((await request.get('/api/scan', { headers: { Authorization: `Bearer ${user.token}` } })).status()).toBe(200)

    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete my scan' }).click()
    await expect(page.getByRole('button', { name: 'Scan yourself' })).toBeVisible()
    await expect(page.getByText('178 cm')).toBeVisible()
    await expect(page.locator('.stage .badge')).toContainText('Stand-in avatar')
    expect((await request.get('/api/scan', { headers: { Authorization: `Bearer ${user.token}` } })).status()).toBe(204)
  })

  test('a scan made as a guest moves into the account when the user signs up, then leaves the device', async ({ page }) => {
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '172', '68')
    await save(page)
    await expect(page.getByText('172 cm')).toBeVisible()

    const email = uniqueEmail()
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
    await dialog(page).getByLabel('Email').fill(email)
    await dialog(page).getByLabel('Password').fill('password123')
    await dialog(page).getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.locator('.acct')).toContainText(email)
    await expect(page.getByText('172 cm')).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('h2t-guest-scan'))).toBeNull()

    const token = await page.evaluate(() => localStorage.getItem('h2t-token'))
    const res = await page.request.get('/api/scan', { headers: { Authorization: `Bearer ${token}` } })
    expect((await res.json()).heightCm).toBe(172)
  })

  test("two people on one browser never see each other's scan", async ({ page, request }) => {
    const a = { email: uniqueEmail(), password: 'password123', token: '' }
    a.token = await register(request, a.email, a.password)
    await signInAs(page, a)
    await openApp(page)
    const photos = await capturePhotos(page)
    await runScan(page, photos, '165', '58')
    await save(page)
    await expect(page.getByText('165 cm')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByText('178 cm')).toBeVisible() // back to the stand-in
    // a second person signs in on the same browser, through the UI (no reload: the init script above would re-sign-in user A)
    const b = { email: uniqueEmail(), password: 'password123' }
    await register(request, b.email, b.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
    await dialog(page).getByRole('button', { name: 'I have an account' }).click()
    await dialog(page).getByLabel('Email').fill(b.email)
    await dialog(page).getByLabel('Password').fill(b.password)
    await dialog(page).getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('.acct')).toContainText(b.email)
    await expect(page.getByText('178 cm')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Scan yourself' })).toBeVisible()
  })
})

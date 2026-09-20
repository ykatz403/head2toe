import { expect, looksDrawn, openApp, avatarShot, test } from './fixtures'

test.describe('BAT-1 first visit', () => {
  test('the page loads with a look already on the avatar', async ({ page }) => {
    await openApp(page)
    await expect(page).toHaveTitle('Head2Toe')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('whole outfit')
    await expect(page.getByText('Summer · Designer + Everyday')).toBeVisible()
    await expect(page.locator('.webgl-fail')).toHaveCount(0)
    expect(looksDrawn(await avatarShot(page))).toBe(true)
  })

  test('every slot has either a product with a shop link or a reason it is skipped', async ({ page }) => {
    await openApp(page)
    const rows = page.locator('.outfit li')
    for (let i = 0; i < 9; i++) {
      const row = rows.nth(i)
      const hasProduct = await row.locator('.nm').count()
      if (hasProduct) await expect(row.getByRole('link', { name: /^Shop / })).toHaveAttribute('href', /^\/go\/\d+$/)
      else await expect(row.locator('.br')).not.toBeEmpty()
    }
  })

  test('fonts, styles and scripts all load (no failed or 404 requests)', async ({ page }) => {
    const bad: string[] = []
    page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`))
    await openApp(page)
    expect(bad).toEqual([])
  })

  test('the app shell is served for deep links, but unknown API routes are real 404s', async ({ request }) => {
    const deep = await request.get('/some/deep/link')
    expect(deep.status()).toBe(200)
    expect(deep.headers()['content-type']).toContain('text/html')
    const missing = await request.get('/api/definitely-not-a-route')
    expect(missing.status()).toBe(404)
    expect(missing.headers()['content-type'] ?? '').not.toContain('text/html')
  })

  test('the pose model and its WASM runtime are served with usable content types', async ({ request }) => {
    const model = await request.get('/models/pose_landmarker_lite.task')
    expect(model.status()).toBe(200)
    expect((await model.body()).length).toBeGreaterThan(5_000_000)
    const wasm = await request.get('/mediapipe/wasm/vision_wasm_internal.wasm')
    expect(wasm.status()).toBe(200)
    expect(wasm.headers()['content-type']).toContain('application/wasm')
  })

  test('the page does not load the heavy body-scan code until it is needed', async ({ page }) => {
    const loaded: string[] = []
    page.on('request', (r) => loaded.push(r.url()))
    await openApp(page)
    expect(loaded.some((u) => /pose_landmarker|vision_wasm|measure-/.test(u))).toBe(false)
  })
})

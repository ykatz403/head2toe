import { avatarShot, expect, looksDrawn, openApp, signInAs, test } from './fixtures'

const OUTFIT = '**/api/outfit**'

test.describe('BAT-10 when things go wrong', () => {
  test('API unreachable: a clear message, the page still works, and it recovers by itself when the API is back', async ({ page, allow }) => {
    allow(/outfit|Failed to load|ERR_/)
    await page.route(OUTFIT, (r) => r.abort('connectionrefused'))
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('Is the API running?')
    await expect(page.locator('.stage canvas')).toBeVisible() // the avatar still renders
    await page.unroute(OUTFIT)
    await page.getByRole('button', { name: 'Shuffle look' }).click()
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('server error (500) on outfits shows the message, not a blank page', async ({ page, allow }) => {
    allow(/500|outfit/)
    await page.route(OUTFIT, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('boom')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('a slow API does not freeze the page, and the result appears when it arrives', async ({ page }) => {
    await page.route(OUTFIT, async (r) => {
      await new Promise((res) => setTimeout(res, 2500))
      await r.continue()
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.stage canvas')).toBeVisible()
    await expect(page.locator('.outfit li')).toHaveCount(9, { timeout: 10_000 })
  })

  test('out-of-order responses: the look on screen always matches the last thing clicked', async ({ page }) => {
    await openApp(page)
    await page.route('**/api/outfit?season=winter**', async (r) => {
      await new Promise((res) => setTimeout(res, 2500)) // slow
      await r.continue()
    })
    await page.getByRole('button', { name: 'Winter' }).click() // slow request starts
    await page.getByRole('button', { name: 'Pool day' }).click() // fast request finishes first
    await expect(page.locator('.panel-head .eyebrow')).toContainText('Pool day')
    await page.waitForTimeout(3200) // the stale winter answer arrives late
    await expect(page.locator('.panel-head .eyebrow')).toContainText('Pool day')
    await expect(page.locator('.outfit li .nm').filter({ hasText: /boot|coat|jacket|sweater/i })).toHaveCount(0)
  })

  test('going offline: shuffle shows an error, coming back online recovers', async ({ page, context, allow }) => {
    allow(/Failed to load|ERR_INTERNET|outfit/)
    await openApp(page)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Shuffle look' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Shuffle look' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.outfit li')).toHaveCount(9)
  })

  test('the scan endpoint failing on load does not break a signed-in visit', async ({ page, user, allow }) => {
    allow(/500|scan/)
    await signInAs(page, user)
    await page.route('**/api/scan', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' }))
    await page.goto('/')
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await expect(page.locator('.acct')).toContainText(user.email)
    expect(looksDrawn(await avatarShot(page))).toBe(true)
  })

  test('saving a scan fails: the dialog stays open with the reason, and Save works on retry', async ({ page, user, allow }) => {
    allow(/500|scan|pose_landmarker|ERR_FAILED/)
    await signInAs(page, user)
    await openApp(page)
    await page.getByRole('button', { name: 'Scan yourself' }).click()
    const d = page.getByRole('dialog')
    await d.getByRole('checkbox').check()
    await d.getByRole('button', { name: 'Start' }).click()
    // any photo pair will do: a flat picture makes the model give up, so route the model away to use the height/weight path
    await page.route('**/pose_landmarker_lite.task', (r) => r.abort())
    const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    await d.locator('#p-front').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: blank })
    await d.getByRole('button', { name: 'Next' }).click()
    await d.locator('#p-side').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: blank })
    await d.getByRole('button', { name: 'Build my avatar' }).click()
    const saveBtn = d.getByRole('button', { name: /save and see my avatar/i })
    await expect(saveBtn).toBeVisible({ timeout: 60_000 })

    await page.route('**/api/scan', (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Could not save."}' }) : r.continue()))
    await saveBtn.click()
    await expect(d.getByRole('alert')).toHaveText('Could not save.')
    await expect(d).toBeVisible()
    await page.unroute('**/api/scan')
    await saveBtn.click()
    await expect(d).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete my scan' })).toBeVisible()
  })

  test('browser storage blocked (private mode): the whole app still works as a guest', async ({ page }) => {
    await page.addInitScript(() => {
      const deny = () => { throw new DOMException('denied', 'SecurityError') }
      Object.defineProperty(window, 'localStorage', { get: deny })
      Object.defineProperty(window, 'sessionStorage', { get: deny })
    })
    await page.goto('/')
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await page.getByRole('button', { name: 'Winter' }).click()
    await page.getByRole('button', { name: 'Skin tone 3' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click() // saving to storage fails quietly
    await expect(page.locator('.outfit li')).toHaveCount(9)
  })

  test('no WebGL: the outfit list and shop links still work, with an explanation instead of a blank box', async ({ page, allow }) => {
    allow(/WebGL|context/i)
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof orig
    })
    await page.goto('/')
    await expect(page.locator('.webgl-fail')).toContainText("3D isn't available")
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await expect(page.getByRole('link', { name: /^Shop / }).first()).toHaveAttribute('href', /\/go\/\d+/)
    await page.getByRole('button', { name: 'Winter' }).click()
    await expect(page.locator('.panel-head .eyebrow')).toContainText('Winter')
  })

  test('a wrong image file in the scan (not an image) is handled without crashing the page', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Scan yourself' }).click()
    const d = page.getByRole('dialog')
    await d.getByRole('checkbox').check()
    await d.getByRole('button', { name: 'Start' }).click()
    const junk = Buffer.from('this is not a picture')
    await d.locator('#p-front').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: junk })
    await d.getByRole('button', { name: 'Next' }).click()
    await d.locator('#p-side').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: junk })
    await d.getByRole('button', { name: 'Build my avatar' }).click()
    await expect(d.getByRole('alert')).toContainText(/couldn't open your front photo/i, { timeout: 60_000 })
    await expect(d).toBeVisible()
    await expect(d.getByRole('heading', { name: 'Front photo' })).toBeVisible()
  })
})

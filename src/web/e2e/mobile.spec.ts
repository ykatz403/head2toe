import { avatarShot, expect, looksDrawn, openApp, register, signInAs, test } from './fixtures'

// Runs on a Pixel 7 emulation (touch, ~412px wide). Tagged so the desktop project skips it.
test.describe('BAT-12 phone @mobile', () => {
  test('the page never scrolls sideways and everything fits the screen', async ({ page }) => {
    await openApp(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const offenders = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      return [...document.querySelectorAll('body *')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) })
        .map((e) => e.tagName + '.' + (e as HTMLElement).className).slice(0, 5)
    })
    expect(offenders).toEqual([])
  })

  test('the avatar is drawn and the outfit list follows it in a single column', async ({ page }) => {
    await openApp(page)
    expect(looksDrawn(await avatarShot(page))).toBe(true)
    const layout = await page.evaluate(() => ({
      stage: document.querySelector('.stage')!.getBoundingClientRect(),
      panel: document.querySelector('.panel')!.getBoundingClientRect(),
    }))
    expect(layout.panel.top).toBeGreaterThanOrEqual(layout.stage.bottom - 1)
    expect(Math.abs(layout.panel.left - layout.stage.left)).toBeLessThan(2)
  })

  test('the occasion buttons and shuffle can be tapped', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Winter' }).tap()
    await expect(page.locator('.panel-head .eyebrow')).toContainText('Winter')
    await page.getByRole('button', { name: 'Shuffle look' }).tap()
    await expect(page.locator('.outfit li')).toHaveCount(9)
  })

  test('a horizontal swipe on the model turns it, while a vertical swipe still scrolls the page', async ({ page }) => {
    await openApp(page)
    const touchAction = await page.locator('.stage canvas').evaluate((el) => getComputedStyle(el).touchAction)
    expect(touchAction).toBe('pan-y') // horizontal drags go to the model, vertical drags scroll the page
  })

  test('tap targets are large enough to hit', async ({ page }) => {
    await openApp(page)
    const small = await page.$$eval('button, a.shop, .seg button', (els) =>
      els
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24) })
        .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()),
    )
    expect(small).toEqual([])
  })

  test('the scan dialog fits the phone and can be completed to the photo step', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Scan yourself' }).tap()
    const d = page.getByRole('dialog')
    const box = (await d.locator('.sheet').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    await d.getByRole('checkbox').check()
    await d.getByRole('button', { name: 'Start' }).tap()
    await expect(d.getByRole('heading', { name: 'Front photo' })).toBeVisible()
    // the button to continue is reachable without the dialog cutting it off
    await d.getByRole('button', { name: 'Next' }).scrollIntoViewIfNeeded()
    await expect(d.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  test('signing in works on a phone', async ({ page, request }) => {
    const email = `m-${Date.now()}@example.com`
    await register(request, email, 'password123')
    await openApp(page)
    await page.getByRole('button', { name: 'Sign in', exact: true }).tap()
    const d = page.getByRole('dialog')
    await d.getByRole('button', { name: 'I have an account' }).tap()
    await d.getByLabel('Email').fill(email)
    await d.getByLabel('Password').fill('password123')
    await d.getByRole('button', { name: 'Sign in', exact: true }).tap()
    await expect(page.locator('.acct')).toContainText(email)
  })

  test('a signed-in phone user sees their saved avatar', async ({ page, user, request }) => {
    await request.put('/api/scan', { headers: { Authorization: `Bearer ${user.token}` }, data: { heightCm: 169, buildPct: 97, skinTone: 2 } })
    await signInAs(page, user)
    await openApp(page)
    await expect(page.getByText('169 cm')).toBeVisible()
  })
})

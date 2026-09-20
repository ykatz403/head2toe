import { expect, test as base, type APIRequestContext, type Locator, type Page } from '@playwright/test'

interface Fixtures {
  /** Declare an error the test expects (for example a 401 from a wrong password). Anything else fails the test. */
  allow: (pattern: RegExp) => void
  /** A user created through the API, ready to be signed in on any page. */
  user: { email: string; password: string; token: string }
}

export const test = base.extend<Fixtures>({
  allow: [
    async ({ page, baseURL }, use) => {
      const issues: string[] = []
      const allowed: RegExp[] = []
      // MediaPipe prints an informational line ("INFO: Created TensorFlow Lite XNNPACK delegate") on the error channel.
      page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('INFO:') && issues.push(`console: ${m.text()}`))
      page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`))
      page.on('requestfailed', (r) => {
        const err = r.failure()?.errorText ?? ''
        if (r.url().startsWith(baseURL!) && !err.includes('ERR_ABORTED')) issues.push(`requestfailed: ${r.url()} ${err}`)
      })
      await use((p) => void allowed.push(p))
      const unexpected = issues.filter((i) => !allowed.some((a) => a.test(i)))
      expect(unexpected, 'the page logged errors nobody declared').toEqual([])
    },
    { auto: true },
  ],

  user: async ({ request }, use) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const password = 'password123'
    await use({ email, password, token: await register(request, email, password) })
  },
})
export { expect }

export async function register(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/register', { data: { email, password } })
  expect(res.ok(), `register ${email}`).toBeTruthy()
  return (await res.json()).token as string
}

/** Sign the browser in before the app loads, exactly as a returning visitor would be. */
export async function signInAs(page: Page, u: { email: string; token: string }) {
  await page.addInitScript(([t, e]) => {
    localStorage.setItem('h2t-token', t)
    localStorage.setItem('h2t-email', e)
  }, [u.token, u.email])
}

/** Load the app and wait until the outfit and the 3D stage are both ready. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.locator('.outfit li')).toHaveCount(9)
  await expect(page.locator('.stage canvas')).toBeVisible()
  await settle(page)
}

/** Give the WebGL render loop a few frames to draw. */
export const settle = (page: Page, ms = 400) => page.waitForTimeout(ms)

/** A PNG of just the 3D canvas, with the UI overlays hidden so it is only the avatar. */
export async function avatarShot(page: Page): Promise<Buffer> {
  const canvas = page.locator('.stage canvas')
  await page.addStyleTag({ content: '.stage .views,.stage .tag,.stage .hint,.stage .ruler{visibility:hidden!important}' })
  await settle(page, 600)
  const png = await canvas.screenshot()
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.stage .views,.stage .tag') && s.remove()))
  return png
}

/**
 * Is there a figure on the stage? A blank canvas is one flat colour, which PNG-compresses to almost nothing;
 * a drawn avatar is far bigger. (Cheap, robust, needs no image library.)
 */
export const looksDrawn = (png: Buffer) => png.length > 12_000

export const differs = (a: Buffer, b: Buffer) => !a.equals(b)

export const rowFor = (page: Page, label: string): Locator =>
  page.locator('.outfit li').filter({ has: page.locator('.slot', { hasText: new RegExp(`^${label}$`) }) })

export const parseMoney = (s: string) => Number(s.replace(/[$,]/g, ''))

export async function visibleTotal(page: Page) {
  return parseMoney((await page.locator('.total .mono').textContent()) ?? '0')
}

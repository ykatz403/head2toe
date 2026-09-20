import type { Page } from '@playwright/test'
import { expect, openApp, register, signInAs, test } from './fixtures'

const dialog = (page: Page) => page.getByRole('dialog')
const uniqueEmail = () => `acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`

async function openSignIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await expect(dialog(page)).toBeVisible()
}
async function submit(page: Page, email: string, password: string, button: string) {
  await dialog(page).getByLabel('Email').fill(email)
  await dialog(page).getByLabel('Password').fill(password)
  await dialog(page).getByRole('button', { name: button, exact: true }).click()
}

test.describe('BAT-7 accounts', () => {
  test('a new visitor can create an account and is signed in straight away', async ({ page }) => {
    await openApp(page)
    const email = uniqueEmail()
    await openSignIn(page)
    await expect(dialog(page).getByRole('heading')).toHaveText('Keep your scan for good')
    await submit(page, email, 'password123', 'Create account')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.acct')).toContainText(email)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
  })

  test('the session survives a reload and works from a second tab', async ({ page, context }) => {
    await openApp(page)
    const email = uniqueEmail()
    await openSignIn(page)
    await submit(page, email, 'password123', 'Create account')
    await expect(page.locator('.acct')).toContainText(email)
    await page.reload()
    await expect(page.locator('.acct')).toContainText(email)
    const tab2 = await context.newPage()
    await tab2.goto('/')
    await expect(tab2.locator('.acct')).toContainText(email)
  })

  test('signing out returns to the guest view and forgets the session', async ({ page }) => {
    await openApp(page)
    await openSignIn(page)
    await submit(page, uniqueEmail(), 'password123', 'Create account')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('h2t-token'))).toBeNull()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('an existing user can sign in with the right password', async ({ page, request }) => {
    const email = uniqueEmail()
    await register(request, email, 'password123')
    await openApp(page)
    await openSignIn(page)
    await dialog(page).getByRole('button', { name: 'I have an account' }).click()
    await expect(dialog(page).getByRole('heading')).toHaveText('Welcome back')
    await submit(page, email, 'password123', 'Sign in')
    await expect(page.locator('.acct')).toContainText(email)
  })

  test('sign in is case-insensitive for the email', async ({ page, request }) => {
    const email = uniqueEmail()
    await register(request, email, 'password123')
    await openApp(page)
    await openSignIn(page)
    await dialog(page).getByRole('button', { name: 'I have an account' }).click()
    await submit(page, email.toUpperCase(), 'password123', 'Sign in')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('a wrong password is refused with a clear message and no session', async ({ page, request, allow }) => {
    allow(/401/)
    const email = uniqueEmail()
    await register(request, email, 'password123')
    await openApp(page)
    await openSignIn(page)
    await dialog(page).getByRole('button', { name: 'I have an account' }).click()
    await submit(page, email, 'not-the-password', 'Sign in')
    await expect(dialog(page).getByRole('alert')).toHaveText('Email or password is incorrect.')
    await expect(dialog(page)).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('h2t-token'))).toBeNull()
  })

  test('registering an email that already exists explains what to do', async ({ page, request, allow }) => {
    allow(/409/)
    const email = uniqueEmail()
    await register(request, email, 'password123')
    await openApp(page)
    await openSignIn(page)
    await submit(page, email, 'password123', 'Create account')
    await expect(dialog(page).getByRole('alert')).toContainText('already exists')
    await expect(dialog(page)).toBeVisible()
  })

  test('the form will not submit a short password or a bad email', async ({ page }) => {
    await openApp(page)
    await openSignIn(page)
    let posted = false
    page.on('request', (r) => r.url().includes('/api/auth/') && (posted = true))
    await submit(page, uniqueEmail(), 'short', 'Create account')
    await submit(page, 'not-an-email', 'password123', 'Create account')
    expect(posted).toBe(false)
    await expect(dialog(page)).toBeVisible()
  })

  test('the server also refuses a short password if the browser check is bypassed', async ({ page, allow }) => {
    allow(/400/)
    await openApp(page)
    await openSignIn(page)
    await page.evaluate(() => document.querySelector('form')!.setAttribute('novalidate', ''))
    await dialog(page).getByLabel('Password').evaluate((el) => el.removeAttribute('minlength'))
    await submit(page, uniqueEmail(), 'short', 'Create account')
    await expect(dialog(page).getByRole('alert')).toHaveText('Password must be at least 8 characters.')
  })

  test('an invalid or expired token quietly signs the user out instead of breaking the page', async ({ page, allow }) => {
    allow(/401/)
    await signInAs(page, { email: 'ghost@example.com', token: 'not.a.token' })
    await page.goto('/')
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('h2t-token'))).toBeNull()
  })

  test('the modal closes with Escape, the close button, or a click outside', async ({ page }) => {
    await openApp(page)
    await openSignIn(page)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await openSignIn(page)
    await dialog(page).getByRole('button', { name: 'Close' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await openSignIn(page)
    await page.mouse.click(5, 5)
    await expect(dialog(page)).toHaveCount(0)
  })

  test('hostile text in an email is shown as plain text, never run', async ({ page, request }) => {
    let alerted = false
    page.on('dialog', (d) => { alerted = true; void d.dismiss() })
    const evil = `"<img src=x onerror=alert(1)>"${Date.now()}@example.com`
    const res = await request.post('/api/auth/register', { data: { email: evil, password: 'password123' } })
    if (res.ok()) {
      const { token, email } = await res.json()
      await signInAs(page, { email, token })
    }
    await openApp(page)
    await page.waitForTimeout(500)
    expect(alerted).toBe(false)
    expect(await page.locator('.acct img').count()).toBe(0)
  })
})

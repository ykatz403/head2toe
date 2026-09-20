import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

test.describe('BAT-11 accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`main page has no serious or critical WCAG A/AA issues (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await openApp(page)
      expect(await violations(page)).toEqual([])
    })

    test(`sign-in dialog (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await openApp(page)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      expect(await violations(page)).toEqual([])
    })

    test(`every scan step (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await openApp(page)
      await page.getByRole('button', { name: 'Scan yourself' }).click()
      expect(await violations(page), 'step 1').toEqual([])
      const d = page.getByRole('dialog')
      await d.getByRole('checkbox').check()
      await d.getByRole('button', { name: 'Start' }).click()
      expect(await violations(page), 'front photo').toEqual([])
    })
  }

  test('winter and pool looks are accessible too (different colours on screen)', async ({ page }) => {
    await openApp(page)
    for (const s of ['Winter', 'Pool day']) {
      await page.getByRole('button', { name: s }).click()
      await expect(page.locator('.panel-head .eyebrow')).toContainText(s)
      expect(await violations(page), s).toEqual([])
    }
  })

  test('a dialog takes focus when it opens, keeps Tab inside, and gives focus back when it closes', async ({ page }) => {
    await openApp(page)
    const opener = page.getByRole('button', { name: 'Sign in', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    const d = page.getByRole('dialog')
    await expect(d.getByLabel('Email')).toBeFocused()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await d.evaluate((el) => el.contains(document.activeElement)), `Tab #${i + 1} stayed in the dialog`).toBe(true)
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(d).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('the scan dialog keeps focus inside as it moves between steps', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Scan yourself' }).click()
    const d = page.getByRole('dialog')
    await expect(d.getByLabel('Height (cm)')).toBeFocused()
    await d.getByRole('checkbox').check()
    await d.getByRole('button', { name: 'Start' }).click()
    expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Tab')
    expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  })

  test('the whole app can be driven from the keyboard: every control is reachable with Tab', async ({ page }) => {
    await openApp(page)
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const label = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement
        return (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40)
      })
      seen.add(label)
    }
    for (const must of ['Sign in', 'Summer', 'Winter', 'Pool day', 'Designer', 'Everyday', 'Both', 'Shuffle look', 'Front', 'Side', 'Back', 'Scan yourself'])
      expect([...seen], `Tab reaches "${must}"`).toContain(must)
    expect([...seen].some((s) => s.startsWith('Shop '))).toBe(true)
    expect([...seen].some((s) => s.startsWith('Hide '))).toBe(true)
    expect([...seen].some((s) => s.startsWith('Skin tone'))).toBe(true)
  })

  test('the focused control is visibly highlighted', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Shuffle look' }).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
    expect(outline).not.toBe('none')
  })

  test('interactive state is exposed to assistive technology (pressed, names, alerts)', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('button', { name: 'Summer' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Winter' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('group', { name: 'Season' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Skin tone' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    const unnamed = await page.$$eval('button, a[href], input', (els) =>
      els.filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim() || (e as HTMLInputElement).labels?.length)).length,
    )
    expect(unnamed).toBe(0)
  })
})

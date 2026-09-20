import { expect, openApp, parseMoney, rowFor, test, visibleTotal } from './fixtures'

const SEASONS = [['Summer', 'summer'], ['Winter', 'winter'], ['Pool day', 'pool']] as const
const TIERS = [['Designer', 'lux'], ['Everyday', 'std'], ['Both', 'both']] as const

const DESIGNER_BRANDS = ['Gucci', 'Ferragamo', 'Loro Piana', 'Brunello Cucinelli', 'Persol', 'Sunspel', 'Falke', 'Moncler', 'Vilebrequin', 'Prada']
const EVERYDAY_BRANDS = ['Uniqlo', 'Zara', 'COS', 'H&M', 'Ray-Ban', 'Nike', "Levi's", 'Dr. Martens', 'Timberland', 'Speedo', 'Birkenstock']

async function brandsShown(page: import('@playwright/test').Page) {
  const labels = await page.locator('.outfit li .br').allTextContents()
  return labels.filter((l) => l.includes(' · ')).map((l) => ({ brand: l.split(' · ')[0], tier: l.split(' · ')[1] }))
}

test.describe('BAT-2 season and store level', () => {
  for (const [seasonLabel, season] of SEASONS) {
    for (const [tierLabel, tier] of TIERS) {
      test(`${seasonLabel} × ${tierLabel} gives a complete, correctly-tiered look`, async ({ page }) => {
        await openApp(page)
        if (season !== 'summer' || tier !== 'both') {
          const api = page.waitForResponse((r) => r.url().includes(`/api/outfit?season=${season}&tier=${tier}`))
          if (season !== 'summer') await page.getByRole('button', { name: seasonLabel }).click()
          if (tier !== 'both') await page.getByRole('button', { name: tierLabel, exact: true }).click()
          await api
        }

        await expect(page.locator('.outfit li')).toHaveCount(9)
        await expect(page.locator('.panel-head .eyebrow')).toContainText(
          `${seasonLabel} · ${tier === 'both' ? 'Designer + Everyday' : tierLabel}`,
        )

        const shown = await brandsShown(page)
        expect(shown.length).toBeGreaterThanOrEqual(4)
        if (tier === 'lux') for (const s of shown) expect(s.tier).toBe('Designer')
        if (tier === 'std') for (const s of shown) expect(s.tier).toBe('Everyday')
        for (const s of shown) expect([...DESIGNER_BRANDS, ...EVERYDAY_BRANDS]).toContain(s.brand)

        // the displayed total matches the sum of the displayed prices
        const prices = (await page.locator('.outfit li .price').allTextContents()).map(parseMoney)
        expect(await visibleTotal(page)).toBe(Math.round(prices.reduce((a, b) => a + b, 0)))
      })
    }
  }

  test('Both really mixes designer and everyday across shuffles', async ({ page }) => {
    await openApp(page)
    const tiers = new Set<string>()
    for (let i = 0; i < 4; i++) {
      for (const s of await brandsShown(page)) tiers.add(s.tier)
      await page.getByRole('button', { name: 'Shuffle look' }).click()
      await expect(page.locator('.outfit li')).toHaveCount(9)
    }
    expect([...tiers].sort()).toEqual(['Designer', 'Everyday'])
  })

  test('the pool look drops the layers nobody wears at the pool, and says why', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Pool day' }).click()
    await expect(page.locator('.panel-head .eyebrow')).toContainText('Pool day')
    for (const label of ['Undershirt', 'Outer layer', 'Underwear', 'Socks']) {
      const row = rowFor(page, label)
      await expect(row).toHaveClass(/skip/)
      await expect(row.locator('.br')).not.toBeEmpty()
      await expect(row.getByRole('link')).toHaveCount(0)
    }
    await expect(rowFor(page, 'Pants').locator('.nm')).toContainText(/swim|watershorts|trunks/i)
  })

  test('winter adds a coat and warm layers; summer has no coat', async ({ page }) => {
    await openApp(page)
    await expect(rowFor(page, 'Outer layer')).toHaveClass(/skip/)
    await page.getByRole('button', { name: 'Winter' }).click()
    await expect(rowFor(page, 'Outer layer').locator('.nm')).toBeVisible()
    await expect(rowFor(page, 'Shoes').locator('.nm')).toContainText(/boot/i)
  })
})

test.describe('BAT-3 shuffle', () => {
  test('gives a different look, and the same seed always gives the same look', async ({ page }) => {
    await openApp(page)
    const names = () => page.locator('.outfit li .nm').allTextContents()
    const first = await names()
    await page.getByRole('button', { name: 'Shuffle look' }).click()
    await expect.poll(names).not.toEqual(first)
    const second = await names()
    // the shuffle position is kept when the occasion changes, so coming back reproduces the same look exactly
    await page.getByRole('button', { name: 'Winter' }).click()
    await expect.poll(names).not.toEqual(second)
    await page.getByRole('button', { name: 'Summer' }).click()
    await expect.poll(names).toEqual(second)
  })

  test('keeps working when pressed repeatedly and quickly', async ({ page }) => {
    await openApp(page)
    const btn = page.getByRole('button', { name: 'Shuffle look' })
    for (let i = 0; i < 12; i++) await btn.click()
    await expect(page.locator('.outfit li')).toHaveCount(9)
    await expect(page.locator('.webgl-fail')).toHaveCount(0)
  })
})

test.describe('BAT-4 layers and total', () => {
  test('hiding a layer takes it out of the total, showing it puts it back', async ({ page }) => {
    await openApp(page)
    const total = await visibleTotal(page)
    const shirtPrice = parseMoney((await rowFor(page, 'Shirt').locator('.price').textContent())!)
    await rowFor(page, 'Shirt').getByRole('button', { name: /Hide Shirt/ }).click()
    await expect(rowFor(page, 'Shirt')).toHaveClass(/off/)
    expect(await visibleTotal(page)).toBe(Math.round(total - shirtPrice))
    await rowFor(page, 'Shirt').getByRole('button', { name: /Show Shirt/ }).click()
    expect(await visibleTotal(page)).toBe(total)
  })

  test('hiding everything leaves a zero total and does not break the page', async ({ page }) => {
    await openApp(page)
    const eyes = page.getByRole('button', { name: /^Hide / })
    while (await eyes.count()) await eyes.first().click()
    expect(await visibleTotal(page)).toBe(0)
    await expect(page.locator('.webgl-fail')).toHaveCount(0)
  })

  test('hidden layers reset when the occasion changes', async ({ page }) => {
    await openApp(page)
    await rowFor(page, 'Shirt').getByRole('button', { name: /Hide Shirt/ }).click()
    await page.getByRole('button', { name: 'Winter' }).click()
    await expect(page.locator('.outfit li.off')).toHaveCount(0)
  })
})

test.describe('BAT-5 buying', () => {
  test('Shop opens a new tab through the tracked link, which the real server redirects to the retailer', async ({ page, context }) => {
    // Let the real server answer /go/:id, record what it says, and never actually visit a retailer from a test.
    let location = ''
    await context.route('**/go/*', async (route) => {
      const res = await route.fetch({ maxRedirects: 0 })
      location = res.headers()['location'] ?? ''
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<title>${res.status()} ${location}</title>` })
    })
    await openApp(page)
    const link = rowFor(page, 'Shirt').getByRole('link', { name: /^Shop / })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('rel', /sponsored/)
    const href = (await link.getAttribute('href'))!

    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()])
    await popup.waitForLoadState()
    await expect(popup).toHaveTitle(/^302 https:\/\/www\.[a-z-]+\.com\/?$/)
    expect(location).toMatch(/^https:\/\/www\.[a-z-]+\.com\/?$/)
    expect(href).toMatch(/^\/go\/\d+$/)
    expect(page.url()).toContain('localhost') // the original tab is untouched
  })

  test('the redirect endpoint sends visitors only to the stored retailer', async ({ request }) => {
    const res = await request.get('/go/1?url=https://evil.example', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toMatch(/^https:\/\/www\./)
    expect(res.headers()['location']).not.toContain('evil')
    expect((await request.get('/go/424242', { maxRedirects: 0 })).status()).toBe(404)
  })

  test('the affiliate relationship is disclosed next to the shop links', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('.panel-foot')).toContainText(/commission/i)
  })
})

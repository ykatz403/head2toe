import type { Page } from '@playwright/test'
import { avatarShot, differs, expect, looksDrawn, openApp, rowFor, settle, test } from './fixtures'

/** Stop the idle spin so two screenshots of the same state are comparable. */
async function freeze(page: Page) {
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await settle(page, 1200)
}

test.describe('BAT-6 the 3D avatar', () => {
  test('draws a figure for every season, store level and shuffle (renderer knows every product attribute)', async ({ page }) => {
    await openApp(page)
    for (const season of ['Summer', 'Winter', 'Pool day']) {
      await page.getByRole('button', { name: season }).click()
      for (const tier of ['Designer', 'Everyday', 'Both']) {
        await page.getByRole('button', { name: tier, exact: true }).click()
        for (let i = 0; i < 4; i++) {
          await expect(page.locator('.outfit li')).toHaveCount(9)
          const shot = await avatarShot(page)
          expect(looksDrawn(shot), `${season}/${tier}/shuffle ${i}`).toBe(true)
          await page.getByRole('button', { name: 'Shuffle look' }).click()
        }
      }
    }
    await expect(page.locator('.webgl-fail')).toHaveCount(0)
  })

  test('the picture changes with the occasion', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const summer = await avatarShot(page)
    await page.getByRole('button', { name: 'Winter' }).click()
    await settle(page, 800)
    const winter = await avatarShot(page)
    await page.getByRole('button', { name: 'Pool day' }).click()
    await settle(page, 800)
    const pool = await avatarShot(page)
    expect(differs(summer, winter)).toBe(true)
    expect(differs(winter, pool)).toBe(true)
    expect(differs(summer, pool)).toBe(true)
  })

  test('hiding a layer changes the picture but the body is still drawn', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const full = await avatarShot(page)
    await rowFor(page, 'Hat').getByRole('button', { name: /Hide Hat/ }).click()
    await settle(page)
    expect(differs(full, await avatarShot(page))).toBe(true)

    const eyes = page.getByRole('button', { name: /^Hide / })
    while (await eyes.count()) await eyes.first().click()
    await settle(page)
    const bare = await avatarShot(page)
    expect(looksDrawn(bare)).toBe(true)
    expect(differs(full, bare)).toBe(true)
  })

  test('Front, Side and Back show three different views', async ({ page }) => {
    await openApp(page)
    const shots: Buffer[] = []
    for (const v of ['Front', 'Side', 'Back']) {
      await page.getByRole('button', { name: v, exact: true }).click()
      await settle(page, 1500)
      shots.push(await avatarShot(page))
    }
    expect(differs(shots[0], shots[1])).toBe(true)
    expect(differs(shots[1], shots[2])).toBe(true)
    expect(differs(shots[0], shots[2])).toBe(true)
    shots.forEach((s) => expect(looksDrawn(s)).toBe(true))
  })

  test('dragging turns the model', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const before = await avatarShot(page)
    const box = (await page.locator('.stage canvas').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    await settle(page, 800)
    expect(differs(before, await avatarShot(page))).toBe(true)
  })

  test('the arrow keys turn the model when the canvas has focus', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const before = await avatarShot(page)
    await page.locator('.stage canvas').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await settle(page, 1200)
    expect(differs(before, await avatarShot(page))).toBe(true)
  })

  test('zoom in and out change the picture and cannot be pushed past their limits', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const normal = await avatarShot(page)
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await settle(page, 500)
    const near = await avatarShot(page)
    expect(differs(normal, near)).toBe(true)
    expect(looksDrawn(near)).toBe(true)
    for (let i = 0; i < 30; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    await settle(page, 500)
    const far = await avatarShot(page)
    expect(looksDrawn(far)).toBe(true)
    // at the limits, another click changes nothing
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await settle(page, 500)
    expect((await avatarShot(page)).equals(far)).toBe(true)
  })

  test('the model idles with a slow turn until touched, then stays put', async ({ page }) => {
    await openApp(page)
    const a = await avatarShot(page)
    await settle(page, 800)
    expect(differs(a, await avatarShot(page))).toBe(true)
    await freeze(page)
    const s1 = await avatarShot(page)
    await settle(page, 800)
    expect((await avatarShot(page)).equals(s1)).toBe(true)
  })

  test('respects reduced motion: no idle spin', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:5081' })
    const page = await ctx.newPage()
    await openApp(page)
    const a = await avatarShot(page)
    await settle(page, 1000)
    expect((await avatarShot(page)).equals(a)).toBe(true)
    await ctx.close()
  })

  test('height, build and skin tone visibly change the avatar, including at their extremes', async ({ page }) => {
    await openApp(page)
    await freeze(page)
    const base = await avatarShot(page)
    const set = async (id: string, v: string) => {
      await page.locator(id).fill(v)
      await settle(page, 300)
    }
    await set('#height', '200')
    const tall = await avatarShot(page)
    await set('#height', '155')
    const short = await avatarShot(page)
    await set('#height', '178')
    await set('#build', '125')
    const broad = await avatarShot(page)
    await set('#build', '85')
    const slim = await avatarShot(page)
    await set('#build', '100')
    await page.getByRole('button', { name: 'Skin tone 5' }).click()
    await settle(page, 300)
    const dark = await avatarShot(page)
    for (const s of [tall, short, broad, slim, dark]) {
      expect(looksDrawn(s)).toBe(true)
      expect(differs(base, s)).toBe(true)
    }
    expect(differs(tall, short)).toBe(true)
    expect(differs(broad, slim)).toBe(true)
    await expect(page.locator('#height')).toHaveValue('178')
    await expect(page.getByText('178 cm')).toBeVisible()
  })

  test('the canvas always fills the stage as the window is resized', async ({ page }) => {
    await openApp(page)
    for (const [w, h] of [[1280, 800], [1024, 700], [820, 900], [420, 800]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await settle(page, 300)
      const [stage, canvas] = await page.evaluate(() => {
        const s = document.querySelector('.stage')! // the stage has a 1px border, so compare with its inner size
        const c = document.querySelector('.stage canvas')!.getBoundingClientRect()
        return [[s.clientWidth, s.clientHeight], [c.width, c.height]]
      })
      expect(canvas[0]).toBeCloseTo(stage[0], 0)
      expect(canvas[1]).toBeCloseTo(stage[1], 0)
      expect(looksDrawn(await avatarShot(page))).toBe(true)
    }
  })

  test('switching occasions many times does not leak WebGL contexts or crash', async ({ page }) => {
    await openApp(page)
    for (let i = 0; i < 15; i++) {
      await page.getByRole('button', { name: ['Summer', 'Winter', 'Pool day'][i % 3] }).click()
      await page.getByRole('button', { name: 'Shuffle look' }).click()
    }
    await settle(page, 500)
    expect(looksDrawn(await avatarShot(page))).toBe(true)
  })
})

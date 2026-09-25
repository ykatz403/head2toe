import { describe, expect, it } from 'vitest'
import type { LookItem } from '../avatar/scene'
import { buildParts, dilate, ellipse, ribbon, shade } from './tryon'

describe('shade', () => {
  it('scales each channel and keeps a valid hex', () => {
    expect(shade('#804020', 1)).toBe('#804020')
    expect(shade('#804020', 0.5)).toBe('#402010')
  })
  it('never overflows a channel', () => expect(shade('#ffffff', 2)).toBe('#ffffff'))
  it('handles a short or malformed hex without throwing', () => {
    expect(() => shade('#abc', 1)).not.toThrow()
    expect(shade('#000000', 1.5)).toBe('#000000')
  })
})

describe('ellipse', () => {
  it('returns points on the ellipse, closed back to the start', () => {
    const pts = ellipse(10, 10, 5, 3)
    expect(pts[0].x).toBeCloseTo(15, 5)
    expect(pts[0].y).toBeCloseTo(10, 5)
    expect(pts.at(-1)!.x).toBeCloseTo(pts[0].x, 5)
  })
  it('a partial arc does not wrap all the way around', () => {
    const pts = ellipse(0, 0, 10, 10, 0, Math.PI)
    expect(pts.at(-1)!.y).toBeCloseTo(0, 5)
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(-0.01)
  })
})

describe('ribbon', () => {
  it('makes a closed polygon with twice the input points', () => {
    const poly = ribbon([{ x: 0, y: 0 }, { x: 0, y: 10 }], [4, 4])
    expect(poly).toHaveLength(4)
  })
  it('is centered on the spine and as wide as the given width', () => {
    const poly = ribbon([{ x: 0, y: 0 }, { x: 0, y: 10 }], [6, 6])
    const xs = poly.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 4)
    expect(Math.max(...xs)).toBeCloseTo(3, 4)
  })
  it('tapers when widths differ', () => {
    const poly = ribbon([{ x: 0, y: 0 }, { x: 0, y: 10 }], [10, 2])
    const topWidth = Math.abs(poly[0].x - poly.at(-1)!.x)
    const botWidth = Math.abs(poly[1].x - poly[2].x)
    expect(topWidth).toBeGreaterThan(botWidth)
  })
})

describe('dilate', () => {
  it('grows a single lit pixel into a filled square', () => {
    const w = 7, h = 7
    const src = new Uint8Array(w * h)
    src[3 * w + 3] = 255
    const out = dilate(src, w, h, 1)
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) expect(out[y * w + x]).toBe(255)
    expect(out[0]).toBe(0)
    expect(out[6 * w + 6]).toBe(0)
  })
  it('radius 0 changes nothing', () => {
    const src = Uint8Array.from([0, 255, 0, 0])
    expect(dilate(src, 2, 2, 0)).toEqual(src)
  })
  it('stays inside the bounds at the edges', () => {
    const w = 4, h = 4
    const src = new Uint8Array(w * h)
    src[0] = 255 // top-left corner
    expect(() => dilate(src, w, h, 3)).not.toThrow()
    expect(dilate(src, w, h, 3)[w * h - 1]).toBe(255) // reaches the far corner at radius 3 on a 4x4
  })
})

// A plausible standing, front-on pose. x/y in 0..1 image-relative coordinates.
function pose(): { x: number; y: number; visibility: number }[] {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 1 })
  set(0, 0.5, 0.1) // nose
  set(2, 0.47, 0.09); set(5, 0.53, 0.09) // eyes
  set(7, 0.44, 0.1); set(8, 0.56, 0.1) // ears
  set(11, 0.4, 0.22); set(12, 0.6, 0.22) // shoulders
  set(13, 0.35, 0.35); set(14, 0.65, 0.35) // elbows
  set(15, 0.33, 0.48); set(16, 0.67, 0.48) // wrists
  set(23, 0.44, 0.5); set(24, 0.56, 0.5) // hips
  set(25, 0.43, 0.7); set(26, 0.57, 0.7) // knees
  set(27, 0.42, 0.9); set(28, 0.58, 0.9) // ankles
  set(29, 0.41, 0.93); set(30, 0.59, 0.93) // heels
  set(31, 0.42, 0.95); set(32, 0.58, 0.95) // toes
  return lm
}
const item = (slot: string, color: string, attrs: Record<string, unknown> = {}): LookItem => ({ slot, color, attrs })
const W = 800, H = 1200

describe('buildParts', () => {
  it('draws nothing for an empty look', () => expect(buildParts(pose(), W, H, [])).toEqual([]))

  it('draws a shirt and trousers as polygons on the body, not off it', () => {
    const parts = buildParts(pose(), W, H, [item('top', '#224466', { sleeve: 'short' }), item('pants', '#333333', { len: 'long' })])
    expect(parts.some((p) => p.slot === 'top')).toBe(true)
    expect(parts.some((p) => p.slot === 'pants')).toBe(true)
    for (const p of parts) {
      expect(p.polygon.length).toBeGreaterThanOrEqual(3)
      for (const pt of p.polygon) {
        expect(pt.x).toBeGreaterThan(-W * 0.5)
        expect(pt.x).toBeLessThan(W * 1.5)
        expect(pt.y).toBeGreaterThan(-H * 0.5)
        expect(pt.y).toBeLessThan(H * 1.5)
      }
    }
  })

  it('an undershirt is hidden by a shirt worn over it, and reappears if the shirt is hidden', () => {
    const withShirt = buildParts(pose(), W, H, [item('under', '#ffffff', { sleeve: 'short' }), item('top', '#224466', { sleeve: 'short' })])
    expect(withShirt.some((p) => p.slot === 'under')).toBe(false)
    const withoutShirt = buildParts(pose(), W, H, [item('under', '#ffffff', { sleeve: 'short' })])
    expect(withoutShirt.some((p) => p.slot === 'under')).toBe(true)
  })

  it('underwear is hidden by trousers, and shown when trousers are hidden', () => {
    const withPants = buildParts(pose(), W, H, [item('boxers', '#111111'), item('pants', '#333333', { len: 'long' })])
    expect(withPants.some((p) => p.slot === 'boxers')).toBe(false)
    const withoutPants = buildParts(pose(), W, H, [item('boxers', '#111111')])
    expect(withoutPants.some((p) => p.slot === 'boxers')).toBe(true)
  })

  it('long sleeves reach further down the arm than short sleeves', () => {
    // part 0 is the torso (same for both); the sleeves are parts 1 and 2
    const long = buildParts(pose(), W, H, [item('top', '#224466', { sleeve: 'long' })]).filter((p) => p.slot === 'top').slice(1)
    const short = buildParts(pose(), W, H, [item('top', '#224466', { sleeve: 'short' })]).filter((p) => p.slot === 'top').slice(1)
    const reach = (parts: typeof long) => Math.max(...parts.flatMap((p) => p.polygon.map((pt) => pt.y)))
    expect(reach(long)).toBeGreaterThan(reach(short))
  })

  it('short trousers are shorter than long trousers', () => {
    const long = buildParts(pose(), W, H, [item('pants', '#333', { len: 'long' })]).filter((p) => p.slot === 'pants')
    const short = buildParts(pose(), W, H, [item('pants', '#333', { len: 'short' })]).filter((p) => p.slot === 'pants')
    const reach = (parts: typeof long) => Math.max(...parts.flatMap((p) => p.polygon.map((pt) => pt.y)))
    expect(reach(long)).toBeGreaterThan(reach(short))
  })

  it('a coat reaches lower than a jacket', () => {
    const coat = buildParts(pose(), W, H, [item('outer', '#111', { coat: true })]).filter((p) => p.slot === 'outer')
    const jacket = buildParts(pose(), W, H, [item('outer', '#111', { coat: false })]).filter((p) => p.slot === 'outer')
    const reach = (parts: typeof coat) => Math.max(...parts.flatMap((p) => p.polygon.map((pt) => pt.y)))
    expect(reach(coat)).toBeGreaterThan(reach(jacket))
  })

  it('draws two shoes, one per foot, clear of each other', () => {
    const parts = buildParts(pose(), W, H, [item('shoes', '#552211', { type: 'sneaker' })]).filter((p) => p.slot === 'shoes')
    expect(parts.length).toBeGreaterThanOrEqual(2)
    const centerX = (poly: { x: number }[]) => poly.reduce((s, p) => s + p.x, 0) / poly.length
    const xs = parts.map((p) => centerX(p.polygon))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10)
  })

  it('glasses are skipped when the eyes are not visible in the photo', () => {
    const noEyes = pose()
    noEyes[2] = { ...noEyes[2], visibility: 0 }
    noEyes[5] = { ...noEyes[5], visibility: 0 }
    expect(buildParts(noEyes, W, H, [item('glasses', '#111', { lens: '#222' })]).some((p) => p.slot === 'glasses')).toBe(false)
    expect(buildParts(pose(), W, H, [item('glasses', '#111', { lens: '#222' })]).some((p) => p.slot === 'glasses')).toBe(true)
  })

  it('a hat is drawn even without visible ears', () => {
    const noEars = pose()
    noEars[7] = { ...noEars[7], visibility: 0 }
    noEars[8] = { ...noEars[8], visibility: 0 }
    expect(buildParts(noEars, W, H, [item('hat', '#224466', { shape: 'cap' })]).some((p) => p.slot === 'hat')).toBe(true)
  })

  it('mirrors correctly when the person faces the other way', () => {
    const mirrored = pose().map((p) => ({ ...p, x: 1 - p.x }))
    const parts = buildParts(mirrored, W, H, [item('shoes', '#552211', { type: 'sneaker' })]).filter((p) => p.slot === 'shoes')
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('gives every clothing part a clip mode used for masking against the body', () => {
    const parts = buildParts(pose(), W, H, [item('top', '#224466'), item('hat', '#224466', { shape: 'cap' })])
    expect(parts.find((p) => p.slot === 'top')!.clip).toBe('tight')
    expect(parts.find((p) => p.slot === 'hat')!.clip).toBe('none')
  })
})

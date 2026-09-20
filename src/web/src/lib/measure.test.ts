import { describe, expect, it } from 'vitest'
import { proportions } from './measure'

// A synthetic front-on person of a known size, drawn into an image of a given pixel size.
function person(opts: { heightCm: number; shoulderCm: number; hipCm: number; cmPerPx: number; w?: number; h?: number }) {
  const w = opts.w ?? 1000
  const h = opts.h ?? 1500
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }))
  const noseY = 150
  const ankleY = noseY + (opts.heightCm * 0.886) / opts.cmPerPx
  const set = (i: number, xPx: number, yPx: number) => (lm[i] = { x: xPx / w, y: yPx / h })
  set(0, w / 2, noseY)
  const sw = opts.shoulderCm / opts.cmPerPx / 2
  const hw = opts.hipCm / opts.cmPerPx / 2
  set(11, w / 2 - sw, 350); set(12, w / 2 + sw, 350)
  set(23, w / 2 - hw, 700); set(24, w / 2 + hw, 700)
  set(27, w / 2 - 40, ankleY); set(28, w / 2 + 40, ankleY)
  return { lm, w, h }
}

const AVG = { heightCm: 178, shoulderCm: 0.23 * 178, hipCm: 0.125 * 178, cmPerPx: 0.2 }

describe('proportions', () => {
  it('recovers real shoulder and hip widths using height as the ruler', () => {
    const { lm, w, h } = person(AVG)
    const r = proportions(lm, w, h, 178)
    expect(r.shoulderCm).toBeCloseTo(40.9, 0)
    expect(r.hipCm).toBeCloseTo(22.3, 0)
  })

  it('makes no adjustment for an average-proportioned person', () => {
    const { lm, w, h } = person(AVG)
    expect(Math.abs(proportions(lm, w, h, 178).adjust)).toBeLessThan(0.3)
  })

  it('gives the same answer however close the camera was (scale invariant)', () => {
    const near = person({ ...AVG, cmPerPx: 0.15 })
    const far = person({ ...AVG, cmPerPx: 0.3 })
    const a = proportions(near.lm, near.w, near.h, 178)
    const b = proportions(far.lm, far.w, far.h, 178)
    expect(a.shoulderCm).toBeCloseTo(b.shoulderCm, 1)
    expect(a.hipCm).toBeCloseTo(b.hipCm, 1)
    expect(a.adjust).toBeCloseTo(b.adjust, 1)
  })

  it('works for non-square images and different heights', () => {
    const p = person({ heightCm: 160, shoulderCm: 0.23 * 160, hipCm: 0.125 * 160, cmPerPx: 0.2, w: 720, h: 1280 })
    const r = proportions(p.lm, p.w, p.h, 160)
    expect(r.shoulderCm).toBeCloseTo(36.8, 0)
    expect(Math.abs(r.adjust)).toBeLessThan(0.3)
  })

  it('nudges the build up for broad shoulders and hips, and down for narrow ones', () => {
    const broad = person({ ...AVG, shoulderCm: AVG.shoulderCm * 1.15, hipCm: AVG.hipCm * 1.15 })
    const narrow = person({ ...AVG, shoulderCm: AVG.shoulderCm * 0.85, hipCm: AVG.hipCm * 0.85 })
    expect(proportions(broad.lm, broad.w, broad.h, 178).adjust).toBeGreaterThan(1)
    expect(proportions(narrow.lm, narrow.w, narrow.h, 178).adjust).toBeLessThan(-1)
  })

  it('caps the adjustment at 5 points so a bad photo cannot wreck the avatar', () => {
    const huge = person({ ...AVG, shoulderCm: AVG.shoulderCm * 3, hipCm: AVG.hipCm * 3 })
    const tiny = person({ ...AVG, shoulderCm: AVG.shoulderCm * 0.2, hipCm: AVG.hipCm * 0.2 })
    expect(proportions(huge.lm, huge.w, huge.h, 178).adjust).toBe(5)
    expect(proportions(tiny.lm, tiny.w, tiny.h, 178).adjust).toBe(-5)
  })
})

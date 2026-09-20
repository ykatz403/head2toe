import { describe, expect, it, vi } from 'vitest'
import { buildFromBmi, clamp, formatDate, guestScan } from './body'

describe('buildFromBmi', () => {
  it('gives an average build (100) at a BMI of about 23', () => {
    expect(buildFromBmi(178, 73)).toBe(100)
    expect(buildFromBmi(165, 62.6)).toBe(100)
  })
  it('gets broader as weight goes up and slimmer as it goes down', () => {
    const at = (kg: number) => buildFromBmi(175, kg)
    expect(at(60)).toBeLessThan(at(70))
    expect(at(70)).toBeLessThan(at(90))
    expect(at(90)).toBeLessThan(at(110))
  })
  it('never leaves the 85 to 125 range the avatar and API accept', () => {
    expect(buildFromBmi(200, 35)).toBe(85)
    expect(buildFromBmi(120, 200)).toBe(125)
    for (let h = 120; h <= 220; h += 10) for (let w = 35; w <= 200; w += 15) {
      const b = buildFromBmi(h, w)
      expect(b).toBeGreaterThanOrEqual(85)
      expect(b).toBeLessThanOrEqual(125)
      expect(Number.isInteger(b)).toBe(true)
    }
  })
})

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('guestScan', () => {
  const scan = { heightCm: 176, buildPct: 104, skinTone: 2, savedAt: '2026-09-20T10:00:00Z' }
  it('is empty at first', () => expect(guestScan.get()).toBeNull())
  it('round-trips a scan', () => {
    guestScan.set(scan)
    expect(guestScan.get()).toEqual(scan)
  })
  it('clears', () => {
    guestScan.set(scan)
    guestScan.clear()
    expect(guestScan.get()).toBeNull()
  })
  it('ignores corrupt or foreign data instead of crashing', () => {
    localStorage.setItem('h2t-guest-scan', '{not json')
    expect(guestScan.get()).toBeNull()
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ hello: 'world' }))
    expect(guestScan.get()).toBeNull()
    localStorage.setItem('h2t-guest-scan', 'null')
    expect(guestScan.get()).toBeNull()
  })
  it('survives storage being unavailable', () => {
    const boom = () => { throw new Error('denied') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
    expect(guestScan.get()).toBeNull()
    expect(() => guestScan.set(scan)).not.toThrow()
    expect(() => guestScan.clear()).not.toThrow()
  })
})

describe('formatDate', () => {
  it('formats an ISO date for people', () => expect(formatDate('2026-09-20T12:00:00Z')).toBe('Sep 20, 2026'))
})

import type { BodyShape } from '../avatar/scene'

export const DEFAULT_BODY: BodyShape = { heightCm: 178, buildPct: 100, skinTone: 0 }

export interface SavedBody extends BodyShape {
  savedAt: string
}

const KEY = 'h2t-guest-scan'

/** Guests keep their scan on this device. Signed-in users keep it on the server. */
export const guestScan = {
  get(): SavedBody | null {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      return v && typeof v.heightCm === 'number' ? v : null
    } catch {
      return null
    }
  },
  set(b: SavedBody) {
    try {
      localStorage.setItem(KEY, JSON.stringify(b))
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  },
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Build index from height and weight: 100 is average, 85 slim, 125 broad. */
export const buildFromBmi = (heightCm: number, weightKg: number) => {
  const bmi = weightKg / Math.pow(heightCm / 100, 2)
  return clamp(Math.round(100 + (bmi - 23) * 3.2), 85, 125)
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { buildFromBmi, clamp } from './body'
import { decodeImage, detectPerson, LM, ScanError, type Detected } from './pose'

export { ScanError }

export interface Measurement {
  buildPct: number
  shoulderCm: number | null
  hipCm: number | null
  usedPhotos: boolean
}

// Average adult proportions, as a share of body height, for the joint landmarks MediaPipe reports.
// Heuristic values: calibrate against measured volunteers before relying on them.
const REF_SHOULDER = 0.23
const REF_HIP = 0.125
const NOSE_TO_ANKLE = 0.886 // nose-to-ankle-joint distance as a share of standing height

async function detect(file: File, which: string): Promise<Detected> {
  // A file that isn't a readable picture is the user's to fix: it must not fall back to a weight-only estimate.
  const bitmap = await decodeImage(file, `${which} photo`)
  try {
    return await detectPerson(bitmap, `${which} photo`)
  } finally {
    bitmap.close()
  }
}

/**
 * Estimates the avatar's build from height and weight, refined with shoulder and hip proportions
 * measured from the front photo. Both photos are checked for a full-body pose. Runs entirely in
 * the browser: photos are never uploaded.
 */
export async function measureBody(front: File, side: File, heightCm: number, weightKg: number): Promise<Measurement> {
  const base = buildFromBmi(heightCm, weightKg)
  let f: Detected, s: Detected
  try {
    f = await detect(front, 'front')
    s = await detect(side, 'side')
  } catch (e) {
    if (e instanceof ScanError) throw e
    // Model or WASM failed to load: still give the user an avatar from height and weight.
    return { buildPct: base, shoulderCm: null, hipCm: null, usedPhotos: false }
  }
  void s // the side photo is only validated for now: it must also contain a full-body pose

  const p = proportions(f.lm, f.w, f.h, heightCm)
  return {
    buildPct: clamp(Math.round(base + p.adjust), 85, 125),
    shoulderCm: Math.round(p.shoulderCm),
    hipCm: Math.round(p.hipCm),
    usedPhotos: true,
  }
}

/**
 * Turns front-photo landmarks into real-world shoulder and hip widths (using the person's own height
 * as the ruler), and a small build adjustment: wider than average nudges up, narrower nudges down.
 */
export function proportions(lm: Pick<NormalizedLandmark, 'x' | 'y'>[], w: number, h: number, heightCm: number) {
  const px = (a: number, b: number) => Math.hypot((lm[a].x - lm[b].x) * w, (lm[a].y - lm[b].y) * h)
  const ankleY = (lm[LM.L_ANKLE].y + lm[LM.R_ANKLE].y) / 2
  const bodyPx = (ankleY - lm[LM.NOSE].y) * h
  const cmPerPx = (heightCm * NOSE_TO_ANKLE) / bodyPx
  const shoulderCm = px(LM.L_SHOULDER, LM.R_SHOULDER) * cmPerPx
  const hipCm = px(LM.L_HIP, LM.R_HIP) * cmPerPx
  const dev = (shoulderCm / heightCm / REF_SHOULDER - 1 + (hipCm / heightCm / REF_HIP - 1)) / 2
  return { shoulderCm, hipCm, adjust: clamp(dev * 30, -5, 5) }
}

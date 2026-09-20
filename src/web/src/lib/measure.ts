import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { buildFromBmi, clamp } from './body'

/** A problem the user can fix by retaking a photo. */
export class ScanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanError'
  }
}

export interface Measurement {
  buildPct: number
  shoulderCm: number | null
  hipCm: number | null
  usedPhotos: boolean
}

let landmarker: Promise<PoseLandmarker> | null = null
function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= FilesetResolver.forVisionTasks('/mediapipe/wasm').then((files) =>
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task' },
      runningMode: 'IMAGE',
      numPoses: 1,
    }),
  )
  landmarker.catch(() => (landmarker = null))
  return landmarker
}

const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24, L_ANKLE = 27, R_ANKLE = 28

// Average adult proportions, as a share of body height, for the joint landmarks MediaPipe reports.
// Heuristic values: calibrate against measured volunteers before relying on them.
const REF_SHOULDER = 0.23
const REF_HIP = 0.125
const NOSE_TO_ANKLE = 0.886 // nose-to-ankle-joint distance as a share of standing height

interface Detected {
  lm: NormalizedLandmark[]
  w: number
  h: number
}

async function detect(file: File, which: string): Promise<Detected> {
  // A file that isn't a readable picture is the user's to fix: it must not fall back to a weight-only estimate.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ScanError(`We couldn't open your ${which} photo. Choose a JPG or PNG picture.`)
  })
  try {
    const result = (await getLandmarker()).detect(bitmap)
    const lm = result.landmarks[0]
    if (!lm) throw new ScanError(`We couldn't find a person in your ${which} photo. Use a plain wall and good light, and keep your whole body in frame.`)
    const seen = (i: number) => (lm[i].visibility ?? 0) > 0.5
    if (![L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].some(seen) || ![L_ANKLE, R_ANKLE].some(seen))
      throw new ScanError(`We couldn't see your whole body in the ${which} photo. Step back until your head and feet are both in the frame.`)
    const feetY = Math.max(lm[L_ANKLE].y, lm[R_ANKLE].y)
    if (feetY > 0.99 || lm[NOSE].y < 0.01)
      throw new ScanError(`Your head or feet are cut off in the ${which} photo. Step back and retake it.`)
    return { lm, w: bitmap.width, h: bitmap.height }
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
  const ankleY = (lm[L_ANKLE].y + lm[R_ANKLE].y) / 2
  const bodyPx = (ankleY - lm[NOSE].y) * h
  const cmPerPx = (heightCm * NOSE_TO_ANKLE) / bodyPx
  const shoulderCm = px(L_SHOULDER, R_SHOULDER) * cmPerPx
  const hipCm = px(L_HIP, R_HIP) * cmPerPx
  const dev = (shoulderCm / heightCm / REF_SHOULDER - 1 + (hipCm / heightCm / REF_HIP - 1)) / 2
  return { shoulderCm, hipCm, adjust: clamp(dev * 30, -5, 5) }
}

import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

/** A problem the user can fix by choosing a different photo. */
export class ScanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanError'
  }
}

/** MediaPipe pose landmark indices used by the app. */
export const LM = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30, L_TOE: 31, R_TOE: 32,
} as const

export interface Detected {
  lm: NormalizedLandmark[]
  w: number
  h: number
  /** Per-pixel "is this the person" confidence (0..1), same size as the image, or null if unavailable. */
  mask: Float32Array | null
}

let landmarker: Promise<PoseLandmarker> | null = null
function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= FilesetResolver.forVisionTasks('/mediapipe/wasm').then((files) =>
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task' },
      runningMode: 'IMAGE',
      numPoses: 1,
      outputSegmentationMasks: true,
    }),
  )
  landmarker.catch(() => (landmarker = null))
  return landmarker
}

/** Decode a picture file, or explain that it can't be read. */
export async function decodeImage(file: Blob, which: string): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ScanError(`We couldn't open your ${which}. Choose a JPG or PNG picture.`)
  })
}

/**
 * Find the person in a picture and check the whole body is in frame. Runs in the browser: nothing is uploaded.
 * `which` is used in messages, e.g. "front photo".
 */
export async function detectPerson(source: ImageBitmap | HTMLCanvasElement, which: string): Promise<Detected> {
  const model = await getLandmarker()
  let lm: NormalizedLandmark[] | undefined
  let mask: Float32Array | null = null
  let maskW = 0
  let maskH = 0
  // Masks are only valid inside the callback, so copy them out.
  model.detect(source, (result) => {
    lm = result.landmarks[0]
    const m = result.segmentationMasks?.[0]
    if (m) {
      mask = new Float32Array(m.getAsFloat32Array())
      maskW = m.width
      maskH = m.height
    }
  })

  if (!lm) throw new ScanError(`We couldn't find a person in your ${which}. Use a plain wall and good light, and keep your whole body in frame.`)
  const seen = (i: number) => (lm![i].visibility ?? 0) > 0.5
  if (![LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].some(seen) || ![LM.L_ANKLE, LM.R_ANKLE].some(seen))
    throw new ScanError(`We couldn't see your whole body in the ${which}. Step back until your head and feet are both in the frame.`)
  const feetY = Math.max(lm[LM.L_ANKLE].y, lm[LM.R_ANKLE].y)
  if (feetY > 0.99 || lm[LM.NOSE].y < 0.01) throw new ScanError(`Your head or feet are cut off in the ${which}. Step back and retake it.`)

  const w = source.width
  const h = source.height
  // A mask at a different size than the image would misalign: resample it to match.
  if (mask && (maskW !== w || maskH !== h)) {
    const src: Float32Array = mask
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const sy = Math.min(maskH - 1, Math.floor((y * maskH) / h))
      for (let x = 0; x < w; x++) out[y * w + x] = src[sy * maskW + Math.min(maskW - 1, Math.floor((x * maskW) / w))]
    }
    mask = out
  }
  return { lm, w, h, mask }
}

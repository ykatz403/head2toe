// Copies the MediaPipe WASM runtime and downloads the pose model into public/, so the
// body scan runs fully in the browser and photos never leave the device.
// Both outputs are git-ignored. Runs automatically after `npm install`.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmDest = join(root, 'public', 'mediapipe', 'wasm')
const modelDest = join(root, 'public', 'models', 'pose_landmarker_lite.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDest, { recursive: true })
  cpSync(wasmSrc, wasmDest, { recursive: true })
  console.log('mediapipe: wasm runtime copied')
} else {
  console.warn('mediapipe: package not installed yet, skipping wasm copy')
}

if (!existsSync(modelDest)) {
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    mkdirSync(dirname(modelDest), { recursive: true })
    writeFileSync(modelDest, Buffer.from(await res.arrayBuffer()))
    console.log('mediapipe: pose model downloaded')
  } catch (e) {
    console.warn(`mediapipe: could not download the pose model (${e.message}).`)
    console.warn('The scan will fall back to height and weight only. Re-run: node scripts/setup-mediapipe.mjs')
  }
} else {
  console.log('mediapipe: pose model already present')
}

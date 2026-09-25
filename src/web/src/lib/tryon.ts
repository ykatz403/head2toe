import type { LookItem } from '../avatar/scene'
import { clamp } from './body'
import { decodeImage, detectPerson, LM, ScanError } from './pose'

export interface Pt {
  x: number
  y: number
}
type P = { x: number; y: number; visibility?: number }

/** One shape to paint onto the photo. */
export interface Part {
  slot: string
  polygon: Pt[]
  color: string
  /** Shaded parts take their light and folds from the photo underneath; flat parts are plain colour. */
  flat?: boolean
  alpha?: number
  /** Cut the shape to the person's outline: tight for fitted clothes, loose for coats, none for hats/shoes/glasses. */
  clip: 'tight' | 'loose' | 'none'
  stroke?: { color: string; width: number }
}

// ---------- small vector helpers ----------
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const unit = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y) || 1
  return { x: a.x / l, y: a.y / l }
}

/** A thick line through points (a sleeve, a trouser leg) as a closed polygon. */
export function ribbon(pts: Pt[], widths: number[]): Pt[] {
  const left: Pt[] = []
  const right: Pt[] = []
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const d = unit(sub(next, prev))
    const n = { x: -d.y, y: d.x }
    left.push(add(p, mul(n, widths[i] / 2)))
    right.push(sub(p, mul(n, widths[i] / 2)))
  })
  return [...left, ...right.reverse()]
}

/** Points around an ellipse (or part of one) for hats, shoes and lenses. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 28): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }
  })
}

/** A rounded, slightly squared shape (a shoe from the front). */
function roundedBox(cx: number, cy: number, hw: number, hh: number, n = 4): Pt[] {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    return { x: cx + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * hw, y: cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * hh }
  })
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const c = (v: number) => clamp(Math.round(v * k), 0, 255)
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')
}

/**
 * Turn detected body landmarks into the shapes of the chosen clothes, in painting order.
 * Hidden layers (an undershirt under a shirt) are skipped. If the user hides a shirt, the undershirt shows instead.
 */
export function buildParts(lm: P[], w: number, h: number, items: LookItem[]): Part[] {
  const pt = (i: number): Pt => ({ x: lm[i].x * w, y: lm[i].y * h })
  const bySlot = new Map(items.map((i) => [i.slot, i]))

  // Everything is described relative to the person's own body, so it works at any size and distance.
  const leftFirst = pt(LM.L_SHOULDER).x <= pt(LM.R_SHOULDER).x
  const sIdx = leftFirst ? [[LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST], [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST]] : [[LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST], [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST]]
  const hipsLeftFirst = pt(LM.L_HIP).x <= pt(LM.R_HIP).x
  const lIdx = hipsLeftFirst ? [[LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.L_HEEL, LM.L_TOE], [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE, LM.R_HEEL, LM.R_TOE]] : [[LM.R_HIP, LM.R_KNEE, LM.R_ANKLE, LM.R_HEEL, LM.R_TOE], [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.L_HEEL, LM.L_TOE]]
  const arms = sIdx.map((r) => r.map(pt))
  const legs = lIdx.map((r) => r.map(pt))

  const [s0, s1] = [arms[0][0], arms[1][0]]
  const [h0, h1] = [legs[0][0], legs[1][0]]
  const sw = dist(s0, s1)
  const hw = dist(h0, h1)
  const sm = mid(s0, s1)
  const hm = mid(h0, h1)
  const T = dist(sm, hm) // shoulders to hips
  const down = unit(sub(hm, sm))
  const up = mul(down, -1)
  const u = unit(sub(s1, s0)) // towards image-right

  // ---- torso and sleeves ----
  const torso = (expandS: number, expandH: number, hem: (hip: Pt, knee: Pt) => Pt): Pt[] => {
    const lift = mul(up, 0.03 * sw)
    const S0 = add(add(s0, mul(u, -expandS * sw)), lift)
    const S1 = add(add(s1, mul(u, expandS * sw)), lift)
    const N0 = add(add(sm, mul(u, -0.15 * sw)), mul(up, 0.05 * sw))
    const N1 = add(add(sm, mul(u, 0.15 * sw)), mul(up, 0.05 * sw))
    const C = add(sm, mul(down, 0.03 * sw)) // scooped neckline
    const A0 = add(lerp(s0, h0, 0.4), mul(u, -expandS * 0.6 * sw))
    const A1 = add(lerp(s1, h1, 0.4), mul(u, expandS * 0.6 * sw))
    const H0 = add(hem(h0, legs[0][1]), mul(u, -expandH * hw))
    const H1 = add(hem(h1, legs[1][1]), mul(u, expandH * hw))
    return [S0, N0, C, N1, S1, A1, H1, H0, A0]
  }
  const shortHem = (t: number) => (hip: Pt) => add(hip, mul(down, t * T))
  const kneeHem = (t: number) => (hip: Pt, knee: Pt) => lerp(hip, knee, t)

  const sleeves = (len: string, widthK: number): Pt[][] =>
    arms.map((arm, i) => {
      const inward = mul(u, (i === 0 ? 1 : -1) * 0.06 * sw)
      const S = add(arm[0], inward)
      const w0 = 0.27 * sw * widthK
      return len === 'long'
        ? ribbon([S, arm[1], lerp(arm[1], arm[2], 0.92)], [w0, w0 * 0.88, w0 * 0.78])
        : ribbon([S, lerp(S, arm[1], 0.55)], [w0, w0 * 0.92])
    })

  const upperGarment = (slot: string, color: string, sleeve: string, expand: number): Part[] => [
    { slot, polygon: torso(expand, expand * 0.6, shortHem(0.1)), color, clip: 'tight' },
    ...sleeves(sleeve, 1).map((polygon): Part => ({ slot, polygon, color, clip: 'tight' })),
  ]

  // ---- legs ----
  const waist = (): Pt[] => [
    add(add(h0, mul(u, -hw * 0.45)), mul(up, 0.06 * T)),
    add(add(h1, mul(u, hw * 0.45)), mul(up, 0.06 * T)),
    add(add(h1, mul(u, hw * 0.45)), mul(down, 0.12 * T)),
    add(add(h0, mul(u, -hw * 0.45)), mul(down, 0.12 * T)),
  ]
  const trouserLegs = (len: 'long' | 'short' | 'boxer', k = 1): Pt[][] =>
    legs.map(([hip, knee, ankle]) => {
      const top = hw * 0.95 * k
      if (len === 'long') return ribbon([hip, knee, lerp(knee, ankle, 0.93)], [top, top * 0.72, top * 0.55])
      const t = len === 'short' ? 0.9 : 0.3
      return ribbon([hip, lerp(hip, knee, t)], [top, top * (len === 'short' ? 0.8 : 0.95)])
    })

  // ---- face ----
  const eyeA = pt(LM.L_EYE)
  const eyeB = pt(LM.R_EYE)
  const earA = pt(LM.L_EAR)
  const earB = pt(LM.R_EAR)
  const nose = pt(LM.NOSE)
  const eyesSeen = (lm[LM.L_EYE].visibility ?? 0) > 0.3 && (lm[LM.R_EYE].visibility ?? 0) > 0.3
  const eyeDist = eyesSeen ? dist(eyeA, eyeB) : sw * 0.2
  const headW = Math.max(dist(earA, earB) * ((lm[LM.L_EAR].visibility ?? 0) > 0.3 ? 1 : 0), eyeDist * 2.4, sw * 0.42)
  const eyeC = eyesSeen ? mid(eyeA, eyeB) : { x: nose.x, y: nose.y - headW * 0.12 }

  const parts: Part[] = []

  // 1. hidden layers only show when the layer above is off
  const under = bySlot.get('under')
  if (under && !bySlot.has('top')) parts.push(...upperGarment('under', under.color, String(under.attrs.sleeve ?? 'short'), 0.09))
  const boxers = bySlot.get('boxers')
  if (boxers && !bySlot.has('pants'))
    parts.push({ slot: 'boxers', polygon: waist(), color: boxers.color, clip: 'tight' }, ...trouserLegs('boxer', 1.02).map((polygon): Part => ({ slot: 'boxers', polygon, color: boxers.color, clip: 'tight' })))

  // 2. lower body: trousers, socks, shoes
  const pants = bySlot.get('pants')
  if (pants) {
    const len = pants.attrs.len === 'short' ? 'short' : 'long'
    parts.push({ slot: 'pants', polygon: waist(), color: pants.color, clip: 'tight' }, ...trouserLegs(len).map((polygon): Part => ({ slot: 'pants', polygon, color: pants.color, clip: 'tight' })))
  }
  const socks = bySlot.get('socks')
  if (socks)
    legs.forEach(([, knee, ankle]) => {
      const crew = socks.attrs.sock === 'crew'
      parts.push({ slot: 'socks', polygon: ribbon([lerp(ankle, knee, crew ? 0.3 : 0.1), lerp(ankle, knee, -0.02)], [hw * 0.5, hw * 0.46]), color: socks.color, clip: 'none' })
    })
  const shoes = bySlot.get('shoes')
  if (shoes) {
    const type = String(shoes.attrs.type ?? 'sneaker')
    legs.forEach(([, knee, ankle, heel, toe]) => {
      const shin = dist(knee, ankle)
      const cx = (ankle.x + heel.x + toe.x) / 3
      const bottom = Math.max(heel.y, toe.y) + shin * 0.03
      const topY = ankle.y - shin * (type === 'boot' ? 0.28 : type === 'slide' ? -0.05 : 0.02)
      const halfW = Math.max(hw * 0.36, Math.abs(toe.x - heel.x) / 2 + shin * 0.06)
      if (type === 'slide') {
        parts.push({ slot: 'shoes', polygon: roundedBox(cx, bottom - shin * 0.03, halfW, shin * 0.04, 6), color: shoes.color, flat: true, clip: 'none' })
        parts.push({ slot: 'shoes', polygon: roundedBox(cx, bottom - shin * 0.09, halfW * 0.8, shin * 0.03, 6), color: shade(shoes.color, 0.85), flat: true, clip: 'none' })
        return
      }
      const cy = (topY + bottom) / 2
      const hh = Math.max(shin * 0.05, (bottom - topY) / 2)
      parts.push({ slot: 'shoes', polygon: roundedBox(cx, cy, halfW, hh, type === 'boot' ? 5 : 3.4), color: shoes.color, flat: true, clip: 'none' })
      parts.push({ slot: 'shoes', polygon: roundedBox(cx, bottom - shin * 0.015, halfW, shin * 0.03, 6), color: type === 'sneaker' ? '#ececec' : shade(shoes.color, 0.5), flat: true, clip: 'none' })
    })
  }

  // 3. upper body on top of the trousers
  const top = bySlot.get('top')
  if (top) parts.push(...upperGarment('top', top.color, String(top.attrs.sleeve ?? 'short'), 0.12))
  const outer = bySlot.get('outer')
  if (outer) {
    const coat = Boolean(outer.attrs.coat)
    parts.push(
      { slot: 'outer', polygon: torso(0.2, 0.14, coat ? kneeHem(0.85) : shortHem(0.24)), color: outer.color, clip: 'loose' },
      ...sleeves('long', 1.25).map((polygon): Part => ({ slot: 'outer', polygon, color: outer.color, clip: 'loose' })),
      { slot: 'outer', polygon: ribbon([add(sm, mul(down, 0.04 * sw)), coat ? lerp(hm, mid(legs[0][1], legs[1][1]), 0.85) : add(hm, mul(down, 0.24 * T))], [sw * 0.03, sw * 0.03]), color: '#000000', alpha: 0.3, flat: true, clip: 'loose' },
    )
  }

  // 4. head: hat and glasses
  const hat = bySlot.get('hat')
  if (hat) {
    const shape = String(hat.attrs.shape ?? 'cap')
    const cx = (lm[LM.L_EAR].visibility ?? 0) > 0.3 ? (earA.x + earB.x) / 2 : nose.x
    const rim = eyeC.y - headW * (shape === 'beanie' ? 0.1 : 0.16)
    const dark = shade(hat.color, 0.82)
    if (shape === 'straw') {
      parts.push({ slot: 'hat', polygon: ellipse(cx, rim + headW * 0.02, headW * 1.15, headW * 0.22), color: dark, flat: true, clip: 'none' })
      parts.push({ slot: 'hat', polygon: ellipse(cx, rim, headW * 0.56, headW * 0.5, Math.PI, Math.PI * 2), color: hat.color, flat: true, clip: 'none' })
      parts.push({ slot: 'hat', polygon: [{ x: cx - headW * 0.56, y: rim }, { x: cx + headW * 0.56, y: rim }, { x: cx + headW * 0.56, y: rim - headW * 0.1 }, { x: cx - headW * 0.56, y: rim - headW * 0.1 }], color: dark, flat: true, clip: 'none' })
    } else if (shape === 'beanie') {
      parts.push({ slot: 'hat', polygon: ellipse(cx, rim, headW * 0.6, headW * 0.68, Math.PI, Math.PI * 2), color: hat.color, flat: true, clip: 'none' })
      parts.push({ slot: 'hat', polygon: roundedBox(cx, rim - headW * 0.03, headW * 0.6, headW * 0.09, 6), color: dark, flat: true, clip: 'none' })
    } else {
      parts.push({ slot: 'hat', polygon: ellipse(cx, rim, headW * 0.58, headW * 0.5, Math.PI, Math.PI * 2), color: hat.color, flat: true, clip: 'none' })
      parts.push({ slot: 'hat', polygon: ellipse(cx, rim + headW * 0.05, headW * 0.62, headW * 0.11, 0, Math.PI), color: dark, flat: true, clip: 'none' })
    }
  }
  const glasses = bySlot.get('glasses')
  if (glasses && eyesSeen) {
    const r = eyeDist * 0.3
    const frame = { color: glasses.color, width: Math.max(1.5, r * 0.16) }
    const lens = String(glasses.attrs.lens ?? '#111111')
    for (const c of [eyeA, eyeB]) parts.push({ slot: 'glasses', polygon: ellipse(c.x, c.y, r, r * 0.85), color: lens, alpha: 0.78, flat: true, clip: 'none', stroke: frame })
    parts.push({ slot: 'glasses', polygon: ribbon([{ x: eyeA.x + r, y: eyeC.y }, { x: eyeB.x - r, y: eyeC.y }], [frame.width, frame.width]), color: glasses.color, flat: true, clip: 'none' })
  }

  return parts
}

// ---------- masks ----------

/** Grow a 0/255 mask outwards by r pixels (separable running maximum). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[row + k] > m) m = src[row + k]
      tmp[row + x] = m
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x]
      out[y * w + x] = m
    }
  }
  return out
}

// ---------- photo analysis and painting ----------

export interface Analysis {
  photo: HTMLCanvasElement
  photoCtx: CanvasRenderingContext2D
  w: number
  h: number
  lm: P[]
  tight: Uint8Array | null
  loose: Uint8Array | null
}

const MAX_SIDE = 1280

/** Load a photo, find the person, and cut out their outline. Nothing leaves the device. */
export async function analyzePhoto(file: Blob): Promise<Analysis> {
  const bitmap = await decodeImage(file, 'photo')
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const photo = document.createElement('canvas')
  photo.width = w
  photo.height = h
  const photoCtx = photo.getContext('2d', { willReadFrequently: true })!
  photoCtx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const found = await detectPerson(photo, 'photo')
  const { lm } = found
  const sw = Math.hypot((lm[LM.L_SHOULDER].x - lm[LM.R_SHOULDER].x) * w, (lm[LM.L_SHOULDER].y - lm[LM.R_SHOULDER].y) * h)
  const torso = Math.hypot(((lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2 - (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2) * w, ((lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2 - (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2) * h)
  if (sw / (torso || 1) < 0.3) throw new ScanError('Please face the camera. In a side-on photo we can\'t place the clothes.')

  let tight: Uint8Array | null = null
  let loose: Uint8Array | null = null
  if (found.mask) {
    const base = new Uint8Array(w * h)
    for (let i = 0; i < base.length; i++) base[i] = found.mask[i] > 0.5 ? 255 : 0
    tight = dilate(base, w, h, Math.max(2, Math.round(w / 260)))
    loose = dilate(tight, w, h, Math.max(6, Math.round(w / 90)))
  }
  return { photo, photoCtx, w, h, lm, tight, loose }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let scratch: HTMLCanvasElement | null = null
const scratchCanvas = (w: number, h: number) => {
  scratch ??= document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  return scratch
}

function tracePath(g: CanvasRenderingContext2D, poly: Pt[], dx = 0, dy = 0) {
  g.beginPath()
  poly.forEach((p, i) => (i ? g.lineTo(p.x - dx, p.y - dy) : g.moveTo(p.x - dx, p.y - dy)))
  g.closePath()
}

/** Paint one part: its shape, cut to the body, coloured, and lit by the photo underneath. */
function paint(out: CanvasRenderingContext2D, a: Analysis, part: Part) {
  if (part.flat) {
    out.save()
    out.globalAlpha = part.alpha ?? 1
    out.fillStyle = part.color
    tracePath(out, part.polygon)
    out.fill()
    if (part.stroke) {
      out.globalAlpha = 1
      out.strokeStyle = part.stroke.color
      out.lineWidth = part.stroke.width
      out.stroke()
    }
    out.restore()
    return
  }

  const xs = part.polygon.map((p) => p.x)
  const ys = part.polygon.map((p) => p.y)
  const x0 = clamp(Math.floor(Math.min(...xs)) - 4, 0, a.w - 1)
  const y0 = clamp(Math.floor(Math.min(...ys)) - 4, 0, a.h - 1)
  const x1 = clamp(Math.ceil(Math.max(...xs)) + 4, 1, a.w)
  const y1 = clamp(Math.ceil(Math.max(...ys)) + 4, 1, a.h)
  const bw = x1 - x0
  const bh = y1 - y0
  if (bw < 2 || bh < 2) return

  const c = scratchCanvas(bw, bh)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.clearRect(0, 0, bw, bh)
  g.save()
  if ('filter' in g) g.filter = 'blur(0.8px)' // soften the edge a little
  g.fillStyle = '#fff'
  tracePath(g, part.polygon, x0, y0)
  g.fill()
  g.restore()
  const shape = g.getImageData(0, 0, bw, bh)
  const photo = a.photoCtx.getImageData(x0, y0, bw, bh)
  const mask = part.clip === 'tight' ? a.tight : part.clip === 'loose' ? a.loose : null

  const cover = new Float32Array(bw * bh)
  let sum = 0
  let n = 0
  for (let i = 0; i < cover.length; i++) {
    let al = shape.data[i * 4 + 3] / 255
    if (al > 0 && mask) al *= mask[(y0 + Math.floor(i / bw)) * a.w + x0 + (i % bw)] / 255
    cover[i] = al
    if (al > 0.6) {
      sum += photo.data[i * 4] * 0.299 + photo.data[i * 4 + 1] * 0.587 + photo.data[i * 4 + 2] * 0.114
      n++
    }
  }
  const mean = n ? Math.max(30, sum / n) : 128
  const [cr, cg, cb] = hexToRgb(part.color)
  const img = g.createImageData(bw, bh)
  for (let i = 0; i < cover.length; i++) {
    if (cover[i] <= 0.004) continue
    const lum = photo.data[i * 4] * 0.299 + photo.data[i * 4 + 1] * 0.587 + photo.data[i * 4 + 2] * 0.114
    // the photo's own light and folds, relative to the average of the area being covered
    const s = clamp((lum / mean) * 0.92, 0.5, 1.18)
    img.data[i * 4] = cr * s
    img.data[i * 4 + 1] = cg * s
    img.data[i * 4 + 2] = cb * s
    img.data[i * 4 + 3] = cover[i] * 255 * (part.alpha ?? 1)
  }
  g.putImageData(img, 0, 0)
  out.drawImage(c, 0, 0, bw, bh, x0, y0, bw, bh)
}

/** Draw the photo, then the chosen outfit on top. `original` shows the photo alone (before/after). */
export function renderTryOn(a: Analysis, out: HTMLCanvasElement, items: LookItem[], original = false) {
  out.width = a.w
  out.height = a.h
  const ctx = out.getContext('2d')!
  ctx.drawImage(a.photo, 0, 0)
  if (original) return
  for (const part of buildParts(a.lm, a.w, a.h, items)) paint(ctx, a, part)
}

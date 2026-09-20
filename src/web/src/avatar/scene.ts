import * as THREE from 'three'

export type Attrs = Record<string, unknown>

/** One garment to draw. Only visible garments are passed in. */
export interface LookItem {
  slot: string
  color: string
  attrs: Attrs
}

export interface BodyShape {
  heightCm: number
  buildPct: number
  skinTone: number
}

export const SKIN_TONES = ['#f1d2b8', '#e3b48c', '#c68b60', '#8f5b3a', '#5a3826']
export const DEFAULT_HEIGHT_CM = 178

const SLOTS = ['hat', 'glasses', 'under', 'top', 'outer', 'pants', 'boxers', 'socks', 'shoes'] as const

/** Which mesh group to show for a garment, chosen from the product's attributes. */
const VARIANT: Record<string, (a: Attrs) => string> = {
  hat: (a) => String(a.shape ?? 'cap'),
  glasses: () => 'all',
  under: (a) => String(a.sleeve ?? 'short'),
  top: (a) => String(a.sleeve ?? 'short'),
  outer: (a) => (a.coat ? 'coat' : 'jacket'),
  pants: (a) => String(a.len ?? 'long'),
  boxers: () => 'all',
  socks: (a) => String(a.sock ?? 'low'),
  shoes: (a) => String(a.type ?? 'sneaker'),
}

const std = (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
const cyl = (rt: number, rb: number, h: number, seg = 28) => new THREE.CylinderGeometry(rt, rb, h, seg)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const sph = (r: number, ws = 24, hs = 16, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) =>
  new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl)

export class AvatarScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  private root = new THREE.Group()
  private model = new THREE.Group()
  private mats: Record<string, THREE.MeshStandardMaterial> = {}
  private lens = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2, transparent: true, opacity: 0.78 })
  private variants: Record<string, Record<string, THREE.Object3D[]>> = {}
  private all: Record<string, THREE.Object3D[]> = {}
  private ang = 0.5
  private target = 0.5
  private auto: boolean
  private dist = 4.3
  private raf = 0
  private ro: ResizeObserver
  private dragX: number | null = null
  private dirty = true
  private disposers: (() => void)[] = []

  private canvas: HTMLCanvasElement
  private host: HTMLElement

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas
    this.host = host
    this.auto = !matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a97a3, 2.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.6)
    key.position.set(2, 4, 3)
    const fill = new THREE.DirectionalLight(0xffffff, 1.0)
    fill.position.set(-3, 2, -2.5)
    this.scene.add(key, fill, this.root)
    this.root.add(this.model)

    for (const k of ['skin', 'hair', 'under', 'top', 'outer', 'pants', 'boxers', 'socks', 'shoes', 'sole', 'hat', 'frame'])
      this.mats[k] = std('#888888')
    this.mats.hair.color.set('#2a2521')
    this.mats.eye = std('#1a1a1a', 0.4)

    this.buildGround()
    this.buildBody()
    this.bindInput()

    this.ro = new ResizeObserver(() => this.fit())
    this.ro.observe(host)
    this.fit()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ---------- public API ----------
  setBody({ heightCm, buildPct, skinTone }: BodyShape) {
    const b = buildPct / 100
    this.model.scale.set(b, heightCm / DEFAULT_HEIGHT_CM, b)
    this.mats.skin.color.set(SKIN_TONES[skinTone] ?? SKIN_TONES[0])
    this.dirty = true
  }

  setLook(items: LookItem[]) {
    const bySlot = new Map(items.map((i) => [i.slot, i]))
    for (const slot of SLOTS) {
      this.all[slot]?.forEach((m) => (m.visible = false))
      const it = bySlot.get(slot)
      if (!it) continue
      this.variants[slot]?.[VARIANT[slot](it.attrs)]?.forEach((m) => (m.visible = true))
      const c = it.color
      if (slot === 'glasses') {
        this.mats.frame.color.set(c)
        this.lens.color.set(String(it.attrs.lens ?? '#111111'))
      } else if (slot === 'shoes') {
        this.mats.shoes.color.set(c)
      } else if (slot === 'hat') {
        this.mats.hat.color.set(c)
      } else {
        this.mats[slot].color.set(c)
      }
    }
    // sole and hat band are derived colours; set once all garments are known
    const shoe = bySlot.get('shoes')
    this.mats.sole.color.set(
      shoe ? (shoe.attrs.type === 'sneaker' ? '#ececec' : new THREE.Color(shoe.color).multiplyScalar(0.5)) : '#888888',
    )
    this.dirty = true
  }

  /** 0 = front, 1 = side, 2 = back */
  setView(v: 0 | 1 | 2) {
    this.auto = false
    this.target = Math.round(this.ang / (Math.PI * 2)) * Math.PI * 2 + [0, Math.PI / 2, Math.PI][v]
  }
  rotate(delta: number) {
    this.auto = false
    this.target += delta
  }
  zoom(delta: number) {
    this.dist = Math.min(6.5, Math.max(2.8, this.dist + delta))
    this.dirty = true
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.disposers.forEach((d) => d())
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    Object.values(this.mats).forEach((m) => m.dispose())
    this.renderer.dispose()
  }

  // ---------- internals ----------
  private reg<T extends THREE.Object3D>(slot: string, keys: string | string[], o: T): T {
    ;(this.all[slot] ??= []).push(o)
    for (const k of [keys].flat()) ((this.variants[slot] ??= {})[k] ??= []).push(o)
    o.visible = false
    return o
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    parent?.add(o)
    return o
  }

  private buildGround() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62)
    gr.addColorStop(0, 'rgba(0,0,0,.35)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    const shadow = this.mesh(
      new THREE.CircleGeometry(0.62, 40),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
      0, 0.002, 0,
    )
    shadow.rotation.x = -Math.PI / 2
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0C7563'
    const ring = this.mesh(
      new THREE.RingGeometry(0.58, 0.6, 64),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 }),
      0, 0.004, 0,
    )
    ring.rotation.x = -Math.PI / 2
    this.root.add(shadow, ring)
  }

  private buildBody() {
    const { mats, model } = this
    const S = mats.skin
    const M = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, p: THREE.Object3D = model) =>
      this.mesh(g, m, x, y, z, p)

    // skin
    M(cyl(0.19, 0.15, 0.6), S, 0, 1.22, 0).scale.z = 0.64
    M(cyl(0.155, 0.15, 0.2), S, 0, 0.93, 0).scale.z = 0.64
    M(cyl(0.05, 0.055, 0.16), S, 0, 1.56, 0)
    M(sph(0.11, 32, 20), S, 0, 1.68, 0).scale.y = 1.12
    M(sph(0.014, 12, 10), S, 0, 1.665, 0.112).scale.z = 1.5
    for (const s of [-1, 1]) M(sph(0.008, 10, 8), mats.eye, s * 0.04, 1.685, 0.1)
    M(sph(0.113, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), mats.hair, 0, 1.685, -0.012).scale.y = 1.12

    for (const s of [-1, 1]) {
      // arms with sleeves
      const p = new THREE.Group()
      p.position.set(s * 0.235, 1.46, 0)
      p.rotation.z = s * 0.07
      model.add(p)
      M(cyl(0.05, 0.038, 0.6), S, 0, -0.3, 0, p)
      M(sph(0.04, 14, 10), S, 0, -0.64, 0, p)
      this.reg('under', 'short', M(cyl(0.058, 0.056, 0.2), mats.under, 0, -0.09, 0, p))
      this.reg('under', 'long', M(cyl(0.058, 0.047, 0.6), mats.under, 0, -0.3, 0, p))
      this.reg('top', 'short', M(cyl(0.068, 0.066, 0.25), mats.top, 0, -0.11, 0, p))
      this.reg('top', 'long', M(cyl(0.068, 0.056, 0.6), mats.top, 0, -0.3, 0, p))
      this.reg('outer', ['jacket', 'coat'], M(cyl(0.08, 0.07, 0.6), mats.outer, 0, -0.3, 0, p))

      // legs, feet, lower garments
      const x = s * 0.085
      M(cyl(0.078, 0.052, 0.86), S, x, 0.5, 0)
      M(sph(0.05, 14, 10), S, x, 0.04, 0.05).scale.set(1, 0.7, 2.3)
      this.reg('pants', 'long', M(cyl(0.095, 0.068, 0.79), mats.pants, x, 0.535, 0))
      this.reg('pants', 'short', M(cyl(0.095, 0.088, 0.4), mats.pants, x, 0.73, 0))
      this.reg('boxers', 'all', M(cyl(0.088, 0.086, 0.16), mats.boxers, x, 0.84, 0))
      this.reg('socks', 'low', M(cyl(0.06, 0.058, 0.09), mats.socks, x, 0.1, 0))
      this.reg('socks', 'crew', M(cyl(0.066, 0.06, 0.32), mats.socks, x, 0.21, 0))

      // shoes
      const upper = (sy: number, sz: number) => {
        const u = M(sph(0.058, 20, 14), mats.shoes, x, 0.06, 0.05)
        u.scale.set(1, sy, sz)
        return u
      }
      this.reg('shoes', 'sneaker', upper(0.9, 2.2))
      this.reg('shoes', 'loafer', upper(0.75, 2.15))
      this.reg('shoes', 'boot', upper(0.95, 2.1))
      this.reg('shoes', 'boot', M(cyl(0.072, 0.076, 0.22), mats.shoes, x, 0.17, -0.005))
      this.reg('shoes', ['sneaker', 'loafer', 'boot', 'slide'], M(box(0.11, 0.028, 0.27), mats.sole, x, 0.014, 0.06))
      this.reg('shoes', 'slide', M(box(0.105, 0.02, 0.09), mats.shoes, x, 0.045, 0.05))

      // glasses
      this.reg('glasses', 'all', M(new THREE.TorusGeometry(0.03, 0.004, 8, 26), mats.frame, s * 0.05, 1.677, 0.105))
      this.reg('glasses', 'all', M(new THREE.CircleGeometry(0.029, 26), this.lens, s * 0.05, 1.677, 0.105))
      this.reg('glasses', 'all', M(box(0.004, 0.004, 0.11), mats.frame, s * 0.109, 1.677, 0.05)).rotation.y = s * 0.12
    }
    this.reg('glasses', 'all', M(box(0.03, 0.004, 0.004), mats.frame, 0, 1.682, 0.108))

    // torso garments (heights offset so lids never share a plane)
    const torso = (slot: string, keys: string | string[], m: THREE.Material, rt: number, rb: number, h: number, y: number) => {
      const o = this.reg(slot, keys, M(cyl(rt, rb, h), m, 0, y, 0))
      o.scale.z = 0.64
    }
    torso('under', ['short', 'long'], mats.under, 0.196, 0.156, 0.6, 1.215)
    torso('top', ['short', 'long'], mats.top, 0.203, 0.16, 0.6, 1.225)
    torso('outer', 'jacket', mats.outer, 0.216, 0.19, 0.64, 1.19)
    torso('outer', 'coat', mats.outer, 0.218, 0.205, 0.98, 1.03)
    torso('pants', ['short', 'long'], mats.pants, 0.163, 0.158, 0.22, 0.93)
    torso('boxers', 'all', mats.boxers, 0.16, 0.155, 0.16, 0.9)

    // hats
    const dome = (r: number, tl: number, y: number) => M(sph(r, 30, 16, 0, Math.PI * 2, 0, tl), mats.hat, 0, y, 0)
    this.reg('hat', 'cap', dome(0.125, Math.PI * 0.52, 1.72)).scale.y = 1.05
    this.reg('hat', 'cap', M(box(0.15, 0.008, 0.11), mats.hat, 0, 1.735, 0.135)).rotation.x = 0.12
    this.reg('hat', 'beanie', dome(0.13, Math.PI * 0.5, 1.73)).scale.y = 1.05
    this.reg('hat', 'beanie', M(cyl(0.133, 0.133, 0.05, 30), mats.hat, 0, 1.745, 0))
    this.reg('hat', 'straw', dome(0.12, Math.PI * 0.5, 1.72)).scale.y = 1.05
    this.reg('hat', 'straw', M(cyl(0.245, 0.245, 0.008, 40), mats.hat, 0, 1.725, 0))
  }

  private bindInput() {
    const c = this.canvas
    const down = (e: PointerEvent) => {
      this.dragX = e.clientX
      this.auto = false
      c.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (this.dragX == null) return
      this.target += (e.clientX - this.dragX) * 0.012
      this.ang = this.target
      this.dragX = e.clientX
      this.dirty = true
    }
    const restored = () => (this.dirty = true) // the GPU can drop the canvas (tab switch, sleep): redraw when it returns
    c.addEventListener('webglcontextrestored', restored)
    const up = () => (this.dragX = null)
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    this.disposers.push(() => {
      c.removeEventListener('webglcontextrestored', restored)
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
    })
  }

  private fit() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.85 ? 38 : 30 // keep the whole body in frame on narrow screens
    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  /** Draws only when something changed, so an idle page costs no CPU or battery. */
  private loop = () => {
    let draw = this.dirty
    if (this.auto) {
      this.ang += 0.006
      this.target = this.ang
      draw = true
    } else if (Math.abs(this.target - this.ang) > 0.0005) {
      this.ang += (this.target - this.ang) * 0.14
      draw = true
    } else if (this.ang !== this.target) {
      this.ang = this.target
      draw = true
    }
    if (draw) {
      this.root.rotation.y = this.ang
      this.camera.position.set(0, 1.0, this.dist)
      this.camera.lookAt(0, 0.93, 0)
      this.renderer.render(this.scene, this.camera)
      this.dirty = false
    }
    this.raf = requestAnimationFrame(this.loop)
  }
}

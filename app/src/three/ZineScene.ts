import {
  AmbientLight, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide,
  Euler, FrontSide, Group, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PerspectiveCamera, Plane, Quaternion, Raycaster, Scene, Shape, ShapeGeometry, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer,
} from 'three'
import { onImageLoad } from '../lib/assets'
import { composeSide, isGifScrap, objectHasMotion } from '../lib/compose'
import { gifFrameIndex } from '../lib/gif'
import { FX_GLSL, fxFor } from '../lib/effects'
import { haptic, sfx } from '../lib/feedback'
import { bbox, clamp, difference, union as unionPolys } from '../lib/geom'
import {
  derive, flapOf, flatToPage, handlePoint, hingeMatrix, pageToFlat, panelMatrices, panelMatrixWith, type Derived,
} from '../lib/paper'
import type { Crease, MultiPoly, Side, Vec2, ZineDoc } from '../lib/types'
import { FEELS, Spring } from './spring'

export type CameraMode = 'free' | 'page' | 'preview' | 'static'

export interface CreaseMark { panel: string; a: Vec2; b: Vec2; color: string; width: number; opacity?: number; dash?: [number, number] }

export interface PointerInfo { x: number; y: number; id: number; t: number; button?: number }
export interface TwoInfo { cx: number; cy: number; dist: number; angle: number; dx: number; dy: number; scale: number; rot: number }

export interface InputHandlers {
  toolStart?(p: PointerInfo): boolean
  toolMove?(p: PointerInfo): void
  toolEnd?(p: PointerInfo): void
  toolCancel?(): void
  twoStart?(g: TwoInfo): boolean
  twoMove?(g: TwoInfo): void
  twoEnd?(): void
  tap?(p: PointerInfo): void
  doubleTap?(p: PointerInfo): boolean
  undo?(): void
  redo?(): void
}

export interface Hit { panel: string; side: Side; flat: Vec2; surface: string; point: Vector3; dist: number }

export interface PageRef { n: number; panel: string; side: Side; surface: string }

interface PanelMeshes { front: Mesh; back: Mesh; rimF?: Mesh; rimB?: Mesh }
interface SurfTex { front: { canvas: HTMLCanvasElement; tex: CanvasTexture }; back: { canvas: HTMLCanvasElement; tex: CanvasTexture } }

const FOV = 30
const UP = new Vector3(0, 1, 0)
export const HERO = new Quaternion().setFromEuler(new Euler(-0.52, 0.42, 0.2, 'YXZ'))
const BACK = new Quaternion().setFromAxisAngle(UP, Math.PI)

type Evt = 'angle' | 'angle-commit' | 'view' | 'pages' | 'frame' | 'handle-down' | 'handle-up'

export class ZineScene {
  el: HTMLDivElement
  canvas: HTMLCanvasElement
  overlay: HTMLDivElement
  renderer: WebGLRenderer
  scene = new Scene()
  camera = new PerspectiveCamera(FOV, 1, 0.1, 500)
  root = new Group()
  fx = new Group()
  doc!: ZineDoc
  d!: Derived
  mats = new Map<string, Matrix4>()
  springs = new Map<string, Spring>()
  meshes = new Map<string, PanelMeshes>()
  tex = new Map<string, SurfTex>()
  pages: PageRef[] = []
  mode: CameraMode = 'free'
  handlers: InputHandlers = {}
  handlesEnabled = true
  handleEls = new Map<string, HTMLDivElement>()
  handleAnchors = new Map<string, Vec2>()
  showHandleHint = false
  snapFaceOn = true
  handMode = false
  edges = true
  animateContent = true
  feel = FEELS.snappy
  readOnly = false
  bgParallax = true
  fitMargin: number | null = null
  /** in page mode, a one-finger swipe on empty canvas turns the zine over (Read) */
  oneFingerSwipe = true
  /** in free mode, a one-finger drag the tool doesn't claim orbits the camera (Cut & Fold with no tool) */
  dragOrbit = false
  /**
   * in page mode, one finger drags the zine around the screen (with a little glide when let go) and two
   * fingers pinch and pan; nothing a drag does turns it over (the reader leaves that to double-tap)
   */
  dragPan = false
  /** with dragPan: at or below this zoom the whole zine is in view, so a drag only stretches and springs back */
  panFreeZoom = 1.04
  /** a fold let go mid-way springs fully closed or fully open, whichever is nearer (the reader); else it holds */
  snapFolds = false
  private panVel = new Vector2()
  private panAt = 0
  private hintPending = false
  /** called with the visible side whenever the zine turns over */
  side: Side = 'front'

  // view state
  q = HERO.clone()
  qFrom = new Quaternion()
  qTo = new Quaternion()
  qAnim = new Spring(1, 200, 26)
  focus: { kind: 'all' } | { kind: 'panel'; id: string } = { kind: 'all' }
  zoom = 1
  pan = new Vector2()
  center = new Vector3()
  /** the zine's own centre (unrotated); the view rotates about it so turning and orbiting stay in place */
  pivot = new Vector3()
  private pivotReady = false
  dist = 60
  fitReady = false
  tiltX = new Spring(0, 140, 16)
  tiltY = new Spring(0, 140, 16)

  private raf = 0
  private last = 0
  private dirtyTex = new Set<string>()
  private lastCompose = 0
  /** per surface, the frames its GIFs were last drawn at */
  private gifShown = new Map<string, string>()
  private ray = new Raycaster()
  private listeners = new Map<Evt, Set<(a?: unknown) => void>>()
  private ro: ResizeObserver
  private offImg: () => void
  private w = 1
  private h = 1
  private time = 0
  private disposed = false
  private tintMesh: Mesh | null = null
  private ghostMesh: Mesh | null = null
  private creaseMarks: Mesh[] = []
  private drops: { mesh: Mesh; v: Vector3; spin: Vector3; t: number }[] = []
  private hidden = new Set<string>()

  constructor(container: HTMLElement, opts: { mode?: CameraMode; preserve?: boolean } = {}) {
    this.mode = opts.mode ?? 'free'
    this.el = document.createElement('div')
    this.el.className = 'zscene'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'zscene-canvas'
    this.overlay = document.createElement('div')
    this.overlay.className = 'zscene-overlay'
    this.el.append(this.canvas, this.overlay)
    container.appendChild(this.el)
    this.renderer = new WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.root, this.camera)
    this.root.add(this.fx)
    this.scene.add(new AmbientLight(0xffffff, Math.PI * 0.64))
    const key = new DirectionalLight(0xffffff, Math.PI * 0.42)
    key.position.set(-0.35, 0.55, 1)
    this.camera.add(key)
    key.target.position.set(0, 0, -1)
    this.camera.add(key.target)
    if (this.mode !== 'free') this.q.identity()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.el)
    this.resize()
    this.offImg = onImageLoad(() => this.invalidateAll())
    this.bindInput()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  on(e: Evt, fn: (a?: any) => void) {
    let s = this.listeners.get(e)
    if (!s) { s = new Set(); this.listeners.set(e, s) }
    s.add(fn)
    return () => { s!.delete(fn) }
  }
  private emit(e: Evt, a?: unknown) { this.listeners.get(e)?.forEach(f => f(a)) }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.offImg()
    this.unbindInput()
    for (const m of this.meshes.values()) this.disposeMeshes(m)
    for (const t of this.tex.values()) { t.front.tex.dispose(); t.back.tex.dispose() }
    this.renderer.dispose()
    this.el.remove()
  }

  resize() {
    const r = this.el.getBoundingClientRect()
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height)
    this.renderer.setSize(this.w, this.h, false)
    this.camera.aspect = this.w / this.h
    this.camera.updateProjectionMatrix()
  }

  // ---------------------------------------------------------------- document

  /** Load or update the document. Structure changes rebuild meshes; content changes recompose textures. */
  setDoc(doc: ZineDoc, opts: { keepAngles?: boolean; structure?: boolean } = {}) {
    const prev = this.doc
    this.doc = doc
    const structural = opts.structure ?? (!prev || prev.surfaces !== doc.surfaces || prev.creases !== doc.creases || prev.finalize !== doc.finalize)
    if (structural) {
      this.d = derive(doc, { edges: true })
      for (const c of doc.creases) {
        let s = this.springs.get(c.id)
        if (!s) { s = new Spring(opts.keepAngles === false ? c.angle : 0, this.feel.k, this.feel.c); this.springs.set(c.id, s); s.to(c.angle) }
        else if (opts.keepAngles === false) s.set(c.angle)
      }
      for (const id of [...this.springs.keys()]) if (!this.d.creases.has(id)) this.springs.delete(id)
      this.rebuild()
      this.computePages()
    }
    if (!prev || prev.objects !== doc.objects || prev.surfaces !== doc.surfaces || prev.effects !== doc.effects || prev.finalize !== doc.finalize) {
      this.invalidateAll()
    }
    if (!prev || prev.effects !== doc.effects || structural) this.updateFx()
    this.fitReady = this.fitReady && !!prev
  }

  invalidate(surface: string) { this.dirtyTex.add(surface) }
  private tickGifs() {
    const ms = this.time * 1000
    let due: Map<string, string> | null = null
    for (const o of this.doc.objects) {
      if (o.kind !== 'scrap' || o.hidden || !isGifScrap(o)) continue
      due ??= new Map()
      due.set(o.surface, (due.get(o.surface) ?? '') + gifFrameIndex(o.src, ms) + ',')
    }
    if (!due) return
    for (const [surface, frames] of due) {
      if (this.gifShown.get(surface) === frames) continue
      this.gifShown.set(surface, frames)
      this.invalidate(surface)
    }
  }
  invalidateAll() { if (this.doc) for (const s of this.doc.surfaces) this.dirtyTex.add(s.id) }
  setHidden(ids: string[]) { this.hidden = new Set(ids); this.invalidateAll() }

  private ensureTex(id: string): SurfTex {
    let t = this.tex.get(id)
    if (!t) {
      const mk = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 4; canvas.height = 4
        const tex = new CanvasTexture(canvas)
        tex.colorSpace = SRGBColorSpace
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        tex.minFilter = LinearMipmapLinearFilter
        return { canvas, tex }
      }
      t = { front: mk(), back: mk() }
      this.tex.set(id, t)
    }
    return t
  }

  private composeNow(id: string) {
    const s = this.d.surfaces.get(id)
    if (!s) return
    const t = this.ensureTex(id)
    const f = this.doc.finalize
    const opts = {
      time: this.time, animate: this.animateContent, boilAll: f.boilAll, wiggle: f.wiggle,
      hide: this.hidden, creases: this.doc.creases, effects: this.doc.effects,
      wear: Math.max(0, ...this.doc.effects.filter(e => e.type === 'wear' && e.scope !== 'scrap').map(e => e.amount)),
    }
    for (const side of ['front', 'back'] as Side[]) {
      const c = t[side].canvas
      const w0 = c.width, h0 = c.height
      composeSide(c, s, side, this.doc.objects, opts)
      if (c.width !== w0 || c.height !== h0) { t[side].tex.dispose(); t[side].tex.image = c }
      t[side].tex.needsUpdate = true
    }
  }

  private disposeMeshes(m: PanelMeshes) {
    for (const x of [m.front, m.back, m.rimF, m.rimB]) {
      if (!x) continue
      x.geometry.dispose()
      ;(x.material as MeshLambertMaterial).dispose()
      x.removeFromParent()
    }
  }

  private makeMaterial(map: CanvasTexture, side: typeof FrontSide | typeof BackSide) {
    const m = new MeshLambertMaterial({ map, side })
    const uniforms = {
      uFxA: { value: [0, 0, 0, 0] as number[] }, uFxB: { value: [0, 0, 0, 0] as number[] },
      uTexSize: { value: new Vector2(1024, 1024) },
    }
    m.userData.uniforms = uniforms
    m.onBeforeCompile = sh => {
      sh.uniforms.uFxA = { value: uniforms.uFxA.value }
      sh.uniforms.uFxB = { value: uniforms.uFxB.value }
      sh.uniforms.uTexSize = uniforms.uTexSize
      m.userData.shader = sh
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n#ifdef USE_MAP\n' + FX_GLSL + '\n#endif')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb = zfx(sampledDiffuseColor.rgb, vMapUv);
  diffuseColor *= sampledDiffuseColor;
#endif`)
    }
    m.customProgramCacheKey = () => 'zfx1'
    return m
  }

  private rebuild() {
    for (const m of this.meshes.values()) this.disposeMeshes(m)
    this.meshes.clear()
    const outline = this.doc.finalize.outline
    for (const P of this.d.list) {
      if (!P.region.length) continue
      const s = this.d.surfaces.get(P.surface)!
      const t = this.ensureTex(P.surface)
      const geoF = regionGeometry(P.region, s.frame, false)
      const geoB = regionGeometry(P.region, s.frame, true)
      const front = new Mesh(geoF, this.makeMaterial(t.front.tex, FrontSide))
      const back = new Mesh(geoB, this.makeMaterial(t.back.tex, BackSide))
      front.userData = { panel: P.id, side: 'front', surface: P.surface }
      back.userData = { panel: P.id, side: 'back', surface: P.surface }
      front.matrixAutoUpdate = back.matrixAutoUpdate = false
      this.root.add(front, back)
      const pm: PanelMeshes = { front, back }
      if (outline.on && outline.width > 0) {
        const rimRegion = inflate(P.region, outline.width)
        const geo = regionGeometry(rimRegion, s.frame, false)
        const matF = new MeshBasicMaterial({ color: new Color(outline.color), side: FrontSide })
        const matB = new MeshBasicMaterial({ color: new Color(outline.color), side: BackSide })
        pm.rimF = new Mesh(geo, matF); pm.rimB = new Mesh(geo.clone(), matB)
        pm.rimF.matrixAutoUpdate = pm.rimB.matrixAutoUpdate = false
        pm.rimF.userData = pm.rimB.userData = { rim: true }
        this.root.add(pm.rimF, pm.rimB)
      }
      this.meshes.set(P.id, pm)
    }
    this.syncHandles()
    this.updateFx()
  }

  updateFx() {
    if (!this.doc) return
    for (const [id, m] of this.meshes) {
      for (const side of ['front', 'back'] as Side[]) {
        const mesh = m[side]
        const fx = fxFor(this.doc.effects, `${id}:${side}`)
        const u = mesh.material && (mesh.material as MeshLambertMaterial).userData.uniforms
        if (!u) continue
        const A = [fx.halftone, fx.dither, fx.grain, fx.photocopy], B = [fx.scan, fx.riso, fx.bleed, fx.texture]
        for (let i = 0; i < 4; i++) { u.uFxA.value[i] = A[i]; u.uFxB.value[i] = B[i] }
        const tex = (mesh.material as MeshLambertMaterial).map
        if (tex?.image) u.uTexSize.value.set((tex.image as HTMLCanvasElement).width, (tex.image as HTMLCanvasElement).height)
      }
    }
  }

  // ---------------------------------------------------------------- angles

  angle(id: string) { return this.springs.get(id)?.x ?? 0 }
  angles(): Record<string, number> {
    const o: Record<string, number> = {}
    for (const [k, s] of this.springs) o[k] = s.target
    return o
  }
  setAngle(id: string, a: number, animate = true) {
    const s = this.springs.get(id)
    if (!s) return
    if (animate) s.to(a, this.feel); else s.set(a)
  }
  setAngles(map: Record<string, number>, opts: { animate?: boolean; feel?: { k: number; c: number }; sequential?: boolean } = {}) {
    const feel = opts.feel ?? this.feel
    if (opts.sequential && opts.animate !== false) {
      // one at a time, top flap first: deepest panels move first when closing, shallowest first when opening
      const changing = [...this.springs.entries()].filter(([k, s]) => k in map && Math.abs(map[k] - s.target) > 0.5)
      const depth = (id: string) => this.d.panels.get(flapOf(this.d.creases.get(id)!))?.depth ?? 0
      changing.sort((a, b) => {
        const opening = (map[a[0]] < a[1].target ? 1 : -1)
        return opening * (depth(a[0]) - depth(b[0])) || (this.d.creases.get(b[0])!.stack ?? 1) - (this.d.creases.get(a[0])!.stack ?? 1)
      })
      changing.forEach(([k, s], i) => {
        setTimeout(() => { if (!this.disposed) s.to(map[k], feel) }, i * 260)
      })
      return
    }
    for (const [k, s] of this.springs) {
      if (!(k in map)) continue
      if (opts.animate === false) s.set(map[k]); else s.to(map[k], feel)
    }
  }
  /** Interpolated pose between keyframes, t in [0, n-1]. */
  poseAt(t: number) {
    const kfs = this.doc.keyframes
    if (!kfs.length) return {}
    const i = clamp(Math.floor(t), 0, kfs.length - 1)
    const j = Math.min(kfs.length - 1, i + 1)
    const f = clamp(t - i, 0, 1)
    const e = f * f * (3 - 2 * f)
    const o: Record<string, number> = {}
    for (const c of this.doc.creases) {
      const a = kfs[i].angles[c.id] ?? c.angle
      const b = kfs[j].angles[c.id] ?? c.angle
      o[c.id] = a + (b - a) * e
    }
    return o
  }
  isMoving() { for (const s of this.springs.values()) if (!s.done) return true; return false }

  // ---------------------------------------------------------------- view

  setMode(m: CameraMode) { this.mode = m }

  viewAll(q: Quaternion, animate = true) {
    this.focus = { kind: 'all' }
    this.animateQ(q, animate)
  }
  resetView(animate = true) {
    this.zoom = 1; this.pan.set(0, 0)
    this.setSide('front', false)
    this.viewAll(this.mode === 'free' ? HERO : new Quaternion(), animate)
  }
  animateQ(q: Quaternion, animate = true) {
    if (!animate) { this.q.copy(q); this.qAnim.set(1); return }
    this.qFrom.copy(this.q)
    this.qTo.copy(q)
    if (this.qFrom.dot(this.qTo) < 0) { this.qTo.x *= -1; this.qTo.y *= -1; this.qTo.z *= -1; this.qTo.w *= -1 }
    this.qAnim.set(0)
    this.qAnim.to(1)
  }
  /** Rotate so the panel's chosen side faces the camera straight on, upright. */
  facePanel(panel: string, side: Side, opts: { focus?: boolean; animate?: boolean } = {}) {
    const m = this.mats.get(panel)
    if (!m) return
    const r = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m)).invert()
    const q = side === 'back' ? BACK.clone().multiply(r) : r
    if (opts.focus) { this.focus = { kind: 'panel', id: panel }; this.zoom = 1; this.pan.set(0, 0) }
    this.setSide(side, false)
    this.animateQ(q, opts.animate !== false)
  }
  /** The panel + side most squarely facing the camera right now. */
  nearestFace(): { panel: string; side: Side } | null {
    let best: { panel: string; side: Side } | null = null, bd = -2
    const n = new Vector3()
    for (const P of this.d.list) {
      const m = this.mats.get(P.id)
      if (!m || !P.region.length) continue
      n.set(0, 0, 1).transformDirection(m).applyQuaternion(this.q)
      const score = Math.abs(n.z) + P.depth * 0.001
      if (score > bd) { bd = score; best = { panel: P.id, side: n.z >= 0 ? 'front' : 'back' } }
    }
    return best
  }
  /** The face on top at the middle of the zine (what a reader is looking at). */
  topFace(): { panel: string; side: Side } | null {
    const b = this.screenBounds()
    const hit = b ? this.pick((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) : null
    return hit ? { panel: hit.panel, side: hit.side } : this.nearestFace()
  }
  /**
   * The page most in view, and a spot in the middle of what's showing of it. The visible part of the zine is
   * sampled on a grid; every sample is the first face the camera's ray meets there (so a page hidden under
   * another never counts), the face with the most samples wins, and the sample nearest the middle of its
   * samples is returned, so whatever is put there is seen, and kept off spines and edges. `seen` holds every
   * sample on that face (flat coords): how much of it is showing.
   */
  topHit(): (Hit & { seen: Vec2[] }) | null {
    const b = this.screenBounds()
    if (!b) return null
    const c = this.renderer.domElement
    const x0 = Math.max(b.x0, 0), x1 = Math.min(b.x1, c.clientWidth), y0 = Math.max(b.y0, 0), y1 = Math.min(b.y1, c.clientHeight)
    if (x1 <= x0 || y1 <= y0) return null
    const N = 12
    const faces = new Map<string, Hit[]>()
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const hit = this.pick(x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / N) * (y1 - y0))
      if (!hit) continue
      const k = hit.panel + '|' + hit.side
      const l = faces.get(k)
      if (l) l.push(hit); else faces.set(k, [hit])
    }
    let best: Hit[] | null = null
    for (const l of faces.values()) if (!best || l.length > best.length) best = l
    if (!best) return null
    const mx = best.reduce((t, h) => t + h.flat[0], 0) / best.length, my = best.reduce((t, h) => t + h.flat[1], 0) / best.length
    const mid = best.reduce((a, h) => (Math.hypot(h.flat[0] - mx, h.flat[1] - my) < Math.hypot(a.flat[0] - mx, a.flat[1] - my) ? h : a))
    return { ...mid, seen: best.map(h => h.flat) }
  }
  /** Screen-space bounding box of the whole zine. */
  screenBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const P of this.d.list) {
      if (!P.region.length || !this.mats.has(P.id)) continue
      for (const poly of P.region) for (const p of poly[0]) {
        const [x, y] = this.flatToScreen(P.id, p)
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
    return isFinite(x0) ? { x0, y0, x1, y1 } : null
  }
  snapToNearest() {
    const f = this.nearestFace()
    if (f) this.facePanel(f.panel, f.side)
  }
  flip() {
    const q = BACK.clone().multiply(this.qAnim.done ? this.q : this.qTo)
    this.setSide(this.side === 'front' ? 'back' : 'front', true)
    this.animateQ(q)
    sfx('rustle')
    haptic('tap')
  }
  private setSide(s: Side, notify: boolean) {
    const changed = s !== this.side
    this.side = s
    if (changed && notify) this.emit('view')
  }
  orbit(dx: number, dy: number) {
    const qy = new Quaternion().setFromAxisAngle(UP, dx * 0.008)
    const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), dy * 0.008)
    this.q.premultiply(qy).premultiply(qx)
    this.qAnim.set(1)
    this.emit('view')
  }
  roll(a: number) {
    this.q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -a))
    this.qAnim.set(1)
  }
  setZoom(z: number) { this.zoom = clamp(z, 0.45, 5); this.emit('view') }

  private updateView(dt: number) {
    if (!this.qAnim.done) {
      this.qAnim.step(dt)
      this.q.slerpQuaternions(this.qFrom, this.qTo, clamp(this.qAnim.x, -0.1, 1.08))
      if (this.qAnim.done) this.q.copy(this.qTo)
    }
    const tx = this.tiltX.x, ty = this.tiltY.x
    this.tiltX.step(dt); this.tiltY.step(dt)
    const qv = this.q.clone()
    if (tx || ty) qv.premultiply(new Quaternion().setFromEuler(new Euler(tx, ty, 0)))
    this.root.quaternion.copy(qv)
    // fit: bounds of the focused geometry in view space. While shaping paper the framing holds still
    // under the finger and only eases to the new shape once nothing is moving.
    const holding = this.mode === 'free' && this.fitReady && (this.pointers.size > 0 || !!this.drag || this.isMoving() || !this.qAnim.done)
    // rotate about the zine's centre, not the sheet's origin. The pivot only moves while the view is
    // settled, and the camera shifts with it so nothing jumps on screen.
    if (!holding || !this.pivotReady) {
      const c = this.localCenter()
      if (c) {
        if (this.pivotReady) {
          const d = this.pivot.clone().sub(c).applyQuaternion(qv)
          this.center.x += d.x; this.center.y += d.y
        }
        this.pivot.copy(c)
        this.pivotReady = true
      }
    }
    this.root.position.copy(this.pivot).applyQuaternion(qv).negate()
    const b = holding ? null : this.viewBounds(qv)
    if (b) {
      const tan = Math.tan((FOV * Math.PI) / 360)
      const mx = this.fitMargin ?? (this.mode === 'preview' ? 1.45 : this.mode === 'page' ? 1.32 : 1.55)
      const need = Math.max((b.h / 2) / tan, (b.w / 2) / (tan * this.camera.aspect)) * mx
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
      const targetDist = need / this.zoom + b.zmax
      const k = this.fitReady ? 1 - Math.exp(-dt * (this.mode === 'free' ? 5 : 9)) : 1
      this.dist += (targetDist - this.dist) * k
      this.center.x += (cx - this.center.x) * k
      this.center.y += (cy - this.center.y) * k
      this.fitReady = true
    }
    // the camera looks down -z at the focus; screen offsets (pan) shift it
    const yOff = this.mode === 'free' ? 0.05 : this.mode === 'preview' ? 0.02 : 0.03
    this.camera.position.set(this.center.x - this.pan.x, this.center.y - this.pan.y - yOff * this.dist, this.dist)
    this.camera.lookAt(this.center.x - this.pan.x, this.center.y - this.pan.y - yOff * this.dist, 0)
    this.root.updateMatrixWorld(true)
  }

  private viewBounds(q: Quaternion) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zmax = 0
    const v = new Vector3()
    const ids = this.focus.kind === 'panel' && this.mats.has(this.focus.id) ? this.facingWith(this.focus.id, q) : [...this.mats.keys()]
    for (const id of ids) {
      const P = this.d.panels.get(id)
      const m = this.mats.get(id)
      if (!P || !m) continue
      for (const poly of P.region) for (const p of poly[0]) {
        v.set(p[0], p[1], 0).applyMatrix4(m).applyQuaternion(q).add(this.root.position)
        if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x
        if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y
        if (v.z > zmax) zmax = v.z
      }
    }
    if (!isFinite(x0)) return null
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, zmax }
  }

  /** Centre of the folded zine's bounding box, before the view rotation. */
  private localCenter() {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
    const v = new Vector3()
    for (const P of this.d.list) {
      const m = this.mats.get(P.id)
      if (!m || !P.region.length) continue
      for (const poly of P.region) for (const p of poly[0]) {
        v.set(p[0], p[1], 0).applyMatrix4(m)
        if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x
        if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y
        if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z
      }
    }
    return isFinite(x0) ? new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) : null
  }

  /** Panels in the same plane as `panel` that face the viewer: the spread you see when a page is focused. */
  private facingWith(panel: string, q: Quaternion) {
    const out = this.coplanar(panel).filter(id => {
      const m = this.mats.get(id)!
      const n = new Vector3(0, 0, 1).transformDirection(m).applyQuaternion(q)
      return Math.abs(n.z) > 0.5
    })
    return out.length ? out : [panel]
  }

  // ---------------------------------------------------------------- loop

  private loop(now: number) {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016)
    this.last = now
    this.time += dt
    if (!this.doc) return
    let moving = false
    for (const [id, s] of this.springs) {
      if (s.done) continue
      const before = s.x
      s.step(dt)
      // paper may flex a hair past flat but never through itself
      s.x = clamp(s.x, -8, 180)
      if (s.x >= 180 && s.v > 0) { s.v = 0; if (s.target >= 180) s.x = 180 }
      if ((before < 179.5 && s.x >= 179.5) || (before > 0.5 && s.x <= 0.5)) { haptic('medium'); sfx('crease') }
      moving = true
      void id
    }
    const breathe = this.doc.finalize.breathe && (this.mode === 'preview')
    panelMatrices(this.d, c => this.springs.get(c.id)?.x ?? c.angle, this.mats)
    if (breathe) {
      // gentle idle sway: nudge the root, not the folds
      this.tiltY.target = Math.sin(this.time * 0.8) * 0.06
      this.tiltX.target = Math.cos(this.time * 0.6) * 0.03
    }
    this.syncMeshMatrices()
    if (this.ghostMesh?.userData.panel) {
      const pm = this.mats.get(this.ghostMesh.userData.panel)
      if (pm) this.ghostMesh.matrix.copy(pm).multiply(this.ghostMesh.userData.local)
    }
    if (this.tintMesh?.userData.panel) {
      const pm = this.mats.get(this.tintMesh.userData.panel)
      if (pm) this.tintMesh.matrix.copy(pm).multiply(this.tintMesh.userData.local)
    }
    this.updateView(dt)
    // content animation: line boil and wiggle on twos (≈ 12 fps); GIFs at their own pace, redrawing a page
    // whenever one of its GIFs moves on to its next frame
    const boils = this.doc.finalize.boilAll || this.doc.finalize.wiggle || this.doc.objects.some(o => o.kind === 'ink' && objectHasMotion(o))
    if (this.animateContent && boils && now - this.lastCompose > 1000 / 12) { this.invalidateAll() }
    if (this.animateContent) this.tickGifs()
    if (this.dirtyTex.size) {
      this.lastCompose = now
      for (const id of this.dirtyTex) this.composeNow(id)
      this.dirtyTex.clear()
      this.updateFx()
    }
    if (this.dragPan && !this.pointers.size && this.zoom <= this.panFreeZoom) {
      // the whole zine is in view: always settle back to centre it
      this.panVel.set(0, 0)
      if (this.pan.lengthSq() > 1e-6) this.pan.multiplyScalar(Math.exp(-dt * 10)); else this.pan.set(0, 0)
    } else if (!this.pointers.size && this.panVel.lengthSq() > 1e-4) {
      this.panBy(this.panVel.x * dt, this.panVel.y * dt)
      this.panVel.multiplyScalar(Math.exp(-dt * 6))
    }
    this.stepDrops(dt)
    this.renderer.render(this.scene, this.camera)
    this.positionHandles()
    if (this.bgParallax) {
      const e = new Euler().setFromQuaternion(this.root.quaternion, 'YXZ')
      this.el.style.setProperty('--px', `${(e.y * 18).toFixed(2)}px`)
      this.el.style.setProperty('--py', `${(-e.x * 18).toFixed(2)}px`)
    }
    if (moving) this.emit('angle')
    this.emit('frame', dt)
  }

  private rimBack = new Matrix4().makeTranslation(0, 0, -0.012)
  private rimFront = new Matrix4().makeTranslation(0, 0, 0.012)
  private syncMeshMatrices() {
    for (const mk of this.creaseMarks) {
      const pm = this.mats.get(mk.userData.panel)
      if (pm) mk.matrix.copy(pm).multiply(mk.userData.local)
      mk.visible = !!pm
    }
    for (const [id, m] of this.meshes) {
      const mat = this.mats.get(id)
      if (!mat) continue
      m.front.matrix.copy(mat); m.back.matrix.copy(mat)
      if (m.rimF && m.rimB) {
        m.rimF.matrix.copy(mat).multiply(this.rimBack)
        m.rimB.matrix.copy(mat).multiply(this.rimFront)
      }
    }
  }

  renderOnce() {
    panelMatrices(this.d, c => this.springs.get(c.id)?.x ?? c.angle, this.mats)
    this.syncMeshMatrices()
    for (const id of this.dirtyTex) this.composeNow(id)
    this.dirtyTex.clear()
    this.updateView(1)
    this.renderer.render(this.scene, this.camera)
  }

  snapshot(type = 'image/webp', q = 0.85) {
    this.renderOnce()
    return this.canvas.toDataURL(type, q)
  }

  // ---------------------------------------------------------------- projection + picking

  private ndc(x: number, y: number) { return new Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1) }

  toScreen(world: Vector3): [number, number, number] {
    const v = world.clone().project(this.camera)
    return [(v.x + 1) / 2 * this.w, (1 - v.y) / 2 * this.h, v.z]
  }
  panelWorld(panel: string, p: Vec2, z = 0) {
    const m = this.mats.get(panel)
    const v = new Vector3(p[0], p[1], z)
    if (m) v.applyMatrix4(m)
    return v.applyMatrix4(this.root.matrixWorld)
  }
  flatToScreen(panel: string, p: Vec2): [number, number] {
    const s = this.toScreen(this.panelWorld(panel, p))
    return [s[0], s[1]]
  }

  pageToScreen(panel: string, side: Side, p: Vec2): [number, number] {
    const P = this.d.panels.get(panel)
    const s = P && this.d.surfaces.get(P.surface)
    if (!s) return [0, 0]
    return this.flatToScreen(panel, pageToFlat(s.frame, side, p))
  }
  /** Screen point → page coords on a given panel's side (projected onto its plane). */
  screenToPage(panel: string, side: Side, x: number, y: number): Vec2 | null {
    const P = this.d.panels.get(panel)
    const s = P && this.d.surfaces.get(P.surface)
    const f = this.planeHit(panel, x, y)
    if (!s || !f) return null
    return flatToPage(s.frame, side, f)
  }
  /** The panel an object's centre sits on (falls back to the surface's root panel). */
  panelAt(surface: string, side: Side, page: Vec2): string | null {
    const s = this.d.surfaces.get(surface)
    if (!s) return null
    const flat = pageToFlat(s.frame, side, page)
    let fallback: string | null = null
    for (const P of this.d.list) {
      if (P.surface !== surface || !P.region.length) continue
      if (!fallback) fallback = P.id
      if (pointInRegion(flat, P.region)) return P.id
    }
    return fallback
  }

  pick(x: number, y: number): Hit | null {
    this.ray.setFromCamera(this.ndc(x, y), this.camera)
    const objs: Mesh[] = []
    for (const m of this.meshes.values()) objs.push(m.front, m.back)
    const hits = this.ray.intersectObjects(objs, false)
    for (const h of hits) {
      const ud = h.object.userData as { panel: string; side: Side; surface: string }
      // a face only counts when we're looking at it
      const n = new Vector3(0, 0, ud.side === 'front' ? 1 : -1).transformDirection(h.object.matrixWorld)
      if (n.dot(this.ray.ray.direction) > 0) continue
      const inv = new Matrix4().copy(h.object.matrixWorld).invert()
      const lp = h.point.clone().applyMatrix4(inv)
      return { panel: ud.panel, side: ud.side, surface: ud.surface, flat: [lp.x, lp.y], point: h.point, dist: h.distance }
    }
    return null
  }

  /** Project a screen point onto a panel's plane (works outside the panel's paper too). */
  planeHit(panel: string, x: number, y: number): Vec2 | null {
    const m = this.mats.get(panel)
    if (!m) return null
    const world = new Matrix4().multiplyMatrices(this.root.matrixWorld, m)
    const o = new Vector3().setFromMatrixPosition(world)
    const n = new Vector3(0, 0, 1).transformDirection(world)
    const plane = new Plane().setFromNormalAndCoplanarPoint(n, o)
    this.ray.setFromCamera(this.ndc(x, y), this.camera)
    const hit = new Vector3()
    if (!this.ray.ray.intersectPlane(plane, hit)) return null
    const lp = hit.applyMatrix4(world.invert())
    return [lp.x, lp.y]
  }

  /** Does the panel's front face the camera? */
  facesCamera(panel: string) {
    const m = this.mats.get(panel)
    if (!m) return true
    const world = new Matrix4().multiplyMatrices(this.root.matrixWorld, m)
    const n = new Vector3(0, 0, 1).transformDirection(world)
    const o = new Vector3().setFromMatrixPosition(world)
    return n.dot(this.camera.position.clone().sub(o)) > 0
  }

  /** Panels lying in the same plane as `panel` (the stack scissors would cut through). */
  coplanar(panel: string) {
    const m0 = this.mats.get(panel)
    if (!m0) return []
    const n0 = new Vector3(0, 0, 1).transformDirection(m0)
    const o0 = new Vector3().setFromMatrixPosition(m0)
    const out: string[] = []
    for (const [id, m] of this.mats) {
      const n = new Vector3(0, 0, 1).transformDirection(m)
      if (Math.abs(n.dot(n0)) < 0.995) continue
      const o = new Vector3().setFromMatrixPosition(m)
      if (Math.abs(o.sub(o0).dot(n0)) > 0.6) continue
      out.push(id)
    }
    return out
  }

  /** Map a point from one panel's flat coords into another's (both in world, assumes coplanar). */
  mapFlat(from: string, to: string): (p: Vec2) => Vec2 {
    const a = this.mats.get(from)!, b = this.mats.get(to)!
    const rel = new Matrix4().copy(b).invert().multiply(a)
    const v = new Vector3()
    return p => { v.set(p[0], p[1], 0).applyMatrix4(rel); return [v.x, v.y] }
  }

  // ---------------------------------------------------------------- overlays in 3D

  setTint(panel: string | null, region: MultiPoly | null, color = '#FF4934', opacity = 0.28) {
    if (this.tintMesh) { this.tintMesh.geometry.dispose(); (this.tintMesh.material as MeshBasicMaterial).dispose(); this.tintMesh.removeFromParent(); this.tintMesh = null }
    if (!panel || !region?.length) return
    const P = this.d.panels.get(panel)
    const s = P && this.d.surfaces.get(P.surface)
    if (!s) return
    const geo = regionGeometry(region, s.frame, false)
    const mesh = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }))
    mesh.matrixAutoUpdate = false
    const z = this.facesCamera(panel) ? 0.02 : -0.02
    mesh.userData = { panel, local: new Matrix4().makeTranslation(0, 0, z) }
    mesh.renderOrder = 5
    this.root.add(mesh)
    this.tintMesh = mesh
  }

  /**
   * Crease lines drawn on the paper itself, on both faces of the panel that holds them, so they
   * follow every fold and hide behind flaps like real marks. `width` and `dash` are in cm.
   */
  setCreaseMarks(marks: CreaseMark[], seeThrough = false) {
    for (const m of this.creaseMarks) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); m.removeFromParent() }
    this.creaseMarks = []
    for (const k of marks) {
      if (!this.d?.panels.has(k.panel)) continue
      const geo = strokeGeometry(k.a, k.b, k.width, k.dash)
      for (const z of [0.014, -0.014]) {
        const mat = new MeshBasicMaterial({
          color: k.color, transparent: true, opacity: k.opacity ?? 1, side: DoubleSide, depthWrite: false, depthTest: !seeThrough,
          polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
        })
        const mesh = new Mesh(geo, mat)
        mesh.matrixAutoUpdate = false
        mesh.userData = { panel: k.panel, local: new Matrix4().makeTranslation(0, 0, z) }
        mesh.renderOrder = 7
        this.root.add(mesh)
        this.creaseMarks.push(mesh)
      }
    }
    this.syncMeshMatrices()
  }

  /** Translucent preview of a flap folded about a not-yet-created crease. */
  setGhost(panel: string | null, region: MultiPoly | null, crease: Crease | null, color = '#5C5CE3', opacity = 0.32) {
    if (this.ghostMesh) { this.ghostMesh.geometry.dispose(); (this.ghostMesh.material as MeshBasicMaterial).dispose(); this.ghostMesh.removeFromParent(); this.ghostMesh = null }
    if (!panel || !region?.length || !crease) return
    const P = this.d.panels.get(panel)
    const s = P && this.d.surfaces.get(P.surface)
    if (!s) return
    const geo = regionGeometry(region, s.frame, false)
    const mesh = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false }))
    mesh.matrixAutoUpdate = false
    mesh.userData = { panel, local: hingeMatrix(crease, crease.angle, 2) }
    mesh.renderOrder = 6
    this.root.add(mesh)
    this.ghostMesh = mesh
  }

  /** The cut-away piece falls off the paper. */
  dropPieces(pieces: { panel: string; region: MultiPoly }[]) {
    for (const pc of pieces) {
      const P = this.d.panels.get(pc.panel)
      const s = P && this.d.surfaces.get(P.surface)
      const m = this.mats.get(pc.panel)
      const t = P && this.tex.get(P.surface)
      if (!s || !m || !t) continue
      const g = new Group()
      const f = new Mesh(regionGeometry(pc.region, s.frame, false), new MeshLambertMaterial({ map: t.front.tex, side: FrontSide, transparent: true }))
      const b = new Mesh(regionGeometry(pc.region, s.frame, true), new MeshLambertMaterial({ map: t.back.tex, side: BackSide, transparent: true }))
      g.add(f, b)
      const world = new Matrix4().multiplyMatrices(this.root.matrixWorld, m)
      world.decompose(g.position, g.quaternion, g.scale)
      // pivot around the piece's centre so it tumbles naturally
      const bb = bbox(pc.region)
      const c = new Vector3((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, 0)
      f.position.sub(c); b.position.sub(c)
      g.position.add(c.clone().applyQuaternion(g.quaternion))
      this.scene.add(g)
      const dir = c.clone().applyQuaternion(g.quaternion).sub(new Vector3().setFromMatrixPosition(this.root.matrixWorld)).normalize()
      this.drops.push({ mesh: g as unknown as Mesh, v: new Vector3(dir.x * 6, 4, 6), spin: new Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), t: 0 })
    }
  }

  private stepDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.t += dt
      d.v.y -= 70 * dt
      d.mesh.position.addScaledVector(d.v, dt)
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt
      const op = clamp(1 - (d.t - 0.35) / 0.4, 0, 1)
      d.mesh.traverse(o => { const mm = (o as Mesh).material as MeshLambertMaterial | undefined; if (mm) mm.opacity = op })
      if (d.t > 0.8) {
        d.mesh.traverse(o => { const mm = o as Mesh; if (mm.geometry) { mm.geometry.dispose(); (mm.material as MeshLambertMaterial).dispose() } })
        d.mesh.removeFromParent()
        this.drops.splice(i, 1)
      }
    }
  }

  // ---------------------------------------------------------------- pages

  /**
   * Number pages in the order the unfold sequence reveals them, reading it from the front all the way through
   * first, then turning it over: so a booklet runs cover, spreads, back cover, like a real one.
   */
  computePages() {
    const out: PageRef[] = []
    const seen = new Set<string>()
    const kfs = this.doc.keyframes.length ? this.doc.keyframes : [{ id: 'x', name: '', angles: {} }]
    const tmp = new Map<string, Matrix4>()
    const v = new Vector3()
    for (const view of ['front', 'back'] as Side[]) {
      for (const kf of kfs) {
        panelMatrices(this.d, c => kf.angles[c.id] ?? c.angle, tmp)
        const found: { id: string; side: Side; x: number; y: number }[] = []
        for (const P of this.d.list) {
          if (!P.region.length) continue
          const m = tmp.get(P.id)!
          const nz = new Vector3(0, 0, 1).transformDirection(m).z
          const side: Side = (nz >= 0) === (view === 'front') ? 'front' : 'back'
          if (Math.abs(nz) < 0.5) continue
          const key = `${P.id}:${side}`
          if (seen.has(key)) continue
          // occlusion: is anything stacked above this panel's centre (toward the viewer)?
          const bb = bbox(P.region)
          const c: Vec2 = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]
          v.set(c[0], c[1], 0).applyMatrix4(m)
          const myZ = v.z * (view === 'front' ? 1 : -1)
          let covered = false
          for (const Q of this.d.list) {
            if (Q.id === P.id || !Q.region.length) continue
            const mq = tmp.get(Q.id)!
            const inv = new Matrix4().copy(mq).invert()
            const lp = v.clone().applyMatrix4(inv)
            // Q covers P if, along the view axis, Q's plane passes in front of P at this point
            const nq = new Vector3(0, 0, 1).transformDirection(mq)
            if (Math.abs(nq.z) < 0.5) continue
            const t = -lp.z
            const qp = new Vector3(lp.x, lp.y, 0).applyMatrix4(mq)
            const qz = qp.z * (view === 'front' ? 1 : -1)
            if (qz > myZ + 0.005 && Math.abs(t) < 50 && pointInRegion([lp.x, lp.y], Q.region)) { covered = true; break }
          }
          if (covered) continue
          found.push({ id: P.id, side, x: v.x * (view === 'front' ? 1 : -1), y: v.y })
        }
        found.sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x))
        for (const f of found) {
          seen.add(`${f.id}:${f.side}`)
          out.push({ n: out.length + 1, panel: f.id, side: f.side, surface: this.d.panels.get(f.id)!.surface })
        }
      }
    }
    for (const P of this.d.list) for (const side of ['front', 'back'] as Side[]) {
      if (!P.region.length || seen.has(`${P.id}:${side}`)) continue
      out.push({ n: out.length + 1, panel: P.id, side, surface: P.surface })
    }
    this.pages = out
    this.emit('pages', out)
  }
  pageOf(panel: string, side: Side) { return this.pages.find(p => p.panel === panel && p.side === side)?.n ?? 0 }

  // ---------------------------------------------------------------- fold handles

  syncHandles() {
    const want = new Set<string>()
    this.handleAnchors.clear()
    if (this.handlesEnabled) {
      for (const c of this.doc.creases) {
        const hp = handlePoint(this.d, c)
        if (!hp) continue
        want.add(c.id)
        this.handleAnchors.set(c.id, hp)
      }
    }
    for (const [id, el] of this.handleEls) if (!want.has(id)) { el.remove(); this.handleEls.delete(id) }
    let i = 0
    for (const id of want) {
      i++
      if (this.handleEls.has(id)) continue
      const el = document.createElement('div')
      el.className = 'fold-handle'
      el.innerHTML = '<span class="fh-core"></span><span class="fh-label"></span>'
      el.setAttribute('role', 'slider')
      el.setAttribute('tabindex', '0')
      el.dataset.crease = id
      el.addEventListener('pointerdown', e => this.beginHandleDrag(id, e))
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const s = this.springs.get(id)
          if (s) { s.to(s.target > 90 ? 0 : 180, this.feel); this.emit('angle-commit', { id, angle: s.target }) }
        }
      })
      this.overlay.appendChild(el)
      this.handleEls.set(id, el)
    }
    // the hint goes on the first handle that's actually reachable (see positionHandles)
    this.hintPending = this.showHandleHint
  }

  setHandlesEnabled(on: boolean) { this.handlesEnabled = on; if (this.doc) this.syncHandles() }

  private positionHandles() {
    if (!this.handleEls.size) return
    const placed: { id: string; x: number; y: number; el: HTMLDivElement }[] = []
    const objs: Mesh[] = []
    for (const m of this.meshes.values()) objs.push(m.front, m.back)
    let n = 0
    for (const [id, el] of this.handleEls) {
      n++
      const c = this.d.creases.get(id)
      const hp = this.handleAnchors.get(id)
      if (!c || !hp) continue
      const flap = flapOf(c)
      const w = this.panelWorld(flap, hp)
      const [x, y, z] = this.toScreen(w)
      // reachable only if nothing sits between the camera and the handle
      this.ray.set(this.camera.position, w.clone().sub(this.camera.position).normalize())
      const dist = this.camera.position.distanceTo(w)
      const hits = this.ray.intersectObjects(objs, false)
      let visible = z < 1 && x > -20 && y > -20 && x < this.w + 20 && y < this.h + 20
      for (const h of hits) {
        if (h.distance > dist - 0.02) break
        const pid = (h.object.userData as { panel: string }).panel
        if (pid !== flap) { visible = false; break }
      }
      el.classList.toggle('hidden', !visible)
      const a = this.springs.get(id)?.x ?? 0
      el.setAttribute('aria-label', `Fold ${n}, ${a > 170 ? 'closed' : a < 10 ? 'open' : Math.round(a) + ' degrees'}. Press Enter to ${a > 90 ? 'open' : 'close'}.`)
      ;(el.querySelector('.fh-label') as HTMLElement).textContent = String(n)
      if (visible) placed.push({ id, x, y, el })
      if (visible && this.hintPending) { el.classList.add('hint'); this.hintPending = false }
    }
    // fan out handles that would overlap
    for (let i = 0; i < placed.length; i++) {
      let ox = 0, oy = 0, crowded = false
      for (let j = 0; j < placed.length; j++) {
        if (i === j) continue
        const dx = placed[i].x - placed[j].x, dy = placed[i].y - placed[j].y
        const d = Math.hypot(dx, dy)
        if (d < 34) {
          crowded = true
          const push = (34 - d) / 2 + 1
          const a = d > 0.5 ? Math.atan2(dy, dx) : (i > j ? 0 : Math.PI)
          ox += Math.cos(a) * push; oy += Math.sin(a) * push
        }
      }
      const p = placed[i]
      p.el.classList.toggle('crowded', crowded)
      p.el.style.transform = `translate3d(${(p.x + ox).toFixed(1)}px, ${(p.y + oy).toFixed(1)}px, 0)`
    }
  }

  private drag: { id: string; pointer: number; last: number; lastT: number; vel: number; el: HTMLElement } | null = null

  beginHandleDrag(id: string, e: PointerEvent) {
    if (this.readOnly && this.mode === 'static') return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    el.classList.add('active')
    el.classList.remove('hint')
    this.overlay.querySelectorAll('.fold-handle.hint').forEach(h => h.classList.remove('hint'))
    const s = this.springs.get(id)
    if (!s) return
    this.drag = { id, pointer: e.pointerId, last: s.x, lastT: performance.now(), vel: 0, el }
    haptic('tick')
    this.emit('handle-down', id)
    const move = (ev: PointerEvent) => {
      if (!this.drag || ev.pointerId !== this.drag.pointer) return
      const r = this.el.getBoundingClientRect()
      const a = this.angleForScreen(id, ev.clientX - r.left, ev.clientY - r.top)
      const now = performance.now()
      const dt = Math.max(1, now - this.drag.lastT) / 1000
      this.drag.vel = this.drag.vel * 0.6 + ((a - this.drag.last) / dt) * 0.4
      if ((this.drag.last < 179 && a >= 179) || (this.drag.last > 1 && a <= 1)) { haptic('medium'); sfx('crease') }
      this.drag.last = a; this.drag.lastT = now
      s.set(a)
      this.emit('angle')
    }
    const up = (ev: PointerEvent) => {
      if (!this.drag || ev.pointerId !== this.drag.pointer) return
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.classList.remove('active')
      const v = this.drag.vel
      // flick: snap fully open or closed in the flick direction; a slow release holds the angle, or with
      // snapFolds goes to whichever end is nearer
      if (Math.abs(v) > 260) { s.v = v * 0.5; s.to(v > 0 ? 180 : 0, this.feel) }
      else if (this.snapFolds) s.to(s.x >= 90 ? 180 : 0, this.feel)
      else if (s.x > 176) s.to(180); else if (s.x < 4) s.to(0)
      this.drag = null
      this.emit('angle-commit', { id, angle: s.target })
      this.emit('handle-up', id)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  /** Find the fold angle that puts the handle closest to the finger (projection onto its on-screen arc). */
  angleForScreen(id: string, x: number, y: number) {
    const c = this.d.creases.get(id)!
    const hp = this.handleAnchors.get(id)
    if (!hp) return 0
    const flap = flapOf(c)
    const cur = (cc: Crease) => this.springs.get(cc.id)?.x ?? cc.angle
    const sample = (a: number) => {
      const m = panelMatrixWith(this.d, flap, cc => (cc.id === id ? a : cur(cc)))
      const w = new Vector3(hp[0], hp[1], 0).applyMatrix4(m).applyMatrix4(this.root.matrixWorld)
      const [sx, sy] = this.toScreen(w)
      return Math.hypot(sx - x, sy - y)
    }
    let best = 0, bd = Infinity
    const curA = this.springs.get(id)?.x ?? 0
    for (let a = 0; a <= 180; a += 4) {
      // bias toward the current angle so the arc doesn't jump where it doubles back on screen
      const d = sample(a) + Math.abs(a - curA) * 0.03
      if (d < bd) { bd = d; best = a }
    }
    for (let a = Math.max(0, best - 4); a <= Math.min(180, best + 4); a += 0.5) {
      const d = sample(a) + Math.abs(a - curA) * 0.03
      if (d < bd) { bd = d; best = a }
    }
    return best
  }

  // ---------------------------------------------------------------- input

  private pointers = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>()
  private gesture: 'none' | 'tool' | 'two' | 'cam1' | 'swipe' | 'pan' = 'none'
  private two: { cx: number; cy: number; dist: number; angle: number; c0x: number; c0y: number; d0: number; a0: number; claimed: boolean; flipped: boolean; t0: number; maxMove: number; count: number } | null = null
  private lastTap = { t: 0, x: 0, y: 0 }
  private tapCandidate = false
  private multiTap: { count: number; t0: number; moved: boolean } | null = null
  private unbind: (() => void) | null = null

  private rel(e: PointerEvent | WheelEvent) {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private bindInput() {
    const c = this.canvas
    const down = (e: PointerEvent) => this.onDown(e)
    const move = (e: PointerEvent) => this.onMove(e)
    const up = (e: PointerEvent) => this.onUp(e)
    const wheel = (e: WheelEvent) => this.onWheel(e)
    const ctx = (e: Event) => e.preventDefault()
    c.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('contextmenu', ctx)
    this.unbind = () => {
      c.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('contextmenu', ctx)
    }
  }
  private unbindInput() { this.unbind?.() }

  private info(id: number, x: number, y: number, button?: number): PointerInfo { return { id, x, y, t: performance.now(), button } }

  private onDown(e: PointerEvent) {
    if (this.mode === 'static') return
    e.preventDefault()
    const { x, y } = this.rel(e)
    this.pointers.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() })
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const n = this.pointers.size
    if (!this.multiTap || performance.now() - this.multiTap.t0 > 300) this.multiTap = { count: 0, t0: performance.now(), moved: false }
    this.multiTap.count = Math.max(this.multiTap.count, n)
    if (n === 1) {
      const mouseOrbit = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.altKey)
      if (!mouseOrbit && !this.handMode && this.handlers.toolStart?.(this.info(e.pointerId, x, y, e.button))) {
        this.gesture = 'tool'
      } else if (mouseOrbit || this.handMode || this.mode === 'preview' || (this.mode === 'free' && this.dragOrbit)) {
        this.gesture = 'cam1'
      } else {
        this.gesture = this.mode === 'page' && this.dragPan ? 'pan' : this.mode === 'page' && this.oneFingerSwipe ? 'swipe' : 'none'
        this.panVel.set(0, 0); this.panAt = performance.now()
      }
      this.tapCandidate = true
    } else if (n === 2) {
      if (this.gesture === 'tool') this.handlers.toolCancel?.()
      this.tapCandidate = false
      this.startTwo()
    } else {
      this.tapCandidate = false
    }
  }

  private startTwo() {
    const pts = [...this.pointers.values()].slice(0, 2)
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
    this.two = { cx, cy, dist, angle, c0x: cx, c0y: cy, d0: dist, a0: angle, claimed: false, flipped: false, t0: performance.now(), maxMove: 0, count: 2 }
    this.gesture = 'two'
    const info: TwoInfo = { cx, cy, dist, angle, dx: 0, dy: 0, scale: 1, rot: 0 }
    this.two.claimed = !!this.handlers.twoStart?.(info)
    this.zoomStart = this.zoom
  }
  private zoomStart = 1

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const { x, y } = this.rel(e)
    const pdx = x - p.x, pdy = y - p.y
    p.x = x; p.y = y
    if (Math.hypot(x - p.x0, y - p.y0) > 8) { this.tapCandidate = false; if (this.multiTap) this.multiTap.moved = true }
    if (this.gesture === 'tool') { this.handlers.toolMove?.(this.info(e.pointerId, x, y)); return }
    if (this.gesture === 'cam1') {
      if (this.mode === 'preview') {
        // a drag or swipe only angles the zine (it springs back on release); turning over is a tap
        this.tiltY.set(clamp(this.tiltY.x + pdx * 0.006, -0.7, 0.7))
        this.tiltX.set(clamp(this.tiltX.x + pdy * 0.004, -0.4, 0.4))
      } else this.orbit(pdx, pdy)
      return
    }
    if (this.gesture === 'pan') {
      const now = performance.now(), dt = Math.max(1, now - this.panAt) / 1000
      this.panAt = now
      // zoomed out to the whole zine, the drag only gives a little (it springs back in the loop)
      const k = this.dist * Math.tan((FOV * Math.PI) / 360) * 2 / this.h * (this.zoom <= this.panFreeZoom ? 0.3 : 1)
      this.panBy(pdx * k, -pdy * k)
      this.panVel.set(this.panVel.x * 0.6 + (pdx * k / dt) * 0.4, this.panVel.y * 0.6 + (-pdy * k / dt) * 0.4)
      return
    }
    if (this.gesture === 'swipe') {
      const dx = x - p.x0, dy = y - p.y0
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) { this.flip(); this.gesture = 'none' }
      return
    }
    if (this.gesture === 'two' && this.two && this.pointers.size >= 2) {
      const pts = [...this.pointers.values()].slice(0, 2)
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
      const dcx = cx - this.two.cx, dcy = cy - this.two.cy
      let da = angle - this.two.angle
      if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2
      this.two.maxMove = Math.max(this.two.maxMove, Math.hypot(cx - this.two.c0x, cy - this.two.c0y), Math.abs(dist - this.two.d0))
      const info: TwoInfo = { cx, cy, dist, angle, dx: cx - this.two.c0x, dy: cy - this.two.c0y, scale: dist / this.two.d0, rot: angle - this.two.a0 }
      if (this.two.claimed) this.handlers.twoMove?.(info)
      else if (this.mode === 'free') {
        this.orbit(dcx, dcy)
        this.setZoom(this.zoomStart * (dist / this.two.d0))
        if (Math.abs(da) < 0.5) this.roll(da)
      } else {
        this.setZoom(this.zoomStart * (dist / this.two.d0))
        const tdx = cx - this.two.c0x, tdy = cy - this.two.c0y
        if (this.dragPan) {
          const k = this.dist * Math.tan((FOV * Math.PI) / 360) * 2 / this.h
          this.panBy(dcx * k, -dcy * k)
        } else if (this.mode !== 'preview' && !this.two.flipped && this.zoom < 1.15 && Math.abs(tdx) > 60 && Math.abs(tdx) > Math.abs(tdy) * 1.5 && Math.abs(dist / this.two.d0 - 1) < 0.25) {
          this.two.flipped = true
          this.flip()
        } else if (this.zoom >= 1.15) {
          const k = this.dist * Math.tan((FOV * Math.PI) / 360) * 2 / this.h
          this.pan.x += dcx * k; this.pan.y -= dcy * k
        }
      }
      this.two.cx = cx; this.two.cy = cy; this.two.dist = dist; this.two.angle = angle
    }
  }

  private onUp(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const { x, y } = this.rel(e)
    this.pointers.delete(e.pointerId)
    const n = this.pointers.size
    if (this.gesture === 'tool') {
      this.handlers.toolEnd?.(this.info(e.pointerId, x, y))
      this.gesture = 'none'
      return
    }
    if (this.gesture === 'two') {
      if (n < 2) {
        if (this.two?.claimed) this.handlers.twoEnd?.()
        else if (this.mode === 'free' && this.snapFaceOn && this.two && this.two.maxMove > 12) this.snapToNearest()
        else if (this.dragPan) { if (this.zoom < 1) this.zoom = 1 }
        else if (this.mode !== 'free' && this.zoom < 1.05) { this.zoom = 1; this.pan.set(0, 0) }
        this.two = null
        this.gesture = n === 1 ? 'none' : 'none'
      }
      if (n === 0) this.finishMultiTap()
      return
    }
    // a drag let go mid-motion keeps gliding briefly (loop); a still finger just stops
    if (this.gesture === 'pan' && performance.now() - this.panAt > 80) this.panVel.set(0, 0)
    if (this.gesture === 'cam1') {
      if (this.mode === 'preview') { this.tiltX.to(0); this.tiltY.to(0) }
      else if (this.mode === 'free' && this.snapFaceOn && !this.handMode) this.snapToNearest()
    }
    this.gesture = 'none'
    if (n === 0 && this.multiTap && this.multiTap.count >= 2) { this.finishMultiTap(); return }
    if (this.tapCandidate && n === 0) {
      const info = this.info(e.pointerId, x, y)
      const now = performance.now()
      if (now - this.lastTap.t < 300 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30) {
        this.lastTap.t = 0
        if (!this.handlers.doubleTap?.(info)) this.resetView()
      } else {
        this.lastTap = { t: now, x, y }
        this.handlers.tap?.(info)
      }
    }
  }

  private finishMultiTap() {
    const m = this.multiTap
    this.multiTap = null
    if (!m || m.moved || performance.now() - m.t0 > 350) return
    if (m.count === 2) { this.handlers.undo?.(); haptic('tap') }
    else if (m.count >= 3) { this.handlers.redo?.(); haptic('tap') }
  }

  /** Move the zine by world units, keeping its middle on screen. */
  private panBy(dx: number, dy: number) {
    const hh = this.dist * Math.tan((FOV * Math.PI) / 360), hw = hh * this.camera.aspect
    this.pan.set(clamp(this.pan.x + dx, -hw * 0.85, hw * 0.85), clamp(this.pan.y + dy, -hh * 0.85, hh * 0.85))
  }

  private onWheel(e: WheelEvent) {
    if (this.mode === 'static') return
    e.preventDefault()
    if (e.ctrlKey || this.mode !== 'free' || !e.shiftKey) {
      this.setZoom(this.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
    } else {
      this.orbit(-e.deltaX, -e.deltaY)
    }
  }
}

// ---------------------------------------------------------------- geometry helpers

export function regionGeometry(region: MultiPoly, frame: { x: number; y: number; w: number; h: number }, back: boolean) {
  const shapes: Shape[] = []
  for (const poly of region) {
    const outer = poly[0]
    if (outer.length < 3) continue
    const s = new Shape(outer.map(p => new Vector2(p[0], p[1])))
    for (let i = 1; i < poly.length; i++) {
      const h = new Shape(poly[i].map(p => new Vector2(p[0], p[1])))
      s.holes.push(h)
    }
    shapes.push(s)
  }
  const g = new ShapeGeometry(shapes, 1)
  const pos = g.getAttribute('position') as BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - frame.x) / frame.w
    const v = (pos.getY(i) - frame.y) / frame.h
    uv[i * 2] = back ? 1 - u : u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g as BufferGeometry
}

function pointInRegion(p: Vec2, mp: MultiPoly) {
  for (const poly of mp) {
    const r = poly[0]
    let inside = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
    }
    if (inside) return true
  }
  return false
}

/** A flat strip from a to b, `width` wide, optionally broken into dashes [on, off]. */
function strokeGeometry(a: Vec2, b: Vec2, width: number, dash?: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L, nx = -uy * width / 2, ny = ux * width / 2
  const runs: [number, number][] = []
  if (dash) {
    // centre the pattern so both ends get the same partial dash
    const period = dash[0] + dash[1]
    let t = ((L - dash[0]) / 2) % period - period
    for (; t < L; t += period) { const t0 = Math.max(0, t), t1 = Math.min(L, t + dash[0]); if (t1 - t0 > 0.02) runs.push([t0, t1]) }
  } else runs.push([0, L])
  const pos = new Float32Array(runs.length * 18)
  runs.forEach(([t0, t1], i) => {
    const p0x = a[0] + ux * t0, p0y = a[1] + uy * t0, p1x = a[0] + ux * t1, p1y = a[1] + uy * t1
    pos.set([
      p0x - nx, p0y - ny, 0, p1x - nx, p1y - ny, 0, p1x + nx, p1y + ny, 0,
      p0x - nx, p0y - ny, 0, p1x + nx, p1y + ny, 0, p0x + nx, p0y + ny, 0,
    ], i * 18)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  return g
}

/** Grow a region outward by w (for sticker outlines). */
function inflate(region: MultiPoly, w: number): MultiPoly {
  const ribbons: MultiPoly = []
  for (const poly of region) {
    const r = poly[0]
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length]
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const L = Math.hypot(dx, dy) || 1
      const nx = (-dy / L) * w, ny = (dx / L) * w
      ribbons.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]])
      // round joints
      const circle: Vec2[] = []
      for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2; circle.push([a[0] + Math.cos(t) * w, a[1] + Math.sin(t) * w]) }
      ribbons.push([circle])
    }
  }
  const u = unionPolys(region, ...ribbons)
  return difference(u, []) // normalise
}

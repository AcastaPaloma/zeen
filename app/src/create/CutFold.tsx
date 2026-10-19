import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOOLS } from '../lib/assets'
import { haptic, sfx } from '../lib/feedback'
import { clamp, closestOnSegment, dist, uid } from '../lib/geom'
import { music } from '../lib/music'
import { cutPath, flapOf, panelDepth, type CutStyle } from '../lib/paper'
import { useApp } from '../lib/store'
import type { Crease, Vec2, ZineDoc } from '../lib/types'
import { FEELS } from '../three/spring'
import type { PointerInfo, ZineScene } from '../three/ZineScene'
import { CutGlyph, Icon } from '../ui/Icon'
import { CheckBtn, IconBtn, PillGroup, Row, Ruler, Segmented, Sheet, Toggle, VSlider } from '../ui/kit'
import type { StepProps } from './Create'
import { useEditor } from './editor'
import { KeyframeStrip } from './KeyframeStrip'
import { Loupe } from './Loupe'
import { addLeaf, applyCut, applyFold, cutPreview, deleteCrease, foldPreview, updateCrease } from './ops'

type Tool = 'pick' | 'cut' | 'fold'
type FoldSub = 'fold' | 'page'

const CUT_STYLES: { id: CutStyle; label: string }[] = [
  { id: 'straight', label: 'Straight' }, { id: 'smooth', label: 'Smooth curve' }, { id: 'jagged', label: 'Jagged' }, { id: 'round', label: 'Round' },
]

interface Drag {
  kind: 'cut' | 'fold' | 'page' | 'endpoint'
  panel: string
  A: Vec2
  B: Vec2
  sA: [number, number]
  sB: [number, number]
  finger: Vec2[]
  seed: number
  snapKey: string
  crease?: Crease
  length?: number
  clickAt?: number[]
  clicked?: number
  cancelHover?: boolean
}

interface LastAction { kind: 'cut' | 'fold'; panel: string; A: Vec2; B: Vec2; finger: Vec2[]; seed: number; pre: ZineDoc; style: CutStyle }

const SNAP_PX = 14

export default function CutFold({ scene, doc, active, exit, next }: StepProps) {
  const ed = useEditor()
  const showToast = useApp(s => s.showToast)
  const [tool, setTool] = useState<Tool>('pick')
  const [sub, setSub] = useState<FoldSub>('fold')
  const [zoom, setZoom] = useState(0.39)
  const [more, setMore] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [sel, setSel] = useState<string | null>(null) // selected crease
  const [last, setLast] = useState<LastAction | null>(null)
  const lastEndsRef = useRef<[[number, number], [number, number]] | null>(null)
  const setLastEnds = (v: [[number, number], [number, number]] | null) => { lastEndsRef.current = v }
  const creaseBar = useRef<HTMLDivElement>(null)
  const endA = useRef<HTMLSpanElement>(null)
  const endB = useRef<HTMLSpanElement>(null)
  const [kfT, setKfT] = useState(0)
  const [xray, setXray] = useState(false)
  const [faceSnap, setFaceSnap] = useState(false)
  const [hand, setHand] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const overlay = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const cut = ed.cut

  // ---------------------------------------------------------------- scene wiring

  // with no tool, one finger turns the zine freely in 3D. The fold tool keeps a page square to the
  // camera so a fold line can be drawn straight across it.
  useEffect(() => {
    if (!scene) return
    scene.snapFaceOn = faceSnap || tool === 'fold'
    scene.handMode = hand
    scene.dragOrbit = tool === 'pick'
    return () => { scene.dragOrbit = false }
  }, [scene, faceSnap, hand, tool])
  useEffect(() => {
    if (!scene || tool !== 'fold') return
    const f = scene.topFace()
    if (f) scene.facePanel(f.panel, f.side)
  }, [scene, tool])

  useEffect(() => {
    if (!scene) return
    // committing a hand-dragged fold keeps the doc in sync (no undo step: folding isn't destructive)
    const off1 = scene.on('angle-commit', ({ id, angle }: { id: string; angle: number }) => {
      const d = useEditor.getState().doc
      if (!d) return
      const nd = updateCrease(d, id, { angle })
      useEditor.setState({ doc: nd })
      useApp.getState().saveZine(nd)
    })
    const off2 = scene.on('view', () => setZoom(Math.log(scene.zoom / 0.5) / Math.log(6)))
    return () => { off1(); off2() }
  }, [scene])

  useEffect(() => { scene?.setZoom(0.5 * Math.pow(6, zoom)) }, [scene, zoom])

  // x-ray: show hidden creases and content through the top flaps
  useEffect(() => {
    if (!scene) return
    for (const m of scene.meshes.values()) {
      for (const mesh of [m.front, m.back]) {
        const mat = mesh.material as import('three').MeshLambertMaterial
        mat.transparent = xray
        mat.opacity = xray ? 0.55 : 1
        mat.depthWrite = !xray
        mat.needsUpdate = true
      }
    }
  }, [scene, xray, doc])

  // ---------------------------------------------------------------- overlay drawing

  const draw = useCallback(() => {
    const c = overlay.current
    if (!c || !scene) return
    const dpr = Math.min(2, window.devicePixelRatio)
    const W = c.clientWidth, H = c.clientHeight
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr }
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const d = dragRef.current
    // x-ray creases
    if (xray) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(92,92,227,0.8)'; ctx.lineWidth = 1.2
      for (const k of docRef.current.creases) {
        if (k.leaf) continue
        const a = scene.flatToScreen(k.panel, k.a), b = scene.flatToScreen(k.panel, k.b)
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      }
      ctx.setLineDash([])
    }
    if (sel) {
      const k = docRef.current.creases.find(x => x.id === sel)
      if (k) {
        const a = scene.flatToScreen(k.panel, k.a), b = scene.flatToScreen(k.panel, k.b)
        ctx.strokeStyle = 'rgba(92,92,227,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      }
    }
    if (!d) return
    const color = d.kind === 'cut' ? '#FF4934' : '#5C5CE3'
    let pts: [number, number][]
    if (d.kind === 'cut') {
      const path = cutPath(cut.style, d.A, d.B, d.finger, cut.roughness, d.seed, cut.ruler)
      pts = path.map(p => scene.flatToScreen(d.panel, p))
    } else if (d.kind === 'page' && d.crease) {
      pts = [scene.flatToScreen(d.crease.panel, d.crease.a), scene.flatToScreen(d.crease.panel, d.crease.b)]
    } else {
      pts = [d.sA, d.sB]
    }
    if (d.kind === 'cut') {
      ctx.setLineDash([7, 6]); ctx.lineWidth = 2.6
    } else {
      ctx.setLineDash([]); ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(222,255,124,0.9)'
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + 1.5) : ctx.moveTo(p[0], p[1] + 1.5))); ctx.stroke()
      ctx.lineWidth = 3.2
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke()
    ctx.setLineDash([])
    if (d.kind !== 'page') {
      ring(ctx, pts[0], color, '#fff')
      ring(ctx, pts[pts.length - 1], color, '#DEFF7C')
    }
  }, [scene, cut, sel, xray])

  useEffect(() => {
    if (!scene) return
    return scene.on('frame', () => {
      draw()
      // keep floating UI pinned to the paper
      if (sel && creaseBar.current) {
        const k = docRef.current.creases.find(x => x.id === sel)
        if (k) {
          const m: Vec2 = [(k.a[0] + k.b[0]) / 2, (k.a[1] + k.b[1]) / 2]
          const sp = scene.flatToScreen(k.panel, m)
          creaseBar.current.style.transform = `translate(${sp[0]}px, ${sp[1]}px)`
        }
      }
      if (last && !dragRef.current) {
        const e: [[number, number], [number, number]] = [scene.flatToScreen(last.panel, last.A), scene.flatToScreen(last.panel, last.B)]
        lastEndsRef.current = e
        if (endA.current) endA.current.style.transform = `translate(${e[0][0]}px, ${e[0][1]}px)`
        if (endB.current) endB.current.style.transform = `translate(${e[1][0]}px, ${e[1][1]}px)`
      }
    })
  }, [scene, draw, sel, last])

  // ---------------------------------------------------------------- snapping

  const snapPoint = useCallback((panel: string, flat: Vec2, screen: [number, number], A?: Vec2): { p: Vec2; key: string } => {
    if (!scene || !cut.snap) return { p: flat, key: '' }
    const P = scene.d.panels.get(panel)
    if (!P) return { p: flat, key: '' }
    let best: { p: Vec2; d: number; key: string } | null = null
    const consider = (p: Vec2, key: string, bonus = 0) => {
      const s = scene.flatToScreen(panel, p)
      const dd = Math.hypot(s[0] - screen[0], s[1] - screen[1]) - bonus
      if (dd < SNAP_PX && (!best || dd < best.d)) best = { p, d: dd, key }
    }
    // corners and midpoints win over edges
    for (const poly of P.region) {
      const r = poly[0]
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length]
        if (dist(a, b) > 1.2 || i % 6 === 0) consider(a, `v${i}`, 6)
        if (dist(a, b) > 3) consider([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], `m${i}`, 5)
      }
    }
    for (const k of docRef.current.creases) {
      if (k.panel !== panel && flapOf(k) !== panel) continue
      consider(k.a, `ca${k.id}`, 4); consider(k.b, `cb${k.id}`, 4)
      consider([(k.a[0] + k.b[0]) / 2, (k.a[1] + k.b[1]) / 2], `cm${k.id}`, 4)
    }
    if (!best) {
      for (const poly of P.region) {
        const r = poly[0]
        for (let i = 0; i < r.length; i++) {
          const q = closestOnSegment(flat, r[i], r[(i + 1) % r.length])
          consider(q, `e${i}`)
        }
      }
    }
    if (best) return { p: (best as { p: Vec2 }).p, key: (best as { key: string }).key }
    // angle snap every 15° relative to the paper
    if (A) {
      const dx = flat[0] - A[0], dy = flat[1] - A[1]
      const L = Math.hypot(dx, dy)
      const ang = Math.atan2(dy, dx)
      const step = Math.PI / 12
      const snapped = Math.round(ang / step) * step
      if (Math.abs(snapped - ang) < 0.045 && L > 1) {
        return { p: [A[0] + Math.cos(snapped) * L, A[1] + Math.sin(snapped) * L], key: `a${Math.round(snapped / step)}` }
      }
    }
    return { p: flat, key: '' }
  }, [scene, cut.snap])

  // ---------------------------------------------------------------- gestures

  const pickPanel = useCallback((x: number, y: number) => {
    if (!scene) return null
    const hit = scene.pick(x, y)
    if (hit) return hit.panel
    const f = scene.nearestFace()
    return f?.panel ?? null
  }, [scene])

  const nearCrease = useCallback((x: number, y: number, maxPx = 22): Crease | null => {
    if (!scene) return null
    let best: Crease | null = null, bd = maxPx
    for (const k of docRef.current.creases) {
      if (k.leaf) continue
      const a = scene.flatToScreen(k.panel, k.a), b = scene.flatToScreen(k.panel, k.b)
      const q = closestOnSegment([x, y], a, b)
      const dd = Math.hypot(q[0] - x, q[1] - y)
      if (dd < bd) { bd = dd; best = k }
    }
    return best
  }, [scene])

  const updatePreview = useCallback((d: Drag) => {
    if (!scene) return
    if (d.kind === 'cut') {
      const path = cutPath(cut.style, d.A, d.B, d.finger, cut.roughness, d.seed, cut.ruler)
      const pv = cutPreview(scene, d.panel, path)
      scene.setTint(d.panel, pv?.region ?? null, '#FF4934', 0.3)
    } else if (d.kind === 'fold') {
      if (dist(d.A, d.B) < 0.6) { scene.setGhost(null, null, null); scene.setTint(null, null); return }
      const pv = foldPreview(scene, d.panel, d.A, d.B)
      scene.setGhost(pv ? d.panel : null, pv?.region ?? null, pv?.crease ?? null)
      scene.setTint(pv ? d.panel : null, pv?.region ?? null, '#5C5CE3', 0.18)
    }
  }, [scene, cut])

  useEffect(() => {
    if (!scene) return
    scene.handlers = {
      toolStart: (p: PointerInfo) => {
        // endpoint handles of the last line stay draggable until the next action
        const lastEnds = lastEndsRef.current
        if (last && lastEnds && tool !== 'pick') {
          const which = Math.hypot(p.x - lastEnds[0][0], p.y - lastEnds[0][1]) < 24 ? 0 : Math.hypot(p.x - lastEnds[1][0], p.y - lastEnds[1][1]) < 24 ? 1 : -1
          if (which >= 0) {
            const d: Drag = {
              kind: 'endpoint', panel: last.panel, A: which === 0 ? last.B : last.A, B: which === 0 ? last.A : last.B,
              sA: lastEnds[which === 0 ? 1 : 0], sB: lastEnds[which === 0 ? 0 : 1], finger: [], seed: last.seed, snapKey: '',
            }
            ;(d as Drag & { which: number }).which = which
            dragRef.current = d; setDrag(d)
            return true
          }
        }
        if (tool === 'pick') {
          const k = nearCrease(p.x, p.y)
          if (k) { setSel(k.id); haptic('tick'); return false }
          setSel(null)
          return false
        }
        if (tool === 'fold' && sub === 'page') {
          const k = nearCrease(p.x, p.y, 30)
          if (!k) { showToast('Press on a crease and drag away from it'); return false }
          const fixed = scene.d.panels.get(k.panel), flap = scene.d.panels.get(flapOf(k))
          const clickAt = [fixed ? panelDepth(fixed.region, k) : 0, flap ? panelDepth(flap.region, k) : 0].filter(v => v > 0.5)
          const d: Drag = { kind: 'page', panel: k.panel, A: k.a, B: k.b, sA: [p.x, p.y], sB: [p.x, p.y], finger: [], seed: 0, snapKey: '', crease: k, length: 0, clickAt, clicked: -1 }
          dragRef.current = d; setDrag(d); setSel(null)
          haptic('tick')
          return true
        }
        const panel = pickPanel(p.x, p.y)
        if (!panel) return false
        const raw = scene.planeHit(panel, p.x, p.y)
        if (!raw) return false
        const s = snapPoint(panel, raw, [p.x, p.y])
        const d: Drag = {
          kind: tool === 'cut' ? 'cut' : 'fold', panel, A: s.p, B: s.p, sA: scene.flatToScreen(panel, s.p), sB: [p.x, p.y],
          finger: [s.p], seed: Math.floor(Math.random() * 1e9), snapKey: s.key,
        }
        if (s.key) haptic('tick')
        dragRef.current = d; setDrag(d); setSel(null); setLast(null); setLastEnds(null)
        return true
      },
      toolMove: (p: PointerInfo) => {
        const d = dragRef.current
        if (!d) return
        d.cancelHover = p.y < 110 && Math.abs(p.x - window.innerWidth / 2) < 120
        if (d.kind === 'page' && d.crease) {
          const raw = scene.planeHit(d.crease.panel, p.x, p.y)
          if (!raw) return
          const k = d.crease
          const dx = k.b[0] - k.a[0], dy = k.b[1] - k.a[1]
          const L = Math.hypot(dx, dy) || 1
          let len = Math.abs(((raw[0] - k.a[0]) * dy - (raw[1] - k.a[1]) * dx) / L)
          // click when the new leaf matches a neighbouring panel
          let clicked = -1
          d.clickAt?.forEach((c, i) => { if (Math.abs(len - c) < 0.55) { len = c; clicked = i } })
          if (clicked >= 0 && clicked !== d.clicked) { haptic('firm'); sfx('click') }
          d.clicked = clicked
          d.length = len
          d.sB = [p.x, p.y]
          const angle = clamp(scene.angle(k.id) / 2, 25, 90)
          const tmp = addLeaf(scene, docRef.current, k, Math.max(0.3, len), angle)
          if (tmp) {
            scene.setDoc(tmp, { structure: true })
            const leafId = tmp.surfaces[tmp.surfaces.length - 1].id
            const leafPanel = scene.d.panels.get(leafId)
            scene.setTint(clicked >= 0 && leafPanel ? leafId : null, leafPanel?.region ?? null, '#FF4934', 0.35)
            const hinge = tmp.creases[tmp.creases.length - 1]
            scene.setAngle(hinge.id, angle, false)
          }
          setDrag({ ...d })
          return
        }
        const raw = scene.planeHit(d.panel, p.x, p.y)
        if (!raw) return
        if (d.kind === 'cut' || d.kind === 'fold') d.finger.push(raw)
        const s = snapPoint(d.panel, raw, [p.x, p.y], d.A)
        if (s.key && s.key !== d.snapKey) haptic('tick')
        d.snapKey = s.key
        d.B = s.p
        d.sB = [p.x, p.y]
        if (d.kind === 'endpoint' && last) {
          const which = (d as Drag & { which: number }).which
          const A = which === 0 ? d.B : last.A, B = which === 0 ? last.B : d.B
          const fake: Drag = { ...d, kind: last.kind, A, B, finger: last.kind === 'cut' && cut.style !== 'straight' ? [A, B] : [A, B] }
          updatePreview(fake)
        } else updatePreview(d)
        setDrag({ ...d })
      },
      toolEnd: (p: PointerInfo) => {
        const d = dragRef.current
        dragRef.current = null
        setDrag(null)
        scene.setTint(null, null)
        scene.setGhost(null, null, null)
        if (!d) return
        const docNow = docRef.current
        if (d.cancelHover) { haptic('tap'); return }
        if (d.kind === 'page') {
          if (!d.crease || (d.length ?? 0) < 0.4) { scene.setDoc(docNow, { structure: true }); return }
          const angle = clamp(scene.angle(d.crease.id) / 2, 25, 90)
          const nd = addLeaf(scene, docNow, d.crease, d.length!, angle)
          scene.setDoc(docNow, { structure: true })
          if (nd) { ed.commit(nd, 'Add page'); sfx('crease'); haptic('medium') }
          return
        }
        if (d.kind === 'endpoint' && last) {
          const which = (d as Drag & { which: number }).which
          const A = which === 0 ? d.B : last.A, B = which === 0 ? last.B : d.B
          redo(last, A, B, last.kind === 'cut' && cut.style !== 'straight' ? [A, B] : last.finger, last.seed)
          return
        }
        // drag back to the start cancels
        const sA = scene.flatToScreen(d.panel, d.A)
        if (Math.hypot(p.x - sA[0], p.y - sA[1]) < 14) return
        perform(d.kind as 'cut' | 'fold', d.panel, d.A, d.B, d.finger, d.seed, docNow)
      },
      toolCancel: () => {
        dragRef.current = null; setDrag(null)
        scene.setTint(null, null); scene.setGhost(null, null, null)
        scene.setDoc(docRef.current, { structure: true })
      },
      tap: (p: PointerInfo) => {
        const k = nearCrease(p.x, p.y)
        setSel(k ? k.id : null)
        if (k) haptic('tick')
      },
      doubleTap: () => false,
      undo: () => useEditor.getState().undo(),
      redo: () => useEditor.getState().redo(),
    }
    return () => { scene.handlers = {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, tool, sub, cut, last, snapPoint, pickPanel, nearCrease, updatePreview])

  // ---------------------------------------------------------------- actions

  const perform = (kind: 'cut' | 'fold', panel: string, A: Vec2, B: Vec2, finger: Vec2[], seed: number, pre: ZineDoc, replace = false) => {
    if (!scene) return
    if (kind === 'cut') {
      const path = cutPath(cut.style, A, B, finger, cut.roughness, seed, cut.ruler)
      const res = applyCut(scene, pre, panel, path, cut.topOnly)
      if (!res) { if (!replace) showToast('That line missed the paper'); return }
      scene.dropPieces(res.pieces)
      if (replace) { useEditor.setState({ doc: res.doc }); useApp.getState().saveZine(res.doc) }
      else ed.commit(res.doc, res.kind === 'slit' ? 'Slit' : 'Cut')
      sfx('snip'); haptic('tap')
      setLast({ kind, panel, A, B, finger, seed, pre, style: cut.style })
      if (res.kind === 'through' && res.alt && !replace) {
        const alt = res.alt, altPieces = res.altPieces
        showToast('Piece cut away', {
          label: 'Keep this piece instead',
          run: () => {
            scene.dropPieces(altPieces)
            useEditor.setState({ doc: alt }); useApp.getState().saveZine(alt)
            setLast(null)
          },
        }, 4000)
      }
    } else {
      const res = applyFold(scene, pre, panel, A, B)
      if (!res) { if (!replace) showToast('Draw the fold across the paper'); return }
      if (replace) { useEditor.setState({ doc: res.doc }); useApp.getState().saveZine(res.doc) }
      else ed.commit(res.doc, 'Fold')
      setSel(res.crease.id)
      setLast({ kind, panel, A, B, finger, seed, pre, style: cut.style })
      haptic('medium')
      if (!useApp.getState().seenCoach['drag-light']) {
        scene.showHandleHint = true
        setTimeout(() => { scene.syncHandles(); scene.showHandleHint = false }, 50)
        useApp.getState().markSeen('drag-light')
        showToast('Drag the light to open and close the fold', undefined, 3200)
      }
    }
  }

  const redo = (l: LastAction, A: Vec2, B: Vec2, finger: Vec2[], seed: number) => {
    perform(l.kind, l.panel, A, B, finger, seed, l.pre, true)
  }

  const reroll = () => {
    if (!last || last.kind !== 'cut') { showToast('Make a cut first'); return }
    redo(last, last.A, last.B, last.finger, Math.floor(Math.random() * 1e9))
    haptic('tap')
  }

  const selCrease = doc.creases.find(c => c.id === sel)
  const creaseAct = (what: 'side' | 'dir' | 'delete') => {
    if (!selCrease) return
    if (what === 'delete') { ed.commit(deleteCrease(doc, selCrease.id), 'Delete fold'); setSel(null); haptic('tap'); return }
    const p = what === 'side' ? { flapSide: (-selCrease.flapSide) as 1 | -1 } : { dir: (-selCrease.dir) as 1 | -1 }
    ed.commit(updateCrease(doc, selCrease.id, p), what === 'side' ? 'Flip side' : 'Flip direction')
    haptic('tap'); sfx('crease')
  }

  // ---------------------------------------------------------------- keyframes

  const addKeyframe = () => {
    if (!scene) return
    const kf = { id: uid('k'), name: `Pose ${doc.keyframes.length + 1}`, angles: scene.angles() }
    ed.commit({ ...doc, keyframes: [...doc.keyframes, kf] }, 'Add keyframe')
    setKfT(doc.keyframes.length)
    haptic('tap'); sfx('click')
  }
  const goKeyframe = (i: number) => {
    if (!scene) return
    const kf = doc.keyframes[i]
    if (!kf) return
    scene.setAngles(kf.angles, { feel: FEELS[doc.transition.feel], sequential: doc.transition.mode === 'sequential' })
    setKfT(i)
  }
  const play = async () => {
    if (!scene || playing) return
    setPlaying(true)
    if (doc.music) music.play(doc.music.track, { volume: doc.music.volume, start: doc.music.start })
    for (let i = 0; i < doc.keyframes.length; i++) {
      goKeyframe(i)
      await new Promise(r => setTimeout(r, doc.transition.mode === 'sequential' ? 1500 : 1100))
    }
    music.stop()
    setPlaying(false)
  }

  // ---------------------------------------------------------------- render

  const pickTool = (t: Tool) => { haptic('tap'); setTool(t); setSel(null); setLast(null); setLastEnds(null) }
  const checkColor = tool === 'fold' ? 'var(--fold)' : 'var(--accent)'
  const hint = tool === 'cut' ? 'drag to cut!' : tool === 'fold' ? (sub === 'page' ? 'drag a crease to add a page' : 'drag to fold!') : 'drag to turn it around'
  const kfCount = doc.keyframes.length

  return (
    <div className="step-ui cutfold">
      <canvas ref={overlay} className="line-overlay" />
      <div className="top-bar">
        <PillGroup>
          {tool === 'pick'
            ? <IconBtn name="back" label="Save and exit" onClick={exit} />
            : <IconBtn name="x" label="Close tool" onClick={() => pickTool('pick')} />}
          <IconBtn name="undo" label="Undo" onClick={ed.undo} disabled={!ed.past.length} />
          <IconBtn name="redo" label="Redo" onClick={ed.redo} disabled={!ed.future.length} />
        </PillGroup>
        <div className="grow" />
        <PillGroup className="solo"><IconBtn name="more" label="More options" onClick={() => setMore(true)} /></PillGroup>
        {tool === 'pick'
          ? <PillGroup className="solo"><IconBtn name="right" label="Next: Collage" onClick={next} /></PillGroup>
          : <CheckBtn color={checkColor} onClick={() => pickTool('pick')} label="Done" />}
      </div>

      {drag && drag.kind !== 'page' && (
        <div className={`cancel-chip ${drag.cancelHover ? 'hot' : ''}`}><Icon name="x" size={14} /> release here to cancel</div>
      )}

      <div className="rail right">
        <VSlider value={zoom} onChange={setZoom} label="Zoom" />
        {tool === 'pick' && <PillGroup className="solo rail-btn"><IconBtn name="crop" label="Sheet & paper" onClick={() => setMore(true)} /></PillGroup>}
        {tool === 'cut' && <VSlider variant="gradient" value={cut.roughness / 100} onChange={v => ed.setCut({ roughness: Math.round(v * 100) })} label={`Roughness ${cut.roughness}`} />}
        {tool === 'fold' && selCrease && scene && (
          <VSlider variant="gradient" value={scene.angle(selCrease.id) / 180} label="Fold angle"
            onChange={v => { scene.setAngle(selCrease.id, v * 180, false); setKfT(t => t) }}
            onEnd={() => { const nd = updateCrease(doc, selCrease.id, { angle: scene.angle(selCrease.id) }); useEditor.setState({ doc: nd }); useApp.getState().saveZine(nd) }} />
        )}
      </div>

      {drag && scene && <Loupe scene={scene} overlay={overlay.current} at={drag.sB} />}

      {selCrease && !drag && (
        <div className="crease-bar" ref={creaseBar}>
          <button onClick={() => creaseAct('side')}><Icon name="flip" size={17} /><span>Flip side</span></button>
          <button onClick={() => creaseAct('dir')}><Icon name="flipV" size={17} /><span>{selCrease.dir > 0 ? 'Valley' : 'Mountain'}</span></button>
          <button className="danger" onClick={() => creaseAct('delete')}><Icon name="trash" size={17} /><span>Delete</span></button>
        </div>
      )}

      {last && !drag && tool !== 'pick' && (
        <>
          <span className="end-dot" ref={endA} style={{ '--c': last.kind === 'cut' ? 'var(--accent)' : 'var(--fold)' } as React.CSSProperties} />
          <span className="end-dot" ref={endB} style={{ '--c': last.kind === 'cut' ? 'var(--accent)' : 'var(--fold)' } as React.CSSProperties} />
        </>
      )}

      <div className="bottom-stack">
        {hint && <div className="hint-text" key={hint}>{hint}</div>}
        {tool === 'fold' && (
          <KeyframeStrip doc={doc} active={Math.round(kfT)} onPick={goKeyframe} onAdd={addKeyframe} onPlay={play} playing={playing} dither />
        )}
        {kfCount > 1 && (
          <Ruler value={kfT} count={kfCount} onChange={t => { setKfT(t); scene?.setAngles(scene.poseAt(t), { animate: false }) }} onRelease={i => goKeyframe(i)} />
        )}
        <div className="toolbar" role="toolbar" aria-label="Tools">
          {tool === 'pick' && (
            <>
              <button className="tool-img" aria-label="Cut tool" onClick={() => pickTool('cut')}>
                <img className="tool-pic" src={TOOLS.scissors} alt="" draggable={false} style={{ height: 80 }} />
              </button>
              <button className="tool-img" aria-label="Fold tool" onClick={() => pickTool('fold')}>
                <img className="tool-pic" src={TOOLS.bonefolder} alt="" draggable={false} style={{ height: 78 }} />
              </button>
            </>
          )}
          {tool === 'cut' && CUT_STYLES.map(s => (
            <button key={s.id} className={`tool-glyph ${cut.style === s.id ? 'on' : ''}`} aria-label={s.label} aria-pressed={cut.style === s.id}
              onClick={() => { haptic('tick'); ed.setCut({ style: s.id }) }}>
              <CutGlyph kind={s.id} active={cut.style === s.id} />
            </button>
          ))}
          {tool === 'fold' && (
            <>
              <button className={`tool-glyph ${sub === 'fold' ? 'on fold' : ''}`} aria-label="Fold" onClick={() => { haptic('tick'); setSub('fold') }}>
                <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={sub === 'fold' ? 'var(--fold)' : 'var(--ink)'} strokeWidth={1.4} strokeLinecap="round"><path d="M5 19 18 6M14 5.5l4.2.3.3 4.2" /></svg>
              </button>
              <button className={`tool-glyph ${sub === 'page' ? 'on fold' : ''}`} aria-label="Add page along a crease" onClick={() => { haptic('tick'); setSub('page') }}>
                <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={sub === 'page' ? 'var(--fold)' : 'var(--ink)'} strokeWidth={1.4} strokeLinecap="round"><path d="M4 20 16 8M8 20 20 8M13 6.5l3.8.2.2 3.8M17 6.5l3.8.2.2 3.8" /></svg>
              </button>
            </>
          )}
          <span className="tb-sep" />
          {tool === 'fold' && (
            <>
              <button className="tool-glyph" aria-label="Add keyframe" onClick={addKeyframe}><Icon name="pages" size={24} /></button>
              <span className="tb-sep" />
            </>
          )}
          <button className="tool-glyph" aria-label="More tools" onClick={() => setMore(true)}><Icon name="grid" size={24} /></button>
          <span className="tb-grip" aria-hidden />
        </div>
      </div>

      <Sheet open={more} onClose={() => setMore(false)} title="Paper tools" dim height="tall">
        <Row label="Snap" sub="Edges, corners, creases and 15° angles"><Toggle on={cut.snap} onChange={v => ed.setCut({ snap: v })} label="Snap" /></Row>
        <Row label="Ruler" sub="Jagged and round cuts follow a straight line"><Toggle on={cut.ruler} onChange={v => ed.setCut({ ruler: v })} label="Ruler" /></Row>
        <Row label="Top layer only" sub="Cut just the top sheet of a folded stack"><Toggle on={cut.topOnly} onChange={v => ed.setCut({ topOnly: v })} label="Top layer only" /></Row>
        <Row label="Face-on view" sub="After turning it around, ease to face the nearest page"><Toggle on={faceSnap} onChange={setFaceSnap} label="Face-on view" /></Row>
        <Row label="Hand" sub="One finger moves the camera"><Toggle on={hand} onChange={setHand} label="Hand" /></Row>
        <Row label="X-ray" sub="See hidden creases and content"><Toggle on={xray} onChange={setXray} label="X-ray" /></Row>
        <Row label="Reroll last cut" sub="New randomness, same line"><button className="chip" onClick={reroll}><Icon name="dice" size={14} /> Reroll</button></Row>
        <Row label="Transition">
          <Segmented value={doc.transition.mode} onChange={m => ed.commit({ ...doc, transition: { ...doc.transition, mode: m } }, 'Transition')}
            options={[{ value: 'together', label: 'Together' }, { value: 'sequential', label: 'One by one' }]} />
        </Row>
        <Row label="Feel">
          <Segmented value={doc.transition.feel} onChange={f => ed.commit({ ...doc, transition: { ...doc.transition, feel: f } }, 'Feel')}
            options={[{ value: 'gentle', label: 'Gentle' }, { value: 'snappy', label: 'Snappy' }, { value: 'floppy', label: 'Floppy' }]} />
        </Row>
        <Row label="History"><button className="chip" onClick={() => setHistoryOpen(true)}><Icon name="history" size={14} /> {ed.past.length} steps</button></Row>
        <Row label="Reset view"><button className="chip" onClick={() => { scene?.resetView(); setMore(false) }}>Reset</button></Row>
        <p className="sheet-tip">With no tool picked, drag to turn the zine around. With a tool, two fingers turn it, pinch zooms, twist rotates. Two-finger tap undoes, three-finger tap redoes. Double-tap empty canvas to reset.</p>
      </Sheet>
      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  )
}

function ring(ctx: CanvasRenderingContext2D, p: [number, number], stroke: string, fill: string) {
  ctx.save()
  ctx.translate(p[0], p[1])
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const x = Math.cos(a) * 8, y = Math.sin(a) * 8
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 3.4
  ctx.strokeStyle = stroke
  ctx.stroke()
  ctx.restore()
}

export function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ed = useEditor()
  const items = useMemo(() => [...ed.past.map((p, i) => ({ i, label: p.label, at: p.at })), { i: ed.past.length, label: ed.label, at: Date.now() }], [ed.past, ed.label])
  return (
    <Sheet open={open} onClose={onClose} title="History" dim height="half">
      <ol className="history-list">
        {items.slice().reverse().map(h => (
          <li key={h.i}>
            <button className={h.i === ed.past.length ? 'on' : ''} onClick={() => { ed.jump(h.i); haptic('tick') }}>
              <span>{h.label}</span>
              <small>{h.i === ed.past.length ? 'now' : `${ed.past.length - h.i} back`}</small>
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}

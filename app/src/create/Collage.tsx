import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { loadImage, TOOLS, trackById } from '../lib/assets'
import { haptic, sfx } from '../lib/feedback'
import { uid } from '../lib/geom'
import { music } from '../lib/music'
import { flatToPage } from '../lib/paper'
import { useApp } from '../lib/store'
import type { InkObj, InkTool, ScrapItem, ScrapObj, Side, Stroke, TextObj, Vec2, ZineDoc, ZObject } from '../lib/types'
import { FEELS } from '../three/spring'
import type { PageRef, PointerInfo, TwoInfo, ZineScene } from '../three/ZineScene'
import { Icon } from '../ui/Icon'
import { CheckBtn, IconBtn, PillGroup, Row, Ruler, Segmented, Sheet, Slider, Toggle, VSlider } from '../ui/kit'
import { boxCorners, isClipped, objectAt, objectBox, pageRect, pagesOf, pageThumb, transformObject } from './collageUtil'
import type { StepProps } from './Create'
import { HistorySheet } from './CutFold'
import { useEditor } from './editor'
import { EffectsSheet } from './EffectsSheet'
import { LayersSheet } from './LayersSheet'
import { MusicPicker } from './MusicPicker'
import { ScrapSheet } from './ScrapSheet'
import { SpreadView } from './SpreadView'
import { TextEditor } from './TextEditor'

type SheetName = 'none' | 'scrap' | 'effects' | 'layers' | 'music' | 'bg' | 'more' | 'ink' | 'history'

/** h: drawn height; sink: how far the tool drops below the tray edge */
const INK_TOOLS: { id: InkTool; src: string; label: string; h: number; sink: number }[] = [
  { id: 'pencil', src: TOOLS.pencil, label: 'Pencil', h: 90, sink: 26 },
  { id: 'pen', src: TOOLS.pen, label: 'Pen', h: 90, sink: 26 },
  { id: 'marker', src: TOOLS.marker, label: 'Marker', h: 91, sink: 26 },
  { id: 'eraser', src: TOOLS.eraser, label: 'Eraser', h: 39, sink: 2 },
]
const INK_COLORS = ['#1A1A1A', '#FFFFFF', '#FF4934', '#F8D647', '#DEFF7C', '#4BA334', '#245AE2', '#5C5CE3', '#F158A7', '#E8614A', '#8B5A2B']
const BG_COLORS = ['#F6F6F6', '#EEEDE9', '#FFFFFF', '#1A1A1A', '#FFD5F4', '#C0F6FF', '#EBEFD7', '#F8D647', '#FF4934', '#245AE2', '#4BA334', '#5C5CE3']

interface Gest {
  kind: 'draw' | 'move' | 'two' | 'corner'
  panel: string
  side: Side
  surface: string
  obj?: string
  base?: ZObject
  start?: Vec2
  moved?: boolean
  stroke?: Stroke
  inkId?: string
  two?: { scale: number; rot: number; cx: number; cy: number }
  wasSelected?: boolean
}

export default function Collage({ scene, doc, active, exit, next }: StepProps) {
  const ed = useEditor()
  const showToast = useApp(s => s.showToast)
  const [drawing, setDrawing] = useState(false)
  const [sheet, setSheet] = useState<SheetName>('none')
  const [face, setFace] = useState<{ panel: string; side: Side } | null>(null)
  const [pages, setPages] = useState<PageRef[]>([])
  const [spread, setSpread] = useState(false)
  const [text, setText] = useState<{ open: boolean; initial: TextObj | null }>({ open: false, initial: null })
  const [zoom, setZoom] = useState(0.39)
  const [kfT, setKfT] = useState(0)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [guides, setGuides] = useState<{ x?: [number, number][]; y?: [number, number][] }>({})
  const [colorOpen, setColorOpen] = useState(false)
  const [mutedMusic, setMutedMusic] = useState(false)
  const docRef = useRef(doc)
  docRef.current = doc
  const gest = useRef<Gest | null>(null)
  const inkSession = useRef<string | null>(null)
  const fxLive = useRef(false)
  const selBox = useRef<SVGPolygonElement>(null)
  const selBar = useRef<HTMLDivElement>(null)
  const cornerEls = useRef<(HTMLDivElement | null)[]>([])
  const ink = ed.ink
  const selected = doc.objects.find(o => o.id === ed.selected) ?? null

  // ---------------------------------------------------------------- scene setup

  useEffect(() => {
    if (!scene) return
    scene.oneFingerSwipe = false
    const offPages = scene.on('pages', (p: PageRef[]) => setPages(p))
    setPages(scene.pages)
    // start on the first page, flat and face-on
    const first = scene.pages[0]
    if (first) { scene.facePanel(first.panel, first.side, { focus: true }); setFace({ panel: first.panel, side: first.side }) }
    const offUp = scene.on('handle-up', () => {
      // a fold opened: re-centre on what's now facing us
      setTimeout(() => {
        const f = scene.nearestFace()
        if (f) { scene.facePanel(f.panel, f.side, { focus: true }); setFace(f) }
      }, 380)
    })
    const offView = scene.on('view', () => {
      const f = scene.nearestFace()
      if (f) setFace(f)
      setZoom(Math.log(scene.zoom / 0.5) / Math.log(6))
    })
    const offCommit = scene.on('angle-commit', ({ id, angle }: { id: string; angle: number }) => {
      const d = useEditor.getState().doc
      if (!d) return
      const nd = { ...d, creases: d.creases.map(c => (c.id === id ? { ...c, angle } : c)) }
      useEditor.setState({ doc: nd })
      useApp.getState().saveZine(nd)
    })
    return () => { offPages(); offUp(); offView(); offCommit(); scene.oneFingerSwipe = true }
  }, [scene])

  useEffect(() => { scene?.setZoom(0.5 * Math.pow(6, zoom)) }, [scene, zoom])

  // music plays while collaging (mutable)
  useEffect(() => {
    if (doc.music && !mutedMusic) music.play(doc.music.track, { volume: doc.music.volume * 0.6, start: doc.music.start })
    else music.stop()
    return () => music.stop()
  }, [doc.music, mutedMusic])

  // page strip thumbnails, cut from the live textures
  useEffect(() => {
    if (!scene) return
    const t = setTimeout(() => {
      const out: Record<string, string> = {}
      for (const p of pages) {
        const c = pageThumb(scene, p.panel, p.side, 96)
        if (c) out[`${p.panel}:${p.side}`] = c.toDataURL('image/webp', 0.7)
      }
      setThumbs(out)
    }, 450)
    return () => clearTimeout(t)
  }, [scene, pages, doc.objects, doc.surfaces, doc.bg])

  // ---------------------------------------------------------------- selection overlay (imperative, per frame)

  useEffect(() => {
    if (!scene) return
    return scene.on('frame', () => {
      const o = docRef.current.objects.find(x => x.id === useEditor.getState().selected)
      const poly = selBox.current
      if (!o || !poly) return
      const b = objectBox(o)
      const panel = scene.panelAt(o.surface, o.side, [b.cx, b.cy])
      if (!panel) return
      const pts = boxCorners(b).map(p => scene.pageToScreen(panel, o.side, p))
      poly.setAttribute('points', pts.map(p => p.join(',')).join(' '))
      pts.forEach((p, i) => { const el = cornerEls.current[i]; if (el) el.style.transform = `translate(${p[0]}px, ${p[1]}px)` })
      if (selBar.current) {
        const top = Math.min(...pts.map(p => p[1]))
        const cx = pts.reduce((s, p) => s + p[0], 0) / 4
        const y = top > 170 ? top - 64 : Math.max(...pts.map(p => p[1])) + 16
        selBar.current.style.transform = `translate(${Math.max(150, Math.min(scene.el.clientWidth - 150, cx))}px, ${y}px)`
      }
    })
  }, [scene])

  // ---------------------------------------------------------------- helpers

  const commit = (d: ZineDoc, label: string) => ed.commit(d, label)
  const setObjects = (objects: ZObject[], label: string) => commit({ ...docRef.current, objects }, label)
  const patch = (id: string, p: Partial<ZObject>, label?: string) => {
    const d = docRef.current
    const nd = { ...d, objects: d.objects.map(o => (o.id === id ? ({ ...o, ...p } as ZObject) : o)) }
    if (label) commit(nd, label); else ed.live(nd)
  }

  const focusPage = useCallback((panel: string, side: Side) => {
    if (!scene) return
    scene.facePanel(panel, side, { focus: true })
    setFace({ panel, side })
    haptic('tick')
  }, [scene])

  const currentPageCenter = (): { surface: string; side: Side; p: Vec2; w: number } | null => {
    if (!scene) return null
    const f = face ?? scene.nearestFace()
    if (!f) return null
    const r = pageRect(scene, f.panel, f.side)
    if (!r) return null
    return { surface: r.surface, side: f.side, p: [r.x + r.w / 2, r.y + r.h / 2], w: Math.min(r.w, r.h) }
  }

  // ---------------------------------------------------------------- gestures

  useEffect(() => {
    if (!scene) return
    const toPage = (g: Gest, x: number, y: number) => scene.screenToPage(g.panel, g.side, x, y)
    scene.handlers = {
      toolStart: (p: PointerInfo) => {
        const hit = scene.pick(p.x, p.y)
        if (drawing) {
          if (!hit) return false
          const s = scene.d.surfaces.get(hit.surface)!
          const pp = flatToPage(s.frame, hit.side, hit.flat)
          const d = docRef.current
          const tool = useEditor.getState().ink
          if (tool.tool === 'eraser' && tool.eraseMode === 'stroke') {
            gest.current = { kind: 'draw', panel: hit.panel, side: hit.side, surface: hit.surface }
            eraseStrokesAt(hit.surface, hit.side, pp)
            return true
          }
          const stroke: Stroke = {
            tool: tool.tool, color: tool.color, size: tool.size[tool.tool], opacity: tool.opacity, jitter: tool.tool === 'eraser' ? 0 : tool.jitter,
            seed: Math.floor(Math.random() * 1e9), boil: { on: tool.boil && tool.tool !== 'eraser', strength: tool.boilStrength, speed: tool.boilSpeed },
            erase: tool.tool === 'eraser', pts: [pp[0], pp[1]],
          }
          // strokes in one drawing session group into one layer per page side
          let inkObj = d.objects.find(o => o.id === inkSession.current && o.surface === hit.surface && o.side === hit.side) as InkObj | undefined
          let objects = d.objects
          if (stroke.erase) {
            // area eraser rubs out every drawing on this side
            objects = objects.map(o => (o.kind === 'ink' && o.surface === hit.surface && o.side === hit.side ? { ...o, strokes: [...o.strokes, stroke] } : o))
            ed.live({ ...d, objects })
            gest.current = { kind: 'draw', panel: hit.panel, side: hit.side, surface: hit.surface, stroke }
            return true
          }
          if (!inkObj) {
            inkObj = { id: uid('o'), kind: 'ink', surface: hit.surface, side: hit.side, name: 'Drawing', strokes: [] }
            inkSession.current = inkObj.id
            objects = [...objects, inkObj]
          }
          const id = inkObj.id
          objects = objects.map(o => (o.id === id ? { ...(o as InkObj), strokes: [...(o as InkObj).strokes, stroke] } : o))
          ed.live({ ...d, objects })
          gest.current = { kind: 'draw', panel: hit.panel, side: hit.side, surface: hit.surface, stroke, inkId: id }
          return true
        }
        if (!hit) { ed.select(null); return false }
        const s = scene.d.surfaces.get(hit.surface)!
        const pp = flatToPage(s.frame, hit.side, hit.flat)
        const o = objectAt(docRef.current, hit.surface, hit.side, pp)
        if (!o) { if (useEditor.getState().selected) haptic('tick'); ed.select(null); return false }
        const wasSelected = useEditor.getState().selected === o.id
        if (!wasSelected) { ed.select(o.id); haptic('tick') }
        gest.current = { kind: 'move', panel: hit.panel, side: hit.side, surface: hit.surface, obj: o.id, base: o, start: pp, wasSelected }
        return true
      },
      toolMove: (p: PointerInfo) => {
        const g = gest.current
        if (!g) return
        const pp = toPage(g, p.x, p.y)
        if (!pp) return
        if (g.kind === 'draw') {
          const tool = useEditor.getState().ink
          if (tool.tool === 'eraser' && tool.eraseMode === 'stroke') { eraseStrokesAt(g.surface, g.side, pp); return }
          const st = g.stroke!
          const n = st.pts.length
          if (Math.hypot(pp[0] - st.pts[n - 2], pp[1] - st.pts[n - 1]) < 0.035) return
          st.pts = [...st.pts, pp[0], pp[1]]
          const d = docRef.current
          ed.live({
            ...d,
            objects: d.objects.map(o => (o.kind === 'ink' && o.strokes.includes(st) ? { ...o, strokes: [...o.strokes] } : o)),
          })
          return
        }
        if (g.kind === 'move' && g.base && g.start) {
          let dx = pp[0] - g.start[0], dy = pp[1] - g.start[1]
          if (!g.moved && Math.hypot(dx, dy) < 0.12) return
          g.moved = true
          // snap the centre to the page's centre lines
          const r = pageRect(scene, g.panel, g.side)
          const b0 = objectBox(g.base)
          const gx: [number, number][] = [], gy: [number, number][] = []
          if (r) {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2
            if (Math.abs(b0.cx + dx - cx) < 0.3) { dx = cx - b0.cx; gx.push(scene.pageToScreen(g.panel, g.side, [cx, r.y]), scene.pageToScreen(g.panel, g.side, [cx, r.y + r.h])) }
            if (Math.abs(b0.cy + dy - cy) < 0.3) { dy = cy - b0.cy; gy.push(scene.pageToScreen(g.panel, g.side, [r.x, cy]), scene.pageToScreen(g.panel, g.side, [r.x + r.w, cy])) }
          }
          setGuides(prev => {
            const had = !!(prev.x?.length || prev.y?.length), has = !!(gx.length || gy.length)
            if (has && !had) haptic('tick')
            return { x: gx, y: gy }
          })
          const moved = transformObject(g.base, { dx, dy })
          const d = docRef.current
          ed.live({ ...d, objects: d.objects.map(o => (o.id === g.obj ? moved : o)) })
        }
      },
      toolEnd: () => {
        const g = gest.current
        gest.current = null
        setGuides({})
        if (!g) return
        if (g.kind === 'draw') { commit(docRef.current, g.stroke?.erase ? 'Erase' : 'Draw'); return }
        if (g.kind === 'move') {
          if (g.moved) { commit(docRef.current, 'Move'); return }
          // second tap on selected text edits it
          const o = docRef.current.objects.find(x => x.id === g.obj)
          if (g.wasSelected && o?.kind === 'text') setText({ open: true, initial: o })
        }
      },
      toolCancel: () => {
        const g = gest.current
        gest.current = null
        if (g?.kind === 'move' && g.base) {
          const d = docRef.current
          ed.live({ ...d, objects: d.objects.map(o => (o.id === g.obj ? g.base! : o)) })
        }
      },
      twoStart: (t: TwoInfo) => {
        const id = useEditor.getState().selected
        const o = docRef.current.objects.find(x => x.id === id)
        if (!o || o.locked) return false
        // only when the fingers are on (or around) the selected object
        const b = objectBox(o)
        const panel = scene.panelAt(o.surface, o.side, [b.cx, b.cy])
        if (!panel) return false
        const pts = boxCorners(b).map(p => scene.pageToScreen(panel, o.side, p))
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
        const pad = 50
        if (t.cx < Math.min(...xs) - pad || t.cx > Math.max(...xs) + pad || t.cy < Math.min(...ys) - pad || t.cy > Math.max(...ys) + pad) return false
        gest.current = { kind: 'two', panel, side: o.side, surface: o.surface, obj: o.id, base: o, two: { scale: 1, rot: 0, cx: t.cx, cy: t.cy } }
        return true
      },
      twoMove: (t: TwoInfo) => {
        const g = gest.current
        if (!g || g.kind !== 'two' || !g.base || !g.two) return
        const a = scene.screenToPage(g.panel, g.side, g.two.cx, g.two.cy)
        const b = scene.screenToPage(g.panel, g.side, t.cx, t.cy)
        const dx = a && b ? b[0] - a[0] : 0, dy = a && b ? b[1] - a[1] : 0
        // the back side is mirrored, so twist reads the other way there
        const rot = g.side === 'back' ? -t.rot : t.rot
        const moved = transformObject(g.base, { dx, dy, scale: t.scale, rot })
        const d = docRef.current
        ed.live({ ...d, objects: d.objects.map(o => (o.id === g.obj ? moved : o)) })
      },
      twoEnd: () => { gest.current = null; commit(docRef.current, 'Transform') },
      doubleTap: (p: PointerInfo) => {
        const hit = scene.pick(p.x, p.y)
        if (!hit) return false
        const s = scene.d.surfaces.get(hit.surface)!
        const o = objectAt(docRef.current, hit.surface, hit.side, flatToPage(s.frame, hit.side, hit.flat))
        if (o?.kind === 'text') { setText({ open: true, initial: o }); return true }
        return false
      },
      undo: () => useEditor.getState().undo(),
      redo: () => useEditor.getState().redo(),
    }
    return () => { scene.handlers = {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, drawing])

  const eraseStrokesAt = (surface: string, side: Side, p: Vec2) => {
    const d = docRef.current
    const r = useEditor.getState().ink.size.eraser
    let hit = false
    const objects = d.objects.map(o => {
      if (o.kind !== 'ink' || o.surface !== surface || o.side !== side) return o
      const strokes = o.strokes.filter(s => {
        if (s.erase) return true
        for (let i = 0; i < s.pts.length; i += 2) if (Math.hypot(s.pts[i] - p[0], s.pts[i + 1] - p[1]) < r + s.size / 2) { hit = true; return false }
        return true
      })
      return strokes.length === o.strokes.length ? o : { ...o, strokes }
    })
    if (hit) { ed.live({ ...d, objects }); haptic('tick') }
  }

  // corner handles: scale + rotate around the centre
  const cornerDown = (e: React.PointerEvent) => {
    if (!scene || !selected) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const b = objectBox(selected)
    const panel = scene.panelAt(selected.surface, selected.side, [b.cx, b.cy])
    if (!panel) return
    const c = scene.pageToScreen(panel, selected.side, [b.cx, b.cy])
    const r = scene.el.getBoundingClientRect()
    const x0 = e.clientX - r.left - c[0], y0 = e.clientY - r.top - c[1]
    const d0 = Math.hypot(x0, y0), a0 = Math.atan2(y0, x0)
    const base = selected
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - r.left - c[0], y = ev.clientY - r.top - c[1]
      const scale = Math.hypot(x, y) / Math.max(1, d0)
      let rot = Math.atan2(y, x) - a0
      if (selected.side === 'back') rot = -rot
      // soft snap to upright
      const total = (base.kind === 'ink' ? 0 : base.rot) + rot
      const snap = Math.round(total / (Math.PI / 2)) * (Math.PI / 2)
      if (Math.abs(total - snap) < 0.05) rot += snap - total
      const moved = transformObject(base, { scale, rot })
      const d = docRef.current
      ed.live({ ...d, objects: d.objects.map(o => (o.id === base.id ? moved : o)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      commit(docRef.current, 'Transform')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ---------------------------------------------------------------- object actions

  const objAct = (what: 'flip' | 'dup' | 'fwd' | 'back' | 'cutout' | 'fx' | 'del' | 'edit') => {
    if (!selected) return
    const d = docRef.current
    const i = d.objects.findIndex(o => o.id === selected.id)
    haptic('tap')
    switch (what) {
      case 'flip':
        if (selected.kind === 'scrap') patch(selected.id, { flipX: !selected.flipX }, 'Flip')
        else if (selected.kind === 'ink') setObjects(d.objects.map(o => (o.id === selected.id ? transformObject(o, {}) : o)), 'Flip')
        break
      case 'dup': {
        const copy = { ...transformObject(selected, { dx: 0.6, dy: 0.6 }), id: uid('o'), name: selected.name + ' copy' } as ZObject
        setObjects([...d.objects.slice(0, i + 1), copy, ...d.objects.slice(i + 1)], 'Duplicate')
        ed.select(copy.id)
        break
      }
      case 'fwd': if (i < d.objects.length - 1) { const o = d.objects.slice(); [o[i], o[i + 1]] = [o[i + 1], o[i]]; setObjects(o, 'Bring forward') } break
      case 'back': if (i > 0) { const o = d.objects.slice(); [o[i], o[i - 1]] = [o[i - 1], o[i]]; setObjects(o, 'Send backward') } break
      case 'cutout': if (selected.kind === 'scrap') { patch(selected.id, { cutout: !selected.cutout, sticker: selected.cutout ? selected.sticker : Math.max(selected.sticker, 0.15) }, 'Cut out'); showToast(selected.cutout ? 'Background restored' : 'Background removed') } break
      case 'fx': setSheet('effects'); break
      case 'del': setObjects(d.objects.filter(o => o.id !== selected.id), 'Delete'); ed.select(null); sfx('pop'); break
      case 'edit': if (selected.kind === 'text') setText({ open: true, initial: selected }); break
    }
  }

  const addScraps = async (items: ScrapItem[]) => {
    const c = currentPageCenter()
    if (!c) return
    const objs: ScrapObj[] = []
    for (const [k, it] of items.entries()) {
      let aspect = 1
      try { const img = await loadImage(it.src); aspect = img.height / img.width } catch { /* keep square */ }
      const w = c.w * (it.kind === 'sticker' ? 0.36 : 0.55)
      const spread = items.length > 1 ? 1.6 : 0
      objs.push({
        id: uid('o'), kind: 'scrap', surface: c.surface, side: c.side, name: it.name, src: it.src,
        x: c.p[0] + (Math.random() - 0.5) * 2 * spread + k * 0.3, y: c.p[1] + (Math.random() - 0.5) * 2 * spread + k * 0.3,
        rot: (Math.random() - 0.5) * 0.4, scale: 1, w, h: w * aspect,
        sticker: it.kind === 'image' ? 0 : 0.16, shadow: true, gif: it.gif || it.kind === 'gif', alt: it.name,
      })
    }
    const d = docRef.current
    commit({ ...d, objects: [...d.objects, ...objs] }, objs.length > 1 ? `Add ${objs.length} scraps` : 'Add scrap')
    ed.select(objs[objs.length - 1]?.id ?? null)
    sfx('slap'); haptic('tap')
  }

  const doneText = (t: Pick<TextObj, 'text' | 'font' | 'color' | 'style' | 'align'>) => {
    const init = text.initial
    setText({ open: false, initial: null })
    if (!t.text.trim()) { if (init) setObjects(docRef.current.objects.filter(o => o.id !== init.id), 'Delete text'); return }
    if (init) { patch(init.id, { ...t, name: t.text.split('\n')[0].slice(0, 18) }, 'Edit text'); return }
    const c = currentPageCenter()
    if (!c) return
    const o: TextObj = {
      id: uid('o'), kind: 'text', surface: c.surface, side: c.side, name: t.text.split('\n')[0].slice(0, 18), ...t,
      x: c.p[0], y: c.p[1], rot: (Math.random() - 0.5) * 0.08, scale: 1, size: Math.max(0.6, c.w / 9), seed: Math.floor(Math.random() * 1e6),
    }
    commit({ ...docRef.current, objects: [...docRef.current.objects, o] }, 'Add text')
    ed.select(o.id)
    sfx('slap')
  }

  const startDraw = (t: InkTool) => {
    haptic('tap')
    ed.setInk({ tool: t })
    if (!drawing) inkSession.current = null
    setDrawing(true)
    ed.select(null)
  }

  // ---------------------------------------------------------------- render data

  const groups = useMemo(() => ({ front: pages.filter(p => p.side === 'front'), back: pages.filter(p => p.side === 'back') }), [pages])
  const faceN = face && scene ? scene.pageOf(face.panel, face.side) : 0
  const track = trackById(doc.music?.track)
  const effectScopes = {
    scrap: selected?.kind === 'scrap' ? selected.id : undefined,
    page: face ? `${face.panel}:${face.side}` : undefined,
  }

  return (
    <div className="step-ui collage">
      <svg className="sel-svg" aria-hidden>
        {selected && <polygon ref={selBox} className="sel-box" />}
        {guides.x?.length === 2 && <line className="guide" x1={guides.x[0][0]} y1={guides.x[0][1]} x2={guides.x[1][0]} y2={guides.x[1][1]} />}
        {guides.y?.length === 2 && <line className="guide" x1={guides.y[0][0]} y1={guides.y[0][1]} x2={guides.y[1][0]} y2={guides.y[1][1]} />}
      </svg>
      {selected && !drawing && [0, 1, 2, 3].map(i => (
        <div key={i} className="sel-corner" ref={el => { cornerEls.current[i] = el }} onPointerDown={cornerDown} aria-label="Resize and rotate" />
      ))}
      {selected && !drawing && (
        <div className="sel-bar" ref={selBar} role="toolbar" aria-label="Selection">
          {selected.kind === 'text' && <button onClick={() => objAct('edit')}><Icon name="edit" size={17} /><span>Edit</span></button>}
          {selected.kind !== 'text' && <button onClick={() => objAct('flip')}><Icon name="flip" size={17} /><span>Flip</span></button>}
          <button onClick={() => objAct('dup')}><Icon name="duplicate" size={17} /><span>Copy</span></button>
          <button onClick={() => objAct('fwd')}><Icon name="forward" size={17} /><span>Forward</span></button>
          <button onClick={() => objAct('back')}><Icon name="backward" size={17} /><span>Back</span></button>
          {selected.kind === 'scrap' && <button onClick={() => objAct('cutout')}><Icon name="scissors" size={17} /><span>Cut out</span></button>}
          {selected.kind === 'scrap' && <button onClick={() => objAct('fx')}><Icon name="sparkle" size={17} /><span>Effects</span></button>}
          <button className="danger" onClick={() => objAct('del')}><Icon name="trash" size={17} /><span>Delete</span></button>
        </div>
      )}

      <div className="top-bar">
        <PillGroup>
          {drawing
            ? <IconBtn name="x" label="Stop drawing" onClick={() => { setDrawing(false); inkSession.current = null }} />
            : <IconBtn name="back" label="Save and exit" onClick={exit} />}
          <IconBtn name="undo" label="Undo" onClick={ed.undo} disabled={!ed.past.length} />
          <IconBtn name="redo" label="Redo" onClick={ed.redo} disabled={!ed.future.length} />
        </PillGroup>
        <div className="grow" />
        <PillGroup className="solo"><IconBtn name="spread" label="Spread view" active={spread} onClick={() => { haptic('tick'); setSpread(s => !s) }} /></PillGroup>
        {drawing
          ? <CheckBtn onClick={() => { setDrawing(false); inkSession.current = null; haptic('tap') }} label="Done drawing" />
          : <PillGroup className="solo"><IconBtn name="right" label="Next: Finalize" onClick={() => { ed.select(null); next() }} /></PillGroup>}
      </div>

      {face && (
        <button className="orient-chip" onClick={() => setSpread(true)} aria-label="Show all pages">
          <span className={`oc-side ${face.side}`}>{face.side === 'front' ? 'Front' : 'Back'}</span>
          <span>P{faceN || 1}</span>
          <Icon name="pages" size={14} />
        </button>
      )}

      <div className="rail right">
        <VSlider value={zoom} onChange={setZoom} label="Zoom" />
        {drawing ? (
          <>
            <VSlider variant="gradient" value={Math.min(1, ink.size[ink.tool] / (ink.tool === 'eraser' ? 2 : ink.tool === 'marker' ? 1 : 0.5))} label="Brush size"
              onChange={v => ed.setInk({ size: { ...ink.size, [ink.tool]: Math.max(0.03, v * (ink.tool === 'eraser' ? 2 : ink.tool === 'marker' ? 1 : 0.5)) } })} />
            <PillGroup className="solo rail-btn"><IconBtn name="more" label="Brush settings" onClick={() => setSheet('ink')} /></PillGroup>
          </>
        ) : (
          <>
            <button className="rail-round music" aria-label={track ? `Soundtrack: ${track.track.title}` : 'Pick a soundtrack'} onClick={() => setSheet('music')}>
              {track ? <img src={track.album.cover} alt="" /> : <Icon name="music" size={18} />}
            </button>
            <button className="rail-round bg" aria-label="Background colour" style={{ background: doc.bg }} onClick={() => setSheet('bg')} />
            {doc.music && (
              <button className="rail-round" aria-label={mutedMusic ? 'Unmute music' : 'Mute music'} onClick={() => setMutedMusic(m => !m)}>
                <Icon name={mutedMusic ? 'volumeOff' : 'volume'} size={18} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="bottom-stack">
        {!drawing && pages.length > 0 && (
          <div className="page-strip hscroll" role="tablist" aria-label="Pages">
            {(['front', 'back'] as Side[]).map(side => groups[side].length > 0 && (
              <div key={side} className="ps-group">
                <span className="ps-label">{side === 'front' ? 'Front' : 'Back'}</span>
                {groups[side].map(p => {
                  const on = face?.panel === p.panel && face?.side === p.side
                  const src = thumbs[`${p.panel}:${p.side}`]
                  return (
                    <button key={`${p.panel}:${p.side}`} role="tab" aria-selected={on} className={`ps ${on ? 'on' : ''}`} onClick={() => focusPage(p.panel, p.side)}>
                      {src ? <img src={src} alt="" /> : <span className="ps-ph" />}
                      <span className="ps-n">{p.n}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {doc.keyframes.length > 1 && !drawing && (
          <Ruler value={kfT} count={doc.keyframes.length}
            onChange={t => { setKfT(t); scene?.setAngles(scene.poseAt(t), { animate: false }) }}
            onRelease={i => { setKfT(i); scene?.setAngles(doc.keyframes[i].angles, { feel: FEELS[doc.transition.feel] }); setTimeout(() => { const f = scene?.nearestFace(); if (f && scene) { scene.facePanel(f.panel, f.side, { focus: true }); setFace(f) } }, 450) }} />
        )}
        {colorOpen && drawing && (
          <div className="ink-colors hscroll">
            {INK_COLORS.map(c => (
              <button key={c} className={`sw ${ink.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => { ed.setInk({ color: c }); haptic('tick') }} />
            ))}
            <label className="sw spectrum" aria-label="Custom colour"><input type="color" value={ink.color} onChange={e => ed.setInk({ color: e.target.value })} /></label>
          </div>
        )}
        <div className="toolbar collage-bar" role="toolbar" aria-label="Collage tools">
          <div className="ink-tray">
            {INK_TOOLS.map(t => {
              const on = drawing && ink.tool === t.id
              return (
                <button key={t.id} className={`ink-tool ${on ? 'on' : ''}`} aria-label={t.label} aria-pressed={on} onClick={() => startDraw(t.id)}>
                  <img className="tool-pic" src={t.src} alt="" draggable={false} style={{ height: t.h, marginBottom: -t.sink }} />
                </button>
              )
            })}
          </div>
          <span className="tb-sep" />
          {drawing ? (
            <>
              <button className="ink-swatch" aria-label="Ink colour" style={{ '--sw': ink.color } as CSSProperties} onClick={() => setColorOpen(o => !o)}><span /></button>
              <button className="ink-preview" aria-label="Brush settings" onClick={() => setSheet('ink')}>
                <svg viewBox="0 0 60 24" width={60} height={24}><path d="M4 16c10-10 18 6 28-2s16-6 24-8" fill="none" stroke={ink.tool === 'eraser' ? '#ccc' : ink.color} strokeWidth={Math.max(1.5, ink.size[ink.tool] * 14)} strokeLinecap="round" opacity={ink.tool === 'marker' ? 0.6 : ink.opacity} /></svg>
                <span>{ink.boil ? 'boiling' : ink.tool}</span>
              </button>
            </>
          ) : (
            <>
              <button className="tool-glyph" aria-label="Add scraps" onClick={() => setSheet('scrap')}><Icon name="image" size={23} /></button>
              <button className="tool-glyph" aria-label="Layers" onClick={() => setSheet('layers')}><Icon name="layers" size={23} /></button>
              <button className="tool-glyph" aria-label="Add text" onClick={() => { haptic('tap'); setText({ open: true, initial: null }) }}><Icon name="text" size={23} /></button>
              <button className="tool-glyph" aria-label="More tools" onClick={() => setSheet('more')}><Icon name="grid" size={23} /></button>
            </>
          )}
        </div>
      </div>

      {spread && scene && (
        <SpreadView scene={scene} doc={doc} onClose={() => setSpread(false)}
          onJump={(panel, side) => { setSpread(false); focusPage(panel, side) }}
          onMove={(objects, label) => commit({ ...docRef.current, objects }, label)} />
      )}

      <ScrapSheet open={sheet === 'scrap'} onClose={() => setSheet('none')} onAdd={addScraps} />
      <MusicPicker open={sheet === 'music'} onClose={() => setSheet('none')} value={doc.music}
        onChange={m => { commit({ ...docRef.current, music: m }, m ? 'Soundtrack' : 'Remove soundtrack') }} />
      <EffectsSheet open={sheet === 'effects'} effects={doc.effects} scopes={effectScopes}
        onClose={() => { if (fxLive.current) { fxLive.current = false; commit(docRef.current, 'Effect strength') } setSheet('none') }}
        onChange={(e, label) => {
          if (label === 'Effect strength') { fxLive.current = true; ed.live({ ...docRef.current, effects: e }) }
          else { fxLive.current = false; commit({ ...docRef.current, effects: e }, label) }
        }}
        getPreview={() => (scene && face ? pageThumb(scene, face.panel, face.side, 200) : null)} />
      {scene && (
        <LayersSheet open={sheet === 'layers'} onClose={() => setSheet('none')} doc={doc} selected={ed.selected}
          onSelect={id => {
            ed.select(id)
            const o = docRef.current.objects.find(x => x.id === id)
            if (o) { const b = objectBox(o); const p = scene.panelAt(o.surface, o.side, [b.cx, b.cy]); if (p) focusPage(p, o.side) }
          }}
          onChange={setObjects} pagesOf={o => pagesOf(scene, o)} isClipped={o => isClipped(scene, o)} />
      )}
      <TextEditor open={text.open} initial={text.initial} onDone={doneText} onCancel={() => setText({ open: false, initial: null })} />

      <Sheet open={sheet === 'bg'} onClose={() => setSheet('none')} title="Background" dim>
        <p className="sheet-tip" style={{ marginTop: 0 }}>Readers see this behind your zine.</p>
        <div className="bg-grid">
          {BG_COLORS.map(c => (
            <button key={c} className={`sw big ${doc.bg === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Background ${c}`}
              onClick={() => { commit({ ...docRef.current, bg: c }, 'Background'); haptic('tick') }} />
          ))}
          <label className="sw big spectrum" aria-label="Custom background"><input type="color" value={doc.bg} onChange={e => ed.live({ ...docRef.current, bg: e.target.value })} onBlur={() => commit(docRef.current, 'Background')} /></label>
        </div>
      </Sheet>

      <Sheet open={sheet === 'ink'} onClose={() => setSheet('none')} title="Brush" dim>
        <Segmented value={ink.tool} onChange={t => ed.setInk({ tool: t })} options={INK_TOOLS.map(t => ({ value: t.id, label: t.label }))} />
        <div style={{ height: 10 }} />
        <Slider label="Size" value={Math.round(ink.size[ink.tool] * 100)} min={3} max={ink.tool === 'eraser' ? 200 : 100} onChange={v => ed.setInk({ size: { ...ink.size, [ink.tool]: v / 100 } })} format={v => `${(v / 10).toFixed(1)}mm`} />
        {ink.tool !== 'eraser' && <>
          <Slider label="Opacity" value={Math.round(ink.opacity * 100)} onChange={v => ed.setInk({ opacity: v / 100 })} format={v => `${v}%`} />
          <Slider label="Jitter" value={Math.round(ink.jitter * 100)} onChange={v => ed.setInk({ jitter: v / 100 })} format={v => `${v}`} />
          <Row label="Line boil" sub="Redraws on twos, like hand-drawn animation"><Toggle on={ink.boil} onChange={v => ed.setInk({ boil: v })} label="Line boil" /></Row>
          {ink.boil && <>
            <Slider label="Strength" value={Math.round(ink.boilStrength * 100)} onChange={v => ed.setInk({ boilStrength: v / 100 })} format={v => `${v}`} />
            <Row label="Speed"><Segmented value={String(ink.boilSpeed) as '2' | '3'} onChange={v => ed.setInk({ boilSpeed: Number(v) as 2 | 3 })} options={[{ value: '2', label: 'On 2s' }, { value: '3', label: 'On 3s' }]} /></Row>
          </>}
        </>}
        {ink.tool === 'eraser' && (
          <Row label="Eraser"><Segmented value={ink.eraseMode} onChange={v => ed.setInk({ eraseMode: v })} options={[{ value: 'area', label: 'Area' }, { value: 'stroke', label: 'Stroke' }]} /></Row>
        )}
        <p className="sheet-tip">The eraser only touches drawings, never text or scraps.</p>
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet('none')} title="Collage" dim>
        <div className="more-grid">
          <button onClick={() => setSheet('effects')}><Icon name="sparkle" size={22} /><span>Effects</span></button>
          <button onClick={() => setSheet('scrap')}><Icon name="image" size={22} /><span>Scraps</span></button>
          <button onClick={() => setSheet('music')}><Icon name="music" size={22} /><span>Music</span></button>
          <button onClick={() => setSheet('bg')}><Icon name="palette" size={22} /><span>Background</span></button>
          <button onClick={() => { setSheet('none'); setSpread(true) }}><Icon name="spread" size={22} /><span>Spread</span></button>
          <button onClick={() => setSheet('history')}><Icon name="history" size={22} /><span>History</span></button>
          <button onClick={() => { setSheet('none'); scene?.flip() }}><Icon name="rotate" size={22} /><span>Turn over</span></button>
          <button onClick={() => { setSheet('none'); ed.setStep('cut') }}><Icon name="scissors" size={22} /><span>Cut & Fold</span></button>
        </div>
        <p className="sheet-tip">Pinch to zoom the page. Two-finger swipe turns the zine over. Drag the glowing dots to unfold. Two-finger tap undoes.</p>
      </Sheet>
      <HistorySheet open={sheet === 'history'} onClose={() => setSheet('none')} />
    </div>
  )
}

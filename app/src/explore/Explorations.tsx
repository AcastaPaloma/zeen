import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { applyCut, applyFold, cutPreview, foldPlan, foldPreview } from '../create/ops'
import { haptic, sfx } from '../lib/feedback'
import { clipLine, closestOnSegment, dist, lerp2, norm, perp, pointInMulti, sub } from '../lib/geom'
import { cutPath, derive, newDoc, type Derived } from '../lib/paper'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import type { Crease, Frame, Vec2, ZineDoc } from '../lib/types'
import type { CreaseMark, ZineScene } from '../three/ZineScene'
import { Button, IconBtn, PillGroup, Segmented, Slider } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import { KeepItGoing, StartCommunity } from './CommunityConcepts'
import { PageByPage, TapThrough } from './ReadingExplorations'
import { useExploration } from './state'
import './explore.css'

// Two earlier takes on cutting and folding, kept for the case study. Each works on its own blank sheet
// (nothing is saved), using the same paper engine as the final tool: only the way you say where the
// line goes is different.

const FOLD = '#5C5CE3'
const CUT = '#FF4934'
const BLOCKED: Record<string, string> = {
  cross: "Folds can't cross where pages are joined",
  same: "There's already a fold there",
  tear: 'That fold would tear the paper',
}

const freshDoc = () => { const d = newDoc({ author: ME }); d.id = 'z_exploration'; return d }

/** Existing creases as faint marks, plus the line being set up. */
function marks(creases: Crease[], line?: { panel: string; a: Vec2; b: Vec2; color: string } | null): CreaseMark[] {
  const out: CreaseMark[] = creases.filter(k => !k.leaf).map(k => ({ panel: k.panel, a: k.a, b: k.b, color: '#1A1A1A', width: 0.04, opacity: 0.24, dash: [0.28, 0.2] }))
  if (line) out.push({ ...line, width: 0.07, opacity: 0.95, dash: [0.3, 0.18] })
  return out
}

// ---------------------------------------------------------------- shell

interface Paper { scene: ZineScene | null; doc: ZineDoc; commit: (d: ZineDoc) => void }

/** A blank sheet with undo and start over, the top bar, and whatever the exploration puts round it. */
function Shell({ panelHeight = 0, children }: { panelHeight?: number; children: (p: Paper) => ReactNode }) {
  const show = useExploration(s => s.show)
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [doc, setDoc] = useState(freshDoc)
  const [past, setPast] = useState<ZineDoc[]>([])
  const docRef = useRef(doc)
  docRef.current = doc
  const commit = (d: ZineDoc) => { setPast(p => [...p, docRef.current]); setDoc(d) }
  const undo = () => { if (!past.length) return; haptic('tick'); setDoc(past[past.length - 1]); setPast(past.slice(0, -1)) }
  const reset = () => { haptic('tap'); setPast([]); setDoc(freshDoc()) }

  // one finger turns the paper round, as in the final tool's resting state
  const onScene = (s: ZineScene | null) => { if (s) s.dragOrbit = true; setScene(s) }
  // after every change, square up to whatever page is on top, filling the space
  useEffect(() => {
    if (!scene) return
    const t = setTimeout(() => { const f = scene.topFace(); if (f) scene.facePanel(f.panel, f.side, { focus: true }) }, 380)
    return () => clearTimeout(t)
  }, [scene, doc.surfaces, doc.creases.length])
  useEffect(() => {
    if (!scene) return
    // a fold opened or closed by its handle stays that way
    return scene.on('angle-commit', ({ id, angle }: { id: string; angle: number }) => {
      setDoc(d => ({ ...d, creases: d.creases.map(c => (c.id === id ? { ...c, angle } : c)) }))
    })
  }, [scene])

  return (
    <div className="screen dots explore">
      {/* the paper fills the space between the top bar and the exploration's own controls */}
      <div className="ex-stage" style={{ bottom: panelHeight }}>
        <ZineView doc={doc} mode="free" onScene={onScene} />
      </div>
      <div className="top-bar">
        <PillGroup>
          <IconBtn name="x" label="Back to the final design" onClick={() => { haptic('tick'); show(null) }} />
          <IconBtn name="undo" label="Undo" onClick={undo} disabled={!past.length} />
        </PillGroup>
        <div className="grow" />
        <button className="chip ex-reset" onClick={reset}>Start over</button>
      </div>
      {children({ scene, doc, commit })}
    </div>
  )
}

// ---------------------------------------------------------------- 1 · measured

type Edge = 'left' | 'top' | 'right' | 'bottom'
type Kind = 'fold' | 'cut'

/** The line `d` (0–1) of the way in from an edge of the sheet, tilted by `deg`. Measured on the flat sheet. */
function measuredLine(f: Frame, edge: Edge, d: number, deg: number): [Vec2, Vec2] {
  const t = (deg * Math.PI) / 180
  const across = edge === 'left' || edge === 'right'
  const p: Vec2 = edge === 'left' ? [f.x + d * f.w, f.y + f.h / 2]
    : edge === 'right' ? [f.x + f.w - d * f.w, f.y + f.h / 2]
    : edge === 'top' ? [f.x + f.w / 2, f.y + f.h - d * f.h]
    : [f.x + f.w / 2, f.y + d * f.h]
  const u: Vec2 = across ? [Math.sin(t), Math.cos(t)] : [Math.cos(t), Math.sin(t)]
  return [[p[0] - u[0] * 100, p[1] - u[1] * 100], [p[0] + u[0] * 100, p[1] + u[1] * 100]]
}

/** The panel a measured line works on: the page on top if it can take it, otherwise the first that can. */
function measuredTarget(scene: ZineScene, d: Derived, kind: Kind, A: Vec2, B: Vec2): { panel: string } | { error: string } | null {
  const top = scene.topHit()?.panel
  const order = [...(top ? [top] : []), ...d.list.map(P => P.id).filter(id => id !== top)]
  let blocked: string | null = null
  for (const id of order) {
    if (kind === 'fold') {
      const plan = foldPlan(d, id, A, B)
      if (!plan) continue
      if ('error' in plan) { blocked ??= plan.error; continue }
      return { panel: id }
    }
    if (cutPreview(scene, id, [A, B])?.region) return { panel: id }
  }
  return blocked ? { error: blocked } : null
}

function Measured() {
  const [kind, setKind] = useState<Kind>('fold')
  const [edge, setEdge] = useState<Edge>('left')
  const [dist0, setDist] = useState(50)
  const [deg, setDeg] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const [panelH, setPanelH] = useState(300)
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    // (a hidden page measures 0: keep the last real height)
    const measure = () => { const h = el.getBoundingClientRect().height; if (h > 0) setPanelH(h) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <Shell panelHeight={panelH}>
      {({ scene, doc, commit }) => {
        const f = doc.surfaces[0].frame
        const [A, B] = measuredLine(f, edge, dist0 / 100, deg)
        const span = edge === 'left' || edge === 'right' ? f.w : f.h
        const go = () => {
          if (!scene) return
          const t = measuredTarget(scene, scene.d, kind, A, B)
          if (!t) { haptic('firm'); useApp.getState().showToast('That line misses the paper'); return }
          if ('error' in t) { haptic('firm'); useApp.getState().showToast(BLOCKED[t.error] ?? 'That line can’t fold here'); return }
          if (kind === 'fold') {
            const res = applyFold(derive(doc, { edges: true }), doc, scene, t.panel, A, B)
            if (!res || 'error' in res) { haptic('firm'); useApp.getState().showToast(res ? BLOCKED[res.error] : 'That line misses the paper'); return }
            commit(res.doc); haptic('medium'); sfx('crease')
          } else {
            const res = applyCut(scene, doc, t.panel, cutPath('straight', A, B, [A, B], 0, 1, true), false)
            if (!res) { haptic('firm'); useApp.getState().showToast('That line misses the paper'); return }
            scene.dropPieces(res.pieces); commit(res.doc); haptic('tap'); sfx('snip')
          }
        }
        return (
          <>
            <MeasuredPreview scene={scene} doc={doc} kind={kind} A={A} B={B} />
            <div className="ex-panel" ref={panel}>
              <Segmented value={kind} onChange={setKind} options={[{ value: 'fold', label: 'Fold' }, { value: 'cut', label: 'Cut' }]} />
              <div className="ex-row">
                <span>From the</span>
                <Segmented className="ex-edges" value={edge} onChange={setEdge}
                  options={[{ value: 'left', label: 'Left' }, { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' }, { value: 'bottom', label: 'Bottom' }]} />
              </div>
              <Slider label="Distance" value={dist0} min={1} max={99} onChange={setDist} accent={kind === 'fold' ? FOLD : CUT}
                format={v => `${((v / 100) * span).toFixed(1)} cm`} />
              <Slider label="Angle" value={deg} min={-45} max={45} onChange={setDeg} accent={kind === 'fold' ? FOLD : CUT} format={v => `${v}°`} />
              <Button className="ex-go" onClick={go} style={{ background: kind === 'fold' ? FOLD : CUT }}>
                {kind === 'fold' ? 'Fold here' : 'Cut here'}
              </Button>
            </div>
          </>
        )
      }}
    </Shell>
  )
}

/** The line as it's dialled in: the side that would fold (or fall away) tinted, the line drawn on the paper. */
function MeasuredPreview({ scene, doc, kind, A, B }: { scene: ZineScene | null; doc: ZineDoc; kind: Kind; A: Vec2; B: Vec2 }) {
  useEffect(() => {
    if (!scene) return
    const clear = () => { scene.setGhost(null, null, null); scene.setTint(null, null) }
    const t = measuredTarget(scene, scene.d, kind, A, B)
    if (!t || 'error' in t) {
      clear()
      scene.setCreaseMarks(marks(doc.creases))
      return
    }
    const P = scene.d.panels.get(t.panel)!
    const seg = clipLine(A, B, P.region)
    if (kind === 'fold') {
      const pv = foldPreview(scene.d, scene, t.panel, A, B)
      if (pv && 'crease' in pv) { scene.setGhost(t.panel, pv.region, pv.crease, FOLD, 0.2); scene.setTint(t.panel, pv.region, FOLD, 0.12) } else clear()
    } else {
      scene.setGhost(null, null, null)
      scene.setTint(t.panel, cutPreview(scene, t.panel, [A, B])?.region ?? null, CUT, 0.25)
    }
    scene.setCreaseMarks(marks(doc.creases, seg ? { panel: t.panel, a: seg[0], b: seg[1], color: kind === 'fold' ? FOLD : CUT } : null))
  }, [scene, doc, kind, A[0], A[1], B[0], B[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { scene?.setGhost(null, null, null); scene?.setTint(null, null); scene?.setCreaseMarks([]) }, [scene])
  return null
}

// ---------------------------------------------------------------- 2 · dot to dot

/** A spot on the edge of a piece of paper (flat coords on its panel). */
interface Spot { panel: string; p: Vec2 }

/**
 * The spot on a showing edge of the paper nearest a point on screen, if one is within `max` px. Only edges
 * you can actually see count: the paper just inside the edge has to be that panel's, facing the camera.
 */
function edgeNear(scene: ZineScene, x: number, y: number, max: number): Spot | null {
  const cands: { panel: string; a: Vec2; b: Vec2; t: number; d: number }[] = []
  for (const P of scene.d.list) {
    if (!P.region.length) continue
    for (const poly of P.region) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      if (dist(a, b) < 1e-6) continue
      const sa = scene.flatToScreen(P.id, a), sb = scene.flatToScreen(P.id, b)
      const q = closestOnSegment([x, y], sa, sb)
      const d = Math.hypot(q[0] - x, q[1] - y)
      if (d > max) continue
      const t = Math.hypot(q[0] - sa[0], q[1] - sa[1]) / (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) || 1)
      cands.push({ panel: P.id, a, b, t, d })
    }
  }
  cands.sort((m, n) => m.d - n.d)
  for (const c of cands) {
    const p = lerp2(c.a, c.b, c.t)
    const n = norm(perp(sub(c.b, c.a)))
    const region = scene.d.panels.get(c.panel)!.region
    const inside: Vec2 = [p[0] + n[0] * 0.3, p[1] + n[1] * 0.3]
    const q: Vec2 = pointInMulti(inside, region) ? inside : [p[0] - n[0] * 0.3, p[1] - n[1] * 0.3]
    const s = scene.flatToScreen(c.panel, q)
    if (scene.pick(s[0], s[1])?.panel === c.panel) return { panel: c.panel, p }
  }
  return null
}

function DotToDot() {
  return <Shell panelHeight={90}>{p => <Dots {...p} />}</Shell>
}

const HINT = ['click an edge to place a dot', 'now place a second dot', '']

/**
 * Nothing shows until you point at the paper: move along an edge and a glowing dot follows, click to
 * drop one there. Two dots on the same page make a line, and a little menu asks Cut or Fold.
 */
function Dots({ scene, doc, commit }: Paper) {
  const [placed, setPlaced] = useState<Spot[]>([])
  const [hover, setHover] = useState<Spot | null>(null)
  const [hint, setHint] = useState(HINT[0])
  const orbs = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const live = useRef<{ placed: Spot[]; hover: Spot | null }>({ placed, hover })
  live.current = { placed, hover }

  // the paper changed (an action, undo, start over): begin again
  useEffect(() => { setPlaced([]); setHover(null); setHint(HINT[0]) }, [doc])

  const place = (s: Spot) => {
    const [first] = live.current.placed
    haptic('tick')
    if (!first) { setPlaced([s]); setHint(HINT[1]); return }
    // the same spot again takes the dot away
    if (s.panel === first.panel && dist(s.p, first.p) < 0.6) { setPlaced([]); setHint(HINT[0]); return }
    if (s.panel !== first.panel) { setPlaced([s]); setHint('both dots need to be on the same page'); return }
    setPlaced([first, s]); setHover(null); setHint(HINT[2])
  }

  useEffect(() => {
    if (!scene) return
    const canvas = scene.renderer.domElement
    // hovering: a dot follows the nearest edge under the pointer (mouse only, there's no hover on touch)
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons || live.current.placed.length >= 2) return
      const r = canvas.getBoundingClientRect()
      setHover(edgeNear(scene, e.clientX - r.left, e.clientY - r.top, 22))
    }
    const leave = () => setHover(null)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    // a press near an edge drops a dot there; anywhere else still turns the paper round
    let pending: Spot | null = null
    scene.handlers = {
      toolStart: p => {
        if (live.current.placed.length >= 2) return false
        pending = edgeNear(scene, p.x, p.y, 26)
        return !!pending
      },
      toolMove: () => {},
      toolEnd: () => { const s = pending; pending = null; if (s) place(s) },
      toolCancel: () => { pending = null },
    }
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      scene.handlers = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  // keep the dots and the Cut / Fold menu pinned to the paper as it moves
  useEffect(() => {
    if (!scene) return
    return scene.on('frame', () => {
      const els = orbs.current?.children
      if (!els) return
      const { placed: ps, hover: h } = live.current
      const spots = h ? [...ps, h] : ps
      for (let i = 0; i < els.length && i < spots.length; i++) {
        const s = scene.flatToScreen(spots[i].panel, spots[i].p)
        ;(els[i] as HTMLElement).style.transform = `translate(${s[0]}px, ${s[1]}px)`
      }
      if (pop.current && ps.length === 2) {
        const s = scene.flatToScreen(ps[0].panel, lerp2(ps[0].p, ps[1].p, 0.5))
        pop.current.style.transform = `translate(${s[0]}px, ${s[1]}px)`
      }
    })
  }, [scene])

  // the line: drawn between the two dots, or from the first dot to wherever the pointer is on the edge
  useEffect(() => {
    if (!scene) return
    const [a, b] = placed
    const end = b ?? (a && hover && hover.panel === a.panel ? hover : null)
    scene.setCreaseMarks(marks(doc.creases, a && end ? { panel: a.panel, a: a.p, b: end.p, color: '#1A1A1A' } : null))
  }, [scene, doc, placed, hover])
  useEffect(() => () => scene?.setCreaseMarks([]), [scene])

  const cancel = () => { haptic('tick'); setPlaced([]); setHint(HINT[0]) }

  const act = (kind: Kind) => {
    if (!scene || placed.length < 2) return
    const [{ panel, p: A }, { p: B }] = placed
    if (kind === 'fold') {
      const res = applyFold(derive(doc, { edges: true }), doc, scene, panel, A, B)
      if (!res || 'error' in res) { haptic('firm'); useApp.getState().showToast(res ? BLOCKED[res.error] : 'Put the dots on two different edges'); return }
      commit(res.doc); haptic('medium'); sfx('crease')
    } else {
      // run the cut a little past both dots so it goes right through the edge
      const u = norm(sub(B, A))
      const A2: Vec2 = [A[0] - u[0] * 1.2, A[1] - u[1] * 1.2], B2: Vec2 = [B[0] + u[0] * 1.2, B[1] + u[1] * 1.2]
      const res = applyCut(scene, doc, panel, cutPath('straight', A2, B2, [A2, B2], 0, 1, true), false)
      if (!res) { haptic('firm'); useApp.getState().showToast('Put the dots on two different edges'); return }
      scene.dropPieces(res.pieces); commit(res.doc); haptic('tap'); sfx('snip')
    }
  }

  const shown = hover ? [...placed, hover] : placed
  return (
    <>
      <div className={`ex-orbs ${hover ? 'on-edge' : ''}`} ref={orbs}>
        {shown.map((s, i) => (
          <span key={i < placed.length ? `placed${i}` : 'hover'} className={`fold-handle ex-orb ${i < placed.length ? 'active' : ''}`} aria-hidden>
            <span className="fh-core" />
          </span>
        ))}
      </div>
      {placed.length === 2 && (
        <div className="ex-pop" ref={pop}>
          <div className="ex-pop-card">
            <button className="ex-cut" onClick={() => act('cut')}>Cut</button>
            <button className="ex-fold" onClick={() => act('fold')}>Fold</button>
            <IconBtn name="x" label="Cancel" onClick={cancel} size={16} />
          </div>
        </div>
      )}
      <div className="ex-hint hint-text" key={hint}>{hint}</div>
    </>
  )
}

// ---------------------------------------------------------------- the layer

export default function Explorations() {
  const which = useExploration(s => s.which)
  if (!which) return null
  const screen = which === 'cut1' ? <Measured /> : which === 'cut2' ? <DotToDot /> : which === 'read1' ? <PageByPage />
    : which === 'read2' ? <TapThrough /> : which === 'com1' ? <StartCommunity /> : <KeepItGoing />
  return <div className="explore-layer" key={which}>{screen}</div>
}

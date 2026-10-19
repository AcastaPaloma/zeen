import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/feedback'
import { centroid } from '../lib/geom'
import { flatToPage } from '../lib/paper'
import type { Side, Surface, Vec2, ZineDoc, ZObject } from '../lib/types'
import type { ZineScene } from '../three/ZineScene'
import { IconBtn, PillGroup } from '../ui/kit'
import { objectAt, transformObject } from './collageUtil'
import { useEditor } from './editor'

/** The whole zine unfolded flat, front and back, with page numbers. Scraps and text can be moved here. */
export function SpreadView({ scene, doc, onClose, onJump, onMove }: {
  scene: ZineScene; doc: ZineDoc; onClose: () => void; onJump: (panel: string, side: Side) => void; onMove: (objects: ZObject[], label: string) => void
}) {
  const surfaces = doc.surfaces.filter(s => scene.d.surfaces.has(s.id))
  return (
    <div className="spread-view" role="dialog" aria-label="Spread view">
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="x" label="Close spread" onClick={onClose} /></PillGroup>
        <div className="grow sv-title">Spread</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="sv-scroll scroll">
        {surfaces.map(s => (['front', 'back'] as Side[]).map(side => (
          <SpreadSide key={`${s.id}:${side}`} scene={scene} doc={doc} surface={s} side={side} onJump={onJump} onMove={onMove} />
        )))}
        <p className="sheet-tip" style={{ textAlign: 'center' }}>Tap a page to jump in. Drag scraps and text to line them up across creases.</p>
      </div>
    </div>
  )
}

function SpreadSide({ scene, doc, surface, side, onJump, onMove }: {
  scene: ZineScene; doc: ZineDoc; surface: Surface; side: Side; onJump: (panel: string, side: Side) => void; onMove: (objects: ZObject[], label: string) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(340)
  const drag = useRef<{ id: string; base: ZObject; start: Vec2; moved: boolean } | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const f = surface.frame
  const scale = w / f.w
  const h = f.h * scale

  useEffect(() => {
    const el = ref.current?.parentElement
    if (el) setW(Math.min(el.clientWidth, 520))
  }, [])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = ref.current
      const t = scene.tex.get(surface.id)
      if (!c || !t) return
      const dpr = Math.min(2, window.devicePixelRatio)
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
      const ctx = c.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
      // clip to the paper outline (in page coords for this side)
      const ol = scene.d.outlines.get(surface.id) ?? surface.outline
      ctx.save()
      ctx.beginPath()
      for (const poly of ol) for (const ring of poly) ring.forEach((p, i) => { const q = flatToPage(f, side, p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]) })
      ctx.closePath()
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8 / scale; ctx.shadowOffsetY = 2 / scale
      ctx.fillStyle = '#fff'
      ctx.fill('evenodd')
      ctx.shadowColor = 'transparent'
      ctx.clip('evenodd')
      ctx.drawImage(t[side].canvas, 0, 0, f.w, f.h)
      ctx.restore()
      // creases
      ctx.setLineDash([0.25, 0.2])
      ctx.lineWidth = 1.2 / scale
      for (const k of docRef.current.creases) {
        const P = scene.d.panels.get(k.panel)
        if (!P || P.surface !== surface.id || k.leaf) continue
        const a = flatToPage(f, side, k.a), b = flatToPage(f, side, k.b)
        ctx.strokeStyle = k.dir > 0 ? 'rgba(92,92,227,0.85)' : 'rgba(255,73,52,0.85)'
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      }
      ctx.setLineDash([])
      // page numbers
      for (const P of scene.d.list) {
        if (P.surface !== surface.id || !P.region.length) continue
        const n = scene.pageOf(P.id, side)
        if (!n) continue
        const c0 = flatToPage(f, side, centroid(P.region))
        const r = 0.55
        ctx.fillStyle = 'rgba(26,26,26,0.82)'
        ctx.beginPath(); ctx.arc(c0[0], c0[1], r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `600 ${0.55}px DM Sans, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(n), c0[0], c0[1] + 0.02)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [scene, surface, side, w, h, scale, f])

  const toPage = (e: React.PointerEvent): Vec2 => {
    const r = ref.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]
  }

  return (
    <div className="sv-side">
      <div className="sv-label">{surface.kind === 'leaf' ? 'Added page' : 'Sheet'} · {side === 'front' ? 'Front' : 'Back'}</div>
      <canvas ref={ref} style={{ width: w, height: h, touchAction: 'none' }}
        onPointerDown={e => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          const p = toPage(e)
          const o = objectAt(docRef.current, surface.id, side, p)
          if (o && o.kind !== 'ink') { drag.current = { id: o.id, base: o, start: p, moved: false }; useEditor.getState().select(o.id); haptic('tick') }
          else drag.current = { id: '', base: null as unknown as ZObject, start: p, moved: false }
        }}
        onPointerMove={e => {
          const d = drag.current
          if (!d) return
          const p = toPage(e)
          const dx = p[0] - d.start[0], dy = p[1] - d.start[1]
          if (!d.moved && Math.hypot(dx, dy) < 0.15) return
          d.moved = true
          if (!d.id) return
          const moved = transformObject(d.base, { dx, dy })
          const cur = docRef.current
          useEditor.getState().live({ ...cur, objects: cur.objects.map(o => (o.id === d.id ? moved : o)) })
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (!d) return
          if (d.moved && d.id) { onMove(docRef.current.objects, 'Move'); return }
          if (!d.moved) {
            const panel = scene.panelAt(surface.id, side, d.start)
            if (panel) onJump(panel, side)
          }
        }} />
    </div>
  )
}

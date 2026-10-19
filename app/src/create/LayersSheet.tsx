import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { drawStroke, drawText, layoutText } from '../lib/compose'
import { haptic } from '../lib/feedback'
import type { InkObj, TextObj, ZineDoc, ZObject } from '../lib/types'
import { Icon, type IconName } from '../ui/Icon'
import { Chip, Sheet } from '../ui/kit'
import './collage-sheets.css'

const TH = 96 // thumb canvas px

/** Small rendering of a text or ink object for its layer row. */
const LayerThumb = memo(function LayerThumb({ o }: { o: ZObject }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || o.kind === 'scrap') return
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, TH, TH)
    if (o.kind === 'text') {
      const L = layoutText(o)
      const k = Math.min((TH * 0.9) / Math.max(0.01, L.w), (TH * 0.9) / Math.max(0.01, L.h))
      ctx.translate(TH / 2, TH / 2)
      ctx.scale(k, k)
      drawText(ctx, { ...(o as TextObj), x: 0, y: 0, rot: 0, scale: 1 })
      return
    }
    const ink = o as InkObj
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const s of ink.strokes) for (let i = 0; i < s.pts.length; i += 2) {
      x0 = Math.min(x0, s.pts[i] - s.size); x1 = Math.max(x1, s.pts[i] + s.size)
      y0 = Math.min(y0, s.pts[i + 1] - s.size); y1 = Math.max(y1, s.pts[i + 1] + s.size)
    }
    if (!isFinite(x0)) return
    const k = Math.min((TH * 0.86) / Math.max(0.01, x1 - x0), (TH * 0.86) / Math.max(0.01, y1 - y0))
    ctx.translate(TH / 2, TH / 2)
    ctx.scale(k, k)
    ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
    for (const s of ink.strokes) drawStroke(ctx, s, { time: 0, animate: false })
  }, [o])
  if (o.kind === 'scrap') return <img className="layer-thumb" src={o.src} alt="" draggable={false} />
  return <canvas className="layer-thumb" ref={ref} width={TH} height={TH} />
})

const typeIcon: Record<ZObject['kind'], IconName> = { scrap: 'image', text: 'text', ink: 'edit' }

function LayerRow({ o, selected, pages, clipped, onSelect, onToggle, onRename, onDelete, onGrip, dragY, shift }: {
  o: ZObject; selected: boolean; pages: number[]; clipped: boolean
  onSelect: () => void; onToggle: (k: 'hidden' | 'locked') => void; onRename: (n: string) => void; onDelete: () => void
  onGrip: (e: React.PointerEvent) => void; dragY: number | null; shift: number
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(o.name)
  const [open, setOpen] = useState(false) // swiped to reveal delete
  const sw = useRef<{ x: number; dx: number; t: number } | null>(null)
  const press = useRef(0)
  const [dx, setDx] = useState(0)
  useEffect(() => setName(o.name), [o.name])
  const style: React.CSSProperties = dragY !== null
    ? { transform: `translateY(${dragY}px) scale(1.02)`, zIndex: 5, boxShadow: 'var(--shadow-2)', transition: 'none' }
    : { transform: `translateY(${shift}px)` }
  return (
    <li className={`layer-row ${selected ? 'sel' : ''} ${o.hidden ? 'is-hidden' : ''}`} style={style}>
      <button className="lr-delete" onClick={onDelete} aria-label={`Delete ${o.name}`}><Icon name="trash" size={18} /><span>Delete</span></button>
      <div className="lr-main" style={{ transform: `translateX(${open ? -84 : dx}px)`, transition: sw.current ? 'none' : undefined }}
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest('button,input')) return
          sw.current = { x: e.clientX, dx: 0, t: performance.now() }
          press.current = window.setTimeout(() => { haptic('firm'); setRenaming(true); sw.current = null }, 520)
        }}
        onPointerMove={e => {
          const s = sw.current
          if (!s) return
          s.dx = Math.min(0, e.clientX - s.x + (open ? -84 : 0))
          if (Math.abs(e.clientX - s.x) > 6) clearTimeout(press.current)
          setDx(s.dx)
        }}
        onPointerUp={() => {
          clearTimeout(press.current)
          const s = sw.current
          sw.current = null
          setDx(0)
          if (!s) return
          if (Math.abs(s.dx) < 6 && performance.now() - s.t < 400) { if (open) setOpen(false); else onSelect(); return }
          setOpen(s.dx < -50)
        }}
        onPointerCancel={() => { clearTimeout(press.current); sw.current = null; setDx(0) }}>
        <span className="lr-grip" onPointerDown={e => { e.stopPropagation(); onGrip(e) }} aria-label="Drag to reorder" role="button"><Icon name="grid" size={16} /></span>
        <LayerThumb o={o} />
        <span className="lr-name">
          {renaming
            ? <input className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)}
                onBlur={() => { setRenaming(false); if (name.trim() && name !== o.name) onRename(name.trim()) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            : <><Icon name={typeIcon[o.kind]} size={13} /> {o.name}</>}
          {clipped && <em className="lr-clip">Clipped</em>}
        </span>
        <span className="lr-pages">{pages.length ? pages.map(p => `p${p}`).join(', ') : '—'}</span>
        <button className={`lr-tog ${o.hidden ? 'off' : ''}`} aria-label={o.hidden ? 'Show layer' : 'Hide layer'} onClick={() => onToggle('hidden')}><Icon name={o.hidden ? 'eyeOff' : 'eye'} size={17} /></button>
        <button className={`lr-tog ${o.locked ? 'on' : ''}`} aria-label={o.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => onToggle('locked')}><Icon name={o.locked ? 'lock' : 'unlock'} size={17} /></button>
      </div>
    </li>
  )
}

const ROW_H = 72

export function LayersSheet({ open, onClose, doc, selected, onSelect, onChange, pagesOf, isClipped }: {
  open: boolean; onClose: () => void; doc: ZineDoc; selected: string | null; onSelect: (id: string) => void
  onChange: (objects: ZObject[], label: string) => void; pagesOf: (o: ZObject) => number[]; isClipped: (o: ZObject) => boolean
}) {
  const [filter, setFilter] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: string; y0: number; dy: number; from: number } | null>(null)
  const pages = useMemo(() => new Map(doc.objects.map(o => [o.id, pagesOf(o)])), [doc.objects, pagesOf])
  const allPages = useMemo(() => [...new Set([...pages.values()].flat())].sort((a, b) => a - b), [pages])
  // display order is top of the stack first
  const rows = useMemo(() => doc.objects.slice().reverse().filter(o => filter === null || pages.get(o.id)?.includes(filter)), [doc.objects, filter, pages])

  const target = drag ? Math.max(0, Math.min(rows.length - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1

  const endDrag = () => {
    if (!drag) return
    const from = drag.from, to = target
    setDrag(null)
    if (from === to) return
    const ids = rows.map(r => r.id)
    const [m] = ids.splice(from, 1)
    ids.splice(to, 0, m)
    // the visible rows take the stack slots they occupied, in their new order (top first)
    const slots = doc.objects.map((o, i) => (rows.some(r => r.id === o.id) ? i : -1)).filter(i => i >= 0).reverse()
    const next = doc.objects.slice()
    ids.forEach((id, k) => { next[slots[k]] = doc.objects.find(o => o.id === id)! })
    haptic('tap')
    onChange(next, 'Reorder layers')
  }

  const update = (id: string, p: Partial<ZObject>, label: string) => onChange(doc.objects.map(o => (o.id === id ? ({ ...o, ...p } as ZObject) : o)), label)

  return (
    <Sheet open={open} onClose={onClose} title="Layers" height="half" className="layers-sheet">
      {allPages.length > 1 && (
        <div className="layer-filter hscroll">
          <Chip active={filter === null} onClick={() => setFilter(null)}>All</Chip>
          {allPages.map(p => <Chip key={p} active={filter === p} onClick={() => setFilter(f => (f === p ? null : p))}>Page {p}</Chip>)}
        </div>
      )}
      {rows.length === 0 && <p className="scrap-empty">Nothing here yet. Draw, write or stick something on the page.</p>}
      <ul className="layer-list"
        onPointerMove={e => { if (drag) setDrag({ ...drag, dy: e.clientY - drag.y0 }) }}
        onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
        {rows.map((o, i) => {
          let shift = 0
          if (drag && i !== drag.from) {
            if (drag.from < target && i > drag.from && i <= target) shift = -ROW_H
            if (drag.from > target && i < drag.from && i >= target) shift = ROW_H
          }
          return (
            <LayerRow key={o.id} o={o} selected={selected === o.id} pages={pages.get(o.id) ?? []} clipped={isClipped(o)}
              dragY={drag?.id === o.id ? drag.dy : null} shift={shift}
              onSelect={() => { haptic('tick'); onSelect(o.id) }}
              onToggle={k => { haptic('tick'); update(o.id, { [k]: !o[k] } as Partial<ZObject>, k === 'hidden' ? (o.hidden ? 'Show layer' : 'Hide layer') : (o.locked ? 'Unlock layer' : 'Lock layer')) }}
              onRename={n => update(o.id, { name: n }, 'Rename layer')}
              onDelete={() => { haptic('tap'); onChange(doc.objects.filter(x => x.id !== o.id), 'Delete layer') }}
              onGrip={e => {
                const ul = (e.currentTarget as HTMLElement).closest('ul') as HTMLElement
                ul.setPointerCapture(e.pointerId)
                haptic('tick')
                setDrag({ id: o.id, y0: e.clientY, dy: 0, from: i })
              }} />
          )
        })}
      </ul>
    </Sheet>
  )
}

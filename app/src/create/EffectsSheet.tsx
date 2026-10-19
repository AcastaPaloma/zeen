import { useEffect, useMemo, useRef, useState } from 'react'
import { applyEffects, EFFECTS } from '../lib/effects'
import { haptic } from '../lib/feedback'
import { uid } from '../lib/geom'
import type { Effect, EffectType } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Segmented, Sheet, Slider } from '../ui/kit'
import './collage-sheets.css'

type Scope = 'scrap' | 'page' | 'zine'
const PX = 168 // preview tile size in device px (84pt @2x)

function square(src: HTMLCanvasElement | null) {
  const c = document.createElement('canvas')
  c.width = PX; c.height = PX
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#F4F2EE'
  ctx.fillRect(0, 0, PX, PX)
  if (src && src.width && src.height) {
    // cover-crop the centre
    const s = Math.max(PX / src.width, PX / src.height)
    ctx.drawImage(src, (PX - src.width * s) / 2, (PX - src.height * s) / 2, src.width * s, src.height * s)
  }
  return c
}

export function EffectsSheet({ open, onClose, effects, onChange, scopes, getPreview }: {
  open: boolean; onClose: () => void; effects: Effect[]; onChange: (e: Effect[], label: string) => void
  scopes: { scrap?: string; page?: string }; getPreview: () => HTMLCanvasElement | null
}) {
  const [scope, setScope] = useState<Scope>(scopes.scrap ? 'scrap' : scopes.page ? 'page' : 'zine')
  const [previews, setPreviews] = useState<{ base: string; fx: Record<string, string> } | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const swipe = useRef<{ id: string; x: number; dx: number } | null>(null)
  const [swipeDx, setSwipeDx] = useState<{ id: string; dx: number } | null>(null)

  // reset scope + compute filter previews once per open
  useEffect(() => {
    if (!open) { setPreviews(null); setActive(null); return }
    setScope(scopes.scrap ? 'scrap' : scopes.page ? 'page' : 'zine')
    const t = setTimeout(() => {
      const base = square(getPreview())
      const fx: Record<string, string> = {}
      for (const e of EFFECTS) {
        const c = document.createElement('canvas')
        c.width = PX; c.height = PX
        c.getContext('2d')!.drawImage(base, 0, 0)
        applyEffects(c, [{ type: e.type, amount: 0.7 }])
        fx[e.type] = c.toDataURL('image/jpeg', 0.85)
      }
      setPreviews({ base: base.toDataURL('image/jpeg', 0.85), fx })
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const target = scope === 'scrap' ? scopes.scrap : scope === 'page' ? scopes.page : undefined
  const inScope = (e: Effect) => e.scope === scope && (scope === 'zine' || e.target === target)
  const stack = useMemo(() => effects.filter(inScope), [effects, scope, target]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeFx = stack.find(e => e.id === active) ?? null

  const tap = (type: EffectType) => {
    const existing = stack.find(e => e.type === type)
    haptic('tick')
    if (existing) { setActive(a => (a === existing.id ? null : existing.id)); return }
    const e: Effect = { id: uid('e'), type, amount: 0.6, scope, target }
    onChange([...effects, e], `${EFFECTS.find(x => x.type === type)?.label ?? 'Effect'}`)
    setActive(null)
  }
  const clearScope = () => { haptic('tap'); onChange(effects.filter(e => !inScope(e)), 'Remove effects'); setActive(null) }
  const remove = (id: string) => { haptic('tap'); onChange(effects.filter(e => e.id !== id), 'Remove effect'); if (active === id) setActive(null) }
  const move = (id: string, d: -1 | 1) => {
    const ids = stack.map(e => e.id)
    const i = ids.indexOf(id), j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    // rebuild: keep other scopes where they were, splice this scope's stack in its new order
    const ordered = ids.map(x => effects.find(e => e.id === x)!)
    let k = 0
    onChange(effects.map(e => (inScope(e) ? ordered[k++] : e)), 'Reorder effects')
    haptic('tick')
  }

  const scopeOpts = [
    ...(scopes.scrap ? [{ value: 'scrap' as Scope, label: 'Selected scrap' }] : []),
    ...(scopes.page ? [{ value: 'page' as Scope, label: 'This page' }] : []),
    { value: 'zine' as Scope, label: 'Whole zine' },
  ]

  return (
    <Sheet open={open} onClose={onClose} title="Effects" height="auto" className="fx-sheet">
      {scopeOpts.length > 1 && <Segmented value={scope} options={scopeOpts} onChange={s => { setScope(s); setActive(null) }} />}
      <div className="fx-strip hscroll" role="listbox" aria-label="Effects">
        <button className={`fx-tile ${stack.length === 0 ? 'on' : ''}`} onClick={clearScope} role="option" aria-selected={stack.length === 0}>
          <span className="fx-img">{previews ? <img src={previews.base} alt="" /> : <span className="fx-ph" />}</span>
          <span>Original</span>
        </button>
        {EFFECTS.map(e => {
          const applied = stack.find(x => x.type === e.type)
          return (
            <button key={e.type} className={`fx-tile ${applied ? 'on' : ''} ${applied && active === applied.id ? 'editing' : ''}`}
              onClick={() => tap(e.type)} role="option" aria-selected={!!applied}>
              <span className="fx-img">
                {previews ? <img src={previews.fx[e.type]} alt="" /> : <span className="fx-ph" />}
                {applied && <span className="fx-amt">{Math.round(applied.amount * 100)}</span>}
              </span>
              <span>{e.label}</span>
            </button>
          )
        })}
      </div>
      <div className={`fx-slider ${activeFx ? 'on' : ''}`}>
        {activeFx && (
          <Slider label={EFFECTS.find(x => x.type === activeFx.type)?.label} value={Math.round(activeFx.amount * 100)}
            onChange={v => onChange(effects.map(e => (e.id === activeFx.id ? { ...e, amount: v / 100 } : e)), 'Effect strength')}
            format={v => `${v}`} />
        )}
        {!activeFx && <p className="fx-tip">{stack.length ? 'Tap an applied effect again to change its strength.' : 'Tap a look to apply it. Effects stack.'}</p>}
      </div>
      {stack.length > 0 && (
        <>
          <h4 className="scrap-h">Stack <span className="muted">top runs last</span></h4>
          <ol className="fx-stack">
            {stack.map((e, i) => (
              <li key={e.id}
                style={swipeDx?.id === e.id ? { transform: `translateX(${swipeDx.dx}px)`, transition: 'none' } : undefined}
                onPointerDown={ev => { swipe.current = { id: e.id, x: ev.clientX, dx: 0 } }}
                onPointerMove={ev => {
                  const s = swipe.current
                  if (!s || s.id !== e.id) return
                  s.dx = Math.min(0, ev.clientX - s.x)
                  if (s.dx < -6) setSwipeDx({ id: e.id, dx: s.dx })
                }}
                onPointerUp={() => { const s = swipe.current; swipe.current = null; setSwipeDx(null); if (s && s.dx < -90) remove(e.id) }}
                onPointerCancel={() => { swipe.current = null; setSwipeDx(null) }}>
                <span className="fx-dot" />
                <button className="fx-name" onClick={() => setActive(a => (a === e.id ? null : e.id))}>{EFFECTS.find(x => x.type === e.type)?.label}</button>
                <small>{Math.round(e.amount * 100)}%</small>
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(e.id, -1)}><Icon name="up" size={16} /></button>
                <button aria-label="Move down" disabled={i === stack.length - 1} onClick={() => move(e.id, 1)}><Icon name="down" size={16} /></button>
                <button aria-label="Remove effect" onClick={() => remove(e.id)}><Icon name="x" size={16} /></button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Sheet>
  )
}

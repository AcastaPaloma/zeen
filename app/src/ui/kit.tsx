import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { loadImage } from '../lib/assets'
import { BAYER_TILE, DITHER_CELL, DITHER_LEVELS, ditherPixels } from '../lib/dither'
import { haptic } from '../lib/feedback'
import { clamp } from '../lib/geom'
import { useApp } from '../lib/store'
import { Icon, type IconName } from './Icon'

export function PillGroup({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`pill-group ${className}`} style={style}>{children}</div>
}

export function IconBtn({ name, onClick, label, active, disabled, size = 20, className = '', badge }: {
  name: IconName; onClick?: () => void; label: string; active?: boolean; disabled?: boolean; size?: number; className?: string; badge?: string | number
}) {
  return (
    <button className={`icon-btn ${active ? 'active' : ''} ${className}`} onClick={onClick} aria-label={label} title={label} disabled={disabled} aria-pressed={active}>
      <Icon name={name} size={size} />
      {badge !== undefined && <span className="icon-badge">{badge}</span>}
    </button>
  )
}

export function CheckBtn({ onClick, color = 'var(--accent)', label = 'Done', icon = 'check' }: { onClick: () => void; color?: string; label?: string; icon?: IconName }) {
  return (
    <button className="check-btn" style={{ background: color }} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} size={20} stroke={2.4} />
    </button>
  )
}

export function Button({ children, onClick, kind = 'primary', className = '', disabled, icon, style }: {
  children?: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'dark' | 'ghost'; className?: string; disabled?: boolean; icon?: IconName; style?: CSSProperties
}) {
  return (
    <button className={`btn btn-${kind} ${className}`} onClick={onClick} disabled={disabled} style={style}>
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  )
}

export function Chip({ children, active, onClick, color }: { children: ReactNode; active?: boolean; onClick?: () => void; color?: string }) {
  return <button className={`chip ${active ? 'active' : ''}`} onClick={onClick} style={color ? { '--chip-c': color } as CSSProperties : undefined}>{children}</button>
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string
}) {
  const i = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className={`segmented ${className}`} role="tablist" style={{ '--n': options.length, '--i': i } as CSSProperties}>
      <span className="seg-thumb" />
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''}
          onClick={() => { if (o.value !== value) { haptic('tick'); onChange(o.value) } }}>{o.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => { haptic('tick'); onChange(!on) }}>
      <span />
    </button>
  )
}

export function Row({ label, children, sub }: { label: ReactNode; children?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">{label}{sub && <small>{sub}</small>}</div>
      <div className="row-ctl">{children}</div>
    </div>
  )
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, onCommit, label, format, accent }: {
  value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void; label?: string; format?: (v: number) => string; accent?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      {label && <span className="slider-label">{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        style={{ '--pct': `${pct}%`, '--acc': accent ?? 'var(--accent)' } as CSSProperties}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={e => onCommit?.(Number((e.target as HTMLInputElement).value))} />
      {format && <span className="slider-val">{format(value)}</span>}
    </label>
  )
}

/** Vertical slider from the Figma frames: + / − ends with a ring knob. */
export function VSlider({ value, onChange, label, variant = 'zoom', onEnd }: {
  value: number; onChange: (v: number) => void; label: string; variant?: 'zoom' | 'gradient'; onEnd?: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const set = (clientY: number) => {
    const r = track.current!.getBoundingClientRect()
    onChange(clamp(1 - (clientY - r.top) / r.height, 0, 1))
  }
  return (
    <div className={`vslider vslider-${variant}`} role="slider" aria-label={label} aria-valuenow={Math.round(value * 100)} tabIndex={0}
      onKeyDown={e => { if (e.key === 'ArrowUp') onChange(clamp(value + 0.05, 0, 1)); if (e.key === 'ArrowDown') onChange(clamp(value - 0.05, 0, 1)) }}>
      {variant === 'zoom' && <button className="vs-end" aria-label="More" onClick={() => onChange(clamp(value + 0.1, 0, 1))}><Icon name="plus" size={16} /></button>}
      <div className="vs-track" ref={track}
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); set(e.clientY) }}
        onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') set(e.clientY) }}
        onPointerUp={() => onEnd?.()}>
        <div className="vs-rail" />
        <div className="vs-knob" style={{ top: `${(1 - value) * 100}%` }} />
      </div>
      {variant === 'zoom' && <button className="vs-end" aria-label="Less" onClick={() => onChange(clamp(value - 0.1, 0, 1))}><Icon name="minus" size={16} /></button>}
    </div>
  )
}

/** Horizontal tick ruler that scrubs between keyframes. Notches snap with a tick. */
// Ruler drawn from the Figma export "Group 82.svg": 240 x 15 units, a tick every 4.499 units,
// keyframes as darker ticks, and a fixed playhead in the middle the ticks scroll under. At rest it
// is exactly the export. Touching it behaves like the Photos adjust dial: the ticks around the
// playhead swell, the playhead turns accent, ticks past the first and last frame fall away, dots
// mark the frames, it rubber-bands past the ends, and a flick coasts before settling on a frame.
const R_TICK = 4.49899
const R_ORIGIN = 0.488525 // first tick at rest
const R_ZERO = 27 // the tick the playhead sits on at rest (the playhead replaces it)
const R_KF_GAP = 8 // ticks between keyframes
const R_HEAD = 121.665
const R_BASE = 14.1695 // tick bottom
const R_SHORT = 5.86335 // resting tick height
const R_TALL = 13.68073 // playhead height

/** Resistance past either end: grows ever slower, never past `limit`. */
const rubber = (x: number, limit = 0.45) => Math.sign(x) * limit * (1 - 1 / (Math.abs(x) * 1.6 / limit + 1))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function Ruler({ value, count, onChange, onRelease, dimmed }: {
  value: number; count: number; onChange: (v: number) => void; onRelease?: (v: number) => void; dimmed?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const span = Math.max(1, count - 1)
  const [act, setAct] = useState(0) // 0 at rest, 1 while touched
  const [stretch, setStretch] = useState(0) // overscroll shown past the ends, in keyframes
  const drag = useRef<{ x: number; v: number; samples: { t: number; v: number }[] } | null>(null)
  const anim = useRef(0)
  const actAnim = useRef(0)
  const lastKf = useRef(Math.round(value))
  const cb = useRef({ onChange, onRelease })
  useLayoutEffect(() => { cb.current = { onChange, onRelease } })

  const actNow = useRef(0)
  const fadeAct = (to: number, delay = 0) => {
    cancelAnimationFrame(actAnim.current)
    const from = actNow.current
    const dur = to > from ? 140 : 320
    const start = performance.now() + delay
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / dur))
      actNow.current = from + (to - from) * easeOut(k)
      setAct(actNow.current)
      if (k < 1) actAnim.current = requestAnimationFrame(step)
    }
    actAnim.current = requestAnimationFrame(step)
  }
  useEffect(() => () => { cancelAnimationFrame(anim.current); cancelAnimationFrame(actAnim.current) }, [])

  const emit = (v: number) => {
    const k = Math.round(v)
    if (Math.abs(v - k) < 0.02 && k !== lastKf.current) { haptic('tick'); lastKf.current = k }
    cb.current.onChange(v)
  }

  /** Glide from `from` to keyframe `to` (and ease any overscroll back), then report the landing. */
  const settle = (from: number, to: number, stretchFrom: number) => {
    cancelAnimationFrame(anim.current)
    const dist = Math.abs(to - from) + Math.abs(stretchFrom)
    const dur = Math.min(700, 240 + dist * 160)
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = easeOut(k)
      emit(from + (to - from) * e)
      setStretch(stretchFrom * (1 - e))
      if (k < 1) anim.current = requestAnimationFrame(step)
      else { setStretch(0); cb.current.onRelease?.(to); fadeAct(0, 120) }
    }
    anim.current = requestAnimationFrame(step)
  }

  const toV = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const d = drag.current!
    // the ticks follow the finger: dragging left moves later keyframes under the playhead
    const units = ((clientX - d.x) / r.width) * 240
    return d.v - units / (R_KF_GAP * R_TICK)
  }

  // ticks (in track units: j counts from the first tick at rest)
  const shown = value + stretch
  const shift = shown * R_KF_GAP * R_TICK
  const ticks: { x: number; h: number; o: number; kf: boolean }[] = []
  for (let j = Math.ceil((shift - R_TICK * 2) / R_TICK); ; j++) {
    const x = R_ORIGIN + j * R_TICK - shift
    if (x > 239.2) break
    if (x < 0.4 || Math.abs(x - R_HEAD) < 0.6) continue
    const k = j - R_ZERO
    const inTrack = k >= 0 && k <= span * R_KF_GAP
    const kf = inTrack && k % R_KF_GAP === 0
    const near = Math.exp(-(((x - R_HEAD) / 7) ** 2))
    const edge = Math.min(1, x / 18, (240 - x) / 18)
    let o = (kf ? 0.4 : 0.2) + act * 0.5 * near
    if (!inTrack) o *= 1 - act * 0.85
    o *= 1 - act * (1 - edge)
    ticks.push({ x, h: R_SHORT + act * (R_TALL - R_SHORT) * near * 0.95, o, kf })
  }

  return (
    <div className={`ruler ${dimmed ? 'dimmed' : ''}`} ref={ref} role="slider" aria-label="Unfold sequence" aria-valuemin={0} aria-valuemax={span} aria-valuenow={value} tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { const v = Math.min(span, Math.floor(value) + 1); onChange(v); onRelease?.(v) }
        if (e.key === 'ArrowLeft') { const v = Math.max(0, Math.ceil(value) - 1); onChange(v); onRelease?.(v) }
      }}
      onPointerDown={e => {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        cancelAnimationFrame(anim.current)
        const v = clamp(value + stretch, 0, span)
        drag.current = { x: e.clientX, v: value + stretch, samples: [{ t: performance.now(), v }] }
        fadeAct(1)
        // touching the ruler always puts the zine back on the ruler's frame
        emit(v)
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        const raw = toV(e.clientX)
        const v = clamp(raw, 0, span)
        setStretch(rubber(raw - v))
        d.samples.push({ t: performance.now(), v: raw })
        while (d.samples.length > 2 && performance.now() - d.samples[0].t > 100) d.samples.shift()
        emit(v)
      }}
      onPointerUp={() => {
        const d = drag.current
        if (!d) return
        drag.current = null
        const cur = clamp(value, 0, span)
        const a = d.samples[0], b = d.samples[d.samples.length - 1]
        const vel = b.t > a.t ? (b.v - a.v) / ((b.t - a.t) / 1000) : 0 // keyframes per second
        // coast a little in the flick's direction, then land on the nearest frame
        const target = clamp(Math.round(cur + clamp(vel, -12, 12) * 0.18), 0, span)
        settle(cur, target, stretch)
      }}
      onPointerCancel={() => { if (drag.current) { drag.current = null; settle(clamp(value, 0, span), clamp(Math.round(value), 0, span), stretch) } }}>
      <svg viewBox="0 0 240 15" fill="none" aria-hidden>
        {ticks.map(t => (
          <path key={t.x.toFixed(2)} d={`M${t.x.toFixed(4)} ${(R_BASE - t.h).toFixed(4)}L${t.x.toFixed(4)} ${R_BASE}`} stroke="black" strokeOpacity={t.o.toFixed(3)} strokeWidth="0.977228" strokeLinecap="round" />
        ))}
        {act > 0.01 && ticks.filter(t => t.kf).map(t => (
          <circle key={`d${t.x.toFixed(2)}`} cx={t.x} cy={R_BASE - t.h - 2.6} r="0.95" fill="black" fillOpacity={(0.35 * act).toFixed(3)} />
        ))}
        <path d={`M${R_HEAD} 0.48877L${R_HEAD} ${R_BASE}`} stroke="black" strokeOpacity={(0.5 * (1 - act)).toFixed(3)} strokeWidth="0.977228" strokeLinecap="round" />
        {act > 0.01 && <path d={`M${R_HEAD} 0.48877L${R_HEAD} ${R_BASE}`} stroke="var(--accent)" strokeOpacity={act.toFixed(3)} strokeWidth="1.2" strokeLinecap="round" />}
      </svg>
    </div>
  )
}

export function Sheet({ open, onClose, children, title, height = 'auto', className = '', dim = false, noGrab, header, from = null, keep = false }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; height?: 'auto' | 'half' | 'tall' | 'full'; className?: string; dim?: boolean; noGrab?: boolean; header?: ReactNode
  /**
   * Grow out of a field elsewhere on screen (client y of its top edge): the sheet starts as just its own
   * header field, sitting exactly on that one, then rises and unfolds; closing folds back into it.
   */
  from?: number | null
  /** stay in the page (offscreen) while closed, so a tap can focus a field inside it straight away */
  keep?: boolean
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [dy, setDy] = useState(0)
  const start = useRef<{ y: number; t: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(open)

  // growing out of / folding back into a field: set the folded pose inline, then let CSS carry it to the open one
  useLayoutEffect(() => {
    const el = box.current
    const was = wasOpen.current
    wasOpen.current = open
    if (!el || from === null || open === was) return
    const head = el.querySelector<HTMLElement>('.sheet-head')
    const field = head?.firstElementChild as HTMLElement | null
    if (!head || !field) return
    const parent = el.offsetParent?.getBoundingClientRect().top ?? 0
    const top = field.getBoundingClientRect().top - el.getBoundingClientRect().top // field's offset inside the sheet
    const folded = {
      transform: `translateY(${from - top - (parent + el.offsetTop)}px)`,
      clipPath: `inset(${top}px 0 ${el.offsetHeight - top - field.offsetHeight}px 0 round 13px)`,
    }
    const openPose = { transform: 'translateY(0px)', clipPath: 'inset(0px 0 0px 0 round 20px 20px 0 0)' }
    if (open) {
      el.style.transition = 'none'
      Object.assign(el.style, folded)
      el.getBoundingClientRect()
      el.style.transition = ''
      Object.assign(el.style, openPose)
      setShown(true)
    } else {
      el.style.transition = ''
      Object.assign(el.style, folded)
    }
    // once settled, hand back to the stylesheet (closed is offscreen, so the jump is invisible)
    const t = setTimeout(() => {
      el.style.transition = 'none'
      el.style.transform = ''; el.style.clipPath = ''
      el.getBoundingClientRect()
      el.style.transition = ''
    }, 400)
    return () => clearTimeout(t)
  }, [open, from])
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))) }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 320); return () => clearTimeout(t) }
  }, [open])
  if (!mounted && !keep) return null
  const grab = {
    onPointerDown: (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, t: performance.now() } },
    onPointerMove: (e: React.PointerEvent) => { if (start.current) setDy(Math.max(0, e.clientY - start.current.y)) },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return
      const v = (e.clientY - start.current.y) / Math.max(1, performance.now() - start.current.t)
      start.current = null
      if (dy > 90 || v > 0.6) onClose()
      setDy(0)
    },
  }
  return (
    <>
      {dim && mounted && <div className={`sheet-dim ${shown ? 'on' : ''}`} onClick={onClose} />}
      <div ref={box} className={`sheet sheet-${height} ${shown ? 'on' : ''} ${className}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}
        aria-hidden={!mounted} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        {!noGrab && <div className="sheet-grab" {...grab}><span /></div>}
        {(title || header) && <div className="sheet-head" {...grab}>{header ?? <h3>{title}</h3>}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  )
}

/**
 * Sideways swipes on an area that scrolls vertically (give it touch-action: pan-y). A swipe also swallows
 * the tap it would otherwise end in, so a card under the finger doesn't open.
 */
export function useSwipe(onSwipe: (dir: 'left' | 'right') => void) {
  const g = useRef<{ x: number; y: number; t: number; id: number } | null>(null)
  const swiped = useRef(0)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      g.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = g.current
      g.current = null
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6 && performance.now() - d.t < 700) {
        swiped.current = performance.now()
        onSwipe(dx < 0 ? 'left' : 'right')
      }
    },
    onPointerCancel: () => { g.current = null },
    onClickCapture: (e: React.MouseEvent) => {
      if (performance.now() - swiped.current < 350) { e.stopPropagation(); e.preventDefault() }
    },
  }
}

/** Screen background vars for a zine's background colour: the colour itself, and dots that read on it. */
export function bgVars(bg?: string): CSSProperties {
  if (!bg) return {}
  const m = /^#?([0-9a-f]{6})$/i.exec(bg)
  const n = m ? parseInt(m[1], 16) : 0xf6f6f6
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  const dot = n === 0xf6f6f6 ? undefined : lum > 0.45 ? `color-mix(in srgb, ${bg} 82%, #3D4D63)` : `color-mix(in srgb, ${bg} 80%, #FFFFFF)`
  return { '--bg': bg, ...(dot ? { '--dot': dot } : {}) } as CSSProperties
}

/**
 * Drag a bottom panel by its grabber between resting tops (fractions of the parent's height).
 * A tap on the grabber steps to the next stop; a flick carries on in its direction.
 */
export function usePanelDrag(stops: number[], initial: number) {
  const [top, setTop] = useState(initial)
  const [live, setLive] = useState<number | null>(null)
  const g = useRef<{ y0: number; top0: number; h: number; y: number; t: number; v: number; moved: boolean } | null>(null)
  const lo = Math.min(...stops), hi = Math.max(...stops)
  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      const panel = (e.currentTarget as HTMLElement).closest('[data-panel]') as HTMLElement | null
      const h = panel?.parentElement?.clientHeight ?? 1
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      g.current = { y0: e.clientY, top0: top * h, h, y: e.clientY, t: performance.now(), v: 0, moved: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = g.current
      if (!d) return
      const now = performance.now()
      d.v = d.v * 0.6 + ((e.clientY - d.y) / Math.max(1, now - d.t)) * 0.4
      d.y = e.clientY; d.t = now
      const dy = e.clientY - d.y0
      if (!d.moved && Math.abs(dy) < 4) return
      d.moved = true
      // rubber-band past the first and last stops
      const raw = d.top0 + dy, min = lo * d.h, max = hi * d.h
      const px = raw < min ? min - Math.sqrt(min - raw) * 3 : raw > max ? max + Math.sqrt(raw - max) * 3 : raw
      setLive(px)
    },
    onPointerUp: () => end(),
    onPointerCancel: () => end(),
  }
  function end() {
    const d = g.current
    g.current = null
    if (!d) return
    const sorted = [...stops].sort((x, y) => x - y)
    let next: number
    if (!d.moved) {
      // tap: open one step further; from fully open, back to where it started
      const i = sorted.findIndex(x => Math.abs(x - top) < 0.01)
      next = i <= 0 ? initial : sorted[i - 1]
    } else {
      const aim = ((live ?? d.top0) + d.v * 160) / d.h
      next = sorted.reduce((b, x) => (Math.abs(x - aim) < Math.abs(b - aim) ? x : b), sorted[0])
    }
    if (next !== top) haptic('tick')
    setTop(next)
    setLive(null)
  }
  const style: CSSProperties = live !== null ? { top: live, transition: 'none' } : { top: `${top * 100}%` }
  return { top, bind, style, dragging: live !== null }
}

/** Two-bar drag handle for panels and sheets. */
export function Grabber({ label, className = '', ...bind }: { label: string; className?: string } & Partial<ReturnType<typeof usePanelDrag>['bind']>) {
  return <div className={`grabber ${className}`} role="button" aria-label={label} {...bind}><span /></div>
}

export function Toast() {
  const toast = useApp(s => s.toast)
  const [shown, setShown] = useState<typeof toast>(null)
  useEffect(() => { if (toast) setShown(toast) }, [toast])
  return (
    <div className={`toast ${toast ? 'on' : ''}`} role="status" aria-live="polite">
      <span>{shown?.text}</span>
      {shown?.action && <button onClick={() => { shown.action!.run(); useApp.setState({ toast: null }) }}>{shown.action.label}</button>}
    </div>
  )
}

const ditherCache = new Map<string, { url: string; w: number; h: number }>()

/**
 * An image in the app's dither look (lib/dither.ts): colour, Bayer 16×16, 2 px cells, three levels.
 * It fits inside `size` (CSS px, a square or [width, height]) at whole cells, so every cell is 2 px.
 */
export function DitherImg({ src, size, className = '', alt = '', style }: {
  src: string; size: number | [number, number]; className?: string; alt?: string; style?: CSSProperties
}) {
  const [bw, bh] = typeof size === 'number' ? [size, size] : size
  const key = `${src}|${bw}x${bh}`
  const [out, setOut] = useState(ditherCache.get(key) ?? null)
  useEffect(() => {
    if (ditherCache.has(key)) { setOut(ditherCache.get(key)!); return }
    let alive = true
    loadImage(src).then(img => {
      const s = Math.min(bw / img.width, bh / img.height) / DITHER_CELL
      const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const d = ctx.getImageData(0, 0, w, h)
      ditherPixels(d)
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] < 30 ? 0 : 255
      ctx.putImageData(d, 0, 0)
      const r = { url: c.toDataURL(), w: w * DITHER_CELL, h: h * DITHER_CELL }
      ditherCache.set(key, r)
      if (alive) setOut(r)
    }).catch(() => {})
    return () => { alive = false }
  }, [key, src, bw, bh])
  return out
    ? <img src={out.url} alt={alt} className={`dither-img ${className}`} style={{ imageRendering: 'pixelated', width: out.w, height: out.h, ...style }} draggable={false} />
    : <span className={className} style={{ display: 'inline-block', width: bw, height: bh, ...style }} />
}

/** The SVG filter behind `filter: url(#zeen-dither)`: the same dither, applied to live content. */
export function DitherDefs() {
  const k = 1 / DITHER_LEVELS
  const table = Array.from({ length: DITHER_LEVELS }, (_, i) => i / (DITHER_LEVELS - 1)).join(' ')
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <filter id="zeen-dither" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        <feImage href={BAYER_TILE} x="0" y="0" width={16 * DITHER_CELL} height={16 * DITHER_CELL} preserveAspectRatio="none" result="cell" />
        <feTile in="cell" result="map" />
        {/* (levels - 1) * colour + threshold, then floor into the levels */}
        <feComposite in="SourceGraphic" in2="map" operator="arithmetic" k1="0" k2={(DITHER_LEVELS - 1) * k} k3={k} k4="0" result="mix" />
        <feComponentTransfer in="mix" result="steps">
          <feFuncR type="discrete" tableValues={table} />
          <feFuncG type="discrete" tableValues={table} />
          <feFuncB type="discrete" tableValues={table} />
        </feComponentTransfer>
        <feComposite in="steps" in2="SourceGraphic" operator="in" />
      </filter>
    </svg>
  )
}

const coverColors = new Map<string, string>()

/** The most common colour of an image (vivid colours count a little extra), for tinting around it. */
export function useDominantColor(src?: string) {
  const [color, setColor] = useState(src ? coverColors.get(src) ?? null : null)
  useEffect(() => {
    if (!src) { setColor(null); return }
    if (coverColors.has(src)) { setColor(coverColors.get(src)!); return }
    let alive = true
    loadImage(src).then(img => {
      const S = 32
      const c = document.createElement('canvas')
      c.width = S; c.height = S
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, S, S)
      const d = ctx.getImageData(0, 0, S, S).data
      const bins = new Map<number, { w: number; r: number; g: number; b: number }>()
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue
        const r = d[i], g = d[i + 1], b = d[i + 2]
        // chroma, not HSV saturation, so near-black pixels don't count as vivid
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
        const w = 0.25 + chroma * 2
        const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
        const e = bins.get(k) ?? { w: 0, r: 0, g: 0, b: 0 }
        e.w += w; e.r += r * w; e.g += g * w; e.b += b * w
        bins.set(k, e)
      }
      let best: { w: number; r: number; g: number; b: number } | null = null
      for (const e of bins.values()) if (!best || e.w > best.w) best = e
      const out = best ? `rgb(${Math.round(best.r / best.w)}, ${Math.round(best.g / best.w)}, ${Math.round(best.b / best.w)})` : '#E9E9E9'
      coverColors.set(src, out)
      if (alive) setColor(out)
    }).catch(() => {})
    return () => { alive = false }
  }, [src])
  return color
}

export function Avatar({ src, size = 28, ring }: { src: string; size?: number; ring?: boolean }) {
  return <img className={`avatar ${ring ? 'ring' : ''}`} src={src} width={size} height={size} alt="" style={{ width: size, height: size }} />
}

export function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

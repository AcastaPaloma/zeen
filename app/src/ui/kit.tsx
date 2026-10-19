import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { loadImage } from '../lib/assets'
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

export function Sheet({ open, onClose, children, title, height = 'auto', className = '', dim = false, noGrab, header }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; height?: 'auto' | 'half' | 'tall' | 'full'; className?: string; dim?: boolean; noGrab?: boolean; header?: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [dy, setDy] = useState(0)
  const start = useRef<{ y: number; t: number } | null>(null)
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))) }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 320); return () => clearTimeout(t) }
  }, [open])
  if (!mounted) return null
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
      {dim && <div className={`sheet-dim ${shown ? 'on' : ''}`} onClick={onClose} />}
      <div className={`sheet sheet-${height} ${shown ? 'on' : ''} ${className}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        {!noGrab && <div className="sheet-grab" {...grab}><span /></div>}
        {(title || header) && <div className="sheet-head" {...grab}>{header ?? <h3>{title}</h3>}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  )
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

const ditherCache = new Map<string, string>()
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Tool icons are dithered photos: grey when idle, orange when selected. */
export function DitherImg({ src, color, size, className = '', alt = '', style, scale = 2, stretch = false, colorful = false }: {
  src: string; color: string; size: number; className?: string; alt?: string; style?: CSSProperties; scale?: number
  /** spread the image's own light range across the dither, so near-white renders (blank paper) keep their shading */
  stretch?: boolean
  /** keep the image's colours: each channel is dithered to four levels instead of tinting with `color` */
  colorful?: boolean
}) {
  const key = `${src}|${color}|${size}|${scale}|${stretch}|${colorful}`
  const [url, setUrl] = useState(ditherCache.get(key) ?? '')
  useEffect(() => {
    if (ditherCache.has(key)) { setUrl(ditherCache.get(key)!); return }
    let alive = true
    loadImage(src).then(img => {
      const s = Math.min(1, (size * 2) / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const d = ctx.getImageData(0, 0, w, h)
      const m = /^#?([0-9a-f]{6})$/i.exec(color)
      const n = m ? parseInt(m[1], 16) : 0x7b7b7b
      const cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255
      let lo = 0, hi = 1
      if (stretch) {
        lo = 1; hi = 0
        for (let i = 0; i < d.data.length; i += 4) {
          if (d.data[i + 3] < 30) continue
          const l = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) / 255
          if (l < lo) lo = l; if (l > hi) hi = l
        }
        if (hi - lo < 0.02) { lo = hi - 0.2 } // flat blank paper reads as light paper
      }
      const edge = (x: number, y: number) => {
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ox, yy = y + oy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || d.data[(yy * w + xx) * 4 + 3] < 30) return true
        }
        return false
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (d.data[i + 3] < 30) { d.data[i + 3] = 0; continue }
        if (colorful) {
          const t = (BAYER[(Math.floor(y / scale) % 4) * 4 + (Math.floor(x / scale) % 4)] + 0.5) / 16
          for (let c = 0; c < 3; c++) d.data[i + c] = Math.min(3, Math.floor((d.data[i + c] / 255) * 3 + t)) * 85
          d.data[i + 3] = 255
          continue
        }
        const l0 = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) / 255
        const l = stretch ? 0.12 + ((l0 - lo) / (hi - lo)) * 0.9 : l0
        const t = (BAYER[(Math.floor(y / scale) % 4) * 4 + (Math.floor(x / scale) % 4)] + 0.5) / 16
        const ink = l < t * 1.05 || (stretch && edge(x, y))
        // dark dots in the tint colour, light dots in a pale tint so the silhouette reads
        const pale = stretch ? 0.08 : 0.35
        d.data[i] = ink ? cr * 0.75 : 255 - (255 - cr) * pale
        d.data[i + 1] = ink ? cg * 0.75 : 255 - (255 - cg) * pale
        d.data[i + 2] = ink ? cb * 0.75 : 255 - (255 - cb) * pale
        d.data[i + 3] = 255
      }
      ctx.putImageData(d, 0, 0)
      const u = c.toDataURL()
      ditherCache.set(key, u)
      if (alive) setUrl(u)
    }).catch(() => {})
    return () => { alive = false }
  }, [key, src, color, size, scale, stretch, colorful])
  return url ? <img src={url} alt={alt} className={`dither-img ${className}`} style={{ imageRendering: 'pixelated', ...style }} draggable={false} /> : <span className={className} style={{ display: 'inline-block', width: size, height: size, ...style }} />
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

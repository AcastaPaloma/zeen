import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
export function Ruler({ value, count, onChange, onRelease, dimmed }: {
  value: number; count: number; onChange: (v: number) => void; onRelease?: (v: number) => void; dimmed?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(Math.round(value))
  const drag = useRef<{ x: number; v: number } | null>(null)
  const span = Math.max(1, count - 1)
  const toV = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const d = drag.current!
    // scrub: dragging left advances (content moves under the centre line)
    return clamp(d.v - ((clientX - d.x) / r.width) * span * 1.6, 0, span)
  }
  const apply = (v: number) => {
    const near = Math.round(v)
    const snapped = Math.abs(v - near) < 0.08 ? near : v
    if (Math.round(snapped) !== last.current && Math.abs(snapped - Math.round(snapped)) < 0.001) { haptic('tick'); last.current = Math.round(snapped) }
    onChange(snapped)
  }
  const ticks = 60
  const offset = (value / span) * 100
  return (
    <div className={`ruler ${dimmed ? 'dimmed' : ''}`} ref={ref} role="slider" aria-label="Unfold sequence" aria-valuemin={0} aria-valuemax={span} aria-valuenow={value} tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { const v = Math.min(span, Math.floor(value) + 1); onChange(v); onRelease?.(v) }
        if (e.key === 'ArrowLeft') { const v = Math.max(0, Math.ceil(value) - 1); onChange(v); onRelease?.(v) }
      }}
      onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: value } }}
      onPointerMove={e => { if (drag.current) apply(toV(e.clientX)) }}
      onPointerUp={() => {
        if (!drag.current) return
        drag.current = null
        // settle to the nearest keyframe
        const v = Math.round(value)
        onChange(v); onRelease?.(v)
      }}
      onPointerCancel={() => { drag.current = null }}>
      <div className="ruler-strip" style={{ transform: `translateX(${-offset}%)` }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const kfPos = (i / ticks) * span
          const isKf = Math.abs(kfPos - Math.round(kfPos)) < span / ticks / 2
          return <span key={i} className={`tick ${isKf ? 'kf' : ''}`} style={{ left: `${(i / ticks) * 100}%` }} />
        })}
      </div>
      <span className="ruler-center" />
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
export function DitherImg({ src, color, size, className = '', alt = '', style, scale = 2 }: {
  src: string; color: string; size: number; className?: string; alt?: string; style?: CSSProperties; scale?: number
}) {
  const key = `${src}|${color}|${size}|${scale}`
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
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (d.data[i + 3] < 30) { d.data[i + 3] = 0; continue }
        const l = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) / 255
        const t = (BAYER[(Math.floor(y / scale) % 4) * 4 + (Math.floor(x / scale) % 4)] + 0.5) / 16
        const ink = l < t * 1.05
        // dark dots in the tint colour, light dots in a pale tint so the silhouette reads
        d.data[i] = ink ? cr * 0.75 : 255 - (255 - cr) * 0.35
        d.data[i + 1] = ink ? cg * 0.75 : 255 - (255 - cg) * 0.35
        d.data[i + 2] = ink ? cb * 0.75 : 255 - (255 - cb) * 0.35
        d.data[i + 3] = 255
      }
      ctx.putImageData(d, 0, 0)
      const u = c.toDataURL()
      ditherCache.set(key, u)
      if (alive) setUrl(u)
    }).catch(() => {})
    return () => { alive = false }
  }, [key, src, color, size, scale])
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

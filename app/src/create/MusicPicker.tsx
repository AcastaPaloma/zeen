import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ALBUMS, trackById, type Album } from '../lib/assets'
import { haptic } from '../lib/feedback'
import { clamp, rng } from '../lib/geom'
import { music, waveform } from '../lib/music'
import type { ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Sheet, Slider, useDominantColor } from '../ui/kit'
import './collage-sheets.css'

const SPAN = 60 // seconds the scrubber covers
const PREVIEW = 15

/** How much the window squeezes when pushed past an end (0..0.3), for an overdrag of `px`. */
const squeezeFor = (px: number) => (0.3 * px) / (px + 90)
/** How much it stretches along the drag at a speed of `v` px/ms. */
const stretchFor = (v: number) => Math.min(0.32, Math.abs(v) * 0.16)

/**
 * The 15-second window's feel: it's a little piece of jelly. Dragged fast it stretches along the drag and
 * thins out; pushed against either end of the song it squashes against the wall and bulges; let go, it
 * springs back with a wobble. Two springs (stretch, squeeze) drive a scale on the window, nothing else.
 */
function useJelly() {
  const win = useRef<HTMLSpanElement>(null)
  const st = useRef({ s: 0, sv: 0, sT: 0, q: 0, qv: 0, qT: 0, wall: 0 as -1 | 0 | 1, live: false, raf: 0, last: 0 })
  const frame = (now: number) => {
    const j = st.current
    const dt = Math.min(0.032, (now - j.last) / 1000 || 0.016)
    j.last = now
    // underdamped, so letting go overshoots once and settles
    j.sv += ((j.sT - j.s) * 520 - j.sv * 20) * dt; j.s += j.sv * dt
    j.qv += ((j.qT - j.q) * 520 - j.qv * 18) * dt; j.q += j.qv * dt
    const el = win.current
    if (el) {
      const sx = (1 + j.s) * (1 - j.q), sy = (1 - j.s * 0.45) * (1 + j.q * 0.6)
      el.style.transformOrigin = j.wall < 0 ? 'left center' : j.wall > 0 ? 'right center' : 'center'
      el.style.transform = `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`
    }
    const still = Math.abs(j.s - j.sT) + Math.abs(j.sv) + Math.abs(j.q - j.qT) + Math.abs(j.qv) < 1e-3
    if (j.live || !still) { j.raf = requestAnimationFrame(frame); return }
    j.raf = 0
    if (el && !j.sT && !j.qT) { el.style.transform = ''; j.wall = 0 }
  }
  const kick = () => { const j = st.current; if (!j.raf) { j.last = performance.now(); j.raf = requestAnimationFrame(frame) } }
  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])
  return {
    ref: win,
    /** while dragging: the drag's speed (px/ms), and how far past an end it's being pushed (px, - for the start) */
    set(v: number, over: number) {
      const j = st.current
      j.live = true
      j.sT = over ? 0 : stretchFor(v)
      j.qT = squeezeFor(Math.abs(over))
      if (over) j.wall = over < 0 ? -1 : 1
      else if (j.q < 0.01) j.wall = 0
      kick()
    },
    release() { const j = st.current; j.live = false; j.sT = 0; j.qT = 0; kick() },
  }
}

/** Scattered, overlapping covers — like a pile of records on the floor. Each cover is one song. */
function layout(albums: Album[]) {
  const r = rng(42)
  return albums.map((a, i) => {
    const col = i % 2
    return {
      a,
      rot: (r() - 0.5) * 14,
      x: col ? 52 + r() * 4 : 4 + r() * 6, // % of width
      y: Math.floor(i / 2) * 232 + (col ? 40 : 0) + r() * 24,
      capRot: (r() - 0.5) * 12,
    }
  })
}

export function MusicPicker({ open, onClose, value, onChange }: {
  open: boolean; onClose: () => void; value: ZineDoc['music']; onChange: (m: ZineDoc['music']) => void
}) {
  const [q, setQ] = useState('')
  const [album, setAlbum] = useState<string | null>(null)
  const [track, setTrack] = useState<string | null>(null)
  const [start, setStart] = useState(0)
  const [volume, setVolume] = useState(70)
  const [playing, setPlaying] = useState(false)
  const wave = useRef<HTMLDivElement>(null)
  const jelly = useJelly()
  const [held, setHeld] = useState(false)
  // dragging the window: where it was grabbed (px from its left edge), and the finger's last x and time
  const drag = useRef<{ id: number; grab: number; x: number; t: number; v: number; atWall: boolean } | null>(null)

  useEffect(() => {
    if (!open) { music.stop(); return }
    const t = trackById(value?.track)
    setAlbum(t?.album.id ?? null)
    setTrack(value?.track ?? null)
    setStart(value?.start ?? 0)
    setVolume(Math.round((value?.volume ?? 0.7) * 100))
    setQ('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => music.subscribe(s => setPlaying(s.playing)), [])

  const albums = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return ALBUMS
    return ALBUMS.filter(a => `${a.title} ${a.artist} ${a.tracks.map(x => x.title).join(' ')}`.toLowerCase().includes(t))
  }, [q])
  const placed = useMemo(() => layout(albums), [albums])
  const sel = trackById(track ?? undefined)
  const open_ = albums.find(a => a.id === album) ?? null

  const play = (id: string, s = start) => {
    music.play(id, { preview: PREVIEW, start: s, volume: volume / 100 })
  }
  const pick = (id: string) => {
    haptic('tick')
    setTrack(id)
    play(id)
  }
  /** Move the window so the grab point sits under the finger; past either end it stays put and squashes. */
  const dragTo = (clientX: number) => {
    const d = drag.current, el = wave.current
    if (!d || !el) return
    const r = el.getBoundingClientRect()
    const w = (PREVIEW / SPAN) * r.width, max = r.width - w
    const left = clientX - r.left - d.grab
    const over = left < 0 ? left : left > max ? left - max : 0
    const now = performance.now()
    d.v = d.v * 0.6 + ((clientX - d.x) / Math.max(8, now - d.t)) * 0.4
    d.x = clientX; d.t = now
    if (!!over !== d.atWall) { d.atWall = !!over; if (over) haptic('tick') }
    jelly.set(d.v, over)
    setStart(Math.round((clamp(left, 0, max) / r.width) * SPAN * 10) / 10)
  }
  const confirm = () => {
    if (!track) return
    haptic('tap')
    onChange({ track, start, volume: volume / 100 })
    music.stop()
    onClose()
  }

  const bars = useMemo(() => (track ? waveform(track, 56) : []), [track])
  const coverColor = useDominantColor(sel?.album.cover)

  return (
    <Sheet open={open} onClose={() => { music.stop(); onClose() }} height="tall" className="music-sheet">
      <div className="music-search">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="What's the soundtrack?" aria-label="Search music" />
        </label>
        <button className="chip" onClick={() => { music.stop(); onChange(null); onClose() }}>No music</button>
      </div>

      {/* while an album is open, any tap on the pile just closes it */}
      <div className={`record-pile ${album ? 'has-sel' : ''}`} style={{ height: Math.ceil(placed.length / 2) * 232 + 120 }}
        onClick={() => { if (album) { haptic('tick'); setAlbum(null) } }}>
        {placed.map(({ a, rot, x, y, capRot }) => {
          const on = album === a.id
          const first = sel && sel.album.id === a.id ? sel.track : a.tracks[0]
          return (
            <button key={a.id} className={`record ${on ? 'on' : ''}`}
              style={{ left: `${x}%`, top: y, '--rot': `${rot}deg` } as CSSProperties}
              onClick={e => {
                e.stopPropagation()
                if (album) { haptic('tick'); setAlbum(null); return }
                haptic('tap'); setAlbum(a.id)
                if (!(sel && sel.album.id === a.id)) pick(a.tracks[0].id)
              }}
              aria-label={`${a.title} by ${a.artist}`} aria-pressed={on}>
              <img src={a.cover} alt="" draggable={false} />
              <span className="record-cap" style={{ transform: `rotate(${capRot}deg)` }}>
                {on && <Icon name="music" size={11} />} {first.title}<br /><small>{a.artist}</small>
              </span>
            </button>
          )
        })}
      </div>

      {/* the chosen song: just pick which 15 seconds play */}
      {open_ && track && sel?.album.id === open_.id && (
        <div className="tracklist" key={open_.id}>
          <div className={`wave ${held ? 'dragging' : ''}`} ref={wave} role="slider" aria-label="Start point" aria-valuenow={start} aria-valuemin={0} aria-valuemax={SPAN - PREVIEW} tabIndex={0}
            onKeyDown={e => { if (e.key === 'ArrowRight') setStart(s => Math.min(SPAN - PREVIEW, Math.floor(s) + 1)); if (e.key === 'ArrowLeft') setStart(s => Math.max(0, Math.ceil(s) - 1)) }}
            onPointerDown={e => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
              const r = e.currentTarget.getBoundingClientRect()
              const w = (PREVIEW / SPAN) * r.width, l = (start / SPAN) * r.width, x = e.clientX - r.left
              // grabbed inside the window: it moves from where it was held; outside: it jumps there, centred
              drag.current = { id: e.pointerId, grab: x >= l && x <= l + w ? x - l : w / 2, x: e.clientX, t: performance.now(), v: 0, atWall: false }
              setHeld(true)
              dragTo(e.clientX)
            }}
            onPointerMove={e => { if (drag.current?.id === e.pointerId) dragTo(e.clientX) }}
            onPointerUp={e => { if (drag.current?.id !== e.pointerId) return; drag.current = null; setHeld(false); jelly.release(); play(track, start) }}
            onPointerCancel={e => { if (drag.current?.id !== e.pointerId) return; drag.current = null; setHeld(false); jelly.release() }}>
            {bars.map((b, i) => {
              const t = (i / bars.length) * SPAN
              const inWin = t >= start && t < start + PREVIEW
              return <span key={i} className={inWin ? 'in' : ''} style={{ height: `${b * 100}%` }} />
            })}
            <span className="wave-win" ref={jelly.ref} style={{ left: `${(start / SPAN) * 100}%`, width: `${(PREVIEW / SPAN) * 100}%` }} />
          </div>
          <Slider label="Volume" value={volume} onChange={setVolume} format={v => `${v}%`} />
        </div>
      )}
      <div style={{ height: 96 }} />

      <div className={`now-playing ${sel ? 'on' : ''}`} style={{ '--np': coverColor ?? '#F2F2F2' } as CSSProperties}>
        {sel && (
          <>
            <img src={sel.album.cover} alt="" />
            <div className="np-text"><b>{sel.track.title}</b><small>{sel.album.artist}</small></div>
            <button aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => (playing ? music.stop() : play(sel.track.id))}>
              <Icon name={playing ? 'pause' : 'play'} size={20} fill={playing ? undefined : 'currentColor'} />
            </button>
            <button aria-label="Use this song" className="np-go" onClick={confirm}><Icon name="arrowRight" size={22} /></button>
          </>
        )}
      </div>
    </Sheet>
  )
}

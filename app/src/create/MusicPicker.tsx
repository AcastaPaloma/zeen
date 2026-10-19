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
  const scrub = (clientX: number) => {
    const r = wave.current!.getBoundingClientRect()
    const s = Math.round(clamp((clientX - r.left) / r.width, 0, 1) * (SPAN - PREVIEW))
    setStart(s)
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
          <div className="wave" ref={wave} role="slider" aria-label="Start point" aria-valuenow={start} aria-valuemin={0} aria-valuemax={SPAN - PREVIEW} tabIndex={0}
            onKeyDown={e => { if (e.key === 'ArrowRight') setStart(s => Math.min(SPAN - PREVIEW, s + 1)); if (e.key === 'ArrowLeft') setStart(s => Math.max(0, s - 1)) }}
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); scrub(e.clientX) }}
            onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') scrub(e.clientX) }}
            onPointerUp={() => play(track, start)}>
            {bars.map((b, i) => {
              const t = (i / bars.length) * SPAN
              const inWin = t >= start && t < start + PREVIEW
              return <span key={i} className={inWin ? 'in' : ''} style={{ height: `${b * 100}%` }} />
            })}
            <span className="wave-win" style={{ left: `${(start / SPAN) * 100}%`, width: `${(PREVIEW / SPAN) * 100}%` }} />
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

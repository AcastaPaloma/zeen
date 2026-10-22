import { useEffect, useRef, useState } from 'react'
import { pageThumb } from '../create/collageUtil'
import { haptic } from '../lib/feedback'
import { useApp } from '../lib/store'
import type { ZineDoc } from '../lib/types'
import { FEELS } from '../three/spring'
import type { ZineScene } from '../three/ZineScene'
import { bgVars, IconBtn, PillGroup } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import { useExploration } from './state'
import './explore.css'

// Two earlier takes on reading a zine, kept for the case study. They read whichever zine is open in the
// preview or the reader (or Montreal, if none is), with the same pages and keyframes as the final reader.

/** The zine to read: the one open right now, else a sample with a few steps to its unfolding. */
function useReadingZine(): ZineDoc | null {
  const [doc] = useState(() => {
    const s = useApp.getState()
    const top = s.stack[s.stack.length - 1]
    const open = top.name === 'read' || top.name === 'preview' ? s.zines[top.id] : null
    return open ?? s.zines['z_mtl'] ?? Object.values(s.zines).find(z => z.status === 'published') ?? null
  })
  return doc
}

function CloseBar({ children }: { children?: React.ReactNode }) {
  const show = useExploration(s => s.show)
  return (
    <div className="top-bar">
      <PillGroup className="solo"><IconBtn name="x" label="Back to the final design" onClick={() => { haptic('tick'); show(null) }} /></PillGroup>
      <div className="grow" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- 1 · page by page

/** Every page of the zine, cut flat out of its paper and laid out in a carousel you swipe through. */
export function PageByPage() {
  const doc = useReadingZine()
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [at, setAt] = useState(0)
  const track = useRef<HTMLDivElement>(null)

  // the pages come from the zine's own paper (a scene kept out of sight), in its reading order
  useEffect(() => {
    if (!scene) return
    const cut = () => setPages(scene.pages.map(p => pageThumb(scene, p.panel, p.side, 900)?.toDataURL('image/webp', 0.9) ?? '').filter(Boolean))
    // once now-ish, and again once the scraps' images have loaded in
    const t = [setTimeout(cut, 500), setTimeout(cut, 1800)]
    return () => t.forEach(clearTimeout)
  }, [scene])

  const go = (i: number) => {
    const el = track.current
    if (!el || i < 0 || i >= pages.length) return
    haptic('tick')
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  if (!doc) return null
  return (
    <div className="screen dots explore ex-read" style={bgVars(doc.bg)}>
      <div className="ex-offscreen" aria-hidden><ZineView doc={doc} mode="static" handles={false} onScene={setScene} /></div>
      <CloseBar>{pages.length > 0 && <span className="ex-chip">Page {at + 1} of {pages.length}</span>}</CloseBar>
      <div className="ex-pages" ref={track} onScroll={e => setAt(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        {pages.map((src, i) => (
          <div key={i} className="ex-page"><img src={src} alt={`Page ${i + 1}`} draggable={false} /></div>
        ))}
      </div>
      {pages.length > 0 && (
        <div className="ex-pager">
          <IconBtn name="left" label="Previous page" onClick={() => go(at - 1)} disabled={at === 0} />
          <div className="ex-pips">{pages.map((_, i) => <span key={i} className={i === at ? 'on' : ''} />)}</div>
          <IconBtn name="right" label="Next page" onClick={() => go(at + 1)} disabled={at === pages.length - 1} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 2 · tap through

const STEP_MS = 4000

/** The unfold sequence plays like stories: a step every few seconds, tap to skip on or back, hold to pause. */
export function TapThrough() {
  const doc = useReadingZine()
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const kfs = doc?.keyframes ?? []
  const last = Math.max(0, kfs.length - 1)
  const hold = useRef<{ t: number; held: boolean } | null>(null)
  const posed = useRef(false) // the first pose is set at once, every one after that animates

  const onScene = (s: ZineScene | null) => { if (s) s.fitMargin = 1.34; setScene(s) }

  // fold the zine into the current step
  useEffect(() => {
    if (!scene || !doc) return
    const pose: Record<string, number> = {}
    for (const c of doc.creases) pose[c.id] = kfs[i]?.angles[c.id] ?? c.angle
    scene.setAngles(pose, { animate: posed.current, feel: FEELS[doc.transition.feel], sequential: doc.transition.mode === 'sequential' })
    posed.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, doc, i])

  const step = (d: number) => { const n = Math.max(0, Math.min(last, i + d)); if (n !== i) { haptic('tick'); setI(n) } }

  if (!doc) return null
  return (
    <div className="screen dots explore ex-read" style={bgVars(doc.bg)}>
      <div className="ex-stage ex-stage-full"><ZineView doc={doc} mode="page" handles={false} onScene={onScene} /></div>
      {/* the whole screen is two tap zones over the zine: a third on the left goes back, the rest goes on */}
      <div className="ex-taps"
        onPointerDown={() => {
          const h = { t: window.setTimeout(() => { h.held = true; setPaused(true) }, 260), held: false }
          hold.current = h
        }}
        onPointerUp={e => {
          const h = hold.current
          hold.current = null
          if (!h) return
          clearTimeout(h.t)
          if (h.held) { setPaused(false); return }
          const r = e.currentTarget.getBoundingClientRect()
          step(e.clientX - r.left < r.width / 3 ? -1 : 1)
        }}
        onPointerCancel={() => { if (hold.current) clearTimeout(hold.current.t); hold.current = null; setPaused(false) }} />
      <div className="ex-bars" aria-label={`Step ${i + 1} of ${kfs.length}`}>
        {kfs.map((k, j) => (
          <span key={k.id} className="ex-bar">
            <i key={j === i ? `run${i}` : 'still'} className={j < i ? 'done' : j === i ? `run ${paused ? 'paused' : ''}` : ''}
              style={j === i ? { animationDuration: `${STEP_MS}ms` } : undefined}
              onAnimationEnd={() => { if (j === i && i < last) setI(i + 1) }} />
          </span>
        ))}
      </div>
      <CloseBar>
        <span className="ex-chip">{kfs[i]?.name || `Step ${i + 1}`}</span>
      </CloseBar>
      <div className="ex-hint hint-text">{paused ? 'paused' : 'tap right for more, left to go back'}</div>
    </div>
  )
}

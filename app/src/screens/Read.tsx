import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { STICKERS } from '../lib/assets'
import { haptic, isMuted, setMuted, sfx } from '../lib/feedback'
import { music } from '../lib/music'
import { published, useApp } from '../lib/store'
import { renderThumb, useThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import { FEELS } from '../three/spring'
import type { ZineScene } from '../three/ZineScene'
import { Icon } from '../ui/Icon'
import { Button, IconBtn, PillGroup, Ruler, Sheet } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import { copyLink, HeartSticker, zineScreenBox, offsetBox, shareZine, useZineBox, useZineMusic, flyToShelf, MusicChip, type Box } from './Preview'
import './reading.css'

interface ReaderSticker { src: string; fx: number; fy: number; rot: number }

const stickerKey = (id: string) => `zeen.readerStickers.${id}`
function loadStickers(id: string): ReaderSticker[] {
  try { return JSON.parse(localStorage.getItem(stickerKey(id)) ?? '[]') } catch { return [] }
}

/** Small keyframe thumbnail: the zine rendered at that pose. */
function KfThumb({ doc, i, on, onClick }: { doc: ZineDoc; i: number; on: boolean; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const copy: ZineDoc = { ...doc, id: `${doc.id}#k${i}`, publish: { ...doc.publish, coverKeyframe: i } }
    renderThumb(copy).then(u => { if (alive) setSrc(u) })
    return () => { alive = false }
  }, [doc, i])
  return (
    <button className={`kf-thumb ${on ? 'on' : ''}`} onClick={onClick} aria-label={`Go to ${doc.keyframes[i].name || 'keyframe ' + (i + 1)}`} aria-current={on}>
      {src ? <img src={src} alt="" /> : <span />}
    </button>
  )
}

function MoreThumb({ z }: { z: ZineDoc }) {
  const src = useThumb(z)
  const go = useApp(s => s.go)
  return <button className="end-more" onClick={() => go({ name: 'preview', id: z.id, from: null })} aria-label={z.publish.title}>{src && <img src={src} alt="" />}</button>
}

export default function Read({ id, active }: { id: string; active: boolean }) {
  const doc = useApp(s => s.zines[id])
  const liked = useApp(s => s.likes.includes(id))
  const saved = useApp(s => s.saves.includes(id))
  const seenHint = useApp(s => !!s.seenCoach['read-hint'])
  const zines = useApp(s => s.zines)
  const { go, back, toggleLike, toggleSave, setReadProgress, markSeen, showToast } = useApp.getState()
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [t, setT] = useState(0)
  const [offFlow, setOffFlow] = useState(false)
  const [page, setPage] = useState<{ n: number; total: number; side: 'front' | 'back' }>({ n: 1, total: 1, side: 'front' })
  const [slap, setSlap] = useState(0)
  const [mutedS, setMutedS] = useState(isMuted())
  const [endOpen, setEndOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; fx: number; fy: number } | null>(null)
  const [stickerPick, setStickerPick] = useState<{ fx: number; fy: number } | null>(null)
  const [stickers, setStickers] = useState<ReaderSticker[]>(() => loadStickers(id))
  const [showHint, setShowHint] = useState(!seenHint)
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; y: number; timer: number } | null>(null)
  const endTimer = useRef(0)
  const box = useZineBox(scene)
  const thumb = useThumb(doc)
  useZineMusic(doc, active)

  const kfs = doc?.keyframes ?? []
  const last = Math.max(0, kfs.length - 1)
  const feel = FEELS[doc?.transition.feel ?? 'snappy']

  const fullPose = useCallback((k: number) => {
    const o: Record<string, number> = {}
    if (!doc) return o
    for (const c of doc.creases) o[c.id] = kfs[k]?.angles[c.id] ?? c.angle
    return o
  }, [doc, kfs])

  const goTo = useCallback((k: number, opts: { animate?: boolean } = {}) => {
    if (!scene || !doc) return
    k = Math.max(0, Math.min(last, Math.round(k)))
    setT(k)
    setOffFlow(false)
    scene.setAngles(fullPose(k), { animate: opts.animate !== false, feel, sequential: doc.transition.mode === 'sequential' })
    setReadProgress(id, k)
    clearTimeout(endTimer.current)
    if (k === last && last > 0) endTimer.current = window.setTimeout(() => setEndOpen(true), 900)
    else setEndOpen(false)
  }, [scene, doc, last, fullPose, feel, id, setReadProgress])

  const onScene = useCallback((s: ZineScene | null) => {
    setScene(s)
    if (!s || !doc) return
    s.fitMargin = 1.34
    const start = Math.min(useApp.getState().readProgress[id] ?? 0, Math.max(0, doc.keyframes.length - 1))
    const pose: Record<string, number> = {}
    for (const c of doc.creases) pose[c.id] = doc.keyframes[start]?.angles[c.id] ?? c.angle
    s.setAngles(pose, { animate: false })
    setT(start)
    if (!useApp.getState().seenCoach['read-hint']) { s.showHandleHint = true; s.syncHandles() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // leaving the authored path: grabbing a light dims the slider until the reader rejoins
  useEffect(() => {
    if (!scene) return
    const offs = [
      scene.on('handle-down', () => {
        setOffFlow(true); setEndOpen(false)
        if (!useApp.getState().seenCoach['read-hint']) { markSeen('read-hint'); setShowHint(false) }
      }),
    ]
    return () => offs.forEach(f => f())
  }, [scene, markSeen])

  // page indicator follows whichever face is squarely toward the reader
  useEffect(() => {
    if (!scene) return
    const tick = () => {
      // the page under the middle of the zine is the one being read; fall back to the squarest face
      const b = zineScreenBox(scene)
      const hit = b ? scene.pick((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) : null
      const f = hit ? { panel: hit.panel, side: hit.side } : scene.nearestFace()
      if (!f) return
      const n = scene.pageOf(f.panel, f.side) || 1
      const side = scene.side
      setPage(p => (p.n === n && p.total === scene.pages.length && p.side === side ? p : { n, total: scene.pages.length, side }))
    }
    tick()
    const iv = setInterval(tick, 250)
    return () => clearInterval(iv)
  }, [scene])

  useEffect(() => () => clearTimeout(endTimer.current), [])

  const backToFlow = () => {
    if (!scene || !doc) return
    const cur = scene.angles()
    let best = 0, bd = Infinity
    kfs.forEach((_, k) => {
      const p = fullPose(k)
      let d = 0
      for (const c of doc.creases) d += Math.abs((cur[c.id] ?? 0) - p[c.id])
      if (d < bd) { bd = d; best = k }
    })
    haptic('tap')
    goTo(best)
  }

  const scrub = (v: number) => {
    if (!scene) return
    setT(v)
    if (offFlow) setOffFlow(false)
    setEndOpen(false)
    scene.setAngles(scene.poseAt(v), { feel: { k: 420, c: 42 } })
  }

  const like = () => {
    const on = toggleLike(id)
    if (on) { setSlap(Date.now()); sfx('slap'); haptic('double') } else haptic('tick')
  }
  const save = () => {
    const on = toggleSave(id)
    if (on) { flyToShelf(thumb, offsetBox(box, stage.current, root.current), root.current); haptic('tap'); setTimeout(() => showToast('Saved to your shelf.'), 380) }
    else showToast('Removed from your shelf')
  }
  const toggleMute = () => {
    const m = !mutedS
    setMutedS(m); setMuted(m); music.setMuted(m); haptic('tick')
  }

  useEffect(() => { if (scene) scene.handlers.doubleTap = p => { if (!scene.pick(p.x, p.y)) return false; if (!liked) like(); else { setSlap(Date.now()); sfx('slap') } return true } })

  // long-press on the paper: Copy / Add sticker / Save / Share
  const onPointerDown = (e: React.PointerEvent) => {
    if (!scene || (e.target as HTMLElement).closest('.fold-handle')) return
    const r = stage.current!.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    clearTimeout(press.current?.timer)
    press.current = {
      x: e.clientX, y: e.clientY,
      timer: window.setTimeout(() => {
        press.current = null
        if (!scene.pick(x, y) || !box) return
        haptic('firm')
        const w = box.x1 - box.x0, h = box.y1 - box.y0
        const hr = root.current!.getBoundingClientRect()
        setMenu({ x: e.clientX - hr.left, y: e.clientY - hr.top, fx: (x - box.x0) / w, fy: (y - box.y0) / h })
      }, 520),
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) { clearTimeout(press.current.timer); press.current = null }
  }
  const onPointerUp = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null } }

  const addSticker = (src: string) => {
    if (!stickerPick) return
    const next = [...stickers, { src, fx: stickerPick.fx, fy: stickerPick.fy, rot: (Math.random() - 0.5) * 0.6 }]
    setStickers(next)
    try { localStorage.setItem(stickerKey(id), JSON.stringify(next)) } catch { /* ignore */ }
    setStickerPick(null)
    sfx('slap'); haptic('double')
    showToast('Stuck on — only you can see it')
  }

  const more = useMemo(() => (doc ? published(zines).filter(z => z.author === doc.author && z.id !== doc.id).slice(0, 6) : []), [zines, doc])

  if (!doc) return <div className="screen dots"><div className="top-bar"><PillGroup className="solo"><IconBtn name="x" label="Close" onClick={back} /></PillGroup></div></div>

  const rejoin = offFlow
  const author = useApp.getState().users.find(u => u.id === doc.author)

  return (
    <div className="screen read dots" ref={root} style={{ '--bg': doc.bg } as CSSProperties}>
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="x" label="Close" onClick={back} /></PillGroup>
        <div className="page-ind" aria-live="polite">{page.side === 'back' ? 'Back · ' : ''}Page {page.n} of {page.total}</div>
        <PillGroup>
          <IconBtn name="heart" label={liked ? 'Unlike' : 'Like'} onClick={like} className={liked ? 'liked' : ''} />
          <IconBtn name="bookmark" label={saved ? 'Remove from shelf' : 'Save'} onClick={save} className={saved ? 'saved' : ''} />
          <IconBtn name={mutedS ? 'volumeOff' : 'volume'} label={mutedS ? 'Unmute' : 'Mute'} onClick={toggleMute} />
        </PillGroup>
      </div>
      {doc.music && <div className="read-music"><MusicChip trackId={doc.music.track} compact /></div>}

      <div className="read-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <ZineView doc={doc} mode="page" keepAngles={false} onScene={onScene} />
        {liked && <HeartSticker box={box} fresh={slap} />}
        {box && stickers.map((s, i) => (
          <img key={i} className="reader-sticker" src={s.src} alt="" draggable={false}
            style={{ left: box.x0 + (box.x1 - box.x0) * s.fx, top: box.y0 + (box.y1 - box.y0) * s.fy, width: Math.max(30, (box.x1 - box.x0) * 0.18), transform: `translate(-50%,-50%) rotate(${s.rot}rad)` }} />
        ))}
      </div>

      {showHint && !seenHint && (
        <div className="read-coach"><span className="rc-dot" />Drag the light to unfold</div>
      )}

      <div className="read-bottom">
        <div className="read-caption">{rejoin ? 'free play — the folds are yours' : 'drag the glowing edges to unfold'}</div>
        {rejoin && (
          <button className="flow-chip" onClick={backToFlow}><Icon name="rotate" size={15} />Back to flow</button>
        )}
        {kfs.length > 1 && (
          <>
            <div className={`kf-strip hscroll ${rejoin ? 'dimmed' : ''}`}>
              {kfs.map((_, i) => <KfThumb key={i} doc={doc} i={i} on={!rejoin && Math.round(t) === i} onClick={() => { haptic('tick'); goTo(i) }} />)}
            </div>
            <div className="ruler-row">
              <button className="step-btn" onClick={() => { haptic('tick'); goTo(Math.ceil(t - 0.01) - 1) }} disabled={t <= 0 && !rejoin} aria-label="Previous keyframe"><Icon name="left" size={18} /></button>
              <Ruler value={t} count={kfs.length} onChange={scrub} onRelease={v => goTo(v)} dimmed={rejoin} />
              <button className="step-btn" onClick={() => { haptic('tick'); goTo(Math.floor(t + 0.01) + 1) }} disabled={t >= last && !rejoin} aria-label="Next keyframe"><Icon name="right" size={18} /></button>
            </div>
          </>
        )}
      </div>

      {menu && (
        <>
          <div className="lp-dim" onPointerDown={() => setMenu(null)} />
          <div className="lp-pos" style={{ left: Math.min(Math.max(menu.x, 140), (root.current?.clientWidth ?? 390) - 140), top: Math.max(menu.y - 64, 90) }}>
          <div className="lp-menu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(null); copyLink(doc) }}>Copy</button>
            <button role="menuitem" onClick={() => { setStickerPick({ fx: menu.fx, fy: menu.fy }); setMenu(null) }}>Add Sticker</button>
            <button role="menuitem" onClick={() => { setMenu(null); if (!saved) save(); else showToast('Already on your shelf') }}>Save</button>
            <button role="menuitem" onClick={() => { setMenu(null); shareZine(doc) }}>Share...</button>
          </div>
          </div>
        </>
      )}

      <Sheet open={!!stickerPick} onClose={() => setStickerPick(null)} title="Stick something on it" dim>
        <div className="sticker-pick">
          {STICKERS.map(s => <button key={s.id} onClick={() => addSticker(s.src)} aria-label={s.name}><img src={s.src} alt="" /></button>)}
        </div>
      </Sheet>

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} className="end-card">
        <div className="end-head">
          <span className="end-fin">fin.</span>
          <p>{doc.publish.title}{author ? ` — by ${author.name}` : ''}</p>
        </div>
        <div className="end-actions">
          <button className={liked ? 'on' : ''} onClick={like}><Icon name="heart" size={22} fill={liked ? 'currentColor' : undefined} /><span>{liked ? 'Liked' : 'Like'}</span></button>
          <button className={saved ? 'on' : ''} onClick={save}><Icon name="bookmark" size={22} fill={saved ? 'currentColor' : undefined} /><span>{saved ? 'Saved' : 'Save'}</span></button>
          <button onClick={() => go({ name: 'create', replyTo: doc.id })}><Icon name="reply" size={22} /><span>Reply zine</span></button>
          <button onClick={() => goTo(0)}><Icon name="rotate" size={22} /><span>Again</span></button>
        </div>
        {more.length > 0 && (
          <>
            <h5 className="end-sub">More from {author?.name}</h5>
            <div className="hscroll end-row">{more.map(z => <MoreThumb key={z.id} z={z} />)}</div>
          </>
        )}
        {author && <Button kind="secondary" onClick={() => go({ name: 'profile', id: author.id })} style={{ width: '100%', marginTop: 12 }}>Visit {author.name}'s shelf</Button>}
      </Sheet>
    </div>
  )
}

export type { Box }

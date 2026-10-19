import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boxCorners, objectAt, objectBox, objectImage } from '../create/collageUtil'
import { haptic, isMuted, setMuted, sfx } from '../lib/feedback'
import { music } from '../lib/music'
import { flatToPage } from '../lib/paper'
import { ME } from '../lib/samples'
import { published, useApp } from '../lib/store'
import { renderThumb, useThumb } from '../lib/thumbs'
import type { ScrapItem, ZineDoc, ZObject } from '../lib/types'
import { FEELS } from '../three/spring'
import type { ZineScene } from '../three/ZineScene'
import { Icon } from '../ui/Icon'
import { bgVars, Button, DitherImg, IconBtn, PillGroup, Ruler, Sheet } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import { copyLink, zineScreenBox, offsetBox, shareZine, useZineBox, useZineMusic, flyToShelf, MusicTile, AlbumPopup, type Box } from './Preview'
import './reading.css'

/** Scrapbook id for an object saved out of a zine, so saving it twice doesn't duplicate it. */
const savedScrapId = (zine: string, obj: string) => `u_${zine}_${obj}`

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
      {src ? <DitherImg src={src} size={[64, 44]} /> : <span />}
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
  const [page, setPage] = useState<{ n: number; total: number; side: 'front' | 'back' }>({ n: 1, total: 1, side: 'front' })
  const [mutedS, setMutedS] = useState(isMuted())
  const [endOpen, setEndOpen] = useState(false)
  /** long-press menu; `obj` is the scrap, text or drawing under the finger, if any */
  const [menu, setMenu] = useState<{ x: number; y: number; obj: ZObject | null } | null>(null)
  const [showHint, setShowHint] = useState(!seenHint)
  const [album, setAlbum] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; y: number; timer: number } | null>(null)
  const endTimer = useRef(0)
  const strip = useRef<HTMLDivElement>(null)
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

  // the ruler glides to a keyframe picked from the strip or the arrows, instead of jumping to it
  const tNow = useRef(t)
  tNow.current = t
  const glide = useRef(0)
  const glideT = useCallback((to: number) => {
    cancelAnimationFrame(glide.current)
    const from = tNow.current, t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 420)
      setT(from + (to - from) * (1 - (1 - k) ** 3))
      if (k < 1) glide.current = requestAnimationFrame(step)
    }
    glide.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => () => cancelAnimationFrame(glide.current), [])

  const goTo = useCallback((k: number, opts: { animate?: boolean; glide?: boolean } = {}) => {
    if (!scene || !doc) return
    k = Math.max(0, Math.min(last, Math.round(k)))
    if (opts.glide) glideT(k); else { cancelAnimationFrame(glide.current); setT(k) }
    scene.setAngles(fullPose(k), { animate: opts.animate !== false, feel, sequential: doc.transition.mode === 'sequential' })
    setReadProgress(id, k)
    clearTimeout(endTimer.current)
    if (k === last && last > 0) endTimer.current = window.setTimeout(() => setEndOpen(true), 900)
    else setEndOpen(false)
  }, [scene, doc, last, fullPose, feel, id, setReadProgress, glideT])

  const onScene = useCallback((s: ZineScene | null) => {
    setScene(s)
    if (!s || !doc) return
    s.fitMargin = 1.34
    // drag to move the zine around; turning it over is double-tap only
    s.dragPan = true
    s.oneFingerSwipe = false
    const start = Math.min(useApp.getState().readProgress[id] ?? 0, Math.max(0, doc.keyframes.length - 1))
    const pose: Record<string, number> = {}
    for (const c of doc.creases) pose[c.id] = doc.keyframes[start]?.angles[c.id] ?? c.angle
    s.setAngles(pose, { animate: false })
    setT(start)
    if (!useApp.getState().seenCoach['read-hint']) { s.showHandleHint = true; s.syncHandles() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // grabbing a light is free play; touching the ruler again poses the zine at the ruler's frame
  useEffect(() => {
    if (!scene) return
    const offs = [
      scene.on('handle-down', () => {
        setEndOpen(false)
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

  // keep the current keyframe's thumbnail in the middle of the strip, over the ruler's playhead
  const kfNow = Math.round(t)
  const kfShown = useRef(kfNow)
  kfShown.current = kfNow
  const centreThumb = useCallback((smooth: boolean) => {
    const el = strip.current
    const on = el?.children[kfShown.current] as HTMLElement | undefined
    if (!el || !on) return
    const r = el.getBoundingClientRect(), b = on.getBoundingClientRect()
    el.scrollTo({ left: el.scrollLeft + (b.left + b.width / 2) - (r.left + r.width / 2), behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  useEffect(() => { centreThumb(true) }, [kfNow, centreThumb])
  // thumbnails render in after mount and change width: keep the current one centred as they do
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const ro = new ResizeObserver(() => centreThumb(false))
    for (const c of el.children) ro.observe(c)
    return () => ro.disconnect()
  }, [kfs.length, centreThumb])

  const scrub = (v: number) => {
    if (!scene) return
    setT(v)
    setEndOpen(false)
    scene.setAngles(scene.poseAt(v), { feel: { k: 420, c: 42 } })
  }

  const like = () => {
    const on = toggleLike(id)
    if (on) { sfx('pop'); haptic('double') } else haptic('tick')
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

  useEffect(() => { if (scene) scene.handlers.doubleTap = () => { scene.flip(); haptic('tap'); return true } }, [scene])

  // long-press on the paper: Copy / Save to scrapbook (the thing under the finger) / Save / Share
  const onPointerDown = (e: React.PointerEvent) => {
    if (!scene || (e.target as HTMLElement).closest('.fold-handle')) return
    const r = stage.current!.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    clearTimeout(press.current?.timer)
    press.current = {
      x: e.clientX, y: e.clientY,
      timer: window.setTimeout(() => {
        press.current = null
        const hit = scene.pick(x, y)
        if (!hit || !doc) return
        haptic('firm')
        const s = scene.d.surfaces.get(hit.surface)
        const obj = s ? objectAt(doc, hit.surface, hit.side, flatToPage(s.frame, hit.side, hit.flat), true) : null
        const hr = root.current!.getBoundingClientRect()
        setMenu({ x: e.clientX - hr.left, y: e.clientY - hr.top, obj })
      }, 520),
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) { clearTimeout(press.current.timer); press.current = null }
  }
  const onPointerUp = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null } }

  /** Save the held object into the reader's scrapbook, then fly it toward the profile tab. */
  const saveObject = (o: ZObject) => {
    if (!doc || !scene) return
    if (doc.author !== ME && !doc.publish.scrapReuse) { haptic('tick'); showToast('The maker keeps these scraps to themselves'); return }
    const sid = savedScrapId(doc.id, o.id)
    if (useApp.getState().scrapbook.some(x => x.id === sid)) { haptic('tick'); showToast('Already in your scrapbook'); return }
    const src = objectImage(o, doc.effects)
    if (!src) { showToast('Nothing to save there'); return }
    const maker = useApp.getState().users.find(u => u.id === doc.author)
    const name = o.kind === 'text' ? o.text.split('\n')[0].slice(0, 28) || 'Text' : o.name || (o.kind === 'ink' ? 'Drawing' : 'Scrap')
    const item: ScrapItem = {
      id: sid, src, name, note: `saved while reading “${doc.publish.title || 'Untitled'}”`,
      collection: 'Saved from zines', addedAt: Date.now(), addedBy: ME,
      from: `"${doc.publish.title || 'Untitled'}"${maker ? ` by ${maker.name}` : ''}`, where: 'Zeen',
      edition: [1, 1], usedIn: [doc.id], gif: o.kind === 'scrap' && !!o.gif, kind: o.kind === 'scrap' && o.gif ? 'gif' : 'image',
    }
    useApp.getState().addScraps([item])
    // fly the object itself from where it sits on the page
    const b = objectBox(o)
    const panel = scene.panelAt(o.surface, o.side, [b.cx, b.cy])
    if (panel) {
      const pts = boxCorners(b).map(p => scene.pageToScreen(panel, o.side, p))
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      flyToShelf(src, offsetBox({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, stage.current, root.current), root.current)
    }
    sfx('rustle'); haptic('tap')
    setTimeout(() => showToast('Saved to your scrapbook', { label: 'View', run: () => go({ name: 'scrapbook' }) }), 380)
  }

  const more = useMemo(() => (doc ? published(zines).filter(z => z.author === doc.author && z.id !== doc.id).slice(0, 6) : []), [zines, doc])

  if (!doc) return <div className="screen dots"><div className="top-bar"><PillGroup className="solo"><IconBtn name="x" label="Close" onClick={back} /></PillGroup></div></div>

  const author = useApp.getState().users.find(u => u.id === doc.author)

  return (
    <div className="screen read dots" ref={root} style={bgVars(doc.bg)}>
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="x" label="Close" onClick={back} /></PillGroup>
        <div className="page-ind" aria-live="polite">{page.side === 'back' ? 'Back · ' : ''}Page {page.n} of {page.total}</div>
        <PillGroup>
          <IconBtn name="heart" label={liked ? 'Unlike' : 'Like'} onClick={like} className={liked ? 'liked' : ''} />
          <IconBtn name="bookmark" label={saved ? 'Remove from shelf' : 'Save'} onClick={save} className={saved ? 'saved' : ''} />
          <IconBtn name={mutedS ? 'volumeOff' : 'volume'} label={mutedS ? 'Unmute' : 'Mute'} onClick={toggleMute} />
        </PillGroup>
      </div>
      {doc.music && <div className="read-music"><MusicTile trackId={doc.music.track} onOpen={() => setAlbum(true)} /></div>}

      <div className="read-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <ZineView doc={doc} mode="page" keepAngles={false} onScene={onScene} />
      </div>

      {showHint && !seenHint && (
        <div className="read-coach"><span className="rc-dot" />Drag the light to unfold</div>
      )}

      <div className="read-bottom">
        <div className="read-caption">drag the lights to unfold · double-tap to turn over</div>
        {kfs.length > 1 && (
          <>
            <div className="kf-strip hscroll" ref={strip}>
              {kfs.map((_, i) => <KfThumb key={i} doc={doc} i={i} on={Math.round(t) === i} onClick={() => { haptic('tick'); goTo(i, { glide: true }) }} />)}
            </div>
            <div className="ruler-row">
              <button className="step-btn" onClick={() => { haptic('tick'); goTo(Math.ceil(t - 0.01) - 1, { glide: true }) }} disabled={t <= 0} aria-label="Previous keyframe"><Icon name="left" size={18} /></button>
              <Ruler value={t} count={kfs.length} onChange={scrub} onRelease={v => goTo(v)} />
              <button className="step-btn" onClick={() => { haptic('tick'); goTo(Math.floor(t + 0.01) + 1, { glide: true }) }} disabled={t >= last} aria-label="Next keyframe"><Icon name="right" size={18} /></button>
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
            {menu.obj && <button role="menuitem" onClick={() => { const o = menu.obj!; setMenu(null); saveObject(o) }}>Save to scrapbook</button>}
            <button role="menuitem" onClick={() => { setMenu(null); if (!saved) save(); else showToast('Already on your shelf') }}>Save</button>
            <button role="menuitem" onClick={() => { setMenu(null); shareZine(doc) }}>Share...</button>
          </div>
          </div>
        </>
      )}

      <AlbumPopup trackId={doc.music?.track} open={album} onClose={() => setAlbum(false)} />

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} className="end-card">
        <div className="end-head">
          <span className="end-fin">fin.</span>
          <p>{doc.publish.title}{author ? ` — by ${author.name}` : ''}</p>
        </div>
        <div className="end-actions">
          <button className={liked ? 'on' : ''} onClick={like}><Icon name="heart" size={22} fill={liked ? 'currentColor' : undefined} /><span>{liked ? 'Liked' : 'Like'}</span></button>
          <button className={saved ? 'on' : ''} onClick={save}><Icon name="bookmark" size={22} fill={saved ? 'currentColor' : undefined} /><span>{saved ? 'Saved' : 'Save'}</span></button>
          <button onClick={() => go({ name: 'create', replyTo: doc.id })}><Icon name="reply" size={22} /><span>Reply zine</span></button>
          <button onClick={() => goTo(0)}><Icon name="replay" size={22} /><span>Again</span></button>
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

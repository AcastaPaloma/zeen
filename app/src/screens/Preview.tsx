import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { trackById } from '../lib/assets'
import { luminance } from '../lib/compose'
import { haptic, sfx } from '../lib/feedback'
import { music, type MusicState } from '../lib/music'
import { useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import type { ZineScene } from '../three/ZineScene'
import { Icon } from '../ui/Icon'
import { Avatar, Button, fmtCount, Grabber, IconBtn, PillGroup, Sheet, timeAgo } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import './reading.css'

// ---------------------------------------------------------------- shared reading helpers

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Screen-space bounds of the whole zine, from the scene's live panel transforms. */
export function zineScreenBox(s: ZineScene | null): Box | null {
  if (!s || !s.d) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const P of s.d.list) {
    if (!s.mats.has(P.id)) continue
    for (const poly of P.region) for (const p of poly[0]) {
      const [x, y] = s.flatToScreen(P.id, p)
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return isFinite(x0) ? { x0, y0, x1, y1 } : null
}

/** Tracks the zine's on-screen box, a few times a second (cheap enough for overlays). */
export function useZineBox(scene: ZineScene | null) {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    if (!scene) return
    let n = 0
    return scene.on('frame', () => {
      if (n++ % 3) return
      const b = zineScreenBox(scene)
      if (!b) return
      setBox(prev => (prev && Math.abs(prev.x0 - b.x0) < 0.8 && Math.abs(prev.y0 - b.y0) < 0.8 && Math.abs(prev.x1 - b.x1) < 0.8 && Math.abs(prev.y1 - b.y1) < 0.8 ? prev : b))
    })
  }, [scene])
  return box
}

export function useMusicState() {
  const [st, setSt] = useState<MusicState>(music.state)
  useEffect(() => music.subscribe(setSt), [])
  return st
}

/** Plays the zine's soundtrack while the screen is on top; stops when it unmounts. */
export function useZineMusic(doc: ZineDoc | undefined, active: boolean) {
  useEffect(() => {
    if (!active || !doc?.music) return
    if (music.state.track !== doc.music.track || !music.state.playing) music.play(doc.music.track, { volume: doc.music.volume, start: doc.music.start })
  }, [active, doc?.music])
  useEffect(() => () => { if (doc?.music && music.state.track === doc.music.track) music.stop() }, [doc?.music])
}

/** The zine's song as a small rounded-square cover. Tapping it opens the album. */
export function MusicTile({ trackId, onOpen }: { trackId?: string; onOpen: () => void }) {
  const t = trackById(trackId)
  if (!t || !trackId) return null
  return (
    <button className="music-tile" onClick={() => { haptic('tick'); onOpen() }} aria-label={`Soundtrack: ${t.track.title} by ${t.album.artist}`}>
      <img src={t.album.cover} alt="" draggable={false} />
    </button>
  )
}

/** The album cover, big, over a dithered screen. It sits on the device so the screen under it can take the dither. */
export function AlbumPopup({ trackId, open, onClose }: { trackId?: string; open: boolean; onClose: () => void }) {
  const st = useMusicState()
  const t = trackById(trackId)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  const host = document.querySelector('.device')
  if (!t || !trackId || !host) return null
  const playing = st.playing && st.track === trackId
  return createPortal(
    <div className={`album-pop ${open ? 'on' : ''}`} onClick={onClose} role="dialog" aria-modal aria-hidden={!open} aria-label={`${t.album.title} by ${t.album.artist}`}>
      <div className="ap-dither" aria-hidden />
      <div className="ap-card" onClick={e => e.stopPropagation()}>
        {/* tapping the cover plays or pauses */}
        <img className="ap-cover" src={t.album.cover} alt={`${t.album.title} cover`} draggable={false}
          role="button" aria-label={playing ? `Pause ${t.track.title}` : `Play ${t.track.title}`}
          onClick={() => { haptic('tick'); music.toggle(trackId) }} />
        <div className="ap-meta"><b>{t.track.title}</b><small>{t.album.artist}</small></div>
      </div>
    </div>,
    host,
  )
}

/** Re-express a stage-relative box in another element's coordinates. */
export function offsetBox(b: Box | null, from: HTMLElement | null, to: HTMLElement | null): Box | null {
  if (!b || !from || !to) return b
  const a = from.getBoundingClientRect(), c = to.getBoundingClientRect()
  const dx = a.left - c.left, dy = a.top - c.top
  return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy }
}

/**
 * The stage transform that sets the zine, as the scene draws it now, exactly over a feed card (its centre,
 * width and tilt). The stage scales about its centre. Used to lift the zine out of the card and put it back.
 */
function onCard(el: HTMLElement, scene: ZineScene, card: HTMLElement | null, from: DOMRect | null | undefined) {
  const zb = zineScreenBox(scene)
  const cr = card?.getBoundingClientRect() ?? from
  if (!zb || !cr) return null
  const r = el.getBoundingClientRect(), cv = scene.canvas.getBoundingClientRect()
  const w = card ? (card.querySelector('img') ?? card).offsetWidth : cr.width
  const s = w / Math.max(1, zb.x1 - zb.x0)
  const tilt = card ? parseFloat(card.style.getPropertyValue('--tilt')) || 0 : 0
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const vx = (cv.left + (zb.x0 + zb.x1) / 2 - cx) * s, vy = (cv.top + (zb.y0 + zb.y1) / 2 - cy) * s
  const a = (tilt * Math.PI) / 180
  const tx = cr.left + cr.width / 2 - cx - (vx * Math.cos(a) - vy * Math.sin(a))
  const ty = cr.top + cr.height / 2 - cy - (vx * Math.sin(a) + vy * Math.cos(a))
  return `translate(${tx}px, ${ty}px) rotate(${tilt}deg) scale(${s})`
}

const exporters = import.meta.glob('../create/export.ts') as Record<string, () => Promise<{ exportZine: (d: ZineDoc, k: 'pdf-pages' | 'pdf-print' | 'video' | 'gif') => Promise<void> }>>

export async function runExport(doc: ZineDoc, kind: 'pdf-pages' | 'pdf-print' | 'video' | 'gif') {
  const load = exporters['../create/export.ts']
  if (!load) { useApp.getState().showToast('Export is still warming up — try again in a moment'); return }
  const m = await load()
  await m.exportZine(doc, kind)
}

export async function shareZine(doc: ZineDoc) {
  const url = `${location.origin}/z/${doc.id}`
  const title = doc.publish.title || 'A zine on Zeen'
  try {
    if (navigator.share) { await navigator.share({ title, text: `${title} — on Zeen`, url }); return }
  } catch { /* cancelled */ return }
  copyLink(doc)
}

export function copyLink(doc: ZineDoc) {
  const url = `${location.origin}/z/${doc.id}`
  navigator.clipboard?.writeText(url).catch(() => {})
  useApp.getState().showToast('Link copied')
  haptic('tick')
}

/** Shrinks a copy of the cover toward the Profile tab: the zine lands on your shelf. */
export function flyToShelf(src: string | null, box: Box | null, host: HTMLElement | null) {
  if (!src || !box || !host) return
  const r = host.getBoundingClientRect()
  const img = document.createElement('img')
  img.src = src
  img.className = 'fly-shelf'
  const w = box.x1 - box.x0
  Object.assign(img.style, { left: `${box.x0}px`, top: `${box.y0}px`, width: `${w}px` })
  host.appendChild(img)
  const tx = r.width * 0.83 - (box.x0 + w / 2), ty = r.height - 40 - (box.y0 + (box.y1 - box.y0) / 2)
  const a = img.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${tx * 0.35}px, ${ty * 0.1 - 40}px) scale(0.6) rotate(-8deg)`, opacity: 1, offset: 0.35 },
    { transform: `translate(${tx}px, ${ty}px) scale(0.06) rotate(18deg)`, opacity: 0.4 },
  ], { duration: 620, easing: 'cubic-bezier(.5,0,.75,0)' })
  a.onfinish = () => img.remove()
}

// ---------------------------------------------------------------- pull-up tab

function PullTab({ doc }: { doc: ZineDoc }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'comments' | 'replies' | 'details'>('comments')
  const [text, setText] = useState('')
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const allComments = useApp(s => s.comments)
  const comments = useMemo(() => allComments.filter(c => c.zine === doc.id), [allComments, doc.id])
  const users = useApp(s => s.users)
  const zines = useApp(s => s.zines)
  const communities = useApp(s => s.communities)
  const addComment = useApp(s => s.addComment)
  const go = useApp(s => s.go)
  const replies = Object.values(zines).filter(z => z.publish.replyTo === doc.id && z.status === 'published')
  const comm = communities.find(c => c.id === doc.publish.postTo)

  const send = () => {
    if (!text.trim()) return
    addComment(doc.id, text.trim())
    setText('')
    setOpen(true); setTab('comments')
    haptic('tap'); sfx('pop')
  }
  const grab = {
    onPointerDown: (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.current = e.clientY },
    onPointerMove: (e: React.PointerEvent) => { if (start.current !== null) setDrag(e.clientY - start.current) },
    onPointerUp: () => {
      if (start.current === null) return
      start.current = null
      if (Math.abs(drag) < 6) setOpen(o => !o)
      else if (drag < -40) setOpen(true)
      else if (drag > 40) setOpen(false)
      setDrag(0)
    },
  }
  return (
    <>
      <div className={`pull-dim ${open ? 'on' : ''}`} onClick={() => setOpen(false)} />
      <section className={`pull-tab ${open ? 'open' : ''}`} style={drag ? { transform: `translateY(calc(var(--pt-y) + ${drag}px))`, transition: 'none' } : undefined}>
        <Grabber {...grab} label={open ? 'Close comments' : 'Open comments, replies and details'} />
        <div className="pt-tabs" role="tablist">
          {(['comments', 'replies', 'details'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setOpen(true) }}>
              {t === 'comments' ? `Comments ${comments.length || ''}` : t === 'replies' ? `Reply zines ${replies.length || ''}` : 'Details'}
            </button>
          ))}
        </div>
        <div className="pt-body scroll">
          {tab === 'comments' && (comments.length ? comments.map(c => {
            const u = users.find(x => x.id === c.user)
            return (
              <div key={c.id} className="cm">
                <Avatar src={u?.avatar ?? ''} size={30} />
                <div className="cm-main"><b>{u?.name}</b> <small>{timeAgo(c.at)}</small><p>{c.text}</p></div>
                <span className="cm-likes"><Icon name="heart" size={14} />{c.likes || ''}</span>
              </div>
            )
          }) : <p className="pt-empty">No comments yet. Say something nice (or weird).</p>)}
          {tab === 'replies' && (
            <div className="reply-row hscroll">
              <button className="reply-new" onClick={() => go({ name: 'create', replyTo: doc.id })}><Icon name="plus" size={20} /><span>Reply with<br />a zine</span></button>
              {replies.map(z => <ReplyThumb key={z.id} z={z} />)}
              {!replies.length && <p className="pt-empty">No reply zines yet — be the first to answer in paper.</p>}
            </div>
          )}
          {tab === 'details' && (
            <div className="details">
              {doc.publish.description && <p className="det-desc">{doc.publish.description}</p>}
              <div className="chip-wrap">{doc.publish.tags.map(t => <span key={t} className="chip">#{t}</span>)}</div>
              <dl>
                {comm && <><dt>Community</dt><dd><button className="link" onClick={() => go({ name: 'community', id: comm.id })}>#{comm.tag} · {comm.name}</button></dd></>}
                <dt>Posted</dt><dd>{new Date(doc.publishedAt ?? doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
                <dt>Pages</dt><dd>{doc.keyframes.length} keyframes · {doc.creases.length} folds</dd>
                {doc.publish.credits.length > 0 && <><dt>Credits</dt><dd>{doc.publish.credits.join(', ')}</dd></>}
                <dt>Reads</dt><dd>{fmtCount(doc.stats?.reads ?? 0)}</dd>
              </dl>
            </div>
          )}
        </div>
        <form className="pt-input" onSubmit={e => { e.preventDefault(); send() }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="What do you think of this?" aria-label="Write a comment" onFocus={() => setOpen(true)} />
          {text.trim()
            ? <button type="submit" aria-label="Send"><Icon name="arrowRight" size={18} /></button>
            : <button type="button" aria-label="Reply with a zine" onClick={() => go({ name: 'create', replyTo: doc.id })}><Icon name="image" size={18} /></button>}
        </form>
      </section>
    </>
  )
}

function ReplyThumb({ z }: { z: ZineDoc }) {
  const src = useThumb(z)
  const go = useApp(s => s.go)
  return <button className="reply-thumb" onClick={() => go({ name: 'preview', id: z.id, from: null })}>{src && <img src={src} alt={z.publish.title} />}</button>
}

// ---------------------------------------------------------------- preview

export default function Preview({ id, from, active }: { id: string; from?: DOMRect | null; active: boolean }) {
  const doc = useApp(s => s.zines[id])
  const liked = useApp(s => s.likes.includes(id))
  const saved = useApp(s => s.saves.includes(id))
  const following = useApp(s => s.following)
  const users = useApp(s => s.users)
  const communities = useApp(s => s.communities)
  const { go, back, toggleLike, toggleSave, toggleFollow, showToast, markDownloaded } = useApp.getState()
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [noteOk, setNoteOk] = useState(false)
  const [sheet, setSheet] = useState<'download' | 'more' | null>(null)
  const [album, setAlbum] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const tapTimer = useRef(0)
  const box = useZineBox(scene)
  const thumb = useThumb(doc)
  useZineMusic(doc, active)

  const author = users.find(u => u.id === doc?.author)
  const comm = communities.find(c => c.id === doc?.publish.postTo)

  // open: the zine lifts out of its card, leaving the card's slot empty, and grows to its place here
  const card = useRef<HTMLElement | null>(null)
  const lifted = useRef(false)
  useLayoutEffect(() => { if (from && stage.current) stage.current.style.opacity = '0' }, [from])
  useEffect(() => {
    const el = stage.current
    if (!el || !scene || lifted.current) return
    lifted.current = true
    el.style.opacity = ''
    if (!from) return
    // the zine can be on more than one page of home: take the card it was opened from
    const cards = [...document.querySelectorAll<HTMLElement>(`.layer.under .zcard[data-zine="${CSS.escape(id)}"]`)]
    const at = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return Math.hypot(b.left + b.width / 2 - (from.left + from.width / 2), b.top + b.height / 2 - (from.top + from.height / 2)) }
    card.current = cards.sort((a, b) => at(a) - at(b))[0] ?? null
    scene.renderOnce()
    const t = onCard(el, scene, card.current, from)
    card.current?.classList.add('pv-hole')
    if (t) el.animate([{ transform: t }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
  }, [scene, from, id])
  // the card comes back the moment this screen is gone, which is when the zine has landed in its slot
  useEffect(() => () => card.current?.classList.remove('pv-hole'), [])

  const like = useCallback(() => {
    const on = toggleLike(id)
    if (on) { sfx('pop'); haptic('double') } else haptic('tick')
  }, [id, toggleLike])

  // back: the zine flies back into its empty slot in the feed while the rest of the preview fades (App keeps
  // this screen mounted while it leaves) and the feed's covers un-dither (reading.css)
  const close = useCallback(() => {
    const el = stage.current
    const t = el && scene && card.current ? onCard(el, scene, card.current, null) : null
    if (el && t) el.animate([{ transform: 'none' }, { transform: t }], { duration: 480, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' })
    else el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' })
    haptic('tick')
    back()
  }, [scene, back])

  const onScene = useCallback((s: ZineScene | null) => {
    setScene(s)
    if (!s || !doc) return
    const kf = doc.keyframes[doc.publish.coverKeyframe] ?? doc.keyframes[0]
    if (kf) s.setAngles(kf.angles, { animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // one tap turns the zine over, two open it to read (so a tap waits out the double-tap window), and a drag
  // or swipe only tilts it (ZineScene preview mode); liking is the heart up top
  const gatedNow = !!doc?.publish.contentNote && !noteOk
  useEffect(() => {
    if (!scene) return
    scene.handlers.tap = p => {
      if (gatedNow || !scene.pick(p.x, p.y)) return
      clearTimeout(tapTimer.current)
      tapTimer.current = window.setTimeout(() => { haptic('tap'); scene.flip() }, 300)
    }
    scene.handlers.doubleTap = () => {
      clearTimeout(tapTimer.current)
      if (gatedNow) return true
      haptic('tap')
      go({ name: 'read', id })
      return true
    }
  }, [scene, id, go, gatedNow])
  useEffect(() => () => clearTimeout(tapTimer.current), [])

  if (!doc) {
    return <div className="screen"><div className="top-bar"><PillGroup className="solo"><IconBtn name="back" label="Back" onClick={back} /></PillGroup></div><p className="pt-empty" style={{ marginTop: 140 }}>This zine was folded away.</p></div>
  }

  const save = () => {
    const on = toggleSave(id)
    if (on) { flyToShelf(thumb, offsetBox(box, stage.current, root.current), root.current); haptic('tap'); sfx('rustle'); setTimeout(() => showToast('Saved to your shelf.', { label: 'View', run: () => useApp.getState().tab('profile') }), 380) }
    else { haptic('tick'); showToast('Removed from your shelf') }
  }
  const gated = !!doc.publish.contentNote && !noteOk

  return (
    <div className="screen preview" ref={root}>
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="back" label="Back" onClick={close} /></PillGroup>
        <PillGroup>
          <IconBtn name="heart" label={liked ? 'Unlike' : 'Like'} onClick={like} className={liked ? 'liked' : ''} />
          <IconBtn name="bookmark" label={saved ? 'Remove from shelf' : 'Save to shelf'} onClick={save} className={saved ? 'saved' : ''} />
          <IconBtn name="copy" label="Share" onClick={() => shareZine(doc)} />
          <IconBtn name="more" label="More" onClick={() => setSheet('more')} />
        </PillGroup>
      </div>

      {doc.music && <div className="pv-music"><MusicTile trackId={doc.music.track} onOpen={() => setAlbum(true)} /></div>}

      <div className="pv-stage" ref={stage}>
        <ZineView doc={doc} mode="preview" handles={false} keepAngles={false} onScene={onScene} className={gated ? 'gated' : ''} />
      </div>

      {gated && (
        <div className="content-note">
          <Icon name="info" size={22} />
          <h4>Content note</h4>
          <p>{doc.publish.contentNote}</p>
          <Button kind="dark" onClick={() => { setNoteOk(true); haptic('tap') }}>View zine</Button>
        </div>
      )}

      <div className="pv-hint">tap to turn it over · double-tap to read · drag to tilt</div>

      <div className="pv-info">
        <div className="pv-maker">
          <button className="pv-who" onClick={() => author && go({ name: 'profile', id: author.id })}>
            {author && <Avatar src={author.avatar} size={34} />}
            <span><b>{doc.publish.title || 'Untitled'}</b><small>{author?.name} · {fmtCount(author?.followers ?? 0)} readers</small></span>
          </button>
          {author && author.id !== useApp.getState().me.id && (
            <Button kind="dark" icon="users" onClick={() => { toggleFollow(author.id); haptic('tap') }} className={following.includes(author.id) ? 'following' : ''}>
              {following.includes(author.id) ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>
        {comm && <div className="pv-comm">community <button onClick={() => go({ name: 'community', id: comm.id })} style={{ color: comm.color === '#1A1A1A' || luminance(comm.color) > 0.7 ? 'var(--accent)' : comm.color }}>#{comm.tag}</button></div>}
      </div>

      <PullTab doc={doc} />
      <AlbumPopup trackId={doc.music?.track} open={album} onClose={() => setAlbum(false)} />

      <Sheet open={sheet === 'download'} onClose={() => setSheet(null)} title="Download" dim>
        <div className="menu-list">
          <button onClick={() => { markDownloaded(id); setSheet(null); showToast('Saved for offline reading'); haptic('tap') }}><Icon name="download" /><span><b>Offline copy</b><small>Read it on the subway</small></span></button>
          <button onClick={() => { setSheet(null); runExport(doc, 'pdf-pages') }}><Icon name="pdf" /><span><b>PDF · flat pages</b><small>One page per zine page</small></span></button>
          <button onClick={() => { setSheet(null); runExport(doc, 'pdf-print') }}><Icon name="scissors" /><span><b>PDF · print and fold</b><small>Dashed folds, solid cuts — make the real one</small></span></button>
          <button onClick={() => { setSheet(null); runExport(doc, 'video') }}><Icon name="film" /><span><b>Video</b><small>The unfold, with music</small></span></button>
          <button onClick={() => { setSheet(null); runExport(doc, 'gif') }}><Icon name="gif" /><span><b>GIF</b><small>A short loop of the unfold</small></span></button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} dim>
        <div className="menu-list">
          {!gated && <button onClick={() => { setSheet(null); haptic('tap'); go({ name: 'read', id: doc.id }) }}><Icon name="book" /><span><b>Read</b><small>Open it up and unfold it page by page</small></span></button>}
          <button onClick={() => { setSheet(null); go({ name: 'create', replyTo: doc.id }) }}><Icon name="reply" /><span><b>Reply with a zine</b></span></button>
          <button onClick={() => setSheet('download')}><Icon name="download" /><span><b>Save offline</b><small>Offline copy, PDF, video or GIF</small></span></button>
          <button onClick={() => { setSheet(null); copyLink(doc) }}><Icon name="link" /><span><b>Copy link</b></span></button>
          {author && <button onClick={() => { setSheet(null); go({ name: 'profile', id: author.id }) }}><Icon name="user" /><span><b>More from {author.name}</b></span></button>}
          <button className="danger" onClick={() => { setSheet(null); showToast('Reported. Thanks for keeping Zeen kind.') }}><Icon name="flag" /><span><b>Report</b></span></button>
        </div>
      </Sheet>
    </div>
  )
}

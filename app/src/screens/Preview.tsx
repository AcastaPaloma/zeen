import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { trackById } from '../lib/assets'
import { luminance } from '../lib/compose'
import { haptic, sfx } from '../lib/feedback'
import { music, type MusicState } from '../lib/music'
import { useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import type { ZineScene } from '../three/ZineScene'
import { Icon } from '../ui/Icon'
import { Avatar, Button, fmtCount, IconBtn, PillGroup, Sheet, timeAgo } from '../ui/kit'
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
  const st = useMusicState()
  const t = trackById(trackId)
  if (!t || !trackId) return null
  const playing = st.playing && st.track === trackId
  return (
    <button className="music-tile" onClick={() => { haptic('tick'); onOpen() }} aria-label={`Soundtrack: ${t.track.title} by ${t.album.artist}`}>
      <img src={t.album.cover} alt="" draggable={false} />
      {playing && <span className="mt-eq" aria-hidden><i /><i /><i /></span>}
    </button>
  )
}

/** The album cover, big, over a dithered screen. */
export function AlbumPopup({ trackId, open, onClose }: { trackId?: string; open: boolean; onClose: () => void }) {
  const st = useMusicState()
  const t = trackById(trackId)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!t || !trackId) return null
  const playing = st.playing && st.track === trackId
  return (
    <div className={`album-pop ${open ? 'on' : ''}`} onClick={onClose} role="dialog" aria-modal aria-hidden={!open} aria-label={`${t.album.title} by ${t.album.artist}`}>
      <div className="ap-dither" aria-hidden />
      <div className="ap-card" onClick={e => e.stopPropagation()}>
        {/* tapping the cover plays or pauses */}
        <img className="ap-cover" src={t.album.cover} alt={`${t.album.title} cover`} draggable={false}
          role="button" aria-label={playing ? `Pause ${t.track.title}` : `Play ${t.track.title}`}
          onClick={() => { haptic('tick'); music.toggle(trackId) }} />
        <div className="ap-meta"><b>{t.track.title}</b><small>{t.album.artist}</small></div>
      </div>
    </div>
  )
}

/** The heart sticker that slaps onto a liked zine. Fresh = play the slap. */
export function HeartSticker({ box, fresh, src = '/assets/stickers/glitter-heart.webp', at = [0.82, 0.24] }: {
  box: Box | null; fresh: number; src?: string; at?: [number, number]
}) {
  if (!box) return null
  const w = box.x1 - box.x0, h = box.y1 - box.y0
  const size = Math.max(34, Math.min(70, w * 0.2))
  const style: CSSProperties = { left: box.x0 + w * at[0], top: box.y0 + h * at[1], width: size }
  return <img key={fresh} className={`heart-sticker ${fresh ? 'slap' : ''}`} src={src} alt="" style={style} draggable={false} />
}

/** Re-express a stage-relative box in another element's coordinates. */
export function offsetBox(b: Box | null, from: HTMLElement | null, to: HTMLElement | null): Box | null {
  if (!b || !from || !to) return b
  const a = from.getBoundingClientRect(), c = to.getBoundingClientRect()
  const dx = a.left - c.left, dy = a.top - c.top
  return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy }
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
        <div className="pt-grab" {...grab} role="button" aria-label={open ? 'Close comments' : 'Open comments, replies and details'}><span /></div>
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
  const [slap, setSlap] = useState(0)
  const [noteOk, setNoteOk] = useState(false)
  const [sheet, setSheet] = useState<'download' | 'more' | null>(null)
  const [album, setAlbum] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const box = useZineBox(scene)
  const thumb = useThumb(doc)
  useZineMusic(doc, active)

  const author = users.find(u => u.id === doc?.author)
  const comm = communities.find(c => c.id === doc?.publish.postTo)

  // lift: start where the card was and spring to centre
  useLayoutEffect(() => {
    const el = stage.current
    if (!el || !from) return
    const host = root.current!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const zw = Math.min(r.width * 0.62, r.height * 0.62 * 0.68)
    const s = from.width / zw
    const dx = from.left + from.width / 2 - (r.left + r.width / 2)
    const dy = from.top + from.height / 2 - (r.top + r.height / 2)
    void host
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = 'transform 520ms cubic-bezier(0.34, 1.32, 0.64, 1)'
      el.style.transform = ''
    })
  }, [from])

  const like = useCallback(() => {
    const on = toggleLike(id)
    if (on) { setSlap(Date.now()); sfx('slap'); haptic('double') } else haptic('tick')
  }, [id, toggleLike])

  const onScene = useCallback((s: ZineScene | null) => {
    setScene(s)
    if (!s || !doc) return
    const kf = doc.keyframes[doc.publish.coverKeyframe] ?? doc.keyframes[0]
    if (kf) s.setAngles(kf.angles, { animate: false })
    s.handlers = {
      doubleTap: () => {
        if (!useApp.getState().likes.includes(id)) like()
        else { setSlap(Date.now()); sfx('slap'); haptic('tap') }
        return true
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  useEffect(() => { if (scene) scene.handlers.doubleTap = () => { if (!useApp.getState().likes.includes(id)) like(); else { setSlap(Date.now()); sfx('slap') } return true } }, [scene, like, id])

  if (!doc) {
    return <div className="screen dots"><div className="top-bar"><PillGroup className="solo"><IconBtn name="back" label="Back" onClick={back} /></PillGroup></div><p className="pt-empty" style={{ marginTop: 140 }}>This zine was folded away.</p></div>
  }

  const save = () => {
    const on = toggleSave(id)
    if (on) { flyToShelf(thumb, offsetBox(box, stage.current, root.current), root.current); haptic('tap'); sfx('rustle'); setTimeout(() => showToast('Saved to your shelf.', { label: 'View', run: () => go({ name: 'profile' }) }), 380) }
    else { haptic('tick'); showToast('Removed from your shelf') }
  }
  const gated = !!doc.publish.contentNote && !noteOk

  return (
    <div className="screen preview" ref={root}>
      <div className="pv-backdrop" aria-hidden />
      <div className="pv-dither" aria-hidden />

      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="back" label="Back" onClick={back} /></PillGroup>
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
        {liked && <HeartSticker box={box} fresh={slap} />}
      </div>

      {gated && (
        <div className="content-note">
          <Icon name="info" size={22} />
          <h4>Content note</h4>
          <p>{doc.publish.contentNote}</p>
          <Button kind="dark" onClick={() => { setNoteOk(true); haptic('tap') }}>View zine</Button>
        </div>
      )}

      <div className="pv-hint">swipe to turn it over · double-tap to like</div>

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
        <div className="pv-actions">
          <button className="pv-act" onClick={() => go({ name: 'create', replyTo: doc.id })} aria-label="Reply with a zine"><Icon name="reply" size={19} /><span>Reply</span></button>
          <button className="pv-act" onClick={() => setSheet('download')} aria-label="Download"><Icon name="download" size={19} /><span>Save offline</span></button>
          <Button kind="primary" className="pv-read" onClick={() => { haptic('tap'); go({ name: 'read', id: doc.id }) }} disabled={gated}>Read</Button>
        </div>
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
          <button onClick={() => { setSheet(null); copyLink(doc) }}><Icon name="link" /><span><b>Copy link</b></span></button>
          <button onClick={() => { setSheet(null); go({ name: 'create', replyTo: doc.id }) }}><Icon name="reply" /><span><b>Reply with a zine</b></span></button>
          {author && <button onClick={() => { setSheet(null); go({ name: 'profile', id: author.id }) }}><Icon name="user" /><span><b>More from {author.name}</b></span></button>}
          <button className="danger" onClick={() => { setSheet(null); showToast('Reported. Thanks for keeping Zeen kind.') }}><Icon name="flag" /><span><b>Report</b></span></button>
        </div>
      </Sheet>
    </div>
  )
}

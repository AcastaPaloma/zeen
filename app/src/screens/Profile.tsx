import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { haptic, isMuted, setMuted, sfx } from '../lib/feedback'
import { music } from '../lib/music'
import { ME } from '../lib/samples'
import { removeShelf, useApp, type Shelf } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { User, ZineDoc } from '../lib/types'
import { BottomNav } from '../ui/BottomNav'
import { Icon, type IconName } from '../ui/Icon'
import { Button, fmtCount, Sheet } from '../ui/kit'
import { openZine, SocTabs } from './Community'
import { MessyGrid } from './ZineGrid'
import './social.css'

const isColor = (h: string) => /^#|^rgb|^hsl/.test(h)

/** Header background: a colour or a full-bleed image. */
export function HeaderBg({ header }: { header: string }) {
  if (isColor(header)) return null
  return <img className="pf-header-img" src={header} alt="" draggable={false} />
}

export function HeaderStickers({ stickers }: { stickers: User['stickers'] }) {
  return (
    <>
      {(stickers ?? []).map((s, i) => (
        <img key={i} className="pf-sticker" src={s.src} alt="" draggable={false}
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%`, '--r': `${s.rot}rad`, transform: `translate(-50%, -50%) rotate(${s.rot}rad)`, animationDelay: `${200 + i * 80}ms` } as CSSProperties} />
      ))}
    </>
  )
}

function MiniThumb({ z, onClick }: { z: ZineDoc; onClick?: () => void }) {
  const src = useThumb(z)
  return src ? <img src={src} alt={z.publish.title} onClick={onClick} /> : null
}

// ---------------------------------------------------------------- shelf

const hashOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0 }
const SPINES = ['#245AE2', '#F8D647', '#FF4934', '#4BA334', '#F158A7', '#1A1A1A', '#C0F6FF', '#EBEFD7']
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }

function Book({ z, face, onDown, lifted }: { z: ZineDoc; face: boolean; onDown: (e: React.PointerEvent, z: ZineDoc, src: string | null) => void; lifted: boolean }) {
  const src = useThumb(z)
  const h = hashOf(z.id)
  const lean = h % 7 === 3
  if (face) {
    return (
      <div className={`book face ${lean ? 'lean' : ''} ${lifted ? 'lifted' : ''}`} onPointerDown={e => onDown(e, z, src)} role="button" tabIndex={0}
        aria-label={`${z.publish.title}. Hold to move to another shelf`} onKeyDown={e => { if (e.key === 'Enter') openZine(z) }}>
        {src && <img src={src} alt="" draggable={false} />}
      </div>
    )
  }
  const color = z.surfaces[0]?.color && z.surfaces[0].color !== '#FBFAF6' ? z.surfaces[0].color : SPINES[h % SPINES.length]
  const height = 104 + (h % 4) * 9
  return (
    <div className={`book spine ${lean ? 'lean' : ''} ${lifted ? 'lifted' : ''}`} onPointerDown={e => onDown(e, z, src)} role="button" tabIndex={0}
      aria-label={`${z.publish.title}. Hold to move to another shelf`} onKeyDown={e => { if (e.key === 'Enter') openZine(z) }}
      style={{ background: color, height, color: lum(color) > 0.6 ? '#1A1A1A' : '#fff', width: 22 + (h % 3) * 3 }}>
      <span>{z.publish.title || 'Untitled'}</span>
    </div>
  )
}

function Shelves({ editable }: { editable: boolean }) {
  const shelves = useApp(s => s.shelves)
  const saves = useApp(s => s.saves)
  const zines = useApp(s => s.zines)
  const moveToShelf = useApp(s => s.moveToShelf)
  const renameShelf = useApp(s => s.renameShelf)
  const addShelf = useApp(s => s.addShelf)
  const [drag, setDrag] = useState<{ z: ZineDoc; src: string | null; x: number; y: number; from: string } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const press = useRef<{ timer: number; x: number; y: number; z: ZineDoc; src: string | null; from: string; lifted: boolean; el: HTMLElement; id: number } | null>(null)

  // anything saved but not on a shelf yet lands on the first one
  const view: Shelf[] = useMemo(() => {
    const onShelf = new Set(shelves.flatMap(s => s.zines))
    const loose = saves.filter(id => !onShelf.has(id))
    return shelves.map((s, i) => ({ ...s, zines: (i === 0 ? [...s.zines, ...loose] : s.zines).filter(id => zines[id]) }))
  }, [shelves, saves, zines])

  // while a book is lifted, stop the page from scrolling under the finger
  useEffect(() => {
    if (!drag) return
    const stop = (e: TouchEvent) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [drag])

  const shelfAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const s = (el as HTMLElement).closest?.('[data-shelf]') as HTMLElement | null
      if (s) return s.dataset.shelf ?? null
    }
    return null
  }

  const onDown = (from: string) => (e: React.PointerEvent, z: ZineDoc, src: string | null) => {
    const el = e.currentTarget as HTMLElement
    const id = e.pointerId
    const p = { timer: 0, x: e.clientX, y: e.clientY, z, src, from, lifted: false, el, id }
    press.current = p
    if (editable) {
      p.timer = window.setTimeout(() => {
        p.lifted = true
        try { el.setPointerCapture(id) } catch { /* ignore */ }
        haptic('firm'); sfx('rustle')
        setDrag({ z, src, x: p.x, y: p.y, from })
        setHover(from)
      }, 300)
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id || !press.current) return
      if (!p.lifted) {
        if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 8) { clearTimeout(p.timer); cleanup(); press.current = null }
        return
      }
      ev.preventDefault()
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d))
      const s = shelfAt(ev.clientX, ev.clientY)
      setHover(h => { if (s && s !== h) haptic('tick'); return s })
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      clearTimeout(p.timer)
      cleanup()
      if (p.lifted) {
        const target = shelfAt(ev.clientX, ev.clientY)
        if (target && target !== p.from) {
          moveToShelf(z.id, target)
          haptic('tap'); sfx('click')
          const name = useApp.getState().shelves.find(s => s.id === target)?.name
          useApp.getState().showToast(`Moved to ${name}`)
        }
        setDrag(null); setHover(null)
      } else if (press.current && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 8) {
        openZine(z, el.getBoundingClientRect())
      }
      press.current = null
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  if (!saves.length && view.every(s => !s.zines.length)) {
    return <div className="empty-note">Your shelf is empty. Save a zine from its preview and it'll stand here.</div>
  }

  return (
    <div className="shelves">
      {editable && <div className="shelf-hint">Hold a zine to move it between shelves. Tap a shelf name to rename it.</div>}
      {view.map(sh => (
        <section key={sh.id} className={`shelf ${drag && hover === sh.id && drag.from !== sh.id ? 'drop' : ''}`} data-shelf={sh.id}>
          <div className="shelf-head">
            {editable
              ? <input className="shelf-name" defaultValue={sh.name} aria-label="Shelf name" onBlur={e => { const v = e.target.value.trim(); if (v && v !== sh.name) renameShelf(sh.id, v) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              : <span className="shelf-name">{sh.name}</span>}
            <span className="shelf-count">{sh.zines.length}</span>
            {editable && !sh.zines.length && shelves.length > 1 && (
              <button className="icon-btn" aria-label="Remove empty shelf" onClick={() => removeShelf(sh.id)}><Icon name="trash" size={16} /></button>
            )}
          </div>
          <div className="shelf-row">
            {sh.zines.map((id, i) => {
              const z = zines[id]
              const face = i === 0 || hashOf(id) % 5 < 2
              return <Book key={id} z={z} face={face} onDown={onDown(sh.id)} lifted={drag?.z.id === id} />
            })}
            {!sh.zines.length && <span className="muted" style={{ fontSize: 12, alignSelf: 'center', paddingBottom: 30 }}>Drop zines here</span>}
          </div>
        </section>
      ))}
      {editable && (
        <button className="shelf-add" onClick={() => { const id = addShelf('New shelf'); haptic('tap'); setTimeout(() => (document.querySelector(`[data-shelf="${id}"] .shelf-name`) as HTMLInputElement | null)?.select(), 50) }}>
          <Icon name="plus" size={16} /> Add a shelf
        </button>
      )}
      {drag && (
        <div className="book-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.src ? <img src={drag.src} alt="" /> : <div className="book spine" style={{ height: 120, background: '#ddd' }} />}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- profile

function MenuItem({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}><Icon name={icon} size={20} /> {label}</button>
}

export default function Profile({ id }: { active: boolean; id?: string }) {
  const meUser = useApp(s => s.me)
  const users = useApp(s => s.users)
  const zines = useApp(s => s.zines)
  const pinned = useApp(s => s.pinned)
  const following = useApp(s => s.following)
  const toggleFollow = useApp(s => s.toggleFollow)
  const togglePin = useApp(s => s.togglePin)
  const go = useApp(s => s.go)
  const back = useApp(s => s.back)
  const isMe = !id || id === ME
  const user = isMe ? meUser : users.find(u => u.id === id)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'own' | 'collection'>('own')
  const [menu, setMenu] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [muted, setM] = useState(isMuted())

  const own = useMemo(() => Object.values(zines).filter(z => user && z.author === user.id && z.status === 'published')
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)), [zines, user])
  const drafts = useMemo(() => (isMe ? Object.values(zines).filter(z => z.author === ME && z.status === 'draft').sort((a, b) => b.updatedAt - a.updatedAt) : []), [zines, isMe])
  if (!user) return null

  const pins = isMe ? pinned.map(p => zines[p]).filter((z): z is ZineDoc => !!z && z.author === ME) : own.slice(0, 1)
  const rest = own.filter(z => !pins.includes(z))
  const isFollowing = following.includes(user.id)
  const followers = user.followers + (isFollowing && !isMe ? 1 : 0)
  const hdr = user.header || '#222'

  const onOpen = (z: ZineDoc, rect: DOMRect) => {
    if (pinMode) {
      const was = useApp.getState().pinned.includes(z.id)
      if (!was && useApp.getState().pinned.length >= 3) useApp.getState().showToast('Unpin one first — 3 pins max')
      else { togglePin(z.id); haptic('tap'); useApp.getState().showToast(was ? 'Unpinned' : 'Pinned to the top') }
      return
    }
    openZine(z, rect)
  }

  return (
    <div className="pf">
      <div className="pf-scroll" onScroll={e => {
        const y = (e.target as HTMLElement).scrollTop
        setScrollY(y)
        if (expanded && y > 60) setExpanded(false)
      }}>
        <header className={`pf-header ${expanded ? 'expanded' : ''}`} style={{ '--hdr': isColor(hdr) ? hdr : '#222' } as CSSProperties}
          onClick={() => { haptic('tick'); setExpanded(x => !x) }} aria-expanded={expanded} aria-label={`${user.name}'s profile header. Tap to ${expanded ? 'collapse' : 'expand'}`}>
          <HeaderBg header={hdr} />
          <HeaderStickers stickers={user.stickers} />
          <div className="pf-corner l" onClick={e => e.stopPropagation()}>
            {!isMe && <button className="pf-round" aria-label="Back" onClick={back}><Icon name="arrowLeft" size={18} /></button>}
          </div>
          <div className="pf-corner r" onClick={e => e.stopPropagation()}>
            <button className="pf-round" aria-label="Profile menu" onClick={() => setMenu(true)}><Icon name={isMe ? 'settings' : 'more'} size={18} /></button>
          </div>
          <div className="pf-id">
            <div className="pf-name">{user.name}</div>
            <div className="pf-readers">{fmtCount(followers)} readers</div>
            <p className="pf-bio">{user.bio}</p>
            <div className="pf-tags">{user.tags.map(t => <span key={t}>#{t}</span>)}</div>
          </div>
          <span className="pf-grabber" />
        </header>

        {expanded && own.length > 0 && (
          <div className="pf-minis">{own.slice(0, 8).map((z, i) => <span key={z.id} style={{ animationDelay: `${i * 40}ms` }}><MiniThumb z={z} onClick={() => openZine(z)} /></span>)}</div>
        )}

        <div className="pf-bar">
          <div className="pf-stats">
            <div><b>{own.length}</b><small>zines</small></div>
            <div><b>{fmtCount(followers)}</b><small>readers</small></div>
            <div><b>{fmtCount(user.following)}</b><small>following</small></div>
          </div>
          {isMe
            ? <Button kind="dark" icon="edit" onClick={() => go({ name: 'edit-profile' })}>Edit profile</Button>
            : <Button kind="dark" className={isFollowing ? 'following' : ''} icon={isFollowing ? 'check' : 'users'}
                onClick={() => { toggleFollow(user.id); haptic('tap'); if (!isFollowing) sfx('pop') }}>{isFollowing ? 'Following' : 'Follow'}</Button>}
        </div>
        {(user.links ?? []).length > 0 && (
          <div className="pf-extras">
            {(user.links ?? []).map(l => <span key={l} className="link-chip"><Icon name="link" size={13} />{l}</span>)}
          </div>
        )}

        <SocTabs value={tab} onChange={setTab} options={[{ value: 'own', label: 'Own Work' }, { value: 'collection', label: isMe ? 'Collected' : 'Collected' }]} />

        {tab === 'own' && (
          <>
            {isMe && (
              <>
                <div className="pf-section"><h4>Drafts</h4><span className="muted" style={{ fontSize: 11 }}>only you see these</span></div>
                <div className="drafts-row">
                  <button className="draft-card" onClick={() => go({ name: 'create' })}>
                    <span className="dc-img draft-new"><Icon name="plus" size={24} /></span>
                    <small>New zine</small>
                  </button>
                  {drafts.map(z => (
                    <button key={z.id} className="draft-card" onClick={() => go({ name: 'create', id: z.id })}>
                      <span className="dc-img"><MiniThumb z={z} /></span>
                      <small>{z.publish.title || 'Untitled'} · {new Date(z.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {isMe && own.length > 0 && (
              <div className="pf-section">
                <h4>Pinned</h4>
                <button className={`chip ${pinMode ? 'active' : ''}`} onClick={() => { setPinMode(p => !p); haptic('tick') }}>{pinMode ? 'Done' : 'Edit pins'}</button>
              </div>
            )}
            {pinMode && <p className="pin-mode-note">Tap zines to pin or unpin (up to 3).</p>}
            {pins.length > 0 && <MessyGrid zines={pins} onOpen={onOpen} scrollY={scrollY} badges={() => 'pin'} />}
            {pins.length > 0 && rest.length > 0 && <div style={{ height: 34 }} />}
            {rest.length > 0 && <MessyGrid zines={rest} onOpen={onOpen} scrollY={scrollY} badges={z => (z.publish.replyTo ? 'reply' : undefined)} />}
            {!own.length && (
              <div className="empty-note">{isMe ? 'Nothing published yet. Your first zine is one fold away.' : `${user.name} hasn't published yet.`}
                {isMe && <><br /><Button icon="plus" onClick={() => go({ name: 'create' })}>Make a zine</Button></>}
              </div>
            )}
          </>
        )}
        {tab === 'collection' && (isMe
          ? <Shelves editable />
          : <div className="empty-note">{user.name}'s shelf is private.</div>)}
      </div>

      <BottomNav current={isMe ? 'profile' : 'home'} search={false} />

      <Sheet open={menu} onClose={() => setMenu(false)} dim>
        <div className="menu-list">
          {isMe ? (
            <>
              <MenuItem icon="edit" label="Edit profile" onClick={() => { setMenu(false); go({ name: 'edit-profile' }) }} />
              <MenuItem icon="folder" label="Scrapbook" onClick={() => { setMenu(false); go({ name: 'scrapbook' }) }} />
              <MenuItem icon={muted ? 'volumeOff' : 'volume'} label={muted ? 'Sounds off' : 'Sounds on'} onClick={() => { setMuted(!muted); setM(!muted); music.setMuted(!muted) }} />
              <MenuItem icon="play" label="Replay the intro" onClick={() => { setMenu(false); go({ name: 'intro' }) }} />
              <MenuItem icon="link" label="Copy profile link" onClick={() => { navigator.clipboard?.writeText(`zeen.app/@${user.handle}`).catch(() => {}); setMenu(false); useApp.getState().showToast('Link copied') }} />
            </>
          ) : (
            <>
              <MenuItem icon="share" label="Share profile" onClick={() => { navigator.clipboard?.writeText(`zeen.app/@${user.handle}`).catch(() => {}); setMenu(false); useApp.getState().showToast('Link copied') }} />
              <MenuItem icon="flag" label="Report" onClick={() => { setMenu(false); useApp.getState().showToast('Thanks — our mods will take a look') }} />
              <MenuItem icon="x" label={`Block ${user.name}`} danger onClick={() => { setMenu(false); useApp.getState().showToast(`Blocked ${user.name}`); back() }} />
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}

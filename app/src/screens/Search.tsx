import { useEffect, useMemo, useRef, useState } from 'react'
import { trackById } from '../lib/assets'
import { published, useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Avatar, Chip, fmtCount, Sheet } from '../ui/kit'
import './reading.css'

function ZineRow({ z, onOpen }: { z: ZineDoc; onOpen: (z: ZineDoc) => void }) {
  const src = useThumb(z)
  const author = useApp(s => s.users.find(u => u.id === z.author))
  return (
    <button className="sr-row" onClick={() => onOpen(z)}>
      <span className="sr-thumb">{src && <img src={src} alt="" />}</span>
      <span className="sr-text">
        <b>{z.publish.title || 'Untitled'}</b>
        <small>{author ? `@${author.handle}` : ''}{z.publish.tags.length ? ` · #${z.publish.tags.slice(0, 2).join(' #')}` : ''}</small>
      </span>
      <Icon name="right" size={16} />
    </button>
  )
}

/** Pull-up search sheet: zines, makers, communities, tags and songs used in zines. */
export default function Search() {
  const open = useApp(s => s.searchOpen)
  const setOpen = useApp(s => s.setSearchOpen)
  const zines = useApp(s => s.zines)
  const users = useApp(s => s.users)
  const communities = useApp(s => s.communities)
  const recent = useApp(s => s.recentSearches)
  const addRecent = useApp(s => s.addRecentSearch)
  const go = useApp(s => s.go)
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { const t = setTimeout(() => input.current?.focus(), 320); return () => clearTimeout(t) }
    setQ('')
  }, [open])

  const all = useMemo(() => published(zines), [zines])
  const trending = useMemo(() => {
    const count = new Map<string, number>()
    for (const z of all) for (const t of z.publish.tags) count.set(t, (count.get(t) ?? 0) + (z.stats?.likes ?? 1))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [all])

  const s = q.trim().toLowerCase().replace(/^[#@]/, '')
  const res = useMemo(() => {
    if (!s) return null
    const has = (x?: string) => !!x && x.toLowerCase().includes(s)
    const songOf = (z: ZineDoc) => trackById(z.music?.track)
    return {
      zines: all.filter(z => has(z.publish.title) || has(z.publish.description) || z.publish.tags.some(has)).slice(0, 12),
      makers: users.filter(u => has(u.name) || has(u.handle) || has(u.bio)).slice(0, 8),
      communities: communities.filter(c => has(c.name) || has(c.tag) || has(c.description)),
      tags: [...new Set(all.flatMap(z => z.publish.tags))].filter(has).slice(0, 10),
      songs: all.filter(z => { const t = songOf(z); return t && (has(t.track.title) || has(t.album.artist) || has(t.album.title) || has(t.track.mood)) })
        .map(z => ({ z, t: songOf(z)! })).slice(0, 8),
    }
  }, [s, all, users, communities])

  const close = () => setOpen(false)
  const commit = () => addRecent(q.trim())
  const openZine = (z: ZineDoc) => { commit(); close(); go({ name: 'preview', id: z.id, from: null }) }
  const empty = res && !res.zines.length && !res.makers.length && !res.communities.length && !res.tags.length && !res.songs.length

  return (
    <Sheet open={open} onClose={close} height="full" dim className="search-sheet"
      header={
        <form className="search-field" onSubmit={e => { e.preventDefault(); commit(); input.current?.blur() }}>
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Zines, makers, tags, songs" aria-label="Search Zeen" enterKeyHint="search" />
          {q ? <button type="button" aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={16} /></button> : <Icon name="mic" size={18} />}
        </form>
      }>
      {!res ? (
        <div className="search-idle">
          {recent.length > 0 && (<>
            <h5>Recent</h5>
            <div className="chip-wrap">{recent.map(r => <Chip key={r} onClick={() => setQ(r)}>{r}</Chip>)}</div>
          </>)}
          <h5>Trending tags</h5>
          <div className="chip-wrap">{trending.map(t => <Chip key={t} onClick={() => setQ('#' + t)}>#{t}</Chip>)}</div>
          <h5>Communities</h5>
          {communities.map(c => (
            <button key={c.id} className="sr-row" onClick={() => { close(); go({ name: 'community', id: c.id }) }}>
              <span className="sr-badge" style={{ background: c.color }}>#</span>
              <span className="sr-text"><b>{c.name}</b><small>{fmtCount(c.members)} members · {c.perMonth} zines this month</small></span>
              <Icon name="right" size={16} />
            </button>
          ))}
        </div>
      ) : empty ? (
        <p className="search-empty">Nothing for “{q}” yet. Maybe you should make it?</p>
      ) : (
        <div className="search-results">
          {res.tags.length > 0 && <div className="chip-wrap">{res.tags.map(t => <Chip key={t} onClick={() => setQ('#' + t)}>#{t}</Chip>)}</div>}
          {res.zines.length > 0 && (<><h5>Zines</h5>{res.zines.map(z => <ZineRow key={z.id} z={z} onOpen={openZine} />)}</>)}
          {res.makers.length > 0 && (<><h5>Makers</h5>{res.makers.map(u => (
            <button key={u.id} className="sr-row" onClick={() => { commit(); close(); go({ name: 'profile', id: u.id }) }}>
              <Avatar src={u.avatar} size={40} />
              <span className="sr-text"><b>{u.name}</b><small>@{u.handle} · {fmtCount(u.followers)} readers</small></span>
              <Icon name="right" size={16} />
            </button>
          ))}</>)}
          {res.communities.length > 0 && (<><h5>Communities</h5>{res.communities.map(c => (
            <button key={c.id} className="sr-row" onClick={() => { commit(); close(); go({ name: 'community', id: c.id }) }}>
              <span className="sr-badge" style={{ background: c.color }}>#</span>
              <span className="sr-text"><b>{c.name}</b><small>#{c.tag} · {fmtCount(c.members)} members</small></span>
              <Icon name="right" size={16} />
            </button>
          ))}</>)}
          {res.songs.length > 0 && (<><h5>Songs in zines</h5>{res.songs.map(({ z, t }) => (
            <button key={z.id} className="sr-row" onClick={() => openZine(z)}>
              <span className="sr-thumb album"><img src={t.album.cover} alt="" /></span>
              <span className="sr-text"><b>{t.track.title}</b><small>{t.album.artist} · in “{z.publish.title}”</small></span>
              <Icon name="music" size={16} />
            </button>
          ))}</>)}
        </div>
      )}
    </Sheet>
  )
}

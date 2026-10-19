import { useMemo, useRef, useState } from 'react'
import { haptic, sfx } from '../lib/feedback'
import { uid } from '../lib/geom'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ScrapItem, ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Button, Sheet, timeAgo } from '../ui/kit'
import { openZine } from './Community'
import './social.css'

function UsedIn({ z, onOpen }: { z: ZineDoc; onOpen: () => void }) {
  const src = useThumb(z)
  return <button onClick={onOpen} aria-label={z.publish.title}>{src && <img src={src} alt="" />}</button>
}

/** Scrap details: when it was added, by whom, from where, how many versions exist, and where it's used. */
export function ScrapInfo({ item, onClose }: { item: ScrapItem | null; onClose: () => void }) {
  const users = useApp(s => s.users)
  const zines = useApp(s => s.zines)
  const [big, setBig] = useState(false)
  const by = item ? users.find(u => u.id === item.addedBy) : null
  return (
    <Sheet open={!!item} onClose={onClose} height="tall" dim>
      {item && (
        <>
          <div className="sb-info-img" style={big ? { height: 360 } : undefined}><img src={item.src} alt={item.name} style={big ? { maxHeight: 340 } : undefined} /></div>
          <div className="sb-info-title">
            <h3>{item.name}</h3>
            <button className="icon-btn" aria-label={big ? 'Smaller' : 'Bigger'} onClick={() => setBig(b => !b)}><Icon name={big ? 'shrink' : 'expand'} size={18} /></button>
          </div>
          <div className="sb-info-note">{item.note}</div>
          <div className="kv-sep" />
          <div className="kv"><span>Added</span><b>{timeAgo(item.addedAt)} ago</b></div>
          <div className="kv"><span>Added by</span><b>{by ? (by.id === ME ? 'you' : by.name) : 'someone'}</b></div>
          <div className="kv"><span>From</span><b>{item.from}</b></div>
          <div className="kv"><span>Where?</span><b>{item.where}</b></div>
          <div className="kv"><span>Edition</span><b>{item.edition[0]} / {item.edition[1]}</b></div>
          <div className="kv-sep" />
          <h4 className="section-title">Featured on</h4>
          <div className="featured">
            {item.usedIn.map(id => zines[id]).filter(Boolean).map(z => (
              <UsedIn key={z.id} z={z} onOpen={() => { onClose(); openZine(z) }} />
            ))}
            {!item.usedIn.length && <span className="muted" style={{ fontSize: 13 }}>Not used in a zine yet.</span>}
          </div>
        </>
      )}
    </Sheet>
  )
}

export default function Scrapbook(_: { active: boolean }) {
  const items = useApp(s => s.scrapbook)
  const addScraps = useApp(s => s.addScraps)
  const back = useApp(s => s.back)
  const [q, setQ] = useState('')
  const [coll, setColl] = useState<string | null>(null)
  const [info, setInfo] = useState<ScrapItem | null>(null)
  const [peek, setPeek] = useState<ScrapItem | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const press = useRef<{ t: number; long: boolean; x: number; y: number } | null>(null)

  const collections = useMemo(() => {
    const m = new Map<string, ScrapItem[]>()
    for (const it of items) { const l = m.get(it.collection) ?? []; l.push(it); m.set(it.collection, l) }
    return [...m.entries()]
  }, [items])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items.filter(it => (!coll || it.collection === coll) && (!s || `${it.name} ${it.note} ${it.collection} ${it.from}`.toLowerCase().includes(s)))
  }, [items, q, coll])

  const groups = useMemo(() => {
    const m = new Map<string, ScrapItem[]>()
    for (const it of filtered) { const l = m.get(it.collection) ?? []; l.push(it); m.set(it.collection, l) }
    return [...m.entries()]
  }, [filtered])

  const importFiles = (files: FileList | null) => {
    if (!files?.length) return
    const reads = [...files].map(f => new Promise<ScrapItem>(res => {
      const r = new FileReader()
      r.onload = () => res({
        id: uid('u_'), src: String(r.result), name: f.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Import', note: 'imported from your device',
        collection: 'Imports', addedAt: Date.now(), addedBy: ME, from: 'Your photos', where: 'Zeen', edition: [1, 1], usedIn: [],
        gif: f.type === 'image/gif', kind: f.type === 'image/gif' ? 'gif' : 'image',
      })
      r.readAsDataURL(f)
    }))
    Promise.all(reads).then(list => {
      addScraps(list)
      haptic('tap'); sfx('pop')
      useApp.getState().showToast(`Added ${list.length} scrap${list.length > 1 ? 's' : ''} to Imports`)
      setColl(null)
    })
  }

  return (
    <div className="soc-screen">
      <div className="soc-scroll">
        <div className="soc-topline">
          <button className="soc-back" onClick={back} aria-label="Back"><Icon name="arrowLeft" /></button>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>Scrapbook</h2>
          <button className="icon-btn" aria-label="Import scraps" onClick={() => file.current?.click()}><Icon name="plus" size={22} /></button>
        </div>
        <label className="sb-search">
          <Icon name="search" size={17} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find the perfect scrap!" aria-label="Search scraps" />
          {q && <button aria-label="Clear" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </label>
        <div className="sb-collections">
          {collections.map(([name, list]) => (
            <button key={name} className={`sb-coll ${coll === name ? 'on' : ''}`} onClick={() => { haptic('tick'); setColl(c => (c === name ? null : name)) }}>
              <span className="sbc-img"><img src={list[0].src} alt="" /></span>
              <small>{name}</small>
            </button>
          ))}
          <button className="sb-coll" onClick={() => file.current?.click()}>
            <span className="sbc-img"><Icon name="download" size={22} /></span>
            <small>Import</small>
          </button>
        </div>
        {groups.map(([name, list]) => (
          <section key={name}>
            <h4 className="section-title" style={{ padding: '0 20px' }}>{name} <Icon name="right" size={15} /></h4>
            <div className="sb-masonry">
              {list.map((it, i) => (
                <button key={it.id} className="sb-item" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-label={it.name}
                  onPointerDown={e => {
                    const p = { t: 0, long: false, x: e.clientX, y: e.clientY }
                    p.t = window.setTimeout(() => { p.long = true; haptic('medium'); setPeek(it) }, 380)
                    press.current = p
                  }}
                  onPointerMove={e => { const p = press.current; if (p && !p.long && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { clearTimeout(p.t); press.current = null } }}
                  onPointerUp={() => {
                    const p = press.current
                    press.current = null
                    if (!p) return
                    clearTimeout(p.t)
                    if (p.long) setPeek(null)
                    else { haptic('tick'); setInfo(it) }
                  }}
                  onPointerCancel={() => { if (press.current) clearTimeout(press.current.t); press.current = null; setPeek(null) }}
                  onContextMenu={e => e.preventDefault()}>
                  <img src={it.src} alt="" draggable={false} />
                  {it.gif && <span className="sb-gif">GIF</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!filtered.length && (
          <div className="empty-note">No scraps match.<br /><Button kind="secondary" icon="image" onClick={() => file.current?.click()}>Import from Photos</Button></div>
        )}
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={e => { importFiles(e.target.files); e.target.value = '' }} />
      {peek && <div className="sb-peek" aria-hidden><img src={peek.src} alt="" /></div>}
      <ScrapInfo item={info} onClose={() => setInfo(null)} />
    </div>
  )
}

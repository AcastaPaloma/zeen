import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { haptic } from '../lib/feedback'
import { uid } from '../lib/geom'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ScrapItem } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Button, Sheet, timeAgo } from '../ui/kit'
import './collage-sheets.css'

/** Downscale an imported photo to ≤1200px; GIFs stay as-is so they keep moving. */
async function fileToScrap(file: File, from: string): Promise<ScrapItem> {
  const gif = file.type === 'image/gif'
  const raw = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  let src = raw
  if (!gif) {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw })
    const s = Math.min(1, 1200 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    src = c.toDataURL('image/webp', 0.9)
  }
  return {
    id: uid('u_'), src, name: file.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Scrap', note: from === 'camera' ? 'snapped just now' : 'imported',
    collection: 'Imports', addedAt: Date.now(), addedBy: ME, from: from === 'camera' ? 'camera' : 'camera roll', where: 'Zeen',
    edition: [1, 1], usedIn: [], gif, kind: gif ? 'gif' : 'image',
  }
}

function useLongPress(onLong: () => void, onTap: () => void) {
  const t = useRef(0)
  const fired = useRef(false)
  const start = useRef<[number, number]>([0, 0])
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      start.current = [e.clientX, e.clientY]
      t.current = window.setTimeout(() => { fired.current = true; haptic('firm'); onLong() }, 450)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) clearTimeout(t.current)
    },
    onPointerUp: () => { clearTimeout(t.current); if (!fired.current) onTap() },
    onPointerCancel: () => clearTimeout(t.current),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

function ScrapTile({ item, selected, onToggle, onInfo, big, style }: {
  item: ScrapItem; selected: boolean; onToggle: () => void; onInfo: () => void; big?: boolean; style?: CSSProperties
}) {
  const lp = useLongPress(onInfo, onToggle)
  return (
    <button className={`scrap-tile ${big ? 'big' : ''} ${selected ? 'sel' : ''} ${item.kind}`} style={style} {...lp}
      aria-pressed={selected} aria-label={`${item.name}${selected ? ', selected' : ''}. Long-press for details`}>
      <img src={item.src} alt={item.name} draggable={false} loading="lazy" />
      {item.kind === 'gif' && <span className="gif-badge">GIF</span>}
      <span className={`scrap-check ${selected ? 'on' : ''}`} aria-hidden>{selected && <Icon name="check" size={11} stroke={3} />}</span>
    </button>
  )
}

function ZineThumb({ id }: { id: string }) {
  const z = useApp(s => s.zines[id])
  const src = useThumb(z)
  if (!z) return null
  return (
    <div className="featured-z">
      {src ? <img src={src} alt="" /> : <span className="zcard-ph" />}
      <small>{z.publish.title}</small>
    </div>
  )
}

function Detail({ item, selected, onBack, onToggle, onAdd }: {
  item: ScrapItem; selected: boolean; onBack: () => void; onToggle: () => void; onAdd: () => void
}) {
  const users = useApp(s => s.users)
  const addScraps = useApp(s => s.addScraps)
  const [full, setFull] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const by = users.find(u => u.id === item.addedBy)
  return (
    <div className={`scrap-detail ${full ? 'full' : ''}`}>
      <button className="sd-back" onClick={onBack} aria-label="Back to scraps"><Icon name="left" size={20} /></button>
      <div className="sd-img" onClick={() => setFull(f => !f)}>
        <img src={item.src} alt={item.name} />
      </div>
      <div className="sd-body">
        <div className="sd-title">
          {editing
            ? <input className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)}
                onBlur={() => { setEditing(false); addScraps([{ ...item, name: name || item.name }]) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            : <h2>{name}</h2>}
          <button aria-label={full ? 'Shrink preview' : 'Full size preview'} onClick={() => setFull(f => !f)}><Icon name={full ? 'shrink' : 'expand'} size={22} /></button>
        </div>
        <p className="sd-note">{item.note}</p>
        <dl className="sd-rows">
          <div><dt>Added</dt><dd>{timeAgo(item.addedAt) === 'just now' ? 'just now' : `${timeAgo(item.addedAt)} ago`}</dd></div>
          <div><dt>Added by</dt><dd>{by ? (by.id === ME ? 'you' : by.name) : '—'}</dd></div>
          <div><dt>From</dt><dd>{item.from}</dd></div>
          <div><dt>Where?</dt><dd>{item.where}</dd></div>
          <div><dt>Edition</dt><dd><b>{item.edition[0]}</b> / {item.edition[1]}</dd></div>
        </dl>
        {item.usedIn.length > 0 && (
          <>
            <h3 className="sd-h">Featured on</h3>
            <div className="sd-featured hscroll">{item.usedIn.map(id => <ZineThumb key={id} id={id} />)}</div>
          </>
        )}
      </div>
      <div className="sd-actions">
        <button className="sq-btn" aria-label="Rename" onClick={() => setEditing(true)}><Icon name="edit" size={18} /></button>
        <Button kind="secondary" onClick={onToggle}>{selected ? 'Selected' : 'Select'}</Button>
        <Button onClick={onAdd} className="grow-btn">Add to zine</Button>
      </div>
    </div>
  )
}

export function ScrapSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (items: ScrapItem[]) => void }) {
  const scrapbook = useApp(s => s.scrapbook)
  const addScraps = useApp(s => s.addScraps)
  const showToast = useApp(s => s.showToast)
  const [q, setQ] = useState('')
  const [coll, setColl] = useState<string | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [info, setInfo] = useState<ScrapItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!open) { setSel([]); setInfo(null); setQ(''); setColl(null) } }, [open])

  const collections = useMemo(() => {
    const m = new Map<string, ScrapItem>()
    for (const s of scrapbook) if (!m.has(s.collection)) m.set(s.collection, s)
    return [...m.entries()]
  }, [scrapbook])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return scrapbook.filter(s => (!coll || s.collection === coll) &&
      (!t || `${s.name} ${s.note} ${s.collection} ${s.from}`.toLowerCase().includes(t)))
  }, [scrapbook, q, coll])

  const recent = useMemo(() => scrapbook.filter(s => s.kind !== 'sticker').slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 8), [scrapbook])
  const stickers = useMemo(() => scrapbook.filter(s => s.kind === 'sticker'), [scrapbook])
  const fromZines = useMemo(() => scrapbook.filter(s => s.kind !== 'sticker' && s.from.includes('"')), [scrapbook])
  const browsing = !q.trim() && !coll

  const toggle = (id: string) => { haptic('tick'); setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])) }
  const commit = (items: ScrapItem[]) => { if (!items.length) return; haptic('tap'); onAdd(items); onClose() }
  const selItems = sel.map(id => scrapbook.find(s => s.id === id)).filter(Boolean) as ScrapItem[]

  const importFiles = async (files: FileList | null, from: string) => {
    if (!files?.length) return
    try {
      const items = await Promise.all([...files].map(f => fileToScrap(f, from)))
      addScraps(items)
      setSel(s => [...s, ...items.map(i => i.id)])
      showToast(`${items.length} scrap${items.length > 1 ? 's' : ''} added to your scrapbook`)
    } catch { showToast('Could not read that image') }
  }

  const masonry = (list: ScrapItem[]) => {
    const cols: ScrapItem[][] = [[], []]
    list.forEach((s, i) => cols[i % 2].push(s))
    return (
      <div className="scrap-masonry">
        {cols.map((c, ci) => (
          <div key={ci} className="sm-col">
            {c.map((s, i) => (
              <ScrapTile key={s.id} item={s} selected={sel.includes(s.id)} onToggle={() => toggle(s.id)} onInfo={() => setInfo(s)}
                style={{ '--tilt': `${((i * 37 + ci * 11) % 7) - 3}deg` } as CSSProperties} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} height="tall" className="scrap-sheet">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { importFiles(e.target.files, 'files'); e.target.value = '' }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { importFiles(e.target.files, 'camera'); e.target.value = '' }} />
      <label className="search-field">
        <Icon name="search" size={18} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find the perfect scrap!" aria-label="Search scraps" />
        {q && <button aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
      </label>

      <div className="coll-row hscroll">
        {collections.map(([name, first]) => (
          <button key={name} className={`coll ${coll === name ? 'on' : ''}`} onClick={() => { haptic('tick'); setColl(c => (c === name ? null : name)) }}>
            <span className="coll-img"><img src={first.src} alt="" draggable={false} /></span>
            <span>{name}</span>
          </button>
        ))}
        <button className="coll" onClick={() => camRef.current?.click()}>
          <span className="coll-img icon"><Icon name="camera" size={26} /></span>
          <span>Camera</span>
        </button>
        <button className="coll" onClick={() => fileRef.current?.click()}>
          <span className="coll-img icon"><Icon name="image" size={26} /></span>
          <span>Import</span>
        </button>
      </div>

      {browsing ? (
        <>
          <h4 className="scrap-h">Recently scrapped <Icon name="right" size={16} /></h4>
          <div className="recent-row hscroll">
            {recent.map(s => <ScrapTile key={s.id} item={s} big selected={sel.includes(s.id)} onToggle={() => toggle(s.id)} onInfo={() => setInfo(s)} />)}
          </div>
          <h4 className="scrap-h">Sticker packs <Icon name="right" size={16} /></h4>
          <div className="sticker-row hscroll">
            {stickers.map(s => <ScrapTile key={s.id} item={s} selected={sel.includes(s.id)} onToggle={() => toggle(s.id)} onInfo={() => setInfo(s)} />)}
          </div>
          <h4 className="scrap-h">From zines you've saved <Icon name="right" size={16} /></h4>
          {masonry(fromZines.length ? fromZines : recent)}
        </>
      ) : (
        <>
          <h4 className="scrap-h">{coll ?? 'Results'} <span className="muted">{filtered.length}</span></h4>
          {filtered.length ? masonry(filtered) : <p className="scrap-empty">No scraps match “{q}”. Import one?</p>}
        </>
      )}
      <div style={{ height: 90 }} />

      <div className={`scrap-bar ${sel.length ? 'on' : ''}`}>
        <button className="sq-btn" aria-label="Clear selection" onClick={() => setSel([])}><Icon name="x" size={20} /></button>
        <Button onClick={() => commit(selItems)} className="grow-btn">{sel.length > 1 ? `Add all to zine (${sel.length})` : 'Add to zine'}</Button>
      </div>

      {info && (
        <Detail item={info} selected={sel.includes(info.id)} onBack={() => setInfo(null)}
          onToggle={() => { toggle(info.id); setInfo(null) }}
          onAdd={() => commit(sel.includes(info.id) ? selItems : [...selItems, info])} />
      )}
    </Sheet>
  )
}

import { useRef, useState, type CSSProperties } from 'react'
import { COVERS, STICKERS } from '../lib/assets'
import { asset } from '../lib/base'
import { haptic, sfx } from '../lib/feedback'
import { clamp } from '../lib/geom'
import { useApp } from '../lib/store'
import type { User } from '../lib/types'
import { Icon } from '../ui/Icon'
import { CheckBtn, PillGroup, IconBtn, Slider } from '../ui/kit'
import './social.css'

const COLORS = ['#1A1A1A', '#245AE2', '#FF4934', '#4BA334', '#F8D647', '#F158A7', '#C0F6FF', '#EBEFD7']
const IMAGES = [
  COVERS['forever-young'], COVERS.levels, COVERS['how-zeen'], COVERS.june,
  asset('/assets/scraps/grass.webp'), asset('/assets/scraps/night-lights.webp'), asset('/assets/scraps/gate.webp'), asset('/assets/scraps/orcas.webp'), asset('/assets/scraps/friends.webp'),
]
const isColor = (h: string) => /^#|^rgb|^hsl/.test(h)

export default function EditProfile(_: { active: boolean }) {
  const me = useApp(s => s.me)
  const updateMe = useApp(s => s.updateMe)
  const back = useApp(s => s.back)
  const [d, setD] = useState<User>(() => ({ ...me, stickers: [...(me.stickers ?? [])], tags: [...me.tags] }))
  const [sel, setSel] = useState<number | null>(null)
  const [tagIn, setTagIn] = useState('')
  const preview = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; id: number; dx: number; dy: number } | null>(null)

  const set = (p: Partial<User>) => setD(x => ({ ...x, ...p }))
  const stickers = d.stickers ?? []
  const setSticker = (i: number, p: Partial<NonNullable<User['stickers']>[number]>) =>
    setD(x => ({ ...x, stickers: (x.stickers ?? []).map((s, j) => (j === i ? { ...s, ...p } : s)) }))

  const save = () => {
    updateMe({ ...d, name: d.name.trim() || me.name, handle: d.handle.replace(/^@/, '').trim() || me.handle })
    haptic('tap'); sfx('stamp')
    useApp.getState().showToast('Profile updated')
    back()
  }

  const addTag = () => {
    const t = tagIn.trim().replace(/^#/, '').replace(/\s+/g, '')
    if (t && !d.tags.includes(t)) set({ tags: [...d.tags, t].slice(0, 6) })
    setTagIn('')
  }

  return (
    <div className="soc-screen">
      <div className="soc-scroll" style={{ paddingBottom: 40 }}>
        <div className="top-bar" style={{ position: 'relative', paddingBottom: 12 }}>
          <PillGroup className="solo"><IconBtn name="x" label="Cancel" onClick={back} /></PillGroup>
          <span style={{ fontSize: 16, fontWeight: 500 }}>Edit profile</span>
          <CheckBtn onClick={save} label="Save profile" />
        </div>

        {/* live header: drag stickers anywhere on it */}
        <div ref={preview} className="ep-preview" style={{ '--hdr': isColor(d.header) ? d.header : '#222' } as CSSProperties}
          onPointerDown={e => { if (e.target === e.currentTarget) setSel(null) }}>
          {!isColor(d.header) && <img className="bgimg" src={d.header} alt="" draggable={false} />}
          {stickers.map((s, i) => (
            <div key={i} className={`ep-sticker ${sel === i ? 'sel' : ''}`}
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%`, '--r': `${s.rot}rad` } as CSSProperties}
              onPointerDown={e => {
                e.stopPropagation()
                const r = preview.current!.getBoundingClientRect()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                drag.current = { i, id: e.pointerId, dx: e.clientX - (r.left + s.x * r.width), dy: e.clientY - (r.top + s.y * r.height) }
                setSel(i); haptic('tick')
              }}
              onPointerMove={e => {
                const g = drag.current
                if (!g || g.id !== e.pointerId) return
                const r = preview.current!.getBoundingClientRect()
                setSticker(g.i, { x: clamp((e.clientX - g.dx - r.left) / r.width, 0, 1), y: clamp((e.clientY - g.dy - r.top) / r.height, 0, 1) })
              }}
              onPointerUp={() => { drag.current = null }}>
              <img src={s.src} alt="" draggable={false} />
            </div>
          ))}
          <div className="pf-id">
            <div className="pf-name">{d.name || 'your name'}</div>
            <div className="pf-readers">@{d.handle}</div>
          </div>
        </div>
        <div className="ep-sticker-tools">
          {sel !== null && stickers[sel] ? (
            <>
              <Slider label="Size" min={0.06} max={0.5} step={0.01} value={stickers[sel].s} onChange={v => setSticker(sel, { s: v })} />
              <Slider label="Turn" min={-3.14} max={3.14} step={0.02} value={stickers[sel].rot} onChange={v => setSticker(sel, { rot: v })} />
              <button className="icon-btn" aria-label="Remove sticker" onClick={() => { setD(x => ({ ...x, stickers: (x.stickers ?? []).filter((_, j) => j !== sel) })); setSel(null); haptic('tap') }}><Icon name="trash" size={18} /></button>
            </>
          ) : <span className="muted" style={{ fontSize: 12 }}>Drag stickers to place them. Tap one to resize, turn or remove it.</span>}
        </div>

        <div className="ep-body">
          <label className="ep-field"><span>Name</span><input value={d.name} onChange={e => set({ name: e.target.value })} maxLength={30} /></label>
          <label className="ep-field"><span>Handle</span><input value={d.handle} onChange={e => set({ handle: e.target.value.replace(/\s/g, '') })} maxLength={24} /></label>
          <label className="ep-field"><span>Bio</span><textarea value={d.bio} onChange={e => set({ bio: e.target.value })} maxLength={160} /></label>
          <div className="ep-field">
            <span>Tags</span>
            <div className="ep-chips">
              {d.tags.map(t => (
                <span key={t} className="ep-chip">#{t}<button aria-label={`Remove ${t}`} onClick={() => set({ tags: d.tags.filter(x => x !== t) })}><Icon name="x" size={12} /></button></span>
              ))}
              <input className="ep-chip-input" value={tagIn} placeholder="+ add tag" aria-label="Add tag" onChange={e => setTagIn(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} onBlur={addTag} />
            </div>
          </div>
          <div className="ep-field">
            <span>Links</span>
            <input value={(d.links ?? []).join(', ')} placeholder="yoursite.com, @insta" onChange={e => set({ links: e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3) })} />
          </div>

          <div className="ep-field">
            <span>Header</span>
            <div className="swatches">
              {COLORS.map(c => <button key={c} className={`swatch ${d.header === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => { set({ header: c }); haptic('tick') }} />)}
            </div>
            <div className="swatches" style={{ marginTop: 8 }}>
              {IMAGES.map(src => <button key={src} className={`swatch square ${d.header === src ? 'on' : ''}`} aria-label="Image header" onClick={() => { set({ header: src }); haptic('tick') }}><img src={src} alt="" /></button>)}
            </div>
          </div>

          <div className="ep-field">
            <span>Header stickers</span>
            <div className="sticker-pick">
              {STICKERS.map(s => (
                <button key={s.id} aria-label={`Add ${s.name}`} onClick={() => {
                  if (stickers.length >= 8) { useApp.getState().showToast('8 stickers max'); return }
                  const n = { src: s.src, x: 0.3 + Math.random() * 0.4, y: 0.25 + Math.random() * 0.4, rot: (Math.random() - 0.5) * 0.8, s: 0.18 }
                  setD(x => ({ ...x, stickers: [...(x.stickers ?? []), n] }))
                  setSel(stickers.length); haptic('tap'); sfx('slap')
                }}><img src={s.src} alt="" /></button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

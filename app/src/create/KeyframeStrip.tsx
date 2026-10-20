import { useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../lib/feedback'
import { uid } from '../lib/geom'
import { renderThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { DitherImg, Sheet } from '../ui/kit'
import { useEditor } from './editor'

/** Geometry-only signature so thumbnails re-render when folds change, not on every collage edit. */
function sig(doc: ZineDoc, i: number) {
  const k = doc.keyframes[i]
  let h = 0
  const s = JSON.stringify([k?.angles, doc.creases.map(c => [c.id, c.flapSide, c.dir]), doc.surfaces.map(x => x.outline.length + ':' + x.outline[0]?.[0]?.length), doc.objects.length, doc.bg])
  for (let j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) | 0
  return h
}

export function KeyThumb({ doc, i, dither }: { doc: ZineDoc; i: number; dither?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const key = sig(doc, i)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      renderThumb({ ...doc, id: `${doc.id}#k${i}`, updatedAt: key, publish: { ...doc.publish, coverKeyframe: i } }).then(u => { if (alive) setUrl(u) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, i])
  if (!url) return <span className="kt-ph" />
  return dither ? <DitherImg src={url} size={[64, 52]} /> : <img src={url} alt="" draggable={false} />
}

export function KeyframeStrip({ doc, active, onPick, onAdd, onPlay, playing, readOnly, dither }: {
  doc: ZineDoc; active: number; onPick: (i: number) => void; onAdd?: () => void; onPlay?: () => void; playing?: boolean; readOnly?: boolean; dither?: boolean
}) {
  const ed = useEditor()
  const [menu, setMenu] = useState<number | null>(null)
  const [name, setName] = useState('')
  const press = useRef<number>(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // keep the active pose centred (scrolling only the strip: scrollIntoView would drag the screen along too)
    const strip = ref.current
    const el = strip?.querySelector<HTMLElement>(`[data-i="${active}"]`)
    if (!strip || !el) return
    const s = strip.getBoundingClientRect(), b = el.getBoundingClientRect()
    strip.scrollTo({ left: strip.scrollLeft + (b.left + b.width / 2) - (s.left + s.width / 2), behavior: 'smooth' })
  }, [active])
  const kfs = doc.keyframes
  const mutate = (fn: (k: ZineDoc['keyframes']) => ZineDoc['keyframes'], label: string) => ed.commit({ ...doc, keyframes: fn(kfs.slice()) }, label)
  const items = useMemo(() => kfs.map((k, i) => ({ k, i })), [kfs])
  return (
    <>
      <div className="kfi-strip hscroll" ref={ref}>
        {onPlay && kfs.length > 1 && (
          <button className="kfi-play" aria-label={playing ? 'Playing' : 'Play sequence'} onClick={onPlay} disabled={playing}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
        )}
        {items.map(({ k, i }) => (
          <button key={k.id} data-i={i} className={`kfi ${i === active ? 'on' : ''}`} aria-label={`Keyframe ${i + 1}: ${k.name}`}
            onPointerDown={() => { if (readOnly) return; press.current = window.setTimeout(() => { haptic('firm'); setName(k.name); setMenu(i) }, 480) }}
            onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)}
            onClick={() => { haptic('tick'); onPick(i) }}>
            <KeyThumb doc={doc} i={i} dither={dither} />
            <span className="kfi-n">{i === 0 ? 'cover' : i + 1}</span>
          </button>
        ))}
        {onAdd && (
          <button className="kfi kfi-add" onClick={onAdd} aria-label="Add keyframe from the current pose">
            <Icon name="nextPose" size={20} />
            <span>next pose</span>
          </button>
        )}
      </div>
      <Sheet open={menu !== null} onClose={() => setMenu(null)} title={menu !== null ? `Keyframe ${menu + 1}` : ''} dim>
        {menu !== null && (
          <div className="kfi-menu">
            <input className="text-input" value={name} onChange={e => setName(e.target.value)} aria-label="Keyframe name"
              onBlur={() => mutate(k => { k[menu] = { ...k[menu], name: name || k[menu].name }; return k }, 'Rename keyframe')} />
            <button onClick={() => { mutate(k => { k.splice(menu + 1, 0, { ...k[menu], id: uid('k'), name: k[menu].name + ' copy' }); return k }, 'Duplicate keyframe'); setMenu(null) }}><Icon name="duplicate" size={18} />Duplicate</button>
            <button disabled={menu === 0} onClick={() => { mutate(k => { const [x] = k.splice(menu, 1); k.splice(menu - 1, 0, x); return k }, 'Reorder keyframes'); setMenu(null) }}><Icon name="left" size={18} />Move earlier</button>
            <button disabled={menu === kfs.length - 1} onClick={() => { mutate(k => { const [x] = k.splice(menu, 1); k.splice(menu + 1, 0, x); return k }, 'Reorder keyframes'); setMenu(null) }}><Icon name="right" size={18} />Move later</button>
            <button disabled={kfs.length < 2} className="danger" onClick={() => { mutate(k => { k.splice(menu, 1); return k }, 'Delete keyframe'); setMenu(null) }}><Icon name="trash" size={18} />Delete</button>
          </div>
        )}
      </Sheet>
    </>
  )
}

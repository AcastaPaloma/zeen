import { memo, useRef, type CSSProperties } from 'react'
import { rng } from '../lib/geom'
import { haptic } from '../lib/feedback'
import { useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import './grid.css'

export type CardTag = 'maker' | 'community' | 'none'

const seedOf = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return h >>> 0 }

/** One zine on the feed: a static render of its cover keyframe, slightly tilted, with a sticker tag. */
export const ZineCard = memo(function ZineCard({ z, tag = 'none', onOpen, badge, style }: {
  z: ZineDoc; tag?: CardTag; onOpen?: (z: ZineDoc, rect: DOMRect) => void; badge?: 'reply' | 'pin' | 'draft'; style?: CSSProperties
}) {
  const src = useThumb(z)
  const ref = useRef<HTMLButtonElement>(null)
  const r = rng(seedOf(z.id))
  const tilt = (r() - 0.5) * 8 // up to ±4°
  const dx = (r() - 0.5) * 14
  const users = useApp(s => s.users)
  const communities = useApp(s => s.communities)
  const author = users.find(u => u.id === z.author)
  const comm = communities.find(c => c.id === z.publish.postTo)
  const go = useApp(s => s.go)
  const label = tag === 'community' && comm ? `#${comm.tag}` : author ? `@${author.handle}` : ''
  const tagColor = tag === 'community' && comm ? comm.color : '#F158A7'
  return (
    <div className="zcard-wrap" style={{ transform: `translateX(${dx}px)`, ...style }}>
      <button ref={ref} className="zcard" aria-label={`${z.publish.title || 'Untitled'}${author ? ' by ' + author.name : ''}`}
        style={{ '--tilt': `${tilt}deg` } as CSSProperties}
        onClick={() => { haptic('tick'); onOpen?.(z, ref.current!.getBoundingClientRect()) }}>
        {src ? <img src={src} alt="" draggable={false} /> : <span className="zcard-ph" />}
        {badge === 'reply' && <span className="zcard-badge"><Icon name="reply" size={12} /> reply</span>}
        {badge === 'pin' && <span className="zcard-badge pin"><Icon name="pin" size={12} /></span>}
        {badge === 'draft' && <span className="zcard-badge draft">draft</span>}
      </button>
      {tag !== 'none' && label && (
        <button className="zcard-tag" style={{ '--tag': tagColor, transform: `rotate(${-tilt * 0.6 - 2}deg)` } as CSSProperties}
          onClick={() => {
            if (tag === 'community' && comm) go({ name: 'community', id: comm.id })
            else if (author) go({ name: 'profile', id: author.id })
          }}>
          {label}
        </button>
      )}
    </div>
  )
})

/** Messy two-column scroll. Columns drift at slightly different speeds for light parallax. */
export function MessyGrid({ zines, tag = 'none', onOpen, scrollY = 0, badges }: {
  zines: ZineDoc[]; tag?: CardTag | ((z: ZineDoc) => CardTag); onOpen?: (z: ZineDoc, rect: DOMRect) => void; scrollY?: number
  badges?: (z: ZineDoc) => 'reply' | 'pin' | 'draft' | undefined
}) {
  const cols: ZineDoc[][] = [[], []]
  zines.forEach((z, i) => cols[i % 2].push(z))
  return (
    <div className="messy-grid">
      {cols.map((col, ci) => (
        <div key={ci} className="messy-col" style={{ transform: `translateY(${(ci === 1 ? 26 : 0) - scrollY * (ci === 1 ? 0.045 : 0.0)}px)` }}>
          {col.map(z => (
            <ZineCard key={z.id} z={z} tag={typeof tag === 'function' ? tag(z) : tag} onOpen={onOpen} badge={badges?.(z)} />
          ))}
        </div>
      ))}
    </div>
  )
}

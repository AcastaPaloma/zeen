import { ZINE_FONTS } from '../lib/assets'
import { rng } from '../lib/geom'
import type { Community } from '../lib/types'

const RANSOM_FONTS = ['"Anton"', '"DM Serif Display"', '"Special Elite"', '"Bricolage Grotesque"', '"Stardos Stencil"', '"Rubik Mono One"']
const RANSOM_BG = ['#FFFFFF', '#F8D647', '#111111', '#FF4934', '#C0F6FF', '#FFD5F4', '#EBEFD7', '#245AE2']

/** Each letter cut from a different magazine. */
export function Ransom({ text, seed = 7, size = 1 }: { text: string; seed?: number; size?: number }) {
  const r = rng(seed)
  return (
    <>
      {[...text].map((ch, i) => {
        if (ch === '\n') return <br key={i} />
        if (ch === ' ') { r(); r(); r(); return <span key={i} className="rn-sp"> </span> }
        const f = RANSOM_FONTS[Math.floor(r() * RANSOM_FONTS.length)]
        const bg = RANSOM_BG[Math.floor(r() * RANSOM_BG.length)]
        const rot = (r() - 0.5) * 14
        const dark = bg === '#111111' || bg === '#245AE2' || bg === '#FF4934'
        return <span key={i} className="rn-ch" style={{ fontFamily: f, background: bg, color: dark ? '#fff' : '#111', transform: `rotate(${rot}deg)`, fontSize: `${size}em` }}>{ch}</span>
      })}
    </>
  )
}

/** A community's title set in its own face; ransom letters for the riot grrrls. */
export function CommunityTitle({ c, text, className, as: Tag = 'h1' }: { c: Community; text: string; className: string; as?: 'h1' | 'div' }) {
  return (
    <Tag className={`${className} ct ct-${c.font}`} style={c.font === 'ransom' ? undefined : { fontFamily: ZINE_FONTS[c.font]?.css }}>
      {c.font === 'ransom' ? <Ransom text={text} seed={c.tag.length * 7 + 3} size={0.78} /> : text}
    </Tag>
  )
}

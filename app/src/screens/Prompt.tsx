import { useMemo, useState, type CSSProperties } from 'react'
import { STICKERS } from '../lib/assets'
import { haptic } from '../lib/feedback'
import { published, useApp } from '../lib/store'
import { Icon } from '../ui/Icon'
import { Button } from '../ui/kit'
import { openZine } from './Community'
import { MessyGrid } from './ZineGrid'
import './social.css'

/** A community's weekly prompt and the zines made for it. */
export default function PromptScreen({ id }: { active: boolean; id?: string }) {
  const c = useApp(s => s.communities.find(x => x.id === id))
  const zines = useApp(s => s.zines)
  const back = useApp(s => s.back)
  const go = useApp(s => s.go)
  const [scrollY, setScrollY] = useState(0)

  const made = useMemo(() => {
    if (!c) return []
    const slug = c.prompt.title.toLowerCase()
    const inCommunity = published(zines).filter(z => z.publish.postTo === c.id)
    const tagged = inCommunity.filter(z => z.publish.tags.some(t => t.toLowerCase() === slug || t.toLowerCase() === `prompt:${c.tag.toLowerCase()}`))
    return tagged.length ? tagged : inCommunity
  }, [zines, c])

  if (!c) return null
  const stickers = [STICKERS[1], STICKERS[6]]
  return (
    <div className="soc-screen dots">
      <div className="soc-scroll" onScroll={e => setScrollY((e.target as HTMLElement).scrollTop)}>
        <div className="soc-topline">
          <button className="soc-back" onClick={back} aria-label="Back"><Icon name="arrowLeft" /></button>
        </div>
        <section className="pr-hero">
          <div className="pr-stickers" aria-hidden>
            {stickers.map((s, i) => <img key={s.id} src={s.src} alt="" style={{ right: i * 34, top: i * 52, transform: `rotate(${i ? -14 : 10}deg)`, animationDelay: `${120 + i * 90}ms` } as CSSProperties} />)}
          </div>
          <div className="pr-k">#{c.tag} · weekly prompt</div>
          <h1 className="pr-title">{c.prompt.title}</h1>
          <p className="pr-body">{c.prompt.body}</p>
          <div className="pr-meta">
            <span className="pr-due">due {c.prompt.due}</span>
            <button className="chip" onClick={() => go({ name: 'community', id: c.id })}>{c.name}</button>
            <span className="chip">{made.length} made so far</span>
          </div>
          <Button icon="plus" onClick={() => { haptic('tap'); go({ name: 'create' }) }}>Make one</Button>
        </section>
        <div className="pf-section"><h4>Made for this prompt</h4></div>
        <MessyGrid zines={made} tag="maker" onOpen={openZine} scrollY={scrollY} />
      </div>
    </div>
  )
}

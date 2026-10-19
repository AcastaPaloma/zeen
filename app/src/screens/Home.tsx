import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../lib/feedback'
import { ME } from '../lib/samples'
import { published, useApp } from '../lib/store'
import type { ZineDoc } from '../lib/types'
import { BottomNav } from '../ui/BottomNav'
import { Avatar, fmtCount } from '../ui/kit'
import { MessyGrid, type CardTag } from './ZineGrid'
import Search from './Search'
import './reading.css'

type Tab = 'discover' | 'following'

export default function Home({ active }: { active: boolean }) {
  const [tab, setTab] = useState<Tab>('discover')
  const [scrollY, setScrollY] = useState(0)
  const raf = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)
  const zines = useApp(s => s.zines)
  const following = useApp(s => s.following)
  const joined = useApp(s => s.joined)
  const users = useApp(s => s.users)
  const go = useApp(s => s.go)
  const toggleFollow = useApp(s => s.toggleFollow)

  const all = useMemo(() => published(zines), [zines])

  // Discover: trending first, then a seeded shuffle of the rest so it feels alive
  const discover = useMemo(() => {
    const score = (z: ZineDoc) => (z.stats?.likes ?? 0) + (z.stats?.reads ?? 0) / 12 + (z.author === ME ? -50 : 0)
    return [...all].sort((a, b) => score(b) - score(a))
  }, [all])

  const followFeed = useMemo(
    () => all.filter(z => following.includes(z.author) || (z.publish.postTo && joined.includes(z.publish.postTo))),
    [all, following, joined],
  )
  const tagFor = (z: ZineDoc): CardTag =>
    z.publish.postTo && joined.includes(z.publish.postTo) && !following.includes(z.author) ? 'community'
      : following.includes(z.author) ? 'maker' : z.publish.postTo ? 'community' : 'maker'

  const newMakers = users.filter(u => u.id !== ME && !following.includes(u.id))

  // depth of field: zines blur as they scroll out under the header and come into focus as they
  // rise from behind the bottom bar
  const focusCards = useCallback(() => {
    const sc = scroller.current
    if (!sc) return
    const r = sc.getBoundingClientRect()
    for (const el of sc.querySelectorAll<HTMLElement>('.zcard-wrap')) {
      const b = el.getBoundingClientRect()
      const c = (b.top + b.bottom) / 2
      const top = (r.top + 150 - c) / 190 // 0 until the centre passes 150px from the top, 1 at -40px
      const bottom = (c - (r.bottom - 230)) / 270 // 0 until 230px from the bottom, 1 at +40px
      const k = Math.max(0, Math.min(1, Math.max(top, bottom)))
      el.style.filter = k > 0.02 ? `blur(${(k * 7).toFixed(1)}px)` : ''
      el.style.opacity = k > 0.02 ? (1 - k * 0.4).toFixed(2) : ''
    }
  }, [])

  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => { setScrollY(scroller.current?.scrollTop ?? 0); focusCards() })
  }

  // cards change size as their covers render, so re-focus after layout settles
  useEffect(() => {
    focusCards()
    const t = [setTimeout(focusCards, 300), setTimeout(focusCards, 1200)]
    return () => t.forEach(clearTimeout)
  }, [focusCards, tab, all.length])

  const open = (z: ZineDoc, rect: DOMRect) => go({ name: 'preview', id: z.id, from: rect })

  const switchTab = (t: Tab) => {
    if (t === tab) { scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }); return }
    haptic('tick')
    setTab(t)
    scroller.current?.scrollTo({ top: 0 })
    setScrollY(0)
  }

  return (
    <div className="screen dots home" aria-hidden={!active}>
      <header className={`home-head ${scrollY > 8 ? 'scrolled' : ''}`}>
        <div className="logo" aria-label="Zeen">Zeen<span className="logo-dot" /></div>
        <nav className="home-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'on' : ''} onClick={() => switchTab('discover')}>Discover</button>
          <button role="tab" aria-selected={tab === 'following'} className={tab === 'following' ? 'on' : ''} onClick={() => switchTab('following')}>Following</button>
        </nav>
      </header>

      <div className="home-scroll scroll" ref={scroller} onScroll={onScroll}>
        <div key={tab} className="home-feed">
          {tab === 'discover' ? (
            <>
              <MessyGrid zines={discover.slice(0, 6)} tag="none" onOpen={open} scrollY={scrollY} />
              {newMakers.length > 0 && (
                <section className="new-makers">
                  <h4>New makers</h4>
                  <div className="hscroll nm-row">
                    {newMakers.map(u => (
                      <div key={u.id} className="nm-card">
                        <button className="nm-face" onClick={() => go({ name: 'profile', id: u.id })} aria-label={`Open ${u.name}`}>
                          <Avatar src={u.avatar} size={54} />
                          <span>{u.name}</span>
                          <small>{fmtCount(u.followers)} readers</small>
                        </button>
                        <button className="nm-follow" onClick={() => { haptic('tap'); toggleFollow(u.id) }}>Follow</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <MessyGrid zines={discover.slice(6)} tag="none" onOpen={open} scrollY={Math.max(0, scrollY - 600)} />
            </>
          ) : followFeed.length ? (
            <MessyGrid zines={followFeed} tag={tagFor} onOpen={open} scrollY={scrollY} />
          ) : (
            <div className="empty-feed">
              <p>Follow makers or join a community and their zines land here.</p>
              <button className="btn btn-secondary" onClick={() => switchTab('discover')}>Find makers</button>
            </div>
          )}
          <div className="feed-end">you're all caught up ✂︎</div>
        </div>
      </div>

      <BottomNav current="home" />
      <Search />
    </div>
  )
}

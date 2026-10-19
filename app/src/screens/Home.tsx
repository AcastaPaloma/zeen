import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BRAND } from '../lib/assets'
import { haptic } from '../lib/feedback'
import { clamp } from '../lib/geom'
import { ME } from '../lib/samples'
import { published, useApp, type HomePage } from '../lib/store'
import type { ZineDoc } from '../lib/types'
import { Avatar, fmtCount } from '../ui/kit'
import Profile from './Profile'
import { MessyGrid, type CardTag } from './ZineGrid'
import Search from './Search'
import './reading.css'

/** Home is a row of pages: Discover, Following, then your own profile. */
const PAGES: HomePage[] = ['discover', 'following', 'profile']
const GLIDE = 'transform 420ms cubic-bezier(0.32, 0.72, 0, 1)'
/** resistance past the first and last page */
const band = (x: number) => (x * 0.4) / (1 + x * 0.6)

export default function Home({ active }: { active: boolean }) {
  const page = useApp(s => s.homePage)
  const setHomePage = useApp(s => s.setHomePage)
  const idx = PAGES.indexOf(page)
  const [scrollY, setScrollY] = useState<[number, number]>([0, 0])
  const raf = useRef(0)
  const discoverEl = useRef<HTMLDivElement>(null)
  const followingEl = useRef<HTMLDivElement>(null)
  const pager = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLElement>(null)
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
  const focusCards = useCallback((sc: HTMLElement | null) => {
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
  const focusAll = useCallback(() => { focusCards(discoverEl.current); focusCards(followingEl.current) }, [focusCards])

  const onScroll = (i: 0 | 1) => () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = i ? followingEl.current : discoverEl.current
      setScrollY(s => { const n: [number, number] = [...s]; n[i] = el?.scrollTop ?? 0; return n })
      focusCards(el)
    })
  }

  // cards change size as their covers render, so re-focus after layout settles
  useEffect(() => {
    focusAll()
    const t = [setTimeout(focusAll, 300), setTimeout(focusAll, 1200)]
    return () => t.forEach(clearTimeout)
  }, [focusAll, all.length, followFeed.length])

  const open = (z: ZineDoc, rect: DOMRect) => go({ name: 'preview', id: z.id, from: rect })

  // ---------------------------------------------------------------- pager

  // where the row of pages sits, in pages (fractional mid-drag). The header belongs to the two feeds, so it
  // only moves on the way to the profile.
  const pos = useRef(idx)
  const place = useCallback((p: number, animate: boolean) => {
    pos.current = p
    const W = pager.current?.clientWidth ?? 1
    const parts: [HTMLElement | null, number][] = [[track.current, -p * W], [head.current, -Math.max(0, p - 1) * W]]
    for (const [el, x] of parts) {
      if (!el) continue
      el.style.transition = animate ? GLIDE : 'none'
      el.style.transform = `translate3d(${x}px, 0, 0)`
    }
  }, [])
  const placed = useRef(false)
  useLayoutEffect(() => { place(idx, placed.current); placed.current = true }, [idx, place])
  useEffect(() => {
    const fit = () => place(pos.current, false)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [place])

  const switchTo = (p: HomePage) => {
    if (p === page) {
      const el = p === 'following' ? followingEl.current : p === 'discover' ? discoverEl.current : null
      el?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    haptic('tick')
    setHomePage(p)
  }

  // The pages follow the finger sideways; let go and they settle on the page that's more than half in view
  // (a flick carries on to the next), so a drag can always be taken back.
  const drag = useRef<{ x0: number; y0: number; p0: number; dir: 0 | 1 | -1; x: number; t: number; v: number; id: number } | null>(null)
  const dragged = useRef(0)
  const settle = (d: NonNullable<typeof drag.current>) => {
    const W = pager.current?.clientWidth ?? 1
    const from = Math.round(d.p0)
    const to = clamp(Math.round(pos.current - (d.v * 220) / W), Math.max(0, from - 1), Math.min(PAGES.length - 1, from + 1))
    place(to, true)
    if (PAGES[to] !== page) { haptic('tick'); setHomePage(PAGES[to]) }
  }
  const pagerBind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // rows that scroll sideways, and fields, keep their own drags
      if ((e.target as Element).closest('.hscroll, input, textarea, .sheet')) return
      const W = pager.current?.clientWidth ?? 1
      // pick the row up from wherever it is, even mid-glide
      const p0 = track.current ? -new DOMMatrix(getComputedStyle(track.current).transform).m41 / W : pos.current
      drag.current = { x0: e.clientX, y0: e.clientY, p0, dir: 0, x: e.clientX, t: performance.now(), v: 0, id: e.pointerId }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0
      if (d.dir === 0) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          d.dir = 1
          try { pager.current?.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
        } else if (Math.abs(dy) > 8) { d.dir = -1; return } else return
      }
      if (d.dir !== 1) return
      const now = performance.now()
      d.v = d.v * 0.6 + ((e.clientX - d.x) / Math.max(1, now - d.t)) * 0.4
      d.x = e.clientX; d.t = now
      const W = pager.current?.clientWidth ?? 1
      const last = PAGES.length - 1
      let p = d.p0 - dx / W
      if (p < 0) p = -band(-p)
      else if (p > last) p = last + band(p - last)
      place(p, false)
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      if (d.dir !== 1) return
      dragged.current = performance.now()
      settle(d)
    },
    onPointerCancel: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      if (d.dir === 1) { d.v = 0; settle(d) }
    },
    // a sideways drag ends in a click on whatever was under the finger: swallow it
    onClickCapture: (e: React.MouseEvent) => {
      if (performance.now() - dragged.current < 350) { e.stopPropagation(); e.preventDefault() }
    },
  }

  const feedPage = idx === 2 ? 1 : idx
  return (
    <div className="screen home" aria-hidden={!active}>
      <header ref={head} className={`home-head ${scrollY[feedPage] > 8 ? 'scrolled' : ''}`}>
        <img className="logo" src={BRAND.logo} alt="Zeen" draggable={false} />
        <nav className="home-tabs" role="tablist">
          <button role="tab" aria-selected={page === 'discover'} className={page === 'discover' ? 'on' : ''} onClick={() => switchTo('discover')}>Discover</button>
          <button role="tab" aria-selected={page === 'following'} className={page === 'following' ? 'on' : ''} onClick={() => switchTo('following')}>Following</button>
        </nav>
      </header>

      <div className="home-pager" ref={pager} {...pagerBind}>
        <div className="home-track" ref={track}>
          <section className="home-page" aria-label="Discover" aria-hidden={page !== 'discover'}>
            <div className="home-scroll scroll" ref={discoverEl} onScroll={onScroll(0)}>
              <div className="home-feed">
                <MessyGrid zines={discover.slice(0, 6)} tag="none" onOpen={open} scrollY={scrollY[0]} />
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
                <MessyGrid zines={discover.slice(6)} tag="none" onOpen={open} scrollY={Math.max(0, scrollY[0] - 600)} />
                <div className="feed-end">you're all caught up ✂︎</div>
              </div>
            </div>
          </section>

          <section className="home-page" aria-label="Following" aria-hidden={page !== 'following'}>
            <div className="home-scroll scroll" ref={followingEl} onScroll={onScroll(1)}>
              <div className="home-feed">
                {followFeed.length ? (
                  <MessyGrid zines={followFeed} tag={tagFor} onOpen={open} scrollY={scrollY[1]} />
                ) : (
                  <div className="empty-feed">
                    <p>Follow makers or join a community and their zines land here.</p>
                    <button className="btn btn-secondary" onClick={() => switchTo('discover')}>Find makers</button>
                  </div>
                )}
                <div className="feed-end">you're all caught up ✂︎</div>
              </div>
            </div>
          </section>

          <section className="home-page" aria-label="Your profile" aria-hidden={page !== 'profile'}>
            <Profile active={active && page === 'profile'} embedded />
          </section>
        </div>
      </div>

      <Search />
    </div>
  )
}

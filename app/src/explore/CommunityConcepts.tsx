import { useEffect, useState, type CSSProperties } from 'react'
import { COVERS, ZINE_FONTS } from '../lib/assets'
import { haptic, sfx } from '../lib/feedback'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import type { Community, ZineFont } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Avatar, Button, fmtCount } from '../ui/kit'
import { CommunityTitle } from '../ui/Ransom'
import { useExploration } from './state'
import './community.css'

// Two concepts for communities, kept for the case study: starting one, and keeping one making things.
// Nothing here is saved: they play out on their own over the app's sample people and communities.

function TopLine({ title }: { title: string }) {
  const show = useExploration(s => s.show)
  return (
    <div className="soc-topline cc-top">
      <button className="soc-back" onClick={() => { haptic('tick'); show(null) }} aria-label="Back to the final design"><Icon name="x" /></button>
      <span className="cc-top-title">{title}</span>
      <span style={{ width: 34 }} />
    </div>
  )
}

const toast = (t: string) => useApp.getState().showToast(t)

// ---------------------------------------------------------------- 1 · start a community

const SWATCHES = ['#FF4934', '#245AE2', '#F8D647', '#4BA334', '#F158A7', '#1A1A1A', '#5C5CE3', '#FF6A13']
const FONTS: ZineFont[] = ['marker', 'typewriter', 'serif', 'grotesk', 'mono', 'ransom']
const RHYTHMS = [
  { id: 'weekly', name: 'Weekly prompt', body: 'A new prompt every Monday. Zines are due on Sunday.' },
  { id: 'issue', name: 'Monthly issue', body: "Everyone makes a page. On the 1st they're bound into one zine." },
  { id: 'chain', name: 'Chain zine', body: 'One zine passes from member to member. Each adds a page within 48 hours.' },
] as const
const RULES = ['Credit your scraps', 'Be kind in crits', 'Reply in paper', 'No spec work asks', 'Content notes on heavy stuff']
const PROMPTS = ['Something you found', 'A letter to your street', 'Tiny hero', 'Your worst idea, done well']

const tagOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'NEWCLUB'

export function StartCommunity() {
  const users = useApp(s => s.users)
  const following = useApp(s => s.following)
  const me = users.find(u => u.id === ME)
  const friends = users.filter(u => u.id !== ME && following.includes(u.id))
  const [name, setName] = useState('Night Owl Zines')
  const [color, setColor] = useState(SWATCHES[6])
  const [font, setFont] = useState<ZineFont>('serif')
  const [rhythm, setRhythm] = useState<(typeof RHYTHMS)[number]['id']>('weekly')
  const [prompt, setPrompt] = useState(PROMPTS[0])
  const [rules, setRules] = useState<string[]>(RULES.slice(0, 3))
  const [invited, setInvited] = useState<string[]>([])
  const [signed, setSigned] = useState(0) // founders who have signed (you sign first)
  const [open, setOpen] = useState(false)

  const tag = tagOf(name)
  const c: Community = {
    id: 'c_new', tag, name: name || 'Untitled club', description: '', members: 3, perMonth: 0, color, font,
    prompt: { title: prompt, body: RHYTHMS.find(r => r.id === rhythm)!.body, due: 'Sun' }, rules, mods: [ME], created: 'today',
  }
  const founders = [me, ...invited.map(id => users.find(u => u.id === id))].filter(Boolean) as typeof users

  // the founders sign the charter one after another, and then it opens
  useEffect(() => {
    if (signed === 0 || signed >= 3) return
    const t = setTimeout(() => { setSigned(n => n + 1); haptic('tick'); sfx('stamp') }, 650)
    return () => clearTimeout(t)
  }, [signed])
  useEffect(() => {
    if (signed < 3) return
    const t = setTimeout(() => { setOpen(true); haptic('double'); sfx('pop') }, 500)
    return () => clearTimeout(t)
  }, [signed])

  const invite = (id: string) => {
    haptic('tick')
    setInvited(v => (v.includes(id) ? v.filter(x => x !== id) : v.length < 2 ? [...v, id] : [v[1], id]))
  }

  return (
    <div className="soc-screen explore cc">
      <TopLine title="New community" />
      <div className="soc-scroll cc-scroll">
        {/* how it'll look, as you set it up */}
        <div className="cc-preview" style={{ '--cc': color } as CSSProperties}>
          <div className="cm-tag">#{tag}</div>
          <CommunityTitle c={c} text={c.name} className="cc-title" />
          <div className="cc-sub">{founders.length} of 3 founders · opens when everyone signs</div>
        </div>

        <section className="cc-sec">
          <h3>Name it</h3>
          <input className="text-input" value={name} onChange={e => setName(e.target.value)} aria-label="Community name" maxLength={32} />
        </section>

        <section className="cc-sec">
          <h3>Its look</h3>
          <div className="cc-swatches">
            {SWATCHES.map(s => <button key={s} className={`sw ${s === color ? 'on' : ''}`} style={{ background: s }} aria-label={`Colour ${s}`} onClick={() => { haptic('tick'); setColor(s) }} />)}
          </div>
          <div className="cc-fonts hscroll">
            {FONTS.map(f => (
              <button key={f} className={`cc-font ${f === font ? 'on' : ''}`} onClick={() => { haptic('tick'); setFont(f) }}
                style={{ fontFamily: f === 'ransom' ? '"Anton", sans-serif' : ZINE_FONTS[f].css }}>
                Aa<small>{ZINE_FONTS[f].label}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="cc-sec">
          <h3>How it makes things</h3>
          {RHYTHMS.map(r => (
            <button key={r.id} className={`cc-option ${rhythm === r.id ? 'on' : ''}`} onClick={() => { haptic('tick'); setRhythm(r.id) }}>
              <span className="cc-radio" />
              <span><b>{r.name}</b><small>{r.body}</small></span>
            </button>
          ))}
        </section>

        <section className="cc-sec">
          <h3>The first prompt</h3>
          <input className="text-input" value={prompt} onChange={e => setPrompt(e.target.value)} aria-label="First prompt" maxLength={48} />
          <div className="chip-wrap cc-chips">
            {PROMPTS.map(p => <button key={p} className={`chip ${p === prompt ? 'active' : ''}`} onClick={() => { haptic('tick'); setPrompt(p) }}>{p}</button>)}
          </div>
          <p className="cc-note">It goes out the moment the community opens, so there's something to make on day one.</p>
        </section>

        <section className="cc-sec">
          <h3>The charter</h3>
          <div className="chip-wrap cc-chips">
            {RULES.map(r => (
              <button key={r} className={`chip ${rules.includes(r) ? 'active' : ''}`}
                onClick={() => { haptic('tick'); setRules(v => (v.includes(r) ? v.filter(x => x !== r) : [...v, r])) }}>
                {rules.includes(r) && <Icon name="check" size={13} />} {r}
              </button>
            ))}
          </div>
        </section>

        <section className="cc-sec">
          <h3>Founders</h3>
          <p className="cc-note">A community opens once three founders sign its charter. Pick two people to start it with.</p>
          <div className="cc-founders">
            {[0, 1, 2].map(i => {
              const u = founders[i]
              return (
                <div key={i} className={`cc-slot ${u ? 'filled' : ''} ${i < signed ? 'signed' : ''}`}>
                  {u ? <Avatar src={u.avatar} size={46} /> : <span className="cc-slot-ph"><Icon name="plus" size={18} /></span>}
                  <small>{u ? (i === 0 ? 'you' : u.name) : 'invite'}</small>
                  {i < signed && <span className="cc-sig">signed</span>}
                </div>
              )
            })}
          </div>
          <div className="cc-friends hscroll">
            {friends.map(u => (
              <button key={u.id} className={`cc-friend ${invited.includes(u.id) ? 'on' : ''}`} onClick={() => invite(u.id)} disabled={signed > 0}>
                <Avatar src={u.avatar} size={36} /><span>{u.name}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="cc-cta">
          <Button onClick={() => { if (invited.length < 2) { toast('Invite two founders first'); return } haptic('tap'); setSigned(1) }}
            style={{ background: color }} disabled={signed > 0}>
            {signed > 0 ? `Signing… ${Math.min(signed, 3)} of 3` : 'Send the charter'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="cc-open" role="dialog" aria-label="Community opened">
          <div className="cc-open-card" style={{ '--cc': color } as CSSProperties}>
            <div className="cc-stamp">open</div>
            <div className="cm-tag">#{tag}</div>
            <CommunityTitle c={c} text={c.name} className="cc-title" />
            <div className="cc-sub">3 founders · {RHYTHMS.find(r => r.id === rhythm)!.name.toLowerCase()}</div>
            <div className="cm-prompt cc-prompt" style={{ '--pc': color } as CSSProperties}>
              <div style={{ flex: 1 }}>
                <div className="cmp-k">The first prompt</div>
                <CommunityTitle c={c} text={prompt} className="cmp-t" as="div" />
                <div className="cmp-b">Out now to all three of you. Make the first zine.</div>
              </div>
            </div>
            <Button kind="dark" onClick={() => { setOpen(false); setSigned(0) }}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 2 · keep it going

const CHAIN = ['u_me', 'u_raf', 'u_naheel', 'u_ada', 'u_julien', 'u_mira', 'u_tove', 'u_leafy']
const VOTES = [{ t: 'A small guy on a big trip', n: 14 }, { t: 'Your bus stop, redrawn', n: 9 }, { t: 'Things you lost this year', n: 6 }]

export function KeepItGoing() {
  const users = useApp(s => s.users)
  const communities = useApp(s => s.communities)
  const c = communities.find(x => x.id === 'c_small') ?? communities[0]
  const face = (id: string) => users.find(u => u.id === id)
  const [holder, setHolder] = useState(3)
  const [vote, setVote] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const covers = Object.values(COVERS).filter(src => !src.includes('spread'))
  const quiet = ['u_leafy', 'u_tove', 'u_mira', 'u_julien'].map(face).filter(Boolean) as typeof users
  const total = VOTES.reduce((s, v) => s + v.n, 0) + (vote === null ? 0 : 1)

  const pass = () => {
    if (holder >= CHAIN.length - 1) { toast('Chain #4 is done: it goes up as the club’s zine'); return }
    haptic('tap'); sfx('pop'); setHolder(h => h + 1)
  }

  return (
    <div className="soc-screen explore cc" style={{ '--cc': c.color } as CSSProperties}>
      <TopLine title="Host tools" />
      <div className="soc-scroll cc-scroll">
        <div className="cc-host">
          <div className="cm-tag">#{c.tag}</div>
          <CommunityTitle c={c} text={c.name} className="cc-title" />
          <div className="cc-sub">{fmtCount(c.members)} members · {c.perMonth} zines this month</div>
        </div>

        {/* a zine that never stops moving: each member adds a page and passes it on */}
        <section className="cc-card">
          <header><b>Chain zine #4</b><small>"Tiny hero" · page {holder + 1} of {CHAIN.length}</small></header>
          <div className="cc-chain">
            {CHAIN.map((id, i) => {
              const u = face(id)
              return (
                <div key={id} className={`cc-link ${i < holder ? 'done' : i === holder ? 'now' : ''}`}>
                  {u && <Avatar src={u.avatar} size={30} />}
                  {i === holder && <span className="cc-paper" aria-hidden />}
                </div>
              )
            })}
          </div>
          <p className="cc-note"><b>{face(CHAIN[holder])?.name}</b> has it · {Math.max(4, 31 - (holder - 3) * 9)}h left to add a page</p>
          <div className="cc-row">
            <button className="chip" onClick={() => { haptic('tick'); toast(`Nudged ${face(CHAIN[holder])?.name} with a scrap pack`) }}>Nudge</button>
            <button className="chip active" onClick={pass}>{holder >= CHAIN.length - 1 ? 'Publish the chain' : 'Pass it on'}</button>
          </div>
        </section>

        {/* the members pick what's next; a different member hosts each week */}
        <section className="cc-card">
          <header><b>Next week's prompt</b><small>voting closes Sunday · hosted by {face('u_julien')?.name}</small></header>
          {VOTES.map((v, i) => {
            const n = v.n + (vote === i ? 1 : 0)
            return (
              <button key={v.t} className={`cc-vote ${vote === i ? 'on' : ''}`} onClick={() => { haptic('tick'); setVote(i) }} disabled={vote !== null}>
                <span className="cc-vote-bar" style={{ width: vote === null ? 0 : `${(n / total) * 100}%` }} />
                <span className="cc-vote-t">{v.t}</span>
                {vote !== null && <span className="cc-vote-n">{Math.round((n / total) * 100)}%</span>}
              </button>
            )
          })}
        </section>

        {/* a monthly swap: everyone is paired up to make a zine for someone else */}
        <section className="cc-card">
          <header><b>October swap</b><small>make your partner a 4-page zine by the 31st</small></header>
          <button className={`cc-swap ${flipped ? 'flipped' : ''}`} onClick={() => { if (!flipped) { haptic('medium'); sfx('pop'); setFlipped(true) } }}>
            <span className="cc-swap-back">tap to meet your partner</span>
            <span className="cc-swap-front">
              <Avatar src={face('u_julien')?.avatar ?? ''} size={44} />
              <b>{face('u_julien')?.name}</b>
              <small>likes: found objects, photocopiers, montreal</small>
            </span>
          </button>
        </section>

        {/* the month's most-saved zines bind themselves into one issue */}
        <section className="cc-card">
          <header><b>October anthology</b><small>binds itself on the 31st from the month's most-saved zines</small></header>
          <div className="cc-pages">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="cc-page">{i < 12 && <img src={covers[i % covers.length]} alt="" />}</span>
            ))}
          </div>
          <p className="cc-note">12 of 16 pages · 4 spots left for this week's zines</p>
        </section>

        {/* nobody drifts off without a gentle nudge back */}
        <section className="cc-card">
          <header><b>Gone quiet</b><small>haven't posted in a month</small></header>
          <div className="cc-row">
            <div className="cm-avatars">{quiet.map(u => <Avatar key={u.id} src={u.avatar} size={30} />)}</div>
            <span className="cc-note" style={{ margin: 0 }}>+2 more</span>
            <button className="chip active" style={{ marginLeft: 'auto' }} onClick={() => { haptic('tap'); toast('Sent 6 starter scrap packs') }}>Send a scrap pack</button>
          </div>
        </section>
      </div>
    </div>
  )
}

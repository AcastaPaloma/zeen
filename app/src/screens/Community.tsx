import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { haptic, sfx } from '../lib/feedback'
import { ME } from '../lib/samples'
import { addCommunityPost, published, useApp } from '../lib/store'
import { useThumb } from '../lib/thumbs'
import type { Post, ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Avatar, Button, fmtCount, Sheet, timeAgo } from '../ui/kit'
import { CommunityTitle } from '../ui/Ransom'
import { MessyGrid, ZineCard } from './ZineGrid'
import './social.css'

/** Text tabs with a sliding underline (Own Work / Collected style from the profile frame). */
export function SocTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className="soc-tabs" role="tablist" style={{ '--n': options.length, '--i': i } as CSSProperties}>
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''}
          onClick={() => { if (o.value !== value) { haptic('tick'); onChange(o.value) } }}>{o.label}</button>
      ))}
      <span className="soc-tab-bar" />
    </div>
  )
}

function Thumb({ z, style }: { z: ZineDoc; style?: CSSProperties }) {
  const src = useThumb(z)
  return src ? <img src={src} alt="" style={style} /> : null
}

export function openZine(z: ZineDoc, rect?: DOMRect) {
  useApp.getState().go({ name: 'preview', id: z.id, from: rect ?? null })
}

export function PostView({ p }: { p: Post }) {
  const users = useApp(s => s.users)
  const zines = useApp(s => s.zines)
  const likePost = useApp(s => s.likePost)
  const replyPost = useApp(s => s.replyPost)
  const go = useApp(s => s.go)
  const [liked, setLiked] = useState(false)
  const [open, setOpen] = useState(p.replies.length > 0 && p.replies.length <= 2)
  const [reply, setReply] = useState('')
  const u = users.find(x => x.id === p.user)
  const z = p.zine ? zines[p.zine] : undefined
  return (
    <article className="post">
      <div className="post-head">
        <button onClick={() => u && go({ name: 'profile', id: u.id === ME ? undefined : u.id })} aria-label={u?.name}>
          <Avatar src={u?.avatar ?? ''} size={28} />
        </button>
        <b>{u?.name ?? 'someone'}</b>
        <span className="muted">{timeAgo(p.at)}</span>
        {p.pinned && <span className="post-pin"><Icon name="pin" size={12} /> pinned</span>}
      </div>
      {p.text && <p className="post-text">{p.text}</p>}
      {(p.image || z) && (
        <div className="post-media">
          {p.image && <img className="post-img" src={p.image} alt="" />}
          {z && <div className="post-zine"><ZineCard z={z} onOpen={openZine} /></div>}
        </div>
      )}
      <div className="post-actions">
        <button className={liked ? 'on' : ''} aria-label="Like" onClick={() => { if (!liked) { likePost(p.id); setLiked(true); haptic('tap'); sfx('pop') } }}>
          <Icon name="heart" size={17} fill={liked ? 'var(--accent)' : 'none'} /> {p.likes}
        </button>
        <button aria-label="Replies" onClick={() => setOpen(o => !o)}>
          <Icon name="reply" size={17} /> {p.replies.length || 'Reply'}
        </button>
      </div>
      {open && (
        <div className="replies">
          {p.replies.map((r, i) => {
            const ru = users.find(x => x.id === r.user)
            return <div key={i} className="reply"><b>{ru?.name ?? 'someone'}</b>{r.text} <span className="muted" style={{ fontSize: 11 }}>{timeAgo(r.at)}</span></div>
          })}
          <form className="inline-input" onSubmit={e => { e.preventDefault(); if (reply.trim()) { replyPost(p.id, reply.trim()); setReply(''); haptic('tap') } }}>
            <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply…" aria-label="Write a reply" />
            <Button kind="dark" style={{ height: 34 }} disabled={!reply.trim()}>Send</Button>
          </form>
        </div>
      )}
    </article>
  )
}

function Composer({ community }: { community: string }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | undefined>()
  const [zine, setZine] = useState<string | undefined>()
  const [pick, setPick] = useState(false)
  const zines = useApp(s => s.zines)
  const mine = Object.values(zines).filter(z => z.author === ME && z.status === 'published')
  const file = useRef<HTMLInputElement>(null)
  const post = () => {
    if (!text.trim() && !image && !zine) return
    addCommunityPost(community, text.trim(), { image, zine })
    setText(''); setImage(undefined); setZine(undefined)
    haptic('tap'); sfx('stamp')
    useApp.getState().showToast('Posted to the discussion')
  }
  return (
    <div className="composer">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Say something to the community…" aria-label="New post" />
      {(image || zine) && (
        <div className="composer-attach">
          {image && <><img src={image} alt="" /><button className="attach-x" aria-label="Remove image" onClick={() => setImage(undefined)}><Icon name="x" size={14} /></button></>}
          {zine && zines[zine] && <><Thumb z={zines[zine]} style={{ height: 54 }} /><button className="attach-x" aria-label="Remove zine" onClick={() => setZine(undefined)}><Icon name="x" size={14} /></button></>}
        </div>
      )}
      <div className="composer-row">
        <button className="icon-btn" aria-label="Attach image" onClick={() => file.current?.click()}><Icon name="image" size={20} /></button>
        <button className="icon-btn" aria-label="Attach a zine" onClick={() => setPick(true)}><Icon name="pages" size={20} /></button>
        <span className="grow" />
        <Button kind="dark" onClick={post} disabled={!text.trim() && !image && !zine}>Post</Button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => {
        const f = e.target.files?.[0]
        if (!f) return
        const r = new FileReader()
        r.onload = () => setImage(String(r.result))
        r.readAsDataURL(f)
        e.target.value = ''
      }} />
      <Sheet open={pick} onClose={() => setPick(false)} title="Attach one of your zines" dim>
        {mine.length ? (
          <div className="ep-zines">
            {mine.map(z => (
              <button key={z.id} className={zine === z.id ? 'on' : ''} onClick={() => { setZine(z.id); setPick(false); haptic('tick') }}>
                <Thumb z={z} />
              </button>
            ))}
          </div>
        ) : <p className="empty-note">You haven't published a zine yet.</p>}
      </Sheet>
    </div>
  )
}

export default function CommunityScreen({ id }: { active: boolean; id?: string }) {
  const c = useApp(s => s.communities.find(x => x.id === id))
  const joined = useApp(s => !!id && s.joined.includes(id))
  const toggleJoin = useApp(s => s.toggleJoin)
  const zines = useApp(s => s.zines)
  const posts = useApp(s => s.posts)
  const users = useApp(s => s.users)
  const back = useApp(s => s.back)
  const go = useApp(s => s.go)
  const [tab, setTab] = useState<'zines' | 'discussion' | 'about'>('zines')
  const [scrollY, setScrollY] = useState(0)

  const list = useMemo(() => published(zines).filter(z => z.publish.postTo === id), [zines, id])
  const thread = useMemo(() => posts.filter(p => p.community === id).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at), [posts, id])
  if (!c) return <div className="soc-screen"><div className="soc-topline"><button className="soc-back" onClick={back} aria-label="Back"><Icon name="arrowLeft" /></button></div><p className="empty-note">This community doesn't exist anymore.</p></div>

  const members = c.members + (joined ? 1 : 0)
  const memberFaces = users.filter(u => u.id !== ME).slice(0, 4)

  return (
    <div className="soc-screen">
      <div className="soc-scroll" onScroll={e => setScrollY((e.target as HTMLElement).scrollTop)}>
        <div className="soc-topline">
          <button className="soc-back" onClick={back} aria-label="Back"><Icon name="arrowLeft" /></button>
          <button className="icon-btn" aria-label="Share community" onClick={() => {
            navigator.clipboard?.writeText(`zeen.app/c/${c.tag.toLowerCase()}`).catch(() => {})
            useApp.getState().showToast('Link copied')
          }}><Icon name="share" size={20} /></button>
        </div>
        <header className="cm-head">
          <div className="cm-collage" aria-hidden>
            {list.slice(0, 3).map((z, i) => (
              <Thumb key={z.id} z={z} style={{ right: i * 30, top: (i % 2) * 12, '--r': `${[8, -6, 12][i]}deg`, transform: `rotate(${[8, -6, 12][i]}deg)`, animationDelay: `${i * 70}ms`, zIndex: 3 - i } as CSSProperties} />
            ))}
          </div>
          <div className="cm-tag">#{c.tag}</div>
          <CommunityTitle c={c} text={c.name} className="cm-title" />
          <div className="cm-stats">{fmtCount(members)} members · {c.perMonth} zines this month</div>
          <p className="cm-desc">{c.description}</p>
          <div className="cm-join">
            <button className={`btn btn-dark ${joined ? 'joined' : ''}`} onClick={() => {
              toggleJoin(c.id); haptic('tap')
              if (!joined) { sfx('pop'); useApp.getState().showToast(`Joined #${c.tag} — it'll show up in Discover`) }
            }}>
              <Icon name={joined ? 'check' : 'users'} size={16} /> {joined ? 'Joined' : 'Join'}
            </button>
            <div className="cm-avatars" aria-hidden>{memberFaces.map(u => <Avatar key={u.id} src={u.avatar} size={26} />)}</div>
          </div>
        </header>

        <button className="cm-prompt" style={{ '--pc': c.color } as CSSProperties} onClick={() => go({ name: 'prompt', id: c.id })}>
          <div style={{ flex: 1 }}>
            <div className="cmp-k">This week's prompt</div>
            <CommunityTitle c={c} text={c.prompt.title} className="cmp-t" as="div" />
            <div className="cmp-b">{c.prompt.body}</div>
          </div>
          <span className="cmp-due">due {c.prompt.due}</span>
        </button>

        <SocTabs value={tab} onChange={setTab} options={[{ value: 'zines', label: 'Zines' }, { value: 'discussion', label: 'Discussion' }, { value: 'about', label: 'About' }]} />

        {tab === 'zines' && (list.length
          ? <MessyGrid zines={list} tag="maker" onOpen={openZine} scrollY={scrollY} />
          : <div className="empty-note">No zines here yet. Be the first.<br /><Button onClick={() => go({ name: 'create' })} icon="plus">Make a zine</Button></div>)}

        {tab === 'discussion' && (
          <div>
            {joined ? <Composer community={c.id} /> : (
              <div className="empty-note" style={{ padding: '6px 30px 14px' }}>Join to post in the discussion.</div>
            )}
            {thread.map(p => <PostView key={p.id} p={p} />)}
            {!thread.length && <p className="empty-note">Quiet in here. Start a thread.</p>}
          </div>
        )}

        {tab === 'about' && (
          <div className="about">
            <h4>Rules</h4>
            <ol>{c.rules.map(r => <li key={r}>{r}</li>)}</ol>
            <h4>Moderators</h4>
            {c.mods.map(m => {
              const u = users.find(x => x.id === m)
              if (!u) return null
              return (
                <button key={m} className="mod-row" onClick={() => go({ name: 'profile', id: m === ME ? undefined : m })}>
                  <Avatar src={u.avatar} size={36} />
                  <div><b>{u.name}</b><small>@{u.handle}</small></div>
                </button>
              )
            })}
            <h4>Since</h4>
            <p style={{ fontSize: 14, margin: 0 }}>Created {c.created} · {fmtCount(members)} members · {c.perMonth} zines a month</p>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { trackById } from '../lib/assets'
import { haptic, sfx } from '../lib/feedback'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import { renderThumb } from '../lib/thumbs'
import type { Visibility, ZineDoc } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Avatar, Button, Chip, Grabber, IconBtn, PillGroup, Row, Segmented, Toggle, usePanelDrag } from '../ui/kit'
import type { StepProps } from './Create'
import { useEditor } from './editor'
import { exportZine, type Aspect, type ExportKind } from './export'
import { KeyThumb } from './KeyframeStrip'
import './finish.css'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function Publish({ scene, doc, exit }: StepProps) {
  const ed = useEditor()
  const app = useApp()
  const p = doc.publish
  const [tagDraft, setTagDraft] = useState('')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [busy, setBusy] = useState<{ kind: ExportKind; p: number } | null>(null)
  const [stamping, setStamping] = useState(false)
  // the sheet drags between nearly full, its resting height and tucked away under the zine
  const panel = usePanelDrag([0.12, 0.37, 0.8], 0.37)

  // the zine sits in the space above the sheet, posed at its cover keyframe
  useEffect(() => {
    if (!scene) return
    const el = scene.el
    el.style.top = 'calc(var(--safe-top) + 84px)'
    el.style.bottom = `${Math.round((1 - panel.top) * 100)}%`
    scene.fitMargin = 1.25
    scene.resize()
  }, [scene, panel.top])
  useEffect(() => {
    if (!scene) return
    const el = scene.el
    return () => { el.style.top = ''; el.style.bottom = ''; scene.fitMargin = null; scene.resize() }
  }, [scene])
  useEffect(() => {
    const kf = doc.keyframes[p.coverKeyframe] ?? doc.keyframes[0]
    if (scene && kf) scene.setAngles(kf.angles)
  }, [scene, p.coverKeyframe, doc.keyframes])

  const setPub = (patch: Partial<ZineDoc['publish']>, label?: string) => {
    const nd = { ...doc, publish: { ...doc.publish, ...patch } }
    if (label) ed.commit(nd, label); else ed.live(nd)
  }
  const commitPub = (label: string) => { const d = useEditor.getState().doc; if (d) ed.commit(d, label) }

  const communities = app.communities.filter(c => app.joined.includes(c.id))
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of app.communities) counts.set(c.tag.toLowerCase(), 5)
    for (const z of Object.values(app.zines)) for (const t of z.publish.tags) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1)
    const q = tagDraft.trim().replace(/^#/, '').toLowerCase()
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
      .filter(t => !p.tags.map(x => x.toLowerCase()).includes(t) && (!q || t.includes(q))).slice(0, 8)
  }, [app.communities, app.zines, tagDraft, p.tags])

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').replace(/\s+/g, '')
    if (!t || p.tags.length >= 10 || p.tags.includes(t)) { setTagDraft(''); return }
    haptic('tick')
    setPub({ tags: [...p.tags, t] }, 'Add tag')
    setTagDraft('')
  }

  const music = doc.music ? trackById(doc.music.track) : null
  const others = app.users.filter(u => u.id !== ME)

  const runExport = async (kind: ExportKind) => {
    if (busy) return
    haptic('tap')
    setBusy({ kind, p: 0 })
    try {
      await exportZine(doc, kind, { aspect, onProgress: v => setBusy({ kind, p: v }) })
      app.showToast(kind === 'video' ? 'Video saved' : kind === 'gif' ? 'GIF saved' : 'PDF saved')
    } catch (e) {
      console.warn(e)
      app.showToast(e instanceof Error ? e.message : 'Export failed')
    } finally { setBusy(null) }
  }

  const post = async () => {
    const title = p.title.trim()
    if (!title || stamping) return
    const final: ZineDoc = {
      ...doc, status: 'published', publishedAt: Date.now(), author: ME,
      stats: { likes: 0, saves: 0, reads: 0, comments: 0 },
      publish: { ...doc.publish, title },
    }
    ed.commit(final, 'Publish')
    app.saveZine(final)
    if (final.publish.postTo) app.addPost(final.publish.postTo, `New zine: ${title}`, final.id)
    setStamping(true)
    setTimeout(() => { sfx('stamp'); haptic('firm') }, 240)
    const saved = useApp.getState().zines[final.id] ?? final
    await Promise.all([Promise.race([renderThumb(saved).catch(() => null), wait(1200)]), wait(1150)])
    useApp.setState({ stack: [{ name: 'home' }, { name: 'preview', id: final.id, from: null }], dir: 1 })
  }

  const VIS: { value: Visibility; label: string }[] = [
    { value: 'public', label: 'Public' }, { value: 'followers', label: 'Followers' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' },
  ]
  const EXPORTS: { kind: ExportKind; icon: 'film' | 'pdf' | 'gif'; title: string; sub: string }[] = [
    { kind: 'video', icon: 'film', title: 'Video', sub: 'The unfold, with the Zeen mark' },
    { kind: 'pdf-pages', icon: 'pdf', title: 'PDF · flat pages', sub: 'One page per zine page' },
    { kind: 'pdf-print', icon: 'pdf', title: 'PDF · print & fold', sub: 'The flat sheet with cut and fold guides' },
    { kind: 'gif', icon: 'gif', title: 'GIF', sub: 'A short loop for socials' },
  ]

  return (
    <div className="step-ui publish">
      <div className="top-bar">
        <PillGroup>
          <IconBtn name="back" label="Save and exit" onClick={exit} />
          <IconBtn name="undo" label="Undo" onClick={ed.undo} disabled={!ed.past.length} />
          <IconBtn name="redo" label="Redo" onClick={ed.redo} disabled={!ed.future.length} />
        </PillGroup>
        <div className="grow" />
        <button className="post-mini" disabled={!p.title.trim()} onClick={post}>Post</button>
      </div>

      <section className="pub-sheet" aria-label="Publish" data-panel style={panel.style}>
        <Grabber {...panel.bind} label="Drag to resize the publish sheet" />
        <div className="pub-scroll scroll">
          <label className="field">
            <span className="field-head"><b>Title</b><small className={p.title.length > 54 ? 'warn' : ''}>{p.title.length}/60</small></span>
            <input className="text-input title-input" value={p.title} maxLength={60} placeholder="Name your zine" autoComplete="off"
              onChange={e => setPub({ title: e.target.value })} onBlur={() => commitPub('Title')} />
          </label>
          <label className="field">
            <span className="field-head"><b>Description</b><small>{p.description.length}/500</small></span>
            <textarea className="text-input" value={p.description} maxLength={500} placeholder="What's it about? Who's it for?"
              onChange={e => setPub({ description: e.target.value })} onBlur={() => commitPub('Description')} />
          </label>

          <div className="field">
            <span className="field-head"><b>Tags</b><small>{p.tags.length}/10</small></span>
            <div className="tag-input">
              {p.tags.map(t => (
                <button key={t} className="tag-chip" onClick={() => setPub({ tags: p.tags.filter(x => x !== t) }, 'Remove tag')} aria-label={`Remove tag ${t}`}>
                  #{t}<Icon name="x" size={11} />
                </button>
              ))}
              {p.tags.length < 10 && (
                <input value={tagDraft} placeholder={p.tags.length ? 'add tag' : '#tag your zine'} aria-label="Add tag"
                  onChange={e => { const v = e.target.value; if (/[,\s]$/.test(v)) addTag(v); else setTagDraft(v) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft) } if (e.key === 'Backspace' && !tagDraft && p.tags.length) setPub({ tags: p.tags.slice(0, -1) }, 'Remove tag') }} />
              )}
            </div>
            {p.tags.length < 10 && suggestions.length > 0 && (
              <div className="tag-sugg hscroll">{suggestions.map(t => <Chip key={t} onClick={() => addTag(t)}>#{t}</Chip>)}</div>
            )}
          </div>

          <div className="field">
            <span className="field-head"><b>Cover</b><small>which keyframe shows in feeds</small></span>
            <div className="cover-row hscroll">
              {doc.keyframes.map((k, i) => (
                <button key={k.id} className={`cover-opt ${p.coverKeyframe === i ? 'on' : ''}`} aria-pressed={p.coverKeyframe === i}
                  onClick={() => { haptic('tick'); setPub({ coverKeyframe: i }, 'Cover') }}>
                  <KeyThumb doc={doc} i={i} />
                  <span>{i === 0 ? 'Cover' : k.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-head"><b>Post to</b></span>
            <div className="postto">
              <button className={`postto-opt ${!p.postTo ? 'on' : ''}`} onClick={() => setPub({ postTo: null }, 'Post to')}>
                <Avatar src={app.me.avatar} size={30} />
                <span>My profile only</span>
                {!p.postTo && <Icon name="check" size={16} stroke={2.4} />}
              </button>
              {communities.map(c => (
                <button key={c.id} className={`postto-opt ${p.postTo === c.id ? 'on' : ''}`} onClick={() => setPub({ postTo: c.id }, 'Post to')}>
                  <span className="comm-dot" style={{ background: c.color }}>#</span>
                  <span>{c.name}<small>#{c.tag} · {c.members.toLocaleString()} members</small></span>
                  {p.postTo === c.id && <Icon name="check" size={16} stroke={2.4} />}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-head"><b>Visibility</b></span>
            <Segmented value={p.visibility} onChange={v => setPub({ visibility: v }, 'Visibility')} options={VIS} />
          </div>

          <div className="field rows">
            <Row label="Reply zines" sub="Readers can answer with a zine of their own">
              <Toggle on={p.allowReplies} onChange={v => setPub({ allowReplies: v }, 'Reply zines')} label="Reply zines" />
            </Row>
            <Row label="Scrap reuse" sub="Readers can save your scraps to their scrapbook">
              <Toggle on={p.scrapReuse} onChange={v => setPub({ scrapReuse: v }, 'Scrap reuse')} label="Scrap reuse" />
            </Row>
          </div>

          <div className="field">
            <span className="field-head"><b>Credits</b><small>tag collaborators</small></span>
            <div className="credit-row hscroll">
              {others.map(u => {
                const on = p.credits.includes(u.id)
                return (
                  <button key={u.id} className={`credit ${on ? 'on' : ''}`} aria-pressed={on}
                    onClick={() => { haptic('tick'); setPub({ credits: on ? p.credits.filter(x => x !== u.id) : [...p.credits, u.id] }, 'Credits') }}>
                    <Avatar src={u.avatar} size={40} />
                    <span>@{u.handle}</span>
                    {on && <span className="credit-check"><Icon name="check" size={10} stroke={3} /></span>}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="field">
            <span className="field-head"><b>Content note</b><small>optional · shown before Preview</small></span>
            <input className="text-input" value={p.contentNote} placeholder="e.g. mentions of grief" maxLength={120}
              onChange={e => setPub({ contentNote: e.target.value })} onBlur={() => commitPub('Content note')} />
          </label>

          {music && (
            <div className="music-credit">
              <img src={music.album.cover} alt="" />
              <span><b>{music.track.title}</b><small>{music.album.artist} · credit attaches automatically</small></span>
              <Icon name="music" size={16} />
            </div>
          )}

          <div className="field export">
            <span className="field-head"><b>Export</b><small>take it off-platform</small></span>
            {EXPORTS.map(x => (
              <div key={x.kind} className="export-row">
                <span className="export-ico"><Icon name={x.icon} size={18} /></span>
                <span className="export-text"><b>{x.title}</b><small>{x.sub}</small>
                  {x.kind === 'video' && (
                    <span className="aspect-row">
                      {(['9:16', '4:5', '1:1', '16:9'] as Aspect[]).map(a => (
                        <button key={a} className={`aspect ${aspect === a ? 'on' : ''}`} onClick={() => setAspect(a)} aria-pressed={aspect === a}>
                          <i style={{ aspectRatio: a.replace(':', ' / ') }} />{a}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                <button className="export-go" disabled={!!busy} onClick={() => runExport(x.kind)} aria-label={`Export ${x.title}`}>
                  {busy?.kind === x.kind
                    ? <span className="export-prog" style={{ '--p': `${Math.round(busy.p * 100)}%` } as React.CSSProperties}>{Math.round(busy.p * 100)}%</span>
                    : <Icon name="download" size={18} />}
                </button>
              </div>
            ))}
          </div>
          <div className="pub-spacer" />
        </div>
        <div className="pub-foot">
          <Button className="post-btn" disabled={!p.title.trim() || stamping} onClick={post}>
            {p.title.trim() ? (p.postTo ? `Post to #${app.communities.find(c => c.id === p.postTo)?.tag}` : 'Post zine') : 'Add a title to post'}
          </Button>
        </div>
      </section>

      {stamping && (
        <div className="stamp-wrap" aria-live="assertive">
          <div className="stamp"><span>Posted</span><small>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>
        </div>
      )}
    </div>
  )
}

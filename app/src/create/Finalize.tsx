import { useEffect, useMemo, useRef, useState } from 'react'
import { Matrix4, Vector3 } from 'three'
import { applyEffects, EFFECTS } from '../lib/effects'
import { haptic, sfx } from '../lib/feedback'
import { bbox, pointInMulti, uid } from '../lib/geom'
import { pageToFlat, panelMatrices } from '../lib/paper'
import type { EdgeStyle, EffectType, Side, Vec2, ZineDoc } from '../lib/types'
import type { PageRef, ZineScene } from '../three/ZineScene'
import { Icon, type IconName } from '../ui/Icon'
import { IconBtn, PillGroup, Row, Segmented, Slider, Toggle } from '../ui/kit'
import type { StepProps } from './Create'
import { useEditor } from './editor'
import './finish.css'

type Tab = 'edges' | 'outline' | 'look' | 'anim' | 'check'

const EDGES: { id: EdgeStyle; label: string; d: string }[] = [
  { id: 'none', label: 'Clean', d: 'M4 18H44' },
  { id: 'jagged', label: 'Jagged', d: 'M4 18l4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6' },
  { id: 'ripped', label: 'Ripped', d: 'M4 16c3 2 4-3 7-1s3 4 6 1 2-3 6-1 3 3 6 0 4-2 6 1 3 2 5-1 3 0 4 1' },
  { id: 'deckle', label: 'Deckle', d: 'M4 17l2-1 1 2 2-2 2 1 1-1 2 2 1-2 2 1 2-1 1 2 2-1 1 1 2-2 2 2 1-1 2 1 2-1 2 2 1-1 2 1 2-1 1 1' },
  { id: 'scallop', label: 'Scallop', d: 'M4 18a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0' },
]
const OUTLINE_COLORS = ['#FFFFFF', '#1A1A1A', '#FF4934', '#DEFF7C', '#F158A7', '#245AE2', '#F8D647']
const LOOKS: EffectType[] = ['dither', 'halftone', 'grain', 'scan', 'photocopy', 'riso', 'bleed', 'texture']

export interface Flag { id: string; icon: IconName; text: string; page?: PageRef }

/** Faces some keyframe actually shows a reader (front or back view, not covered by another flap). */
function revealedFaces(scene: ZineScene, doc: ZineDoc) {
  const seen = new Set<string>()
  const d = scene.d
  const tmp = new Map<string, Matrix4>()
  const v = new Vector3()
  const kfs = doc.keyframes.length ? doc.keyframes : [{ id: 'x', name: '', angles: {} }]
  for (const kf of kfs) {
    panelMatrices(d, c => kf.angles[c.id] ?? c.angle, tmp)
    for (const view of ['front', 'back'] as Side[]) {
      const sign = view === 'front' ? 1 : -1
      for (const P of d.list) {
        if (!P.region.length) continue
        const m = tmp.get(P.id)!
        const nz = new Vector3(0, 0, 1).transformDirection(m).z
        if (Math.abs(nz) < 0.5) continue
        const side: Side = (nz >= 0) === (view === 'front') ? 'front' : 'back'
        const b = bbox(P.region)
        v.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0).applyMatrix4(m)
        const myZ = v.z * sign
        let covered = false
        for (const Q of d.list) {
          if (Q.id === P.id || !Q.region.length) continue
          const mq = tmp.get(Q.id)!
          if (Math.abs(new Vector3(0, 0, 1).transformDirection(mq).z) < 0.5) continue
          const lp = v.clone().applyMatrix4(new Matrix4().copy(mq).invert())
          const qz = new Vector3(lp.x, lp.y, 0).applyMatrix4(mq).z * sign
          if (qz > myZ + 0.005 && pointInMulti([lp.x, lp.y], Q.region)) { covered = true; break }
        }
        if (!covered) seen.add(`${P.id}:${side}`)
      }
    }
  }
  return seen
}

/** Things worth a second look before publishing. */
export function checkZine(scene: ZineScene | null, doc: ZineDoc): Flag[] {
  if (!scene || !scene.d) return []
  const flags: Flag[] = []
  const revealed = revealedFaces(scene, doc)
  for (const pg of scene.pages) {
    const P = scene.d.panels.get(pg.panel)
    const s = scene.d.surfaces.get(pg.surface)
    if (!P || !s) continue
    const has = doc.objects.some(o => {
      if (o.surface !== pg.surface || o.side !== pg.side || o.hidden) return false
      const pts: Vec2[] = o.kind === 'ink' ? o.strokes.flatMap(st => st.pts.filter((_, i) => i % 8 === 0).map((_, i) => [st.pts[i * 8], st.pts[i * 8 + 1]] as Vec2)) : [[o.x, o.y]]
      return pts.some(p => p[0] !== undefined && pointInMulti(pageToFlat(s.frame, pg.side, p), P.region))
    })
    if (!has) flags.push({ id: `empty:${pg.n}`, icon: 'page', text: `Page ${pg.n} is empty`, page: pg })
    else if (!revealed.has(`${pg.panel}:${pg.side}`)) flags.push({ id: `hidden:${pg.n}`, icon: 'eyeOff', text: `No keyframe ever shows page ${pg.n}`, page: pg })
  }
  for (const o of doc.objects) {
    if (o.kind !== 'text' || o.hidden) continue
    if (o.size * o.scale < 0.35) {
      const pg = scene.pages.find(p => p.surface === o.surface && p.side === o.side && pointInMulti(pageToFlat(scene.d.surfaces.get(o.surface)!.frame, o.side, [o.x, o.y]), scene.d.panels.get(p.panel)?.region ?? []))
      flags.push({ id: `small:${o.id}`, icon: 'text', text: `“${o.text.split('\n')[0].slice(0, 22)}” is too small to read`, page: pg })
    }
  }
  return flags
}

export default function Finalize({ scene, doc, exit, next }: StepProps) {
  const ed = useEditor()
  const [tab, setTab] = useState<Tab>('edges')
  const [playing, setPlaying] = useState(true)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [warned, setWarned] = useState(false)
  const paused = useRef(false)
  const f = doc.finalize

  // the zine sits in the top part of the screen while the sheet takes the bottom
  useEffect(() => {
    if (!scene) return
    const el = scene.el
    el.style.top = 'calc(var(--safe-top) + 84px)'
    el.style.bottom = '47%'
    scene.fitMargin = 1.4
    scene.resize()
    return () => { el.style.top = ''; el.style.bottom = ''; scene.fitMargin = null; scene.resize(); scene.tiltX.to(0); scene.tiltY.to(0) }
  }, [scene])

  // unfold sequence on loop, with holds on each keyframe; breathe sways the paper gently
  useEffect(() => {
    if (!scene) return
    const n = doc.keyframes.length
    let t = 0, raf = 0, last = performance.now()
    const hold = 0.9, move = 1.3, cycle = n > 1 ? (n - 1) * (hold + move) * 2 : 1
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (f.breathe) {
        scene.tiltY.to(Math.sin(now / 1250) * 0.07)
        scene.tiltX.to(Math.cos(now / 1600) * 0.035)
      }
      if (!playing || paused.current || n < 2) return
      t = (t + dt) % cycle
      // ping-pong across the keyframes
      const half = cycle / 2
      let x = t < half ? t : cycle - t
      let k = 0
      for (let i = 0; i < n - 1; i++) {
        if (x < hold) { k = i; break }
        x -= hold
        if (x < move) { const e = x / move; k = i + e * e * (3 - 2 * e); break }
        x -= move
        k = i + 1
      }
      scene.setAngles(scene.poseAt(k), { animate: false })
    }
    raf = requestAnimationFrame(tick)
    const off1 = scene.on('handle-down', () => { paused.current = true })
    let resume = 0
    const off2 = scene.on('handle-up', () => { clearTimeout(resume); resume = window.setTimeout(() => { paused.current = false }, 2500) })
    return () => { cancelAnimationFrame(raf); off1(); off2(); clearTimeout(resume) }
  }, [scene, doc.keyframes, playing, f.breathe])

  useEffect(() => {
    if (!scene || f.breathe) return
    scene.tiltX.to(0); scene.tiltY.to(0)
  }, [scene, f.breathe])

  // effect previews come from one snapshot of the zine as it looks right now
  useEffect(() => {
    if (tab !== 'look' || !scene || Object.keys(previews).length) return
    const url = scene.snapshot('image/png')
    const img = new Image()
    img.onload = () => {
      const S = 84
      const base = document.createElement('canvas')
      base.width = S; base.height = S
      const bctx = base.getContext('2d')!
      bctx.fillStyle = '#F2F2F2'; bctx.fillRect(0, 0, S, S)
      const sc = Math.max(S / img.width, S / img.height) * 1.6
      bctx.drawImage(img, (S - img.width * sc) / 2, (S - img.height * sc) / 2, img.width * sc, img.height * sc)
      const out: Record<string, string> = { none: base.toDataURL() }
      for (const t of LOOKS) {
        const c = document.createElement('canvas')
        c.width = S; c.height = S
        c.getContext('2d')!.drawImage(base, 0, 0)
        applyEffects(c, [{ type: t, amount: 0.85 }])
        out[t] = c.toDataURL()
      }
      setPreviews(out)
    }
    img.src = url
  }, [tab, scene, previews])

  const flags = useMemo(() => checkZine(scene, doc), [scene, doc])

  const setFin = (p: Partial<ZineDoc['finalize']>, label?: string) => {
    const nd = { ...doc, finalize: { ...doc.finalize, ...p } }
    if (label) ed.commit(nd, label); else ed.live(nd)
  }
  const commitFin = (label: string) => { const d = useEditor.getState().doc; if (d) ed.commit(d, label) }

  const zineFx = doc.effects.filter(e => e.scope === 'zine')
  const fxOf = (t: EffectType) => zineFx.find(e => e.type === t)
  const toggleFx = (t: EffectType) => {
    haptic('tick')
    const cur = fxOf(t)
    const effects = cur ? doc.effects.filter(e => e !== cur) : [...doc.effects, { id: uid('e'), type: t, amount: 0.6, scope: 'zine' as const }]
    ed.commit({ ...doc, effects }, cur ? `Remove ${t}` : `Add ${t}`)
  }
  const setFxAmount = (id: string, amount: number, commit?: boolean) => {
    const nd = { ...doc, effects: doc.effects.map(e => (e.id === id ? { ...e, amount } : e)) }
    if (commit) ed.commit(nd, 'Effect amount'); else ed.live(nd)
  }

  const previewIntro = () => {
    if (!scene) return
    haptic('tap')
    const el = scene.el
    const kf: Keyframe[] = f.intro === 'drop'
      ? [{ transform: 'translateY(-110%) rotate(-8deg)', opacity: 0 }, { transform: 'translateY(4%) rotate(1deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }]
      : f.intro === 'slide'
        ? [{ transform: 'translateX(110%) rotate(6deg)', opacity: 0 }, { transform: 'translateX(-3%)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }]
        : [{ transform: 'perspective(900px) rotateY(180deg) scale(0.8)', opacity: 0 }, { transform: 'perspective(900px) rotateY(-12deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }]
    el.animate(kf, { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    setTimeout(() => sfx(f.intro === 'drop' ? 'slap' : 'rustle'), f.intro === 'drop' ? 420 : 200)
  }

  const jump = (fl: Flag) => {
    haptic('tap')
    ed.setStep('collage')
    if (fl.page && scene) {
      const pg = fl.page
      setTimeout(() => scene.facePanel(pg.panel, pg.side, { focus: true }), 80)
    }
  }

  const goNext = () => {
    if (flags.length && !warned) {
      setWarned(true)
      setTab('check')
      haptic('tap')
      return
    }
    next()
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'edges', label: 'Edges' }, { id: 'outline', label: 'Outline' }, { id: 'look', label: 'Look' },
    { id: 'anim', label: 'Animation' }, { id: 'check', label: 'Check' },
  ]

  return (
    <div className="step-ui finalize">
      <div className="top-bar">
        <PillGroup>
          <IconBtn name="back" label="Save and exit" onClick={exit} />
          <IconBtn name="undo" label="Undo" onClick={ed.undo} disabled={!ed.past.length} />
          <IconBtn name="redo" label="Redo" onClick={ed.redo} disabled={!ed.future.length} />
        </PillGroup>
        <div className="grow" />
        <PillGroup className="solo"><IconBtn name="right" label="Next: Publish" onClick={goNext} /></PillGroup>
      </div>

      {doc.keyframes.length > 1 && (
        <button className="fin-play" onClick={() => { haptic('tick'); setPlaying(p => !p) }} aria-label={playing ? 'Pause unfold loop' : 'Play unfold loop'}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
          <span>{playing ? 'looping unfold' : 'paused'}</span>
        </button>
      )}

      <section className="fin-panel" aria-label="Finishing">
        <div className="fin-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { haptic('tick'); setTab(t.id) }}>
              {t.label}
              {t.id === 'check' && flags.length > 0 && <span className="fin-badge">{flags.length}</span>}
            </button>
          ))}
        </div>
        <div className="fin-body" key={tab}>
          {tab === 'edges' && (
            <>
              <div className="edge-grid">
                {EDGES.map(e => (
                  <button key={e.id} className={`edge-opt ${f.edge === e.id ? 'on' : ''}`} aria-pressed={f.edge === e.id}
                    onClick={() => { haptic('tick'); sfx('snip'); setFin({ edge: e.id }, `Edges: ${e.label}`) }}>
                    <svg viewBox="0 0 48 30" width={56} height={36} aria-hidden>
                      <path d={`${e.d} V28 H4 Z`} fill={f.edge === e.id ? '#FFE3DF' : '#F3F3F3'} stroke="none" />
                      <path d={e.d} fill="none" stroke={f.edge === e.id ? 'var(--accent)' : 'var(--ink)'} strokeWidth={1.4} strokeLinejoin="round" />
                    </svg>
                    <span>{e.label}</span>
                  </button>
                ))}
              </div>
              <Slider label="Intensity" value={Math.round(f.edgeAmount * 100)} min={10} max={100}
                onChange={v => setFin({ edgeAmount: v / 100 })} onCommit={() => commitFin('Edge intensity')} format={v => `${v}`} />
              <p className="fin-tip">Applies to every outer edge. Creases stay crisp.</p>
            </>
          )}

          {tab === 'outline' && (
            <>
              <Row label="Sticker outline" sub="A die-cut border around the whole zine">
                <Toggle on={f.outline.on} onChange={v => setFin({ outline: { ...f.outline, on: v } }, v ? 'Outline on' : 'Outline off')} label="Sticker outline" />
              </Row>
              <div className={`outline-swatches ${f.outline.on ? '' : 'off'}`}>
                {OUTLINE_COLORS.map(c => (
                  <button key={c} className={`sw ${f.outline.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Outline ${c}`}
                    onClick={() => { haptic('tick'); setFin({ outline: { ...f.outline, color: c, on: true } }, 'Outline colour') }} />
                ))}
                <label className="sw spectrum-sw" aria-label="Custom outline colour">
                  <input type="color" value={f.outline.color} onChange={e => setFin({ outline: { ...f.outline, color: e.target.value, on: true } })}
                    onBlur={() => commitFin('Outline colour')} />
                </label>
              </div>
              <Slider label="Width" value={Math.round(f.outline.width * 100)} min={8} max={90}
                onChange={v => setFin({ outline: { ...f.outline, width: v / 100, on: true } })} onCommit={() => commitFin('Outline width')}
                format={v => `${(v / 10).toFixed(1)}mm`} />
            </>
          )}

          {tab === 'look' && (
            <>
              <div className="look-strip hscroll">
                {LOOKS.map(t => {
                  const on = !!fxOf(t)
                  return (
                    <button key={t} className={`look ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleFx(t)}>
                      <span className="look-thumb">{previews[t] ? <img src={previews[t]} alt="" /> : <span className="look-ph" />}</span>
                      <span>{EFFECTS.find(e => e.type === t)?.label}</span>
                    </button>
                  )
                })}
              </div>
              {zineFx.length > 0 ? (
                <div className="fx-stack">
                  <div className="label-sm">Stack</div>
                  {zineFx.map(e => (
                    <div className="fx-row" key={e.id}>
                      <Slider label={EFFECTS.find(x => x.type === e.type)?.label} value={Math.round(e.amount * 100)}
                        onChange={v => setFxAmount(e.id, v / 100)} onCommit={v => setFxAmount(e.id, v / 100, true)} format={v => `${v}`} />
                      <button className="fx-x" aria-label={`Remove ${e.type}`} onClick={() => toggleFx(e.type)}><Icon name="x" size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : <p className="fin-tip">Tap a look to lay it over the whole zine. Looks stack.</p>}
            </>
          )}

          {tab === 'anim' && (
            <>
              <Row label="Line boil" sub="Every stroke redraws on twos, Spider-Verse style">
                <Toggle on={f.boilAll} onChange={v => setFin({ boilAll: v }, v ? 'Line boil on' : 'Line boil off')} label="Line boil" />
              </Row>
              <Row label="Paper breathe" sub="A gentle idle sway">
                <Toggle on={f.breathe} onChange={v => setFin({ breathe: v }, 'Paper breathe')} label="Paper breathe" />
              </Row>
              <Row label="Sticker wiggle" sub="Stickers lift and wobble slightly">
                <Toggle on={f.wiggle} onChange={v => setFin({ wiggle: v }, 'Sticker wiggle')} label="Sticker wiggle" />
              </Row>
              <Row label="Intro" sub="How the zine enters the screen">
                <Segmented value={f.intro} onChange={v => { setFin({ intro: v }, 'Intro'); setTimeout(previewIntro, 30) }}
                  options={[{ value: 'drop', label: 'Drop' }, { value: 'slide', label: 'Slide' }, { value: 'flip', label: 'Flip' }]} />
              </Row>
              <button className="chip fin-preview" onClick={previewIntro}><Icon name="play" size={12} /> Preview intro</button>
            </>
          )}

          {tab === 'check' && (
            flags.length === 0 ? (
              <div className="check-ok">
                <span className="check-stamp"><Icon name="check" size={22} stroke={2.4} /></span>
                <b>Looking good.</b>
                <span>Every page has something on it and the unfold shows it all.</span>
              </div>
            ) : (
              <>
                {warned && <p className="fin-tip">Worth a look before you publish. Or keep going, it's your zine.</p>}
                <ul className="flag-list">
                  {flags.map(fl => (
                    <li key={fl.id}>
                      <button onClick={() => jump(fl)}>
                        <span className="flag-ico"><Icon name={fl.icon} size={16} /></span>
                        <span className="flag-text">{fl.text}</span>
                        <Icon name="right" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
                {warned && <button className="btn btn-secondary fin-anyway" onClick={next}>Publish anyway</button>}
              </>
            )
          )}
        </div>
      </section>
    </div>
  )
}

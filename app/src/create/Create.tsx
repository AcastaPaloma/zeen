import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { PAPER } from '../lib/assets'
import { haptic, sfx } from '../lib/feedback'
import { newDoc, SIZES, type TemplateId } from '../lib/paper'
import { ME } from '../lib/samples'
import { useApp, type CreateStep } from '../lib/store'
import type { PaperStock, ZineDoc } from '../lib/types'
import { music } from '../lib/music'
import { Icon } from '../ui/Icon'
import { bgVars, Button, CheckBtn, IconBtn, PillGroup, Sheet, VSlider } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import { HERO, type ZineScene } from '../three/ZineScene'
import { useEditor } from './editor'
import CutFold from './CutFold'

const Collage = lazy(() => import('./Collage'))
const Finalize = lazy(() => import('./Finalize'))
const Publish = lazy(() => import('./Publish'))

export const STEPS: { id: CreateStep; label: string }[] = [
  { id: 'cut', label: 'Cut & Fold' },
  { id: 'collage', label: 'Collage' },
  { id: 'finalize', label: 'Finalize' },
  { id: 'publish', label: 'Publish' },
]

export interface StepProps {
  scene: ZineScene | null
  doc: ZineDoc
  active: boolean
  exit: () => void
  next: () => void
}

export default function Create({ id, replyTo, step: startStep, active }: { id?: string; replyTo?: string; step?: string; active: boolean }) {
  const zines = useApp(s => s.zines)
  const back = useApp(s => s.back)
  const showToast = useApp(s => s.showToast)
  const ed = useEditor()
  const dock = useEditor(s => s.dock)
  const [scene, setScene] = useState<ZineScene | null>(null)
  const [starting, setStarting] = useState(!id)
  const [draft, setDraft] = useState<ZineDoc | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (id && zines[id]) ed.load(zines[id], (startStep as CreateStep) ?? 'cut')
    else {
      const d = newDoc({ author: ME, template: 'half', size: 'a5' })
      if (replyTo) d.publish.replyTo = replyTo
      setDraft(d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { music.stop() }, [])

  const doc = starting ? draft : ed.doc
  const step = ed.step

  // scene mode follows the step
  useEffect(() => {
    if (!scene) return
    if (starting) { scene.setMode('free'); scene.handlesEnabled = false; return }
    const mode = step === 'cut' ? 'free' : step === 'publish' ? 'page' : 'page'
    scene.setMode(mode)
    scene.handMode = false
    scene.setHandlesEnabled(step === 'cut' || step === 'collage')
    if (step === 'cut') scene.viewAll(HERO)
    else scene.resetView()
  }, [scene, step, starting])

  const exit = () => {
    if (ed.doc) { useApp.getState().saveZine(ed.doc); showToast('Draft saved to your profile') }
    back()
  }
  const goStep = (s: CreateStep) => { haptic('tap'); sfx('rustle'); ed.setStep(s) }
  const next = () => {
    const i = STEPS.findIndex(s => s.id === step)
    if (i < STEPS.length - 1) goStep(STEPS[i + 1].id)
  }

  return (
    <div className={`screen create dots step-${starting ? 'start' : step}`} data-dock={dock} style={bgVars(doc?.bg)}>
      <ZineView doc={doc} mode="free" onScene={setScene} handles={!starting} keepAngles />
      {starting && draft && (
        <StartSheet draft={draft} setDraft={setDraft} scene={scene} replyTo={replyTo}
          onCancel={() => back()}
          onContinue={d => { ed.load({ ...d, createdAt: Date.now(), updatedAt: Date.now() }, 'cut'); useApp.getState().saveZine(d); setStarting(false) }} />
      )}
      {!starting && doc && (
        <>
          {step === 'cut' && <CutFold scene={scene} doc={doc} active={active} exit={exit} next={next} />}
          <Suspense fallback={null}>
            {step === 'collage' && <Collage scene={scene} doc={doc} active={active} exit={exit} next={next} />}
            {step === 'finalize' && <Finalize scene={scene} doc={doc} active={active} exit={exit} next={next} />}
            {step === 'publish' && <Publish scene={scene} doc={doc} active={active} exit={exit} next={next} />}
          </Suspense>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- start

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'half', label: '4-page' },
  { id: 'book8', label: '8-page' },
  { id: 'book12', label: '12-page' },
  { id: 'book16', label: '16-page' },
  { id: 'gatefold', label: 'Gatefold' },
  { id: 'accordion', label: 'Accordion' },
  { id: 'trifold', label: 'Tri-fold' },
  { id: 'blank', label: 'Blank' },
]
const COLORS = ['#FBFAF6', '#6052F5', '#E15E5E', '#FBFF7C', '#5FCE49', '#F158A7', '#C0F6FF', '#1A1A1A']
const STOCKS: { id: PaperStock; label: string; img?: string }[] = [
  { id: 'crumpled', label: 'Crumpled', img: PAPER.crumpled },
  { id: 'lined', label: 'Lined', img: PAPER.lined },
  { id: 'plain', label: 'Plain' },
  { id: 'newsprint', label: 'Newsprint', img: PAPER.newsprint },
  { id: 'kraft', label: 'Kraft', img: PAPER.kraft },
  { id: 'construction', label: 'Construction', img: PAPER.watercolor },
]

/** An open booklet with fanned pages on the left. */
function Booklet({ leaves }: { leaves: number }) {
  return (
    <>
      <path d="M22 9 36 6v28l-14 3Z" />
      {Array.from({ length: leaves }, (_, i) => {
        const x = 9 + i * 2.2
        return <path key={i} d={`M22 9 ${x} ${6 + i * 0.6}v28l${22 - x} ${3 - i * 0.6}`} />
      })}
    </>
  )
}

function TemplateGlyph({ id }: { id: TemplateId }) {
  const g = {
    half: <><path d="M14 10 26 6v30l-12 4Z" /><path d="M26 6l10 5v29l-10-4" /><path d="M14 40 26 36" strokeDasharray="2 2" /></>,
    gatefold: <><path d="M6 14 16 10v24L6 38Z" /><path d="M16 10h14v24H16Z" /><path d="M30 10l10 4v24l-10-4" /></>,
    accordion: <><path d="M4 12l9-4v26l-9 4Z" /><path d="M13 8l9 4v26l-9-4" /><path d="M22 12l9-4v26l-9 4Z" /><path d="M31 8l9 4v26l-9-4" /></>,
    trifold: <><path d="M8 12 20 8v26L8 38Z" /><path d="M20 8l12 4v26l-12-4" /><path d="M32 12l8-6v26l-8 6" /></>,
    blank: <path d="M10 8h24v30H10Z" />,
    book8: <Booklet leaves={2} />,
    book12: <Booklet leaves={3} />,
    book16: <Booklet leaves={4} />,
  }[id]
  return (
    <svg viewBox="0 0 44 44" width={52} height={52} fill="none" stroke="#1A1A1A" strokeWidth={1.3} strokeLinejoin="round" aria-hidden>
      {g}
      <path d="M38 6c2 1 3 3 2 5M4 40c1 1 3 2 5 1" stroke="#7FD66B" strokeWidth={1.2} strokeDasharray="1.5 2" />
    </svg>
  )
}

function StartSheet({ draft, setDraft, scene, onCancel, onContinue, replyTo }: {
  draft: ZineDoc; setDraft: (d: ZineDoc) => void; scene: ZineScene | null; onCancel: () => void; onContinue: (d: ZineDoc) => void; replyTo?: string
}) {
  const [tpl, setTpl] = useState<TemplateId>('half')
  const [size, setSize] = useState<keyof typeof SIZES>('a5')
  const [color, setColor] = useState('#FBFAF6')
  const [stock, setStock] = useState<PaperStock>('plain')
  const [zoom, setZoom] = useState(0.4)
  const [sizes, setSizes] = useState(false)
  const replyZine = useApp(s => (replyTo ? s.zines[replyTo] : undefined))

  const build = useMemo(() => (t: TemplateId, sz: keyof typeof SIZES, c: string, st: PaperStock) => {
    const d = newDoc({ author: ME, template: t, size: sz, color: c, stock: st })
    d.id = draft.id
    d.publish.replyTo = draft.publish.replyTo
    return d
  }, [draft.id, draft.publish.replyTo])

  const update = (t = tpl, sz = size, c = color, st = stock) => {
    setTpl(t); setSize(sz); setColor(c); setStock(st)
    setDraft(build(t, sz, c, st))
  }

  useEffect(() => {
    if (!scene) return
    scene.setZoom(0.5 * Math.pow(6, zoom))
  }, [scene, zoom])

  // show the template folding itself so new makers see what they're picking
  useEffect(() => {
    if (!scene || !draft.keyframes.length) return
    let i = 0
    const kfs = draft.keyframes
    scene.setAngles(kfs[0].angles)
    if (kfs.length < 2) return
    const t = setInterval(() => { i = (i + 1) % kfs.length; scene.setAngles(kfs[i].angles, { feel: { k: 120, c: 16 } }) }, 1500)
    return () => clearInterval(t)
  }, [scene, draft])

  return (
    <>
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="x" label="Close" onClick={onCancel} /></PillGroup>
        <div className="grow" />
        <CheckBtn onClick={() => onContinue(draft)} label="Start with this paper" />
      </div>
      <div className="rail right" style={{ top: 'calc(var(--safe-top) + 74px)' }}>
        <VSlider value={zoom} onChange={setZoom} label="Zoom" />
      </div>
      <div className="start-sheet" role="dialog" aria-label="Start a zine">
        <div className="sheet-grab"><span /></div>
        <h3>Start From...</h3>
        {replyZine && <div className="reply-chip"><Icon name="reply" size={14} /> Replying to “{replyZine.publish.title}”</div>}
        <div className="label-sm">Saved Templates</div>
        <div className="tpl-row hscroll">
          {TEMPLATES.map(t => (
            <button key={t.id} className={`tpl ${tpl === t.id ? 'on' : ''}`} onClick={() => { haptic('tick'); update(t.id) }} aria-pressed={tpl === t.id}>
              <TemplateGlyph id={t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="start-cols">
          <div>
            <div className="label-sm">Color</div>
            <div className="swatches">
              {COLORS.slice(0, 5).map(c => (
                <button key={c} className={`sw ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Paper colour ${c}`} onClick={() => { haptic('tick'); update(tpl, size, c) }} />
              ))}
              <label className="sw spectrum" aria-label="Custom colour">
                <input type="color" value={color} onChange={e => update(tpl, size, e.target.value)} />
              </label>
            </div>
          </div>
          <div className="vr" />
          <div>
            <div className="label-sm">Paper</div>
            <div className="swatches">
              {STOCKS.slice(0, 5).map(s => (
                <button key={s.id} className={`sw paper ${stock === s.id ? 'on' : ''}`} aria-label={s.label}
                  style={{ backgroundImage: s.img ? `url(${s.img})` : undefined, backgroundColor: s.img ? undefined : '#F4F2EE' }}
                  onClick={() => { haptic('tick'); update(tpl, size, color, s.id) }} />
              ))}
              <button className="sw plus" aria-label="More papers" onClick={() => update(tpl, size, color, 'construction')}><Icon name="plus" size={16} /></button>
            </div>
          </div>
        </div>
        <div className="start-actions">
          <button className="sq-btn" aria-label="Sheet size" onClick={() => setSizes(true)}><Icon name="edit" size={18} /></button>
          <Button kind="secondary" onClick={() => { onContinue(draft); }}>Save</Button>
          <Button onClick={() => onContinue(draft)} className="grow-btn">Continue</Button>
        </div>
      </div>
      <Sheet open={sizes} onClose={() => setSizes(false)} title="Sheet size" dim>
        <div className="size-grid">
          {Object.entries(SIZES).map(([k, v]) => (
            <button key={k} className={`size-opt ${size === k ? 'on' : ''}`} onClick={() => { update(tpl, k as keyof typeof SIZES); setSizes(false) }}>
              <span className="size-shape" style={{ aspectRatio: `${v.w} / ${v.h}` }} />
              <b>{v.label}</b>
              <small>{v.w} × {v.h} cm</small>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ZINE_FONTS } from '../lib/assets'
import { luminance } from '../lib/compose'
import { haptic } from '../lib/feedback'
import type { TextObj, TextStyle, ZineFont } from '../lib/types'
import type { IconName } from '../ui/Icon'
import { Ransom } from '../ui/Ransom'
import { CheckBtn, IconBtn, PillGroup } from '../ui/kit'
import './collage-sheets.css'

const COLORS = ['#1A1A1A', '#FFFFFF', '#FF4934', '#F8D647', '#DEFF7C', '#4BA334', '#C0F6FF', '#245AE2', '#5C5CE3', '#F158A7', '#FF6A13']
const FONTS = Object.keys(ZINE_FONTS) as ZineFont[]
const STYLES: TextStyle[] = ['plain', 'box', 'outline']
const ALIGNS: TextObj['align'][] = ['center', 'left', 'right']
const ALIGN_ICON: Record<TextObj['align'], IconName> = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' }

export function TextEditor({ open, initial, onDone, onCancel }: {
  open: boolean; initial: TextObj | null; onDone: (t: Pick<TextObj, 'text' | 'font' | 'color' | 'style' | 'align'>) => void; onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [font, setFont] = useState<ZineFont>('marker')
  const [color, setColor] = useState('#FF4934')
  const [style, setStyle] = useState<TextStyle>('plain')
  const [align, setAlign] = useState<TextObj['align']>('center')
  const [panel, setPanel] = useState<'fonts' | 'colors'>('fonts')
  const [kb, setKb] = useState(0)
  const [shown, setShown] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const colorInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setShown(false); return }
    setText(initial?.text ?? '')
    setFont(initial?.font ?? 'marker')
    setColor(initial?.color ?? '#FF4934')
    setStyle(initial?.style ?? 'plain')
    setAlign(initial?.align ?? 'center')
    setPanel('fonts')
    requestAnimationFrame(() => { setShown(true); ta.current?.focus({ preventScroll: true }) })
  }, [open, initial])

  // keep the tool rows riding on top of the on-screen keyboard
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const f = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    f()
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f)
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f) }
  }, [open])

  const lines = useMemo(() => (text || '').split('\n'), [text])
  if (!open) return null

  const css = ZINE_FONTS[font]?.css ?? 'sans-serif'
  const fg = style === 'box' ? (luminance(color) > 0.6 ? '#111' : '#fff') : color
  const stroke = luminance(color) > 0.6 ? '#111' : '#fff'
  const done = () => {
    haptic('tap')
    if (!text.trim()) { onCancel(); return }
    onDone({ text: text.replace(/\s+$/, ''), font, color, style, align })
  }

  return (
    <div className={`text-editor ${shown ? 'on' : ''}`} role="dialog" aria-label="Edit text">
      <div className="top-bar">
        <PillGroup className="solo"><IconBtn name="x" label="Cancel" onClick={() => { haptic('tick'); onCancel() }} /></PillGroup>
        <div className="grow" />
        <CheckBtn onClick={done} label="Done" />
      </div>

      <div className="te-stage" style={{ paddingBottom: kb + 150 }} onClick={() => ta.current?.focus()}>
        <div className={`te-wrap align-${align}`}>
          {/* styled preview sits under a transparent textarea that owns the caret */}
          <div className={`te-preview style-${style} font-${font}`} aria-hidden
            style={{ fontFamily: css, color: fg, '--box': color, '--stroke': stroke, textAlign: align } as CSSProperties}>
            {!text
              ? <div className="te-line te-ph"><span>What's on your mind?</span></div>
              : font === 'ransom'
              ? <Ransom text={text} seed={initial?.seed ?? 7} />
              : lines.map((l, i) => <div key={i} className="te-line"><span>{l || '​'}</span></div>)}
          </div>
          <textarea ref={ta} className={`te-input font-${font}`} value={text} rows={Math.max(1, lines.length)}
            aria-label="Text"
            style={{ fontFamily: css, textAlign: align, caretColor: style === 'box' ? fg : color, '--ph': luminance(color) > 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.55)' } as CSSProperties}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done() }} />
        </div>
      </div>

      <div className="te-tools" style={{ bottom: kb + 12 }}>
        {panel === 'fonts' ? (
          <div className="te-fonts hscroll" role="listbox" aria-label="Font">
            {FONTS.map(f => (
              <button key={f} role="option" aria-selected={font === f} className={`te-font ${font === f ? 'on' : ''}`}
                onPointerDown={e => e.preventDefault()}
                onClick={() => { haptic('tick'); setFont(f) }}
                style={{ fontFamily: f === 'ransom' ? undefined : ZINE_FONTS[f].css }}>
                {f === 'ransom' ? <span className="te-ransom-chip"><Ransom text="Aa" seed={3} /></span> : 'Aa'}
                <small>{ZINE_FONTS[f].label}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="te-colors hscroll" role="listbox" aria-label="Colour">
            {COLORS.map(c => (
              <button key={c} role="option" aria-selected={color === c} aria-label={c} className={`te-sw ${color === c ? 'on' : ''}`} style={{ background: c }}
                onPointerDown={e => e.preventDefault()}
                onClick={() => { haptic('tick'); setColor(c) }} />
            ))}
          </div>
        )}
        <div className="te-row">
          <PillGroup className="te-pill">
            <IconBtn name="textStyle" label="Fonts" active={panel === 'fonts'} onClick={() => setPanel('fonts')} />
            <IconBtn name="palette" label="Colours" active={panel === 'colors'} onClick={() => setPanel('colors')} />
            <IconBtn name="box" label={`Style: ${style}`} active={style !== 'plain'} onClick={() => { haptic('tick'); setStyle(STYLES[(STYLES.indexOf(style) + 1) % STYLES.length]) }} />
            <IconBtn name={ALIGN_ICON[align]} label={`Align ${align}`} onClick={() => { haptic('tick'); setAlign(ALIGNS[(ALIGNS.indexOf(align) + 1) % ALIGNS.length]) }} />
          </PillGroup>
          <label className="te-current" style={{ background: color }} aria-label="Pick any colour">
            <input ref={colorInput} type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#ff4934'} onChange={e => setColor(e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  )
}

import { createContext, useContext, useId, type KeyboardEvent, type ReactNode } from 'react'
import { TOOLS } from '../lib/assets'
import type { CutStyle } from '../lib/paper'
import type { InkTool } from '../lib/types'
import { CUT_JAGGED, CUT_ROUND, CUT_SMOOTH, CUT_STRAIGHT, FOLD, GRID, KEYFRAME, PAGE_A, PAGE_B } from './trayPaths'

// Bottom toolbars for Cut & Fold and Collage, drawn from the Figma exports "Group 84.svg" (cut)
// and "Group 93.svg" (fold). Every toolbar is one SVG in the design file's units: a white bar at
// x 3.42, y 2.44, 46 tall, 12.704 radius, with the file's drop shadow. CSS scales a unit with the
// screen (--u in create.css) so the bar keeps the mockup's proportions on any phone width.

const BAR_X = 3.42041
const BAR_Y = 2.44287
const BAR_H = 46
const BAR_BOTTOM = BAR_Y + BAR_H
const INK = 'black'
const ICON = '#323232'
const CUT_ON = '#FF4934'
const FOLD_ON = '#5C5CE3'

/** clip-path that trims tool art at the bar's rounded bottom edge (but lets it rise above the top) */
const ClipCtx = createContext('')

function Tray({ w, label, children }: { w: number; label: string; children: ReactNode }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const W = Math.round((w + 7) * 1000) / 1000
  return (
    <svg className="tray" viewBox={`0 0 ${W} 53`} fill="none" role="toolbar" aria-label={label}
      style={{ width: `calc(${W} * var(--u))` }}>
      <defs>
        <filter id={`tf${id}`} x="0.000113964" y="-0.000197589" width={W - 0.159} height="52.8406" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset dy="0.977228" />
          <feGaussianBlur stdDeviation="1.71015" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <clipPath id={`tc${id}`}><rect x={BAR_X} y={BAR_BOTTOM - 140} width={w} height="140" rx="12.704" /></clipPath>
      </defs>
      <g filter={`url(#tf${id})`}><rect x={BAR_X} y={BAR_Y} width={w} height={BAR_H} rx="12.704" fill="white" /></g>
      <ClipCtx.Provider value={`url(#tc${id})`}>{children}</ClipCtx.Provider>
    </svg>
  )
}

function Sep({ x }: { x: number }) {
  return <path d={`M${x} 5.44287L${x} 45.5325`} stroke="black" strokeOpacity="0.07" strokeLinecap="round" />
}

/** Six-dot drag grip; `x` is the left column. */
function Grip({ x }: { x: number }) {
  return (
    <g stroke="black" strokeOpacity="0.15" strokeWidth="1.46584" strokeLinecap="round" aria-hidden>
      {[x, x + 3].flatMap(cx => [21.4429, 24.4429, 27.4429].map(y => <path key={`${cx}:${y}`} d={`M${cx} ${y}V${y + 1}`} />))}
    </g>
  )
}

/** A cell of the bar that acts as a button: the whole cell is the hit area. */
function Cell({ x0, x1, label, pressed, onClick, children }: {
  x0: number; x1: number; label: string; pressed?: boolean; onClick: () => void; children: ReactNode
}) {
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }
  return (
    <g className="tray-cell" role="button" tabIndex={0} aria-label={label} aria-pressed={pressed} onClick={onClick} onKeyDown={key}>
      <rect x={x0} y={BAR_Y} width={x1 - x0} height={BAR_H} fill="transparent" />
      <g className="tray-glyph">{children}</g>
    </g>
  )
}

/** The grid ("more tools") icon centred at `cx`. */
function GridIcon({ cx }: { cx: number }) {
  return <path d={GRID} fill={ICON} transform={`translate(${cx - 174.92} 0)`} />
}

/** A 24-unit icon drawn in a 19-unit box centred on the grid icon's row. */
function Icon19({ cx, d }: { cx: number; d: string }) {
  return <path d={d} fill={ICON} transform={`translate(${cx - 9.5} 15.44) scale(${19 / 24})`} />
}

/** Raster tool art standing in the bar, cut off at its bottom edge. Lifts when active. */
function ToolArt({ src, cx, top, w, h, lifted }: { src: string; cx: number; top: number; w: number; h: number; lifted?: boolean }) {
  const clip = useContext(ClipCtx)
  return (
    <g clipPath={clip}>
      <image className={`tray-art ${lifted ? 'lifted' : ''}`} href={src} x={cx - w / 2} y={BAR_Y + top} width={w} height={h} preserveAspectRatio="xMidYMin meet" />
    </g>
  )
}

// ---------------------------------------------------------------- Cut & Fold

/** No tool picked: scissors and bone folder, then more tools. Built on the fold toolbar's grid. */
export function PickTray({ onCut, onFold, onMore }: { onCut: () => void; onFold: () => void; onMore: () => void }) {
  return (
    <Tray w={173} label="Tools">
      <Cell x0={BAR_X} x1={56.42} label="Cut tool" onClick={onCut}>
        <ToolArt src={TOOLS.scissors} cx={30.42} top={8} w={50} h={38} />
      </Cell>
      <Cell x0={56.42} x1={97.42} label="Fold tool" onClick={onFold}>
        <ToolArt src={TOOLS.bonefolder} cx={76.92} top={9} w={17} h={37} />
      </Cell>
      <Sep x={97.42} />
      <Cell x0={97.42} x1={148.42} label="More tools" onClick={onMore}><GridIcon cx={122.92} /></Cell>
      <Sep x={148.42} />
      <Grip x={165.42} />
    </Tray>
  )
}

const CUT_GLYPHS: { id: CutStyle; label: string; d: string; x0: number; x1: number }[] = [
  { id: 'straight', label: 'Straight', d: CUT_STRAIGHT, x0: BAR_X, x1: 50 },
  { id: 'smooth', label: 'Smooth curve', d: CUT_SMOOTH, x0: 50, x1: 93 },
  { id: 'jagged', label: 'Jagged', d: CUT_JAGGED, x0: 93, x1: 133 },
  { id: 'round', label: 'Round', d: CUT_ROUND, x0: 133, x1: 187.42 },
]

/** Group 84.svg: four cut styles, more tools, grip. */
export function CutTray({ value, onChange, onMore }: { value: CutStyle; onChange: (s: CutStyle) => void; onMore: () => void }) {
  return (
    <Tray w={243} label="Cut styles">
      {CUT_GLYPHS.map(g => (
        <Cell key={g.id} x0={g.x0} x1={g.x1} label={g.label} pressed={value === g.id} onClick={() => onChange(g.id)}>
          <path d={g.d} fill={value === g.id ? CUT_ON : INK} />
        </Cell>
      ))}
      <Sep x={187.42} />
      <Cell x0={187.42} x1={228.42} label="More tools" onClick={onMore}><GridIcon cx={207.92} /></Cell>
      <Sep x={228.42} />
      <Grip x={238.42} />
    </Tray>
  )
}

/** Group 93.svg: fold, add page, add keyframe, more tools, grip. */
export function FoldTray({ sub, onSub, onKeyframe, onMore }: {
  sub: 'fold' | 'page'; onSub: (s: 'fold' | 'page') => void; onKeyframe: () => void; onMore: () => void
}) {
  return (
    <Tray w={225} label="Fold tools">
      <Cell x0={BAR_X} x1={50} label="Fold" pressed={sub === 'fold'} onClick={() => onSub('fold')}>
        <path d={FOLD} fill={sub === 'fold' ? FOLD_ON : INK} />
      </Cell>
      <Cell x0={50} x1={97.42} label="Add page along a crease" pressed={sub === 'page'} onClick={() => onSub('page')}>
        <path d={PAGE_A} fill={sub === 'page' ? FOLD_ON : INK} />
        <path d={PAGE_B} fill={sub === 'page' ? FOLD_ON : INK} />
      </Cell>
      <Sep x={97.42} />
      <Cell x0={97.42} x1={149.42} label="Add keyframe" onClick={onKeyframe}><path d={KEYFRAME} fill={ICON} /></Cell>
      <Sep x={149.42} />
      <Cell x0={149.42} x1={200.42} label="More tools" onClick={onMore}><GridIcon cx={174.92} /></Cell>
      <Sep x={200.42} />
      <Grip x={221.42} />
    </Tray>
  )
}

// ---------------------------------------------------------------- Collage

// Material "layers" and "title" icons (24-unit paths), as in the collage mockup.
const LAYERS = 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16zm0-11.47L17.74 9 12 13.47 6.26 9 12 4.53z'
const TITLE = 'M5 4v3h5.5v12h3V7H19V4z'

/** Pens as they stand in the collage mockup: centre, top (below the bar's top edge), size. */
const PENS: { id: InkTool; label: string; src: string; cx: number; top: number; w: number; h: number; x0: number; x1: number }[] = [
  { id: 'pencil', label: 'Pencil', src: TOOLS.pencil, cx: 23.92, top: 11.5, w: 13, h: 56.8, x0: BAR_X, x1: 34.9 },
  { id: 'pen', label: 'Pen', src: TOOLS.pen, cx: 45.92, top: 11.5, w: 13, h: 81.1, x0: 34.9, x1: 56.7 },
  { id: 'marker', label: 'Marker', src: TOOLS.marker, cx: 67.42, top: 11.5, w: 16, h: 85.6, x0: 56.7, x1: 77.7 },
  { id: 'eraser', label: 'Eraser', src: TOOLS.eraser, cx: 87.92, top: 18.5, w: 13, h: 36.2, x0: 77.7, x1: 109.42 },
]

/**
 * Collage toolbar, from the collage mockup: pens | more tools | layers | text | grip.
 * While drawing, the right side swaps to the ink colour and brush settings.
 */
export function CollageTray({ drawing, tool, onTool, onMore, onLayers, onText, color, onColor, onBrush, brushLabel }: {
  drawing: boolean; tool: InkTool; onTool: (t: InkTool) => void
  onMore: () => void; onLayers: () => void; onText: () => void
  color: string; onColor: () => void; onBrush: () => void; brushLabel: string
}) {
  return (
    <Tray w={255} label="Collage tools">
      {PENS.map(p => (
        <Cell key={p.id} x0={p.x0} x1={p.x1} label={p.label} pressed={drawing && tool === p.id} onClick={() => onTool(p.id)}>
          <ToolArt src={p.src} cx={p.cx} top={p.top} w={p.w} h={p.h} lifted={drawing && tool === p.id} />
        </Cell>
      ))}
      <Sep x={109.42} />
      {drawing ? (
        <>
          <Cell x0={109.42} x1={150.42} label="Ink colour" onClick={onColor}>
            <circle cx={129.92} cy={25.44} r={9.5} fill="white" stroke="black" strokeOpacity="0.12" />
            <circle cx={129.92} cy={25.44} r={7} fill={color} />
          </Cell>
          <Sep x={150.42} />
          <Cell x0={150.42} x1={231.42} label="Brush settings" onClick={onBrush}>
            <path d="M162 29c6-7 11 4 18-1s11-4 16-6" stroke={color === '#FFFFFF' ? '#BDBDBD' : color} strokeWidth="2.2" strokeLinecap="round" />
            <text x={206} y={28.6} fontSize="8.5" fill="#7B7B7B" fontFamily="DM Sans, sans-serif">{brushLabel}</text>
          </Cell>
        </>
      ) : (
        <>
          <Cell x0={109.42} x1={150.42} label="More tools" onClick={onMore}><GridIcon cx={129.92} /></Cell>
          <Sep x={150.42} />
          <Cell x0={150.42} x1={189.42} label="Layers" onClick={onLayers}><Icon19 cx={169.92} d={LAYERS} /></Cell>
          <Sep x={189.42} />
          <Cell x0={189.42} x1={231.42} label="Add text" onClick={onText}><Icon19 cx={210.42} d={TITLE} /></Cell>
        </>
      )}
      <Sep x={231.42} />
      <Grip x={247.42} />
    </Tray>
  )
}

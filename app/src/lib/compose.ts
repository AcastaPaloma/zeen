import { getImage, PAPER, ZINE_FONTS } from './assets'
import { applyEffects, cutout } from './effects'
import { noise1, rng } from './geom'
import { flatToPage } from './paper'
import type { Crease, Effect, InkObj, ScrapObj, Side, Stroke, Surface, TextObj, ZObject } from './types'

export const pxPerCm = (s: Surface) => Math.min(96, 2048 / Math.max(s.frame.w, s.frame.h))

const scratch = document.createElement('canvas')

export interface ComposeOpts {
  time: number
  animate: boolean // line boil, gifs, wiggle
  boilAll?: boolean
  wiggle?: boolean
  hide?: Set<string>
  creases?: Crease[] // for fold wear
  wear?: number
  effects?: Effect[]
}

export function composeSide(
  canvas: HTMLCanvasElement, surface: Surface, side: Side, objects: ZObject[], opts: ComposeOpts,
) {
  const k = pxPerCm(surface)
  const W = Math.max(2, Math.round(surface.frame.w * k)), H = Math.max(2, Math.round(surface.frame.h * k))
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  paintPaper(ctx, W, H, surface, side)
  ctx.setTransform(k, 0, 0, k, 0, 0)
  for (const o of objects) {
    if (o.surface !== surface.id || o.side !== side || o.hidden || opts.hide?.has(o.id)) continue
    ctx.save()
    if (o.kind === 'scrap') drawScrap(ctx, o, k, opts)
    else if (o.kind === 'text') drawText(ctx, o)
    else drawInk(ctx, o, k, W, H, opts)
    ctx.restore()
  }
  if (opts.wear && opts.creases) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const c of opts.creases) {
      if (c.leaf) continue
      const a = flatToPage(surface.frame, side, c.a), b = flatToPage(surface.frame, side, c.b)
      const r = rng(Math.round(a[0] * 100 + b[1] * 10))
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.12 * opts.wear})`
        ctx.lineWidth = 0.06 + r() * 0.18
        ctx.beginPath()
        ctx.moveTo(a[0] + (r() - 0.5) * 0.08, a[1]); ctx.lineTo(b[0] + (r() - 0.5) * 0.08, b[1])
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

function paintPaper(ctx: CanvasRenderingContext2D, W: number, H: number, s: Surface, side: Side) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = s.color
  ctx.fillRect(0, 0, W, H)
  const tex = s.stock === 'kraft' ? PAPER.kraft : s.stock === 'newsprint' ? PAPER.newsprint
    : s.stock === 'crumpled' ? PAPER.crumpled : s.stock === 'lined' ? PAPER.lined
      : s.stock === 'construction' ? PAPER.watercolor : null
  if (tex) {
    const img = getImage(tex)
    if (img) {
      ctx.save()
      ctx.globalCompositeOperation = s.stock === 'kraft' ? 'multiply' : 'multiply'
      ctx.globalAlpha = s.stock === 'kraft' ? 0.95 : s.stock === 'construction' ? 0.5 : 0.85
      // cover, mirrored on the back so the grain lines up through the sheet
      const sc = Math.max(W / img.width, H / img.height)
      if (side === 'back') { ctx.translate(W, 0); ctx.scale(-1, 1) }
      ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc)
      ctx.restore()
    }
  }
}

// ---------------------------------------------------------------- scraps

const scrapCache = new Map<string, { canvas: HTMLCanvasElement; pad: number }>()

function scrapKey(o: ScrapObj, effects: Effect[]) {
  const fx = effects.filter(e => e.scope === 'scrap' && e.target === o.id).map(e => e.type + e.amount.toFixed(2)).join(',')
  return `${o.src}|${o.sticker.toFixed(2)}|${o.cutout ? 1 : 0}|${fx}`
}

export function processedScrap(o: ScrapObj, effects: Effect[] = []) {
  const key = scrapKey(o, effects)
  const hit = scrapCache.get(key)
  if (hit) return hit
  const img = getImage(o.src)
  if (!img) return null
  const max = 900
  const s = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s))
  const base = document.createElement('canvas')
  base.width = w; base.height = h
  const bctx = base.getContext('2d', { willReadFrequently: true })!
  bctx.drawImage(img, 0, 0, w, h)
  if (o.cutout) cutout(base)
  const fx = effects.filter(e => e.scope === 'scrap' && e.target === o.id)
  if (fx.length) applyEffects(base, fx)
  // die-cut white border: stamp the silhouette around a circle, then the image on top
  const pxPerCmImg = w / Math.max(0.01, o.w)
  const pad = Math.round(o.sticker * pxPerCmImg)
  const out = document.createElement('canvas')
  out.width = w + pad * 2; out.height = h + pad * 2
  const octx = out.getContext('2d')!
  if (pad > 0) {
    const sil = document.createElement('canvas')
    sil.width = w; sil.height = h
    const sctx = sil.getContext('2d')!
    sctx.drawImage(base, 0, 0)
    sctx.globalCompositeOperation = 'source-in'
    sctx.fillStyle = '#fff'
    sctx.fillRect(0, 0, w, h)
    const steps = 28
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      octx.drawImage(sil, pad + Math.cos(a) * pad, pad + Math.sin(a) * pad)
    }
    octx.drawImage(sil, pad, pad)
  }
  octx.drawImage(base, pad, pad)
  const res = { canvas: out, pad }
  scrapCache.set(key, res)
  return res
}

function drawScrap(ctx: CanvasRenderingContext2D, o: ScrapObj, k: number, opts: ComposeOpts) {
  let rot = o.rot
  if (opts.animate && opts.wiggle) rot += Math.sin(opts.time * 2.2 + o.x) * 0.035
  ctx.translate(o.x, o.y)
  ctx.rotate(rot)
  ctx.scale(o.scale * (o.flipX ? -1 : 1), o.scale)
  const w = o.w, h = o.h
  if (o.gif && opts.animate) {
    const img = getImage(o.src)
    if (!img) return
    if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 0.35 * k; ctx.shadowOffsetY = 0.12 * k }
    if (o.sticker > 0) {
      ctx.fillStyle = '#fff'
      roundRect(ctx, -w / 2 - o.sticker, -h / 2 - o.sticker, w + o.sticker * 2, h + o.sticker * 2, o.sticker * 1.5)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    return
  }
  const p = processedScrap(o, opts.effects)
  if (!p) return
  const pw = w * (p.canvas.width / (p.canvas.width - p.pad * 2))
  const ph = h * (p.canvas.height / (p.canvas.height - p.pad * 2))
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = 0.32 * k * o.scale
    ctx.shadowOffsetX = 0.04 * k
    ctx.shadowOffsetY = 0.12 * k * o.scale
  }
  ctx.drawImage(p.canvas, -pw / 2, -ph / 2, pw, ph)
  if (o.sticker > 0 && o.shadow) {
    // paper lift: a soft highlight at one corner
    ctx.shadowColor = 'transparent'
    const g = ctx.createLinearGradient(pw / 2 - pw * 0.25, -ph / 2, pw / 2, -ph / 2 + ph * 0.25)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,0.35)')
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = g
    ctx.fillRect(pw / 2 - pw * 0.25, -ph / 2, pw * 0.25, ph * 0.25)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------------------------------------------------------------- text

const RANSOM_FONTS = ['"Anton"', '"DM Serif Display"', '"Special Elite"', '"Permanent Marker"', '"Stardos Stencil"', '"Rubik Mono One"']
const RANSOM_BG = ['#FFFFFF', '#F8D647', '#111111', '#FF4934', '#C0F6FF', '#FFD5F4', '#EBEFD7', '#245AE2']

const measureCtx = scratch.getContext('2d')!

export interface TextLayout {
  w: number; h: number
  lines: { text: string; w: number; y: number; chars?: { ch: string; font: string; w: number; bg: string; fg: string; rot: number; dy: number; s: number }[] }[]
  lineH: number
}

export function layoutText(o: Pick<TextObj, 'text' | 'font' | 'size' | 'seed' | 'color'>): TextLayout {
  const size = o.size
  const lineH = size * (o.font === 'script' ? 1.25 : 1.12)
  const fontCss = ZINE_FONTS[o.font]?.css ?? 'sans-serif'
  const lines = (o.text || ' ').split('\n')
  const r = rng(o.seed)
  let maxW = 0
  const out: TextLayout['lines'] = []
  lines.forEach((t, i) => {
    if (o.font === 'ransom') {
      const chars: NonNullable<TextLayout['lines'][number]['chars']> = []
      let w = 0
      for (const ch of t) {
        const font = RANSOM_FONTS[Math.floor(r() * RANSOM_FONTS.length)]
        const s = 0.85 + r() * 0.35
        measureCtx.font = `${size * s * 10}px ${font}`
        const cw = ch === ' ' ? size * 0.4 : measureCtx.measureText(ch).width / 10 + size * 0.22
        const bg = RANSOM_BG[Math.floor(r() * RANSOM_BG.length)]
        const dark = bg === '#111111' || bg === '#245AE2' || bg === '#FF4934'
        chars.push({ ch, font, w: cw, bg, fg: dark ? '#fff' : '#111', rot: (r() - 0.5) * 0.22, dy: (r() - 0.5) * size * 0.12, s })
        w += cw + size * 0.04
      }
      out.push({ text: t, w, y: i * lineH * 1.12, chars })
      maxW = Math.max(maxW, w)
    } else {
      measureCtx.font = `${size * 10}px ${fontCss}`
      const w = measureCtx.measureText(t).width / 10
      out.push({ text: t, w, y: i * lineH, chars: undefined })
      maxW = Math.max(maxW, w)
    }
  })
  const h = o.font === 'ransom' ? lines.length * lineH * 1.12 : lines.length * lineH
  return { w: maxW + size * 0.5, h: h + size * 0.3, lines: out, lineH }
}

export function drawText(ctx: CanvasRenderingContext2D, o: TextObj) {
  const L = layoutText(o)
  ctx.translate(o.x, o.y)
  ctx.rotate(o.rot)
  ctx.scale(o.scale, o.scale)
  const fontCss = ZINE_FONTS[o.font]?.css ?? 'sans-serif'
  const size = o.size
  ctx.textBaseline = 'middle'
  const top = -L.h / 2 + size * 0.15
  for (const ln of L.lines) {
    const x0 = o.align === 'left' ? -L.w / 2 + size * 0.25 : o.align === 'right' ? L.w / 2 - size * 0.25 - ln.w : -ln.w / 2
    const yc = top + ln.y + L.lineH / 2
    if (ln.chars) {
      let x = x0
      for (const c of ln.chars) {
        if (c.ch !== ' ') {
          ctx.save()
          ctx.translate(x + c.w / 2, yc + c.dy)
          ctx.rotate(c.rot)
          ctx.fillStyle = c.bg
          ctx.fillRect(-c.w / 2, -size * c.s * 0.6, c.w, size * c.s * 1.2)
          ctx.fillStyle = c.fg
          ctx.font = `${size * c.s}px ${c.font}`
          ctx.textAlign = 'center'
          ctx.fillText(c.ch, 0, size * 0.04)
          ctx.restore()
        }
        x += c.w + size * 0.04
      }
      continue
    }
    ctx.font = `${size}px ${fontCss}`
    ctx.textAlign = 'left'
    if (o.style === 'box') {
      ctx.fillStyle = o.color
      roundRect(ctx, x0 - size * 0.22, yc - L.lineH / 2 - size * 0.02, ln.w + size * 0.44, L.lineH + size * 0.04, size * 0.18)
      ctx.fill()
      ctx.fillStyle = luminance(o.color) > 0.6 ? '#111' : '#fff'
      ctx.fillText(ln.text, x0, yc)
    } else if (o.style === 'outline') {
      ctx.lineJoin = 'round'
      ctx.lineWidth = size * 0.16
      ctx.strokeStyle = luminance(o.color) > 0.6 ? '#111' : '#fff'
      ctx.strokeText(ln.text, x0, yc)
      ctx.fillStyle = o.color
      ctx.fillText(ln.text, x0, yc)
    } else {
      ctx.fillStyle = o.color
      ctx.fillText(ln.text, x0, yc)
    }
  }
}

export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0.5
  const n = parseInt(m[1], 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

// ---------------------------------------------------------------- ink

export function drawInk(ctx: CanvasRenderingContext2D, o: InkObj, k: number, W: number, H: number, opts: ComposeOpts) {
  if (!o.strokes.length) return
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H }
  const sctx = scratch.getContext('2d')!
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, W, H)
  sctx.setTransform(k, 0, 0, k, 0, 0)
  for (const s of o.strokes) drawStroke(sctx, s, opts)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(scratch, 0, 0)
}

const markerCanvas = document.createElement('canvas')

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, opts: { time: number; animate: boolean; boilAll?: boolean }) {
  const pts = strokePoints(s, opts)
  if (pts.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.erase) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = s.size
    path(ctx, pts); ctx.stroke()
    ctx.restore()
    return
  }
  ctx.strokeStyle = s.color
  switch (s.tool) {
    case 'pen':
      ctx.globalAlpha = s.opacity
      ctx.lineWidth = s.size
      path(ctx, pts); ctx.stroke()
      break
    case 'pencil': {
      const r = rng(s.seed)
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = s.opacity * 0.38
        ctx.lineWidth = s.size * (0.55 + r() * 0.3)
        const ox = (r() - 0.5) * s.size * 0.5, oy = (r() - 0.5) * s.size * 0.5
        ctx.beginPath()
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i] + ox, y = pts[i + 1] + oy
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      // grain: knock out speckles along the line
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#000'
      for (let i = 0; i < pts.length; i += 2) {
        if (r() < 0.6) ctx.fillRect(pts[i] + (r() - 0.5) * s.size, pts[i + 1] + (r() - 0.5) * s.size, s.size * 0.18, s.size * 0.18)
      }
      break
    }
    case 'marker': {
      // a single marker stroke doesn't darken itself; overlapping strokes multiply
      const t = ctx.getTransform()
      const W = ctx.canvas.width, H = ctx.canvas.height
      if (markerCanvas.width !== W || markerCanvas.height !== H) { markerCanvas.width = W; markerCanvas.height = H }
      const m = markerCanvas.getContext('2d')!
      m.setTransform(1, 0, 0, 1, 0, 0)
      m.clearRect(0, 0, W, H)
      m.setTransform(t)
      m.lineCap = 'square'; m.lineJoin = 'round'
      m.strokeStyle = s.color
      m.lineWidth = s.size * 2.4
      path(m, pts); m.stroke()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = s.opacity * 0.62
      ctx.drawImage(markerCanvas, 0, 0)
      break
    }
    case 'eraser':
      break
  }
  ctx.restore()
}

function path(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath()
  ctx.moveTo(p[0], p[1])
  if (p.length === 4) { ctx.lineTo(p[2], p[3]); return }
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my)
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1])
}

const noiseCache = new Map<number, (x: number) => number>()
const getNoise = (seed: number) => {
  let n = noiseCache.get(seed)
  if (!n) { n = noise1(seed); noiseCache.set(seed, n) }
  return n
}

/** Applies jitter (static) and line boil (animated, on twos/threes) to a stroke. */
export function strokePoints(s: Stroke, opts: { time: number; animate: boolean; boilAll?: boolean }) {
  const boil = (s.boil.on || opts.boilAll) && opts.animate
  if (!s.jitter && !boil) return s.pts
  const out = new Array<number>(s.pts.length)
  const nj = getNoise(s.seed)
  const fps = 24 / (s.boil.speed || 2)
  const frame = boil ? Math.floor(opts.time * fps) % 64 : 0
  const nb = boil ? getNoise(s.seed * 31 + frame * 977) : null
  const nb2 = boil ? getNoise(s.seed * 17 + frame * 613) : null
  const ja = s.jitter * s.size * 1.6
  const ba = (s.boil.on ? s.boil.strength : 0.5) * 0.09 + s.size * 0.12
  for (let i = 0; i < s.pts.length; i += 2) {
    const t = i * 0.18
    let x = s.pts[i], y = s.pts[i + 1]
    if (ja) { x += nj(t) * ja; y += nj(t + 50) * ja }
    if (nb && nb2) { x += nb(t * 0.6) * ba; y += nb2(t * 0.6) * ba }
    out[i] = x; out[i + 1] = y
  }
  return out
}

export function objectHasMotion(o: ZObject) {
  if (o.kind === 'ink') return o.strokes.some(s => s.boil.on)
  if (o.kind === 'scrap') return !!o.gif
  return false
}

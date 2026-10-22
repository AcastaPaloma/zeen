import { music } from '../lib/music'
import { audio } from '../lib/feedback'
import { jsPDF } from 'jspdf'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { BRAND, loadFonts, PAPER, preload } from '../lib/assets'
import { composeSide } from '../lib/compose'
import { applyEffects, fxFor } from '../lib/effects'
import { flatToPage } from '../lib/paper'
import { userById } from '../lib/samples'
import type { EffectType, MultiPoly, Side, Surface, ZineDoc } from '../lib/types'
import { ZineScene } from '../three/ZineScene'

export type ExportKind = 'pdf-pages' | 'pdf-print' | 'video' | 'gif'
export type Aspect = '9:16' | '4:5' | '1:1' | '16:9'
export interface ExportOpts { aspect?: Aspect; onProgress?: (p: number) => void }

const slug = (s: string) => (s || 'zine').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'zine'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

async function prepare(doc: ZineDoc) {
  await loadFonts()
  const srcs = doc.objects.flatMap(o => (o.kind === 'scrap' ? [o.src] : []))
  await preload([...srcs, ...Object.values(PAPER)])
}

/** A hidden scene for rendering; disposed when `fn` finishes. */
async function withScene<T>(doc: ZineDoc, w: number, h: number, fn: (s: ZineScene) => Promise<T>, opts: { animate?: boolean; dpr?: number } = {}): Promise<T> {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-5000px;top:0;width:${w}px;height:${h}px;pointer-events:none;opacity:0;`
  document.body.appendChild(host)
  const s = new ZineScene(host, { mode: 'page', preserve: true })
  s.handlesEnabled = false
  s.bgParallax = false
  s.animateContent = !!opts.animate
  if (opts.dpr) { s.renderer.setPixelRatio(opts.dpr); s.resize() }
  try {
    s.setDoc(doc, { keepAngles: false, structure: true })
    s.setHandlesEnabled(false)
    const k0 = doc.keyframes[0]
    if (k0) s.setAngles(k0.angles, { animate: false })
    s.resetView(false)
    s.invalidateAll()
    await frame(); await frame()
    return await fn(s)
  } finally {
    s.dispose()
    host.remove()
  }
}

/** Pose of the unfold sequence at time t (seconds), with holds on each keyframe. */
function timeline(doc: ZineDoc) {
  const n = Math.max(1, doc.keyframes.length)
  const hold = 0.7, move = 1.2
  const total = n === 1 ? 2.5 : hold + (n - 1) * (move + hold) + 0.8
  const at = (t: number) => {
    if (n === 1) return 0
    let x = t - hold
    if (x <= 0) return 0
    for (let i = 0; i < n - 1; i++) {
      if (x < move) return i + x / move
      x -= move
      if (x < hold) return i + 1
      x -= hold
    }
    return n - 1
  }
  return { total, at }
}

function dotGrid(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string, step: number) {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.13)'
  const r = Math.max(1, step / 14)
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
}

// the Zeen wordmark for the corner of exported videos and GIFs (loaded ahead, exports start on a tap)
const logo = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: BRAND.logo }) : null

function mark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (!logo?.complete || !logo.naturalWidth) return
  const h = Math.round(Math.min(W, H) * 0.05), w = h * (logo.naturalWidth / logo.naturalHeight)
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.drawImage(logo, W - w - h * 0.8, H - h * 1.8, w, h)
  ctx.restore()
}

function fxList(effects: ZineDoc['effects'], key: string | null) {
  const f = fxFor(effects, key)
  return (Object.keys(f) as EffectType[]).filter(t => f[t] > 0 && t !== 'wear').map(t => ({ type: t, amount: f[t] }))
}

function composeSurface(doc: ZineDoc, s: Surface, side: Side, effects = true) {
  const c = document.createElement('canvas')
  composeSide(c, s, side, doc.objects, {
    time: 0, animate: false, creases: doc.creases, effects: doc.effects,
    wear: Math.max(0, ...doc.effects.filter(e => e.type === 'wear' && e.scope === 'zine').map(e => e.amount)),
  })
  if (effects) applyEffects(c, fxList(doc.effects, null))
  return c
}

function tracePage(ctx: CanvasRenderingContext2D, region: MultiPoly, s: Surface, side: Side, k: number) {
  ctx.beginPath()
  for (const poly of region) for (const ring of poly) {
    ring.forEach((p, i) => {
      const q = flatToPage(s.frame, side, p)
      if (i) ctx.lineTo(q[0] * k, q[1] * k); else ctx.moveTo(q[0] * k, q[1] * k)
    })
    ctx.closePath()
  }
}

// ---------------------------------------------------------------- PDF: flat pages

async function pdfPages(doc: ZineDoc, o: ExportOpts) {
  const pages = await withScene(doc, 360, 480, async s => ({ pages: s.pages.slice(), d: s.d }))
  const pdf = new jsPDF({ unit: 'cm', format: 'a5', orientation: 'portrait' })
  const PW = 14.8, PH = 21
  const author = userById(doc.author)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(26)
  pdf.text(pdf.splitTextToSize(doc.publish.title || 'Untitled zine', PW - 3), 1.5, 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12)
  pdf.text(`by ${author?.name ?? 'a zinester'}`, 1.5, 8.6)
  if (doc.publish.description) { pdf.setFontSize(10); pdf.setTextColor(110); pdf.text(pdf.splitTextToSize(doc.publish.description, PW - 3), 1.5, 10) }
  pdf.setTextColor(255, 73, 52); pdf.setFontSize(9); pdf.text('made with Zeen', 1.5, PH - 1.5)
  pdf.setTextColor(0)
  const canvases = new Map<string, HTMLCanvasElement>()
  for (let i = 0; i < pages.pages.length; i++) {
    const pg = pages.pages[i]
    const P = pages.d.panels.get(pg.panel)
    const s = pages.d.surfaces.get(pg.surface)
    if (!P || !s || !P.region.length) continue
    const key = `${s.id}:${pg.side}`
    let src = canvases.get(key)
    if (!src) { src = composeSurface(doc, s, pg.side, false); canvases.set(key, src) }
    const k = src.width / s.frame.w
    // bounds of this panel in page coords
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const poly of P.region) for (const p of poly[0]) {
      const q = flatToPage(s.frame, pg.side, p)
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1])
    }
    const out = document.createElement('canvas')
    out.width = Math.max(2, Math.round((x1 - x0) * k)); out.height = Math.max(2, Math.round((y1 - y0) * k))
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
    ctx.save()
    ctx.translate(-x0 * k, -y0 * k)
    tracePage(ctx, P.region, s, pg.side, k)
    ctx.clip('evenodd')
    ctx.drawImage(src, 0, 0)
    ctx.restore()
    applyEffects(out, fxList(doc.effects, `${pg.panel}:${pg.side}`))
    const ar = out.width / out.height
    let w = PW - 2, h = w / ar
    if (h > PH - 3) { h = PH - 3; w = h * ar }
    pdf.addPage('a5', 'portrait')
    pdf.addImage(out.toDataURL('image/jpeg', 0.9), 'JPEG', (PW - w) / 2, (PH - 1 - h) / 2, w, h)
    pdf.setFontSize(9); pdf.setTextColor(140)
    pdf.text(`${pg.n}`, PW / 2, PH - 0.9, { align: 'center' })
    pdf.setTextColor(0)
    o.onProgress?.((i + 1) / pages.pages.length)
    await frame()
  }
  download(pdf.output('blob'), `${slug(doc.publish.title)}-pages.pdf`)
}

// ---------------------------------------------------------------- PDF: print and fold

async function pdfPrint(doc: ZineDoc, o: ExportOpts) {
  let pdf: jsPDF | null = null
  const total = doc.surfaces.length * 2
  let done = 0
  for (const s of doc.surfaces) {
    const land = s.frame.w > s.frame.h
    const A4 = land ? { w: 29.7, h: 21 } : { w: 21, h: 29.7 }
    const fits = s.frame.w + 2 <= A4.w && s.frame.h + 3.2 <= A4.h
    const PW = fits ? A4.w : s.frame.w + 2, PH = fits ? A4.h : s.frame.h + 3.2
    for (const side of ['front', 'back'] as Side[]) {
      const fmt: [number, number] = [PW, PH]
      if (!pdf) pdf = new jsPDF({ unit: 'cm', format: fmt, orientation: land ? 'landscape' : 'portrait' })
      else pdf.addPage(fmt, land ? 'landscape' : 'portrait')
      const src = composeSurface(doc, s, side)
      const k = src.width / s.frame.w
      const out = document.createElement('canvas')
      out.width = src.width; out.height = src.height
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
      ctx.save()
      tracePage(ctx, s.outline, s, side, k)
      ctx.clip('evenodd')
      ctx.drawImage(src, 0, 0)
      ctx.restore()
      const ox = (PW - s.frame.w) / 2, oy = 1.6
      pdf.addImage(out.toDataURL('image/jpeg', 0.92), 'JPEG', ox, oy, s.frame.w, s.frame.h)
      // solid cut lines along the outline
      pdf.setDrawColor(26, 26, 26); pdf.setLineWidth(0.03); pdf.setLineDashPattern([], 0)
      for (const poly of s.outline) for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = flatToPage(s.frame, side, ring[i]), b = flatToPage(s.frame, side, ring[(i + 1) % ring.length])
          pdf.line(ox + a[0], oy + a[1], ox + b[0], oy + b[1])
        }
      }
      // fold lines: valley dashed, mountain dash-dot (as seen from this side)
      for (const c of doc.creases) {
        if (c.leaf) continue
        if (!ownedBy(doc, s.id, c.panel)) continue
        const valley = (c.dir > 0) === (side === 'front')
        pdf.setDrawColor(255, 73, 52)
        pdf.setLineWidth(0.025)
        pdf.setLineDashPattern(valley ? [0.3, 0.15] : [0.35, 0.12, 0.05, 0.12], 0)
        const a = flatToPage(s.frame, side, c.a), b = flatToPage(s.frame, side, c.b)
        pdf.line(ox + a[0], oy + a[1], ox + b[0], oy + b[1])
      }
      pdf.setLineDashPattern([], 0)
      pdf.setFontSize(9); pdf.setTextColor(60)
      const title = `${doc.publish.title || 'Untitled zine'} — ${s.kind === 'leaf' ? 'extra page' : 'sheet'} ${side}`
      pdf.text(title, ox, 1.1)
      pdf.setTextColor(120)
      const legend = side === 'front'
        ? 'Solid black: cut   ·   Red dashed: valley fold   ·   Red dash-dot: mountain fold'
        : 'Print double-sided, flip on long edge. Back side shown as seen from behind.'
      pdf.text(legend, ox, oy + s.frame.h + 0.8)
      if (s.kind === 'leaf') pdf.text('Glue this page along its straight hinge edge, into the matching crease.', ox, oy + s.frame.h + 1.3)
      pdf.setTextColor(0)
      o.onProgress?.(++done / total)
      await frame()
    }
  }
  if (pdf) download(pdf.output('blob'), `${slug(doc.publish.title)}-print-and-fold.pdf`)
}

/** Does `panel` belong to surface `surface`? Flap ids ('p:<crease>') follow their crease back to a root. */
function ownedBy(doc: ZineDoc, surface: string, panel: string) {
  let p = panel
  for (let guard = 0; guard < 64; guard++) {
    if (p === surface) return true
    if (!p.startsWith('p:')) return false
    const c = doc.creases.find(k => k.id === p.slice(2))
    if (!c) return false
    p = c.panel
  }
  return false
}

// ---------------------------------------------------------------- video

const ASPECTS: Record<Aspect, [number, number]> = { '9:16': [720, 1280], '4:5': [864, 1080], '1:1': [1080, 1080], '16:9': [1280, 720] }

async function video(doc: ZineDoc, o: ExportOpts) {
  const [W, H] = ASPECTS[o.aspect ?? '9:16']
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  const mime = types.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!mime) throw new Error('Video recording is not supported in this browser')
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const ctx = out.getContext('2d')!
  const bg = doc.bg || '#F6F6F6'
  const tl = timeline(doc)
  await withScene(doc, Math.round(W / 2), Math.round(H / 2), async s => {
    s.fitMargin = 1.35
    const stream = out.captureStream(30)
    // mix the soundtrack in when the browser lets us
    let dest: MediaStreamAudioDestinationNode | null = null
    if (doc.music) {
      try {
        dest = audio().createMediaStreamDestination()
        music.addTap(dest)
        music.play(doc.music.track, { volume: doc.music.volume, start: doc.music.start })
        for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr)
      } catch { dest = null }
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>(r => { rec.onstop = () => r() })
    rec.start(250)
    const t0 = performance.now()
    for (;;) {
      const t = (performance.now() - t0) / 1000
      s.setAngles(s.poseAt(tl.at(t)), { animate: false })
      s.renderOnce()
      dotGrid(ctx, W, H, bg, Math.round(W / 24))
      // intro: drop in with a little settle
      const ti = Math.min(1, t / 0.6)
      const e = 1 - Math.pow(1 - ti, 3)
      ctx.save()
      ctx.globalAlpha = ti
      ctx.translate(W / 2, H / 2 - (1 - e) * H * 0.08)
      ctx.scale(0.96 + 0.04 * e, 0.96 + 0.04 * e)
      ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = W * 0.03; ctx.shadowOffsetY = W * 0.015
      ctx.drawImage(s.canvas, -W / 2, -H / 2, W, H)
      ctx.restore()
      mark(ctx, W, H)
      o.onProgress?.(Math.min(1, t / tl.total))
      if (t >= tl.total) break
      await frame()
    }
    rec.stop()
    await stopped
    if (dest) { music.stop(); music.removeTap(dest) }
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'
    download(new Blob(chunks, { type: mime.split(';')[0] }), `${slug(doc.publish.title)}-unfold.${ext}`)
  }, { animate: true, dpr: 2 })
}

// ---------------------------------------------------------------- gif

async function gif(doc: ZineDoc, o: ExportOpts) {
  const W = 360, H = 450
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  const tl = timeline(doc)
  const N = 24
  const enc = GIFEncoder()
  await withScene(doc, W, H, async s => {
    s.fitMargin = 1.3
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * tl.total
      s.setAngles(s.poseAt(tl.at(t)), { animate: false })
      s.renderOnce()
      dotGrid(ctx, W, H, doc.bg || '#F6F6F6', 18)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5
      ctx.drawImage(s.canvas, 0, 0, W, H)
      ctx.restore()
      mark(ctx, W, H)
      const { data } = ctx.getImageData(0, 0, W, H)
      const palette = quantize(data, 256)
      const index = applyPalette(data, palette)
      enc.writeFrame(index, W, H, { palette, delay: i === N - 1 ? 1200 : i === 0 ? 600 : Math.round((tl.total * 1000) / N) })
      o.onProgress?.((i + 1) / N)
      await frame()
    }
  }, { dpr: 1 })
  enc.finish()
  download(new Blob([enc.bytes() as BlobPart], { type: 'image/gif' }), `${slug(doc.publish.title)}-unfold.gif`)
}

// ---------------------------------------------------------------- entry

export async function exportZine(doc: ZineDoc, kind: ExportKind, opts: ExportOpts = {}): Promise<void> {
  await prepare(doc)
  switch (kind) {
    case 'pdf-pages': return pdfPages(doc, opts)
    case 'pdf-print': return pdfPrint(doc, opts)
    case 'video': return video(doc, opts)
    case 'gif': return gif(doc, opts)
  }
}

import { drawStroke, drawText, isGifScrap, layoutText, processedScrap, pxPerCm } from '../lib/compose'
import { bbox } from '../lib/geom'
import { flatToPage, pageToFlat } from '../lib/paper'
import type { Effect, InkObj, Side, Vec2, ZineDoc, ZObject } from '../lib/types'
import type { ZineScene } from '../three/ZineScene'

export interface Box { cx: number; cy: number; w: number; h: number; rot: number; scale: number }

/** An object's oriented box in page coords (w/h before scale). */
export function objectBox(o: ZObject): Box {
  if (o.kind === 'scrap') return { cx: o.x, cy: o.y, w: o.w + o.sticker * 2, h: o.h + o.sticker * 2, rot: o.rot, scale: o.scale }
  if (o.kind === 'text') { const L = layoutText(o); return { cx: o.x, cy: o.y, w: L.w, h: L.h, rot: o.rot, scale: o.scale } }
  const b = inkBounds(o)
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: Math.max(0.5, b.x1 - b.x0), h: Math.max(0.5, b.y1 - b.y0), rot: 0, scale: 1 }
}

export function inkBounds(o: InkObj) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of o.strokes) {
    if (s.erase) continue
    const pad = s.size
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = s.pts[i], y = s.pts[i + 1]
      if (x - pad < x0) x0 = x - pad; if (x + pad > x1) x1 = x + pad
      if (y - pad < y0) y0 = y - pad; if (y + pad > y1) y1 = y + pad
    }
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return { x0, y0, x1, y1 }
}

export function boxCorners(b: Box): Vec2[] {
  const c = Math.cos(b.rot), s = Math.sin(b.rot)
  const hw = (b.w * b.scale) / 2, hh = (b.h * b.scale) / 2
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Vec2[]).map(([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c])
}

export function hitObject(o: ZObject, p: Vec2, pad = 0.25) {
  const b = objectBox(o)
  const dx = p[0] - b.cx, dy = p[1] - b.cy
  const c = Math.cos(-b.rot), s = Math.sin(-b.rot)
  const lx = (dx * c - dy * s) / b.scale, ly = (dx * s + dy * c) / b.scale
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad
}

/** Topmost visible object under a page point. Locked objects are skipped unless `includeLocked` (readers can still grab them). */
export function objectAt(doc: ZineDoc, surface: string, side: Side, p: Vec2, includeLocked = false) {
  for (let i = doc.objects.length - 1; i >= 0; i--) {
    const o = doc.objects[i]
    if (o.surface !== surface || o.side !== side || o.hidden || (o.locked && !includeLocked)) continue
    if (o.kind === 'ink') {
      // ink is only grabbable near its strokes
      const near = o.strokes.some(s => {
        if (s.erase) return false
        for (let k = 0; k < s.pts.length; k += 2) if (Math.hypot(s.pts[k] - p[0], s.pts[k + 1] - p[1]) < Math.max(0.4, s.size)) return true
        return false
      })
      if (near) return o
      continue
    }
    if (hitObject(o, p)) return o
  }
  return null
}

/** Move/scale/rotate an object. Ink transforms its points around the box centre. */
export function transformObject(o: ZObject, t: { dx?: number; dy?: number; scale?: number; rot?: number }, base?: ZObject): ZObject {
  const b0 = base ?? o
  if (b0.kind === 'ink') {
    const bx = objectBox(b0)
    const s = t.scale ?? 1, r = t.rot ?? 0
    const c = Math.cos(r), sn = Math.sin(r)
    return {
      ...b0,
      strokes: b0.strokes.map(st => {
        const pts = st.pts.slice()
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i] - bx.cx, y = pts[i + 1] - bx.cy
          pts[i] = bx.cx + (x * c - y * sn) * s + (t.dx ?? 0)
          pts[i + 1] = bx.cy + (x * sn + y * c) * s + (t.dy ?? 0)
        }
        return { ...st, pts, size: st.size * (st.erase ? 1 : 1) }
      }),
    }
  }
  return {
    ...b0,
    x: b0.x + (t.dx ?? 0), y: b0.y + (t.dy ?? 0),
    scale: Math.max(0.08, b0.scale * (t.scale ?? 1)), rot: b0.rot + (t.rot ?? 0),
  } as ZObject
}

/** Page rectangle (page coords) of a panel side. */
export function pageRect(scene: ZineScene, panel: string, side: Side) {
  const P = scene.d.panels.get(panel)
  const s = P && scene.d.surfaces.get(P.surface)
  if (!P || !s || !P.region.length) return null
  const b = bbox(P.region)
  const a = flatToPage(s.frame, side, [b.x0, b.y0]), c = flatToPage(s.frame, side, [b.x1, b.y1])
  return { x: Math.min(a[0], c[0]), y: Math.min(a[1], c[1]), w: Math.abs(c[0] - a[0]), h: Math.abs(c[1] - a[1]), surface: s.id }
}

/** Small image of one page cut from the live texture. */
export function pageThumb(scene: ZineScene, panel: string, side: Side, max = 120): HTMLCanvasElement | null {
  const r = pageRect(scene, panel, side)
  const t = r && scene.tex.get(r.surface)
  const s = r && scene.d.surfaces.get(r.surface)
  if (!r || !t || !s) return null
  const src = t[side].canvas
  const k = pxPerCm(s)
  const sc = Math.min(1, max / Math.max(r.w * k, r.h * k))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(r.w * k * sc)); c.height = Math.max(1, Math.round(r.h * k * sc))
  c.getContext('2d')!.drawImage(src, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height)
  return c
}

/** Which page numbers an object touches (an object across a crease shows both). */
export function pagesOf(scene: ZineScene, o: ZObject): number[] {
  const s = scene.d.surfaces.get(o.surface)
  if (!s) return []
  const b = objectBox(o)
  // sample just inside the corners so an object that exactly fills a page doesn't count its neighbour
  const pts = [[b.cx, b.cy] as Vec2, ...boxCorners(b).map(([x, y]): Vec2 => [b.cx + (x - b.cx) * 0.92, b.cy + (y - b.cy) * 0.92])]
  const set = new Set<number>()
  for (const p of pts) {
    const panel = panelContaining(scene, o.surface, o.side, p)
    if (panel) { const n = scene.pageOf(panel, o.side); if (n) set.add(n) }
  }
  return [...set].sort((a, c) => a - c)
}

function panelContaining(scene: ZineScene, surface: string, side: Side, p: Vec2) {
  const s = scene.d.surfaces.get(surface)
  if (!s) return null
  const flat = pageToFlat(s.frame, side, p)
  for (const P of scene.d.list) {
    if (P.surface !== surface) continue
    for (const poly of P.region) if (inRing(flat, poly[0])) return P.id
  }
  return null
}

export function isClipped(scene: ZineScene, o: ZObject) {
  const b = objectBox(o)
  return !panelContaining(scene, o.surface, o.side, [b.cx, b.cy])
}

function inRing(p: Vec2, r: Vec2[]) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
  }
  return inside
}

/**
 * One object on its own, as an image with a transparent background (for saving it as a scrap).
 * Scraps keep their cut-out, effects and die-cut border; GIFs keep their original file so they still move.
 */
export function objectImage(o: ZObject, effects: Effect[] = []): string | null {
  if (o.kind === 'scrap') {
    if (isGifScrap(o)) return o.src // keeps playing wherever it's saved to
    const p = processedScrap(o, effects)
    if (!p) return o.src
    if (!o.flipX) return p.canvas.toDataURL('image/webp', 0.92)
    const c = document.createElement('canvas')
    c.width = p.canvas.width; c.height = p.canvas.height
    const ctx = c.getContext('2d')!
    ctx.translate(c.width, 0); ctx.scale(-1, 1)
    ctx.drawImage(p.canvas, 0, 0)
    return c.toDataURL('image/webp', 0.92)
  }
  // text and ink are drawn in cm; render them at up to 60 px/cm, capped at 1200 px
  let w: number, h: number, x0 = 0, y0 = 0
  if (o.kind === 'text') { const L = layoutText(o); w = L.w; h = L.h }
  else { const b = inkBounds(o); x0 = b.x0; y0 = b.y0; w = b.x1 - b.x0; h = b.y1 - b.y0 }
  if (w <= 0 || h <= 0) return null
  const k = Math.min(60, 1200 / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k))
  const ctx = c.getContext('2d')!
  if (o.kind === 'text') {
    ctx.scale(k, k)
    drawText(ctx, { ...o, x: w / 2, y: h / 2, rot: 0, scale: 1 })
  } else {
    ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k)
    for (const st of o.strokes) drawStroke(ctx, st, { time: 0, animate: false })
  }
  return c.toDataURL('image/webp', 0.92)
}

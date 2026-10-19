import pc from 'polygon-clipping'
import type { MultiPoly, Polygon, Ring, Vec2 } from './types'

export const BIG = 150

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const mul = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s]
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
export const len = (a: Vec2) => Math.hypot(a[0], a[1])
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const norm = (a: Vec2): Vec2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l] }
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]]
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Which side of line a→b is p on: >0 left, <0 right. */
export const sideOf = (a: Vec2, b: Vec2, p: Vec2) => cross(sub(b, a), sub(p, a))

export function ringArea(r: Ring) {
  let s = 0
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n]
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s / 2
}

export function area(mp: MultiPoly) {
  let s = 0
  for (const poly of mp) {
    poly.forEach((ring, i) => { s += Math.abs(ringArea(ring)) * (i === 0 ? 1 : -1) })
  }
  return s
}

export function centroid(mp: MultiPoly): Vec2 {
  let cx = 0, cy = 0, A = 0
  for (const poly of mp) {
    const r = poly[0]
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n]
      const f = p[0] * q[1] - q[0] * p[1]
      cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; A += f
    }
  }
  if (Math.abs(A) < 1e-9) { const b = bbox(mp); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] }
  return [cx / (3 * A), cy / (3 * A)]
}

export function bbox(mp: MultiPoly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of mp) for (const p of poly[0]) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]
  }
  return { x0, y0, x1, y1 }
}

export function rect(x: number, y: number, w: number, h: number): MultiPoly {
  return [[[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]]]
}

/** The half-plane on `side` of line a→b, as a huge quad. */
export function halfPlane(a: Vec2, b: Vec2, side: 1 | -1): Polygon {
  const d = norm(sub(b, a))
  const n = mul(perp(d), side * BIG)
  const p0 = add(a, mul(d, -BIG)), p1 = add(a, mul(d, BIG))
  const ring: Ring = [p0, p1, add(p1, n), add(p0, n)]
  if (ringArea(ring) < 0) ring.reverse()
  return [ring]
}

const clean = (mp: pc.MultiPolygon): MultiPoly =>
  mp.map(poly => poly.map(ring => {
    const r = ring.slice() as Ring
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop()
    return r
  })).filter(poly => poly[0] && poly[0].length >= 3 && Math.abs(ringArea(poly[0])) > 1e-6)

type G = MultiPoly | Polygon
const snapRing = (r: Ring, g: number): Ring => {
  const out: Ring = []
  for (const p of r) {
    const q: Vec2 = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]
    const l = out[out.length - 1]
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q)
  }
  return out
}
const isMulti = (g: G): g is MultiPoly => Array.isArray(g[0]?.[0]?.[0])
const snapGeom = (g: G, grid: number): G =>
  isMulti(g) ? g.map(poly => poly.map(r => snapRing(r, grid))) : (g as Polygon).map(r => snapRing(r, grid))

/** polygon-clipping is exact but fragile with near-degenerate input: retry on coarser grids before giving up. */
function op(fn: (a: pc.Geom, ...b: pc.Geom[]) => pc.MultiPolygon, a: MultiPoly, b: G[], fallback: MultiPoly): MultiPoly {
  for (const grid of [1e-7, 1e-5, 1e-3, 5e-3]) {
    try {
      return clean(fn(snapGeom(a, grid) as pc.Geom, ...b.map(x => snapGeom(x, grid) as pc.Geom)))
    } catch { /* try a coarser grid */ }
  }
  console.warn('clip failed after retries')
  return fallback
}

export const intersect = (a: MultiPoly, ...b: G[]): MultiPoly => (a.length === 0 ? [] : op(pc.intersection, a, b, a))
export const union = (a: MultiPoly, ...b: G[]): MultiPoly => op(pc.union, a, b, a)
export const difference = (a: MultiPoly, ...b: G[]): MultiPoly => (a.length === 0 ? [] : op(pc.difference, a, b, a))

export function pointInRing(p: Vec2, r: Ring) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function pointInMulti(p: Vec2, mp: MultiPoly) {
  for (const poly of mp) {
    if (!pointInRing(p, poly[0])) continue
    let hole = false
    for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) { hole = true; break }
    if (!hole) return true
  }
  return false
}

/** Clip the infinite line through a, b against a multipolygon. Returns the longest inside segment. */
export function clipLine(a: Vec2, b: Vec2, mp: MultiPoly): [Vec2, Vec2] | null {
  const d = norm(sub(b, a))
  const ts: number[] = []
  for (const poly of mp) for (const ring of poly) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]
      const e = sub(q, p)
      const den = cross(d, e)
      if (Math.abs(den) < 1e-12) continue
      const w = sub(p, a)
      const t = cross(w, e) / den
      const u = cross(w, d) / den
      if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(t)
    }
  }
  ts.sort((x, y) => x - y)
  let best: [Vec2, Vec2] | null = null, bestLen = 0
  for (let i = 0; i + 1 < ts.length; i++) {
    const m = (ts[i] + ts[i + 1]) / 2
    if (ts[i + 1] - ts[i] < 1e-6) continue
    if (!pointInMulti(add(a, mul(d, m)), mp)) continue
    const L = ts[i + 1] - ts[i]
    // prefer the segment containing the press point (t≈0)
    const containsA = ts[i] <= 1e-6 && ts[i + 1] >= -1e-6
    if (containsA || L > bestLen) {
      best = [add(a, mul(d, ts[i])), add(a, mul(d, ts[i + 1]))]
      bestLen = containsA ? Infinity : L
    }
  }
  return best
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)))
  return add(a, mul(ab, t))
}

export function distToLine(p: Vec2, a: Vec2, b: Vec2) {
  return Math.abs(sideOf(a, b, p)) / (dist(a, b) || 1)
}

export function reflectPoint(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const d = norm(sub(b, a))
  const ap = sub(p, a)
  const proj = add(a, mul(d, dot(ap, d)))
  return sub(mul(proj, 2), p)
}

export function reflectMulti(mp: MultiPoly, a: Vec2, b: Vec2): MultiPoly {
  return mp.map(poly => poly.map(r => r.map(p => reflectPoint(p, a, b)).reverse()))
}

export function transformMulti(mp: MultiPoly, f: (p: Vec2) => Vec2): MultiPoly {
  return mp.map(poly => poly.map(r => r.map(f)))
}

/** Thick polyline as a polygon (for slits). */
export function strokePolygon(pts: Vec2[], w: number): Polygon {
  const left: Vec2[] = [], right: Vec2[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const d = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]))
    const n = mul(perp(d), w / 2)
    left.push(add(p, n)); right.push(sub(p, n))
  }
  const ring = [...left, ...right.reverse()]
  if (ringArea(ring) < 0) ring.reverse()
  return [ring]
}

/** Polyline length + resample at a fixed spacing. */
export function resample(pts: Vec2[], step: number): Vec2[] {
  if (pts.length < 2) return pts.slice()
  const out: Vec2[] = [pts[0]]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]
    const b = pts[i]
    let seg = dist(a, b)
    while (acc + seg >= step) {
      const t = (step - acc) / seg
      const p = lerp2(a, b, t)
      out.push(p)
      a = p; seg = dist(a, b); acc = 0
    }
    acc += seg
  }
  const last = pts[pts.length - 1]
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last)
  return out
}

export function chaikin(pts: Vec2[], iters = 2): Vec2[] {
  let p = pts
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p
    const o: Vec2[] = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      o.push(lerp2(p[i], p[i + 1], 0.25), lerp2(p[i], p[i + 1], 0.75))
    }
    o.push(p[p.length - 1])
    p = o
  }
  return p
}

export function polylineLength(pts: Vec2[]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

// Small seeded RNG (mulberry32) so roughness is repeatable per cut.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 1D value noise, smooth, seeded. */
export function noise1(seed: number) {
  const r = rng(seed)
  const vals = Array.from({ length: 256 }, () => r() * 2 - 1)
  return (x: number) => {
    const i = Math.floor(x), f = x - i
    const a = vals[((i % 256) + 256) % 256], b = vals[(((i + 1) % 256) + 256) % 256]
    const t = f * f * (3 - 2 * f)
    return a + (b - a) * t
  }
}

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

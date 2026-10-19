import { Matrix4, Vector3 } from 'three'
import {
  add, area, bbox, centroid, chaikin, clipLine, difference, dist, distToLine, halfPlane, intersect,
  mul, noise1, norm, perp, rect, reflectMulti, resample, rng, sideOf, sub, uid, union,
} from './geom'
import type {
  Crease, EdgeStyle, Frame, Keyframe, MultiPoly, PaperStock, Polygon, Side, Surface, Vec2, ZineDoc,
} from './types'

/** Layer thickness in cm. Folded layers offset by this so faces never share a plane. */
export const EPS = 0.045

export interface Panel {
  id: string
  surface: string
  parent: string | null
  hinge: string | null
  constraints: { a: Vec2; b: Vec2; side: 1 | -1 }[]
  region: MultiPoly
  depth: number
  zf: number
}

export interface Derived {
  panels: Map<string, Panel>
  list: Panel[]
  creases: Map<string, Crease>
  surfaces: Map<string, Surface>
  /** surface outlines after finalize edge treatment */
  outlines: Map<string, MultiPoly>
}

export const flapOf = (c: Crease) => c.leaf ?? 'p:' + c.id

export function derive(doc: ZineDoc, opts: { edges?: boolean } = {}): Derived {
  const panels = new Map<string, Panel>()
  const creases = new Map<string, Crease>()
  const surfaces = new Map<string, Surface>()
  const outlines = new Map<string, MultiPoly>()
  for (const s of doc.surfaces) {
    surfaces.set(s.id, s)
    const ol = opts.edges && doc.finalize.edge !== 'none'
      ? edgeTreat(s.outline, doc.finalize.edge, doc.finalize.edgeAmount, hash(s.id))
      : s.outline
    outlines.set(s.id, ol)
    if (s.kind === 'sheet') {
      panels.set(s.id, { id: s.id, surface: s.id, parent: null, hinge: null, constraints: [], region: [], depth: 0, zf: 1 })
    }
  }
  // how many leaves share each crease line, for stacking order
  const leafCount = new Map<string, number>()
  for (const c of doc.creases) {
    creases.set(c.id, c)
    const P = panels.get(c.panel)
    if (!P) continue
    if (c.leaf) {
      const key = lineKey(c)
      const k = (leafCount.get(key) ?? 0) + 1
      leafCount.set(key, k)
      panels.set(c.leaf, {
        id: c.leaf, surface: c.leaf, parent: P.id, hinge: c.id, constraints: [], region: [], depth: 0, zf: k * 0.45,
      })
      continue
    }
    const flapId = 'p:' + c.id
    const flap: Panel = {
      id: flapId, surface: P.surface, parent: P.id, hinge: c.id,
      constraints: [...P.constraints, { a: c.a, b: c.b, side: c.flapSide }],
      region: [], depth: 0, zf: c.stack ?? 1,
    }
    // children of P that hang off the flap side follow the flap
    for (const C of panels.values()) {
      if (C.parent !== P.id || !C.hinge) continue
      const h = creases.get(C.hinge)!
      const mid: Vec2 = [(h.a[0] + h.b[0]) / 2, (h.a[1] + h.b[1]) / 2]
      if (sideOf(c.a, c.b, mid) * c.flapSide > 0) C.parent = flapId
    }
    P.constraints = [...P.constraints, { a: c.a, b: c.b, side: (-c.flapSide) as 1 | -1 }]
    panels.set(flapId, flap)
  }
  // creases whose line also carries leaves sit on top of them
  for (const c of doc.creases) {
    if (c.leaf) continue
    const n = leafCount.get(lineKey(c))
    const f = panels.get('p:' + c.id)
    if (n && f) f.zf = (c.stack ?? 1) + n * 0.45
  }
  for (const P of panels.values()) {
    const ol = outlines.get(P.surface) ?? []
    P.region = P.constraints.length
      ? intersect(ol, ...P.constraints.map(k => halfPlane(k.a, k.b, k.side)))
      : ol
  }
  const depthOf = (p: Panel): number => (p.parent ? depthOf(panels.get(p.parent)!) + 1 : 0)
  for (const P of panels.values()) P.depth = depthOf(P)
  const list = [...panels.values()].sort((a, b) => a.depth - b.depth)
  return { panels, list, creases, surfaces, outlines }
}

const lineKey = (c: Crease) => `${c.panel}|${c.a[0].toFixed(3)},${c.a[1].toFixed(3)}|${c.b[0].toFixed(3)},${c.b[1].toFixed(3)}`

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const _t1 = new Matrix4(), _t2 = new Matrix4(), _r = new Matrix4(), _z = new Matrix4()
const _axis = new Vector3()

export function hingeMatrix(c: Crease, angle: number, zf: number, out = new Matrix4()) {
  _axis.set(c.b[0] - c.a[0], c.b[1] - c.a[1], 0).normalize()
  const phi = c.dir * c.flapSide * angle * Math.PI / 180
  _t1.makeTranslation(c.a[0], c.a[1], 0)
  _r.makeRotationAxis(_axis, phi)
  _t2.makeTranslation(-c.a[0], -c.a[1], 0)
  const lift = Math.min(1, angle / 25)
  _z.makeTranslation(0, 0, -c.dir * EPS * zf * lift)
  return out.copy(_t1).multiply(_r).multiply(_t2).multiply(_z)
}

/** World matrix of every panel for a set of crease angles. */
export function panelMatrices(d: Derived, angles: (c: Crease) => number, out = new Map<string, Matrix4>()) {
  for (const P of d.list) {
    let m = out.get(P.id)
    if (!m) { m = new Matrix4(); out.set(P.id, m) }
    if (!P.parent || !P.hinge) { m.identity(); continue }
    const parent = out.get(P.parent)!
    const c = d.creases.get(P.hinge)!
    hingeMatrix(c, angles(c), P.zf, m)
    m.premultiply(parent)
  }
  return out
}

/** Matrix of `panelId` with crease `override` at angle `a` (for handle drag sampling). */
export function panelMatrixWith(d: Derived, panelId: string, angles: (c: Crease) => number): Matrix4 {
  const chain: Panel[] = []
  let P = d.panels.get(panelId)
  while (P) { chain.unshift(P); P = P.parent ? d.panels.get(P.parent) : undefined }
  const m = new Matrix4(), h = new Matrix4()
  for (const Q of chain) {
    if (!Q.hinge) continue
    const c = d.creases.get(Q.hinge)!
    hingeMatrix(c, angles(c), Q.zf, h)
    m.multiply(h)
  }
  return m
}

/** The point a fold handle sits at, in the flap's flat coords. */
export function handlePoint(d: Derived, c: Crease): Vec2 | null {
  const flap = d.panels.get(flapOf(c))
  if (!flap || flap.region.length === 0) return null
  let best: Vec2 | null = null, bd = -1
  for (const poly of flap.region) for (const p of poly[0]) {
    const dd = distToLine(p, c.a, c.b)
    if (dd > bd + 1e-6 || (Math.abs(dd - bd) < 0.05 && best && Math.abs(p[1]) < Math.abs(best[1]))) { bd = dd; best = p }
  }
  if (!best) return null
  // centre of the far edge reads better than a corner: average the vertices near max distance
  const far: Vec2[] = []
  for (const poly of flap.region) for (const p of poly[0]) if (distToLine(p, c.a, c.b) > bd - 0.4) far.push(p)
  let mid: Vec2 = far.reduce((s, p) => add(s, p), [0, 0] as Vec2)
  mid = mul(mid, 1 / far.length)
  const cen = centroid(flap.region)
  const inset = Math.min(1.1, bd * 0.18)
  return add(mid, mul(norm(sub(cen, mid)), inset))
}

// ---------------------------------------------------------------- cutting

export type CutStyle = 'straight' | 'smooth' | 'jagged' | 'round'

export function cutPath(
  style: CutStyle, A: Vec2, B: Vec2, finger: Vec2[], roughness: number, seed: number, ruler: boolean,
): Vec2[] {
  let base: Vec2[]
  if (style === 'straight' || ruler || finger.length < 3) base = [A, B]
  else base = chaikin(resample([A, ...finger.slice(1, -1), B], 0.35), 3)
  const pts = resample(base, 0.08)
  if (pts.length < 2) return [A, B]
  const n1 = noise1(seed), n2 = noise1(seed + 7)
  const r = rng(seed + 3)
  const rough = roughness / 100
  const out: Vec2[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += dist(pts[i - 1], pts[i])
    const p = pts[i]
    const d = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]))
    const n = perp(d)
    let off = 0
    if (style === 'jagged') {
      const per = 0.55, ph = (s / per) % 1
      off += 0.22 * (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4)
    } else if (style === 'round') {
      const per = 0.8
      off += 0.26 * Math.abs(Math.sin(Math.PI * s / per)) - 0.13
    }
    off += rough * (0.32 * n1(s * 0.7) + 0.07 * n2(s * 7))
    if (rough > 0.45 && r() < (rough - 0.45) * 0.08) off += (r() - 0.5) * rough * 0.5 // micro tears
    // keep the ends pinned so the cut starts where the finger pressed
    const pin = Math.min(1, s / 0.3, (polyLen(pts) - s) / 0.3)
    out.push(add(p, mul(n, off * Math.max(0, pin))))
  }
  return out
}

const polyLen = (p: Vec2[]) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s }

/** Closed regions to the left and right of an open path, extended far past both ends. */
export function pathClosures(path: Vec2[]): { left: Polygon; right: Polygon } {
  const A = path[0], B = path[path.length - 1]
  const dA = norm(sub(path[0], path[Math.min(3, path.length - 1)]))
  const dB = norm(sub(path[path.length - 1], path[Math.max(0, path.length - 4)]))
  const E = 90
  const ext: Vec2[] = [add(A, mul(dA, E)), ...path, add(B, mul(dB, E))]
  const dir = norm(sub(ext[ext.length - 1], ext[0]))
  const L = mul(perp(dir), E * 2)
  const left: Vec2[] = [...ext, add(ext[ext.length - 1], L), add(ext[0], L)]
  const right: Vec2[] = [...ext, sub(ext[ext.length - 1], L), sub(ext[0], L)]
  return { left: [orient(left)], right: [orient(right)] }
}

const orient = (r: Vec2[]) => {
  let s = 0
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1] }
  return s < 0 ? r.slice().reverse() : r
}

// ---------------------------------------------------------------- finishing edges

export function edgeTreat(mp: MultiPoly, style: EdgeStyle, amount: number, seed: number): MultiPoly {
  if (style === 'none' || amount <= 0) return mp
  const n1 = noise1(seed), n2 = noise1(seed + 11)
  const out: MultiPoly = mp.map(poly => poly.map((ring, ri) => {
    if (ri > 0) return ring
    const res: Vec2[] = []
    let s = 0
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]
      const L = dist(p, q)
      const steps = Math.max(1, Math.ceil(L / 0.12))
      const d = norm(sub(q, p))
      const inward = perp(d) // ccw ring → left is inside
      for (let k = 0; k < steps; k++) {
        const t = k / steps
        const pt = add(p, mul(sub(q, p), t))
        const ss = s + L * t
        let off = 0
        switch (style) {
          case 'jagged': { const ph = (ss / 0.5) % 1; off = 0.2 * (ph < 0.5 ? ph * 2 : 2 - ph * 2) + 0.03 * n2(ss * 4); break }
          case 'ripped': off = 0.14 + 0.14 * n1(ss * 0.9) + 0.06 * n2(ss * 6); break
          case 'deckle': off = 0.05 + 0.05 * n1(ss * 5) + 0.025 * n2(ss * 17); break
          case 'scallop': off = 0.22 * (1 - Math.abs(Math.sin(Math.PI * ss / 0.7))); break
        }
        res.push(add(pt, mul(inward, Math.max(0, off) * amount)))
      }
      s += L
    }
    return res
  }))
  // repair any self-intersection the displacement introduced
  return union(out)
}

// ---------------------------------------------------------------- page leaves

export function leafOutline(d: Derived, c: Crease, length: number): MultiPoly {
  const fixed = d.panels.get(c.panel)
  const flap = d.panels.get(flapOf(c))
  if (!fixed || !flap) return []
  const dir = norm(sub(c.b, c.a))
  const n = mul(perp(dir), c.flapSide)
  const far: Vec2 = mul(n, length)
  const band: Polygon = [[c.a, c.b, add(c.b, far), add(c.a, far)]]
  const strip = intersect([halfPlane(c.a, c.b, c.flapSide)], halfPlane(add(c.a, far), add(c.b, far), (-c.flapSide) as 1 | -1))
  const shape = union(reflectMulti(fixed.region, c.a, c.b), flap.region, band)
  return intersect(shape, ...strip)
}

export function panelDepth(region: MultiPoly, c: Crease) {
  let m = 0
  for (const poly of region) for (const p of poly[0]) m = Math.max(m, distToLine(p, c.a, c.b))
  return m
}

// ---------------------------------------------------------------- docs + templates

export const SIZES: Record<string, { w: number; h: number; label: string }> = {
  a5: { w: 14.8, h: 21, label: 'A5' },
  letter: { w: 21.6, h: 27.9, label: 'Letter' },
  a4: { w: 21, h: 29.7, label: 'A4' },
  square: { w: 18, h: 18, label: 'Square' },
}

export type TemplateId = 'blank' | 'half' | 'gatefold' | 'accordion' | 'trifold'

export function frameFor(mp: MultiPoly): Frame {
  const b = bbox(mp)
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
}

export function newDoc(opts: {
  author: string; size?: keyof typeof SIZES; w?: number; h?: number; color?: string; stock?: PaperStock; template?: TemplateId
}): ZineDoc {
  const sz = SIZES[opts.size ?? 'a5']
  const tpl = opts.template ?? 'blank'
  let w = opts.w ?? sz.w, h = opts.h ?? sz.h
  // folded templates: panel size comes from the chosen sheet, laid out side by side
  const pw = Math.min(w, h) * 0.7, ph = pw * 1.54
  if (tpl === 'half') { w = pw * 2; h = ph }
  if (tpl === 'gatefold') { w = pw * 2; h = ph }
  if (tpl === 'trifold') { w = pw * 3; h = ph }
  if (tpl === 'accordion') { w = pw * 4; h = ph }
  const outline = rect(-w / 2, -h / 2, w, h)
  const sheet: Surface = {
    id: 'sheet', kind: 'sheet', outline, frame: frameFor(outline),
    color: opts.color ?? '#FBFAF6', stock: opts.stock ?? 'plain',
  }
  const doc: ZineDoc = {
    id: uid('z_'), author: opts.author, createdAt: Date.now(), updatedAt: Date.now(), status: 'draft',
    surfaces: [sheet], creases: [], keyframes: [{ id: uid('k'), name: 'Cover', angles: {} }],
    transition: { mode: 'together', feel: 'snappy' },
    objects: [], effects: [], bg: '#F6F6F6', music: null,
    finalize: { edge: 'none', edgeAmount: 0.6, outline: { on: false, color: '#FFFFFF', width: 0.3 }, boilAll: false, breathe: true, wiggle: false, intro: 'drop' },
    publish: {
      title: '', description: '', tags: [], coverKeyframe: 0, postTo: null, visibility: 'public',
      allowReplies: true, scrapReuse: true, credits: [], contentNote: '',
    },
  }
  const v = (x: number): [Vec2, Vec2] => [[x, -h / 2], [x, h / 2]]
  const mk = (id: string, panel: string, x: number, flapSide: 1 | -1, dir: 1 | -1): Crease => {
    const [a, b] = v(x)
    return { id, panel, a, b, flapSide, dir, angle: 180 }
  }
  // a→b runs bottom to top, so "left" (+1) is smaller x
  switch (tpl) {
    case 'half': {
      doc.creases = [mk('c1', 'sheet', 0, 1, 1)]
      doc.keyframes = [kf('Cover', { c1: 180 }), kf('Open', { c1: 0 })]
      break
    }
    case 'gatefold': {
      doc.creases = [mk('c1', 'sheet', -w / 4, 1, 1), mk('c2', 'sheet', w / 4, -1, 1)]
      doc.keyframes = [kf('Cover', { c1: 180, c2: 180 }), kf('Left door', { c1: 0, c2: 180 }), kf('Open', { c1: 0, c2: 0 })]
      break
    }
    case 'trifold': {
      doc.creases = [mk('c1', 'sheet', w / 6, -1, 1), mk('c2', 'sheet', -w / 6, 1, 1)]
      // the left door lies over the right one when closed
      doc.keyframes = [kf('Cover', { c1: 180, c2: 180 }), kf('Peek', { c1: 180, c2: 0 }), kf('Open', { c1: 0, c2: 0 })]
      break
    }
    case 'accordion': {
      const q = w / 4
      doc.creases = [
        mk('c1', 'sheet', -w / 2 + q, -1, -1),
        mk('c2', 'p:c1', -w / 2 + 2 * q, -1, 1),
        mk('c3', 'p:c2', -w / 2 + 3 * q, -1, -1),
      ]
      doc.keyframes = [
        kf('Cover', { c1: 180, c2: 180, c3: 180 }),
        kf('One', { c1: 20, c2: 180, c3: 180 }),
        kf('Two', { c1: 25, c2: 30, c3: 180 }),
        kf('Spread', { c1: 0, c2: 0, c3: 0 }),
      ]
      break
    }
  }
  if (tpl === 'trifold') doc.creases[1].stack = 2 // the left door closes over the right one
  return doc
}

export const kf = (name: string, angles: Record<string, number>): Keyframe => ({ id: uid('k'), name, angles })

/** Convert flat sheet coords to page coords of a side (y down, origin at frame top-left). */
export function flatToPage(f: Frame, side: Side, p: Vec2): Vec2 {
  const x = side === 'front' ? p[0] - f.x : f.x + f.w - p[0]
  return [x, f.y + f.h - p[1]]
}
export function pageToFlat(f: Frame, side: Side, p: Vec2): Vec2 {
  const x = side === 'front' ? p[0] + f.x : f.x + f.w - p[0]
  return [x, f.y + f.h - p[1]]
}

/** Smaller side of a crease line through a panel region. */
export function splitAreas(region: MultiPoly, a: Vec2, b: Vec2) {
  const L = area(intersect(region, halfPlane(a, b, 1)))
  const R = area(intersect(region, halfPlane(a, b, -1)))
  return { L, R }
}

export function clipCrease(region: MultiPoly, a: Vec2, b: Vec2) {
  return clipLine(a, b, region)
}

export function subtract(mp: MultiPoly, cut: MultiPoly) {
  return cut.length ? difference(mp, cut) : mp
}

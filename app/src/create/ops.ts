import {
  area, clipLine, cross, difference, dist, dot, intersect, norm, pointInMulti, sideOf, strokePolygon, sub, transformMulti, uid, union,
} from '../lib/geom'
import { derive, flapOf, frameFor, leafOutline, pathClosures, splitAreas, type Derived } from '../lib/paper'
import type { Crease, MultiPoly, Polygon, Surface, Vec2, ZineDoc } from '../lib/types'
import type { ZineScene } from '../three/ZineScene'

export interface CutResult {
  doc: ZineDoc
  /** the same cut, keeping the other piece */
  alt: ZineDoc | null
  pieces: { panel: string; region: MultiPoly }[]
  altPieces: { panel: string; region: MultiPoly }[]
  kind: 'through' | 'slit'
}

const mapPoly = (p: Polygon, f: (v: Vec2) => Vec2): Polygon => p.map(r => r.map(f))

/** Panels a cut on `panel` goes through: the whole coplanar stack, unless top layer only. */
function layersFor(scene: ZineScene, panel: string, topOnly: boolean) {
  return topOnly ? [panel] : scene.coplanar(panel)
}

/**
 * Cut along an open path drawn on `panel` (path in that panel's flat coords).
 * A path that runs edge to edge is a through cut: the smaller piece falls away.
 * Otherwise it's a slit: nothing is removed, the paper just gets a thin cut.
 */
export function applyCut(scene: ZineScene, doc: ZineDoc, panel: string, path: Vec2[], topOnly: boolean): CutResult | null {
  const d = scene.d
  const P = d.panels.get(panel)
  if (!P || path.length < 2) return null
  const A = path[0], B = path[path.length - 1]
  const layers = layersFor(scene, panel, topOnly)
  const through = !pointInMulti(A, P.region) && !pointInMulti(B, P.region)

  if (through) {
    const { left, right } = pathClosures(path)
    const L: { panel: string; region: MultiPoly }[] = []
    const R: { panel: string; region: MultiPoly }[] = []
    let aL = 0, aR = 0
    for (const id of layers) {
      const Q = d.panels.get(id)
      if (!Q || !Q.region.length) continue
      const f = scene.mapFlat(panel, id)
      const l = intersect(Q.region, mapPoly(left, f))
      const r = intersect(Q.region, mapPoly(right, f))
      if (l.length) { L.push({ panel: id, region: l }); aL += area(l) }
      if (r.length) { R.push({ panel: id, region: r }); aR += area(r) }
    }
    if (aL < 0.05 || aR < 0.05) return null // the line missed the paper
    const [keepSmall, keepBig] = aL < aR ? [L, R] : [R, L]
    // and anything the cut leaves hanging on nothing falls away with the piece
    const main = withoutFloating(removeRegions(doc, d, keepSmall))
    const alt = withoutFloating(removeRegions(doc, d, keepBig))
    return {
      doc: main.doc, alt: alt.doc,
      pieces: [...keepSmall, ...main.pieces], altPieces: [...keepBig, ...alt.pieces], kind: 'through',
    }
  }

  // slit
  const ribbon = strokePolygon(path, 0.07)
  const cuts: { panel: string; region: MultiPoly }[] = []
  for (const id of layers) {
    const Q = d.panels.get(id)
    if (!Q || !Q.region.length) continue
    const f = scene.mapFlat(panel, id)
    const s = intersect(Q.region, mapPoly(ribbon, f))
    if (s.length) cuts.push({ panel: id, region: s })
  }
  if (!cuts.length) return null
  // a slit can still cut a bit of paper free (across a narrow neck, or along a hinge): that falls away too
  const res = withoutFloating(removeRegions(doc, d, cuts))
  return { doc: res.doc, alt: null, pieces: res.pieces, altPieces: [], kind: 'slit' }
}

// ---------------------------------------------------------------- floating paper

/** How close to a hinge line a paper edge must run to count as on it, and how much of it must be shared. */
const HINGE_TOL = 1e-3
const HINGE_MIN = 0.05

/**
 * Pieces of paper joined to nothing. Every panel's paper is split into its separate pieces; a piece is joined
 * to a piece of its parent panel where both run along the hinge between them for a stretch. Whatever isn't
 * joined, however indirectly, to the biggest body of paper is floating.
 */
export function floatingPieces(d: Derived): { panel: string; region: MultiPoly }[] {
  const nodes: { panel: string; poly: Polygon; area: number }[] = []
  const byPanel = new Map<string, number[]>()
  for (const P of d.list) {
    const ids: number[] = []
    for (const poly of P.region) {
      const a = area([poly])
      if (a < 1e-4) continue
      ids.push(nodes.length)
      nodes.push({ panel: P.id, poly, area: a })
    }
    byPanel.set(P.id, ids)
  }
  if (nodes.length < 2) return []
  const up = nodes.map((_, i) => i)
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])))
  // the stretches of a piece's edge that run along a line, as [from, to] along it
  const along = (poly: Polygon, a: Vec2, b: Vec2) => {
    const u = norm(sub(b, a))
    const out: [number, number][] = []
    for (const ring of poly) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]
      if (Math.abs(cross(u, sub(p, a))) > HINGE_TOL || Math.abs(cross(u, sub(q, a))) > HINGE_TOL) continue
      const t0 = dot(sub(p, a), u), t1 = dot(sub(q, a), u)
      out.push([Math.min(t0, t1), Math.max(t0, t1)])
    }
    return out
  }
  const shared = (A: [number, number][], B: [number, number][]) =>
    A.some(([a0, a1]) => B.some(([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > HINGE_MIN))
  for (const C of d.list) {
    if (!C.parent || !C.hinge) continue
    const h = d.creases.get(C.hinge)
    if (!h) continue
    const parents = (byPanel.get(C.parent) ?? []).map(j => ({ j, s: along(nodes[j].poly, h.a, h.b) }))
    for (const i of byPanel.get(C.id) ?? []) {
      const s = along(nodes[i].poly, h.a, h.b)
      if (!s.length) continue
      for (const p of parents) if (shared(s, p.s)) up[find(i)] = find(p.j)
    }
  }
  const total = new Map<number, number>()
  const rooted = new Set<number>()
  nodes.forEach((n, i) => {
    total.set(find(i), (total.get(find(i)) ?? 0) + n.area)
    if (!d.panels.get(n.panel)?.parent) rooted.add(find(i))
  })
  // the biggest body stays; a near tie goes to the one holding the base sheet, so its folds keep something to hang from
  let body = -1, best = -1
  for (const [r, a] of total) {
    const tie = Math.abs(a - best) <= best * 0.02
    if ((!tie && a > best) || (tie && rooted.has(r) && !rooted.has(body))) { best = Math.max(a, best); body = r }
  }
  const out = new Map<string, MultiPoly>()
  nodes.forEach((n, i) => {
    if (find(i) === body) return
    const l = out.get(n.panel) ?? []
    l.push(n.poly)
    out.set(n.panel, l)
  })
  return [...out].map(([panel, region]) => ({ panel, region }))
}

/** Take away any floating paper (see floatingPieces), and the leaves and folds that are left with none. */
export function withoutFloating(doc: ZineDoc): { doc: ZineDoc; pieces: { panel: string; region: MultiPoly }[] } {
  const d = derive(doc)
  const pieces = floatingPieces(d)
  let nd = pieces.length ? removeRegions(doc, d, pieces) : doc
  // a leaf with no paper left goes, with its hinge, its folds and its collage; a fold with nothing left on its
  // flap goes too, so no handle is left hanging off thin air
  for (let guard = 0; guard < 24; guard++) {
    const dd = derive(nd)
    const bare = nd.creases.find(c => {
      if (c.leaf) return area(nd.surfaces.find(x => x.id === c.leaf)?.outline ?? []) < 0.01
      return area(dd.panels.get(flapOf(c))?.region ?? []) < 0.01
    })
    if (!bare) break
    nd = deleteCrease(nd, bare.id)
  }
  return { doc: nd, pieces }
}

function removeRegions(doc: ZineDoc, d: ZineScene['d'], parts: { panel: string; region: MultiPoly }[]): ZineDoc {
  const bySurface = new Map<string, MultiPoly[]>()
  for (const p of parts) {
    const s = d.panels.get(p.panel)!.surface
    const l = bySurface.get(s) ?? []
    l.push(p.region)
    bySurface.set(s, l)
  }
  const surfaces: Surface[] = doc.surfaces.map(s => {
    const cut = bySurface.get(s.id)
    if (!cut) return s
    const all = cut.length > 1 ? union(cut[0], ...cut.slice(1)) : cut[0]
    // grow the cut a hair so finalize edges can't leave slivers
    return { ...s, outline: difference(s.outline, all) }
  })
  return { ...doc, surfaces }
}

export type FoldPlan = { seg: [Vec2, Vec2]; flapSide: 1 | -1 } | { error: 'cross' | 'same' }

/** How far from a fold line (flat units) a hinge end still counts as on it. */
const ON_LINE = 0.05

/**
 * Where a fold along the line through A–B (flat coords) can go on `panel`. A fold only ever creases: it never
 * tears paper from what it's joined to. So the line may not run through a binding (the hinge the panel hangs
 * from, or the hinge of a fold or leaf hanging off it), just as a book's page can't be folded across its
 * spine, and the side holding the bindings stays put while the free side swings, however big it is.
 * With nothing bound (a loose sheet, or bindings on both sides) the side with less paper folds.
 */
export function foldPlan(d: Derived, panel: string, A: Vec2, B: Vec2): FoldPlan | null {
  const P = d.panels.get(panel)
  if (!P || dist(A, B) < 1e-6) return null
  const seg = clipLine(A, B, P.region)
  if (!seg) return null
  const len = dist(seg[0], seg[1])
  if (len < 1e-6) return null
  // signed distance from the line, + on the left (flapSide +1)
  const off = (p: Vec2) => sideOf(seg[0], seg[1], p) / len
  const own = P.hinge ? d.creases.get(P.hinge) : undefined
  const kids = d.list.filter(C => C.parent === P.id && C.hinge).map(C => d.creases.get(C.hinge!)!)
  const sideOfHinge = (h: { a: Vec2; b: Vec2 }) => {
    const oa = off(h.a), ob = off(h.b)
    if ((oa > ON_LINE && ob < -ON_LINE) || (oa < -ON_LINE && ob > ON_LINE)) return 'cross' as const
    const o = Math.abs(oa) > Math.abs(ob) ? oa : ob
    return Math.abs(o) <= ON_LINE ? ('same' as const) : o > 0 ? 1 : -1
  }
  const ownSide = own ? sideOfHinge(own) : 0
  const kidSides = kids.map(sideOfHinge)
  for (const k of [ownSide, ...kidSides]) if (k === 'cross') return { error: 'cross' }
  const { L, R } = splitAreas(P.region, seg[0], seg[1])
  if (Math.min(L, R) < 0.3) return [ownSide, ...kidSides].includes('same') ? { error: 'same' } : null
  let flapSide: 1 | -1 = L < R ? 1 : -1
  const bound = new Set(kidSides.filter(k => k !== 'same'))
  if (ownSide === 1 || ownSide === -1) flapSide = (-ownSide) as 1 | -1
  else if (bound.size === 1) flapSide = (-[...bound][0]) as 1 | -1
  return { seg, flapSide }
}

/**
 * The flap side a crease is allowed: the one away from what holds its panel in place (its own hinge, and the
 * folds and leaves its panel carries along that line), or null when either side may swing.
 */
export function freeSide(d: Derived, c: Crease): 1 | -1 | null {
  const P = d.panels.get(c.panel)
  if (!P) return null
  const len = dist(c.a, c.b) || 1
  const side = (h: Crease) => {
    const oa = sideOf(c.a, c.b, h.a) / len, ob = sideOf(c.a, c.b, h.b) / len
    const o = Math.abs(oa) > Math.abs(ob) ? oa : ob
    return Math.abs(o) > ON_LINE ? Math.sign(o) : 0
  }
  if (P.hinge) { const s = side(d.creases.get(P.hinge)!); if (s) return (-s) as 1 | -1 }
  // what else hangs off this panel, whichever side of the crease it's on now
  const flap = flapOf(c)
  const sides = new Set<number>()
  for (const C of d.list) {
    if (C.id === flap || !C.hinge) continue
    const h = d.creases.get(C.hinge)!
    if (h.panel !== P.id || (C.parent !== P.id && C.parent !== flap)) continue
    const s = side(h)
    if (s) sides.add(s)
  }
  return sides.size === 1 ? ((-[...sides][0]) as 1 | -1) : null
}

/** Fold `panel` along the line through A–B (see foldPlan). `d` is the paper as it was before this fold. */
export function applyFold(d: Derived, doc: ZineDoc, scene: ZineScene, panel: string, A: Vec2, B: Vec2): { doc: ZineDoc; crease: Crease } | { error: 'cross' | 'same' | 'tear' } | null {
  const plan = foldPlan(d, panel, A, B)
  if (!plan || 'error' in plan) return plan
  const dir: 1 | -1 = scene.facesCamera(panel) ? 1 : -1
  const crease: Crease = { id: uid('c'), panel, a: plan.seg[0], b: plan.seg[1], flapSide: plan.flapSide, dir, angle: 180 }
  const nd = { ...doc, creases: [...doc.creases, crease] }
  // last line of defence: a fold that would leave any paper joined to nothing is a tear, not a fold
  const loose = (x: ZineDoc) => floatingPieces(derive(x)).reduce((s, p) => s + area(p.region), 0)
  if (loose(nd) > loose(doc) + 0.01) return { error: 'tear' }
  return { doc: nd, crease }
}

/** Ghost region for a fold preview: the part of the panel that would swing (or why there's no fold there). */
export function foldPreview(d: Derived, scene: ZineScene, panel: string, A: Vec2, B: Vec2) {
  const P = d.panels.get(panel)
  const plan = P ? foldPlan(d, panel, A, B) : null
  if (!P || !plan || 'error' in plan) return plan
  const dir: 1 | -1 = scene.facesCamera(panel) ? 1 : -1
  const crease: Crease = { id: '__ghost', panel, a: plan.seg[0], b: plan.seg[1], flapSide: plan.flapSide, dir, angle: 180 }
  const hp: Polygon = halfPlanePoly(plan.seg[0], plan.seg[1], plan.flapSide)
  return { crease, region: intersect(P.region, hp), seg: plan.seg }
}

function halfPlanePoly(a: Vec2, b: Vec2, side: 1 | -1): Polygon {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  const nx = -uy * side * 500, ny = ux * side * 500
  const p0: Vec2 = [a[0] - ux * 500, a[1] - uy * 500], p1: Vec2 = [a[0] + ux * 500, a[1] + uy * 500]
  return [[p0, p1, [p1[0] + nx, p1[1] + ny], [p0[0] + nx, p0[1] + ny]]]
}

/** Preview region for the cut: the piece that would fall away (on the pressed panel only). */
export function cutPreview(scene: ZineScene, panel: string, path: Vec2[]) {
  const P = scene.d.panels.get(panel)
  if (!P || path.length < 2) return null
  const A = path[0], B = path[path.length - 1]
  if (pointInMulti(A, P.region) || pointInMulti(B, P.region)) return { kind: 'slit' as const, region: null }
  const { left, right } = pathClosures(path)
  const l = intersect(P.region, left), r = intersect(P.region, right)
  const al = area(l), ar = area(r)
  if (al < 0.05 || ar < 0.05) return null
  return { kind: 'through' as const, region: al < ar ? l : r }
}

export function addLeaf(scene: ZineScene, doc: ZineDoc, crease: Crease, length: number, angle: number): ZineDoc | null {
  const outline = leafOutline(scene.d, crease, length)
  if (!outline.length) return null
  const host = doc.surfaces.find(s => s.id === scene.d.panels.get(crease.panel)?.surface) ?? doc.surfaces[0]
  const id = uid('leaf')
  const surface: Surface = { id, kind: 'leaf', outline, frame: frameFor(outline), color: host.color, stock: host.stock }
  const hinge: Crease = { id: uid('c'), panel: crease.panel, a: crease.a, b: crease.b, flapSide: crease.flapSide, dir: crease.dir, angle, leaf: id }
  return { ...doc, surfaces: [...doc.surfaces, surface], creases: [...doc.creases, hinge] }
}

export function deleteCrease(doc: ZineDoc, id: string): ZineDoc {
  const c = doc.creases.find(x => x.id === id)
  if (!c) return doc
  // removing a crease also removes anything that hangs off its flap
  const gone = new Set<string>([id])
  const goneSurfaces = new Set<string>()
  if (c.leaf) goneSurfaces.add(c.leaf)
  let changed = !!c.leaf // only a leaf takes its sub-folds with it
  while (changed) {
    changed = false
    for (const k of doc.creases) {
      if (gone.has(k.id)) continue
      const parentGone = [...gone].some(g => {
        const gc = doc.creases.find(x => x.id === g)!
        return k.panel === flapOf(gc) || (gc.leaf && k.panel === gc.leaf)
      })
      if (parentGone) { gone.add(k.id); if (k.leaf) goneSurfaces.add(k.leaf); changed = true }
    }
  }
  // a plain crease's flap merges back into its parent; its sub-creases re-home onto the parent panel
  const creases = c.leaf
    ? doc.creases.filter(k => !gone.has(k.id))
    : doc.creases.filter(k => k.id !== id).map(k => (k.panel === flapOf(c) ? { ...k, panel: c.panel } : k))
  const keepIds = new Set(creases.map(k => k.id))
  return {
    ...doc,
    creases,
    surfaces: doc.surfaces.filter(s => !goneSurfaces.has(s.id)),
    objects: doc.objects.filter(o => !goneSurfaces.has(o.surface)),
    keyframes: doc.keyframes.map(k => ({ ...k, angles: Object.fromEntries(Object.entries(k.angles).filter(([cid]) => keepIds.has(cid))) })),
  }
}

export function updateCrease(doc: ZineDoc, id: string, p: Partial<Crease>): ZineDoc {
  return { ...doc, creases: doc.creases.map(c => (c.id === id ? { ...c, ...p } : c)) }
}

export { transformMulti }

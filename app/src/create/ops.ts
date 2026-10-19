import {
  area, clipLine, difference, intersect, pointInMulti, strokePolygon, transformMulti, uid, union,
} from '../lib/geom'
import { flapOf, frameFor, leafOutline, pathClosures, splitAreas } from '../lib/paper'
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
    return {
      doc: removeRegions(doc, d, keepSmall), alt: removeRegions(doc, d, keepBig),
      pieces: keepSmall, altPieces: keepBig, kind: 'through',
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
  return { doc: removeRegions(doc, d, cuts), alt: null, pieces: [], altPieces: [], kind: 'slit' }
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

/** Fold `panel` along the line through A–B (flat coords). The side with less paper folds toward the camera. */
export function applyFold(scene: ZineScene, doc: ZineDoc, panel: string, A: Vec2, B: Vec2, flip = false): { doc: ZineDoc; crease: Crease } | null {
  const P = scene.d.panels.get(panel)
  if (!P) return null
  const seg = clipLine(A, B, P.region)
  if (!seg) return null
  const { L, R } = splitAreas(P.region, seg[0], seg[1])
  if (Math.min(L, R) < 0.3) return null
  let flapSide: 1 | -1 = L < R ? 1 : -1
  if (flip) flapSide = (-flapSide) as 1 | -1
  const dir: 1 | -1 = scene.facesCamera(panel) ? 1 : -1
  const crease: Crease = { id: uid('c'), panel, a: seg[0], b: seg[1], flapSide, dir, angle: 180 }
  return { doc: { ...doc, creases: [...doc.creases, crease] }, crease }
}

/** Ghost region for a fold preview: the part of the panel that would swing. */
export function foldPreview(scene: ZineScene, panel: string, A: Vec2, B: Vec2) {
  const P = scene.d.panels.get(panel)
  if (!P) return null
  const seg = clipLine(A, B, P.region)
  if (!seg) return null
  const { L, R } = splitAreas(P.region, seg[0], seg[1])
  if (Math.min(L, R) < 0.3) return null
  const flapSide: 1 | -1 = L < R ? 1 : -1
  const dir: 1 | -1 = scene.facesCamera(panel) ? 1 : -1
  const crease: Crease = { id: '__ghost', panel, a: seg[0], b: seg[1], flapSide, dir, angle: 180 }
  const hp: Polygon = halfPlanePoly(seg[0], seg[1], flapSide)
  return { crease, region: intersect(P.region, hp), seg }
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

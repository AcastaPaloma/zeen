import type { Effect, EffectType } from './types'

export const EFFECTS: { type: EffectType; label: string }[] = [
  { type: 'scan', label: 'Dirty scan' },
  { type: 'photocopy', label: 'Photocopy' },
  { type: 'halftone', label: 'Halftone' },
  { type: 'dither', label: 'Dither' },
  { type: 'bleed', label: 'Ink bleed' },
  { type: 'grain', label: 'Grain' },
  { type: 'texture', label: 'Paper' },
  { type: 'riso', label: 'Riso' },
  { type: 'wear', label: 'Fold wear' },
]

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Apply a stack of effects to a canvas in place (CPU; used for scraps and filter previews). */
export function applyEffects(canvas: HTMLCanvasElement, effects: { type: EffectType; amount: number }[]) {
  if (!effects.length) return canvas
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const W = canvas.width, H = canvas.height
  for (const fx of effects) {
    const amt = Math.max(0, Math.min(1, fx.amount))
    if (amt <= 0) continue
    const img = ctx.getImageData(0, 0, W, H)
    const src = new Uint8ClampedArray(img.data)
    const d = img.data
    const at = (x: number, y: number, c: number) => {
      x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y))
      return src[(y * W + x) * 4 + c]
    }
    const cell = Math.max(4, Math.round(Math.min(W, H) / 70))
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let r = src[i], g = src[i + 1], b = src[i + 2]
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      let nr = r, ng = g, nb = b
      switch (fx.type) {
        case 'grain': { const n = (hash(x, y) - 0.5) * 70; nr += n; ng += n; nb += n; break }
        case 'dither': {
          const t = BAYER[(y % 4) * 4 + (x % 4)] * 255
          nr = r > t ? 255 : 0; ng = g > t ? 255 : 0; nb = b > t ? 255 : 0
          break
        }
        case 'halftone': {
          const s = cell, c = Math.SQRT1_2
          const rx = (x * c - y * c) / s, ry = (x * c + y * c) / s
          const fx2 = rx - Math.floor(rx) - 0.5, fy2 = ry - Math.floor(ry) - 0.5
          const dd = Math.hypot(fx2, fy2)
          const rad = Math.sqrt(1 - l) * 0.62
          const ink = dd < rad ? 1 : 0
          nr = ink ? r * 0.55 : 248; ng = ink ? g * 0.55 : 245; nb = ink ? b * 0.55 : 238
          break
        }
        case 'photocopy': {
          const n = hash(x >> 1, y >> 1)
          const t = l + (n - 0.5) * 0.15
          const v = t < 0.42 ? 20 : t > 0.58 ? 246 : 20 + (t - 0.42) / 0.16 * 226
          nr = v; ng = v * 0.99; nb = v * 0.97
          if (n > 0.996) nr = ng = nb = 25
          break
        }
        case 'scan': {
          const n = hash(x >> 1, y >> 1)
          const band = 10 * Math.sin(y * 0.05 + hash(1, y >> 5) * 6)
          nr = ((r * 0.75 + l * 255 * 0.25) * 1.02 - 128) * 1.15 + 132 + band
          ng = ((g * 0.75 + l * 255 * 0.25) - 128) * 1.15 + 130 + band
          nb = ((b * 0.75 + l * 255 * 0.25) * 0.94 - 128) * 1.15 + 124 + band
          if (n > 0.997) { nr *= 0.3; ng *= 0.3; nb *= 0.3 }
          break
        }
        case 'bleed': {
          const o = Math.max(1, Math.round(W / 300))
          let mr = r, mg = g, mb = b
          for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) {
            mr = Math.min(mr, at(x + dx, y + dy, 0)); mg = Math.min(mg, at(x + dx, y + dy, 1)); mb = Math.min(mb, at(x + dx, y + dy, 2))
          }
          nr = mr * 0.92; ng = mg * 0.92; nb = mb * 0.92
          break
        }
        case 'riso': {
          const o = Math.max(2, Math.round(W / 120))
          nr = Math.floor(at(x + o, y + (o >> 1), 0) / 64) * 64 + 32
          ng = Math.floor(g / 64) * 64 + 32
          nb = Math.floor(at(x - o, y - (o >> 1), 2) / 64) * 64 + 32
          break
        }
        case 'texture': {
          const n = hash(x >> 2, y >> 2) * 0.6 + hash(x, y) * 0.4
          const f = 1 - n * 0.16
          nr *= f; ng *= f * 0.99; nb *= f * 0.96
          break
        }
        case 'wear': {
          const ex = Math.min(x, W - 1 - x, y, H - 1 - y) / (Math.min(W, H) * 0.08)
          const w = Math.max(0, 1 - ex) * (0.5 + hash(x >> 2, y >> 2) * 0.5)
          nr += (250 - nr) * w; ng += (248 - ng) * w; nb += (242 - nb) * w
          break
        }
      }
      d[i] = r + (nr - r) * amt
      d[i + 1] = g + (ng - g) * amt
      d[i + 2] = b + (nb - b) * amt
    }
    ctx.putImageData(img, 0, 0)
  }
  return canvas
}

/** Summed effect amounts for a page (zine-wide + this page), for the paper shader. */
export function fxFor(effects: Effect[], pageKey: string | null) {
  const out: Record<EffectType, number> = { scan: 0, photocopy: 0, halftone: 0, dither: 0, bleed: 0, grain: 0, texture: 0, riso: 0, wear: 0 }
  for (const e of effects) {
    if (e.scope === 'zine' || (e.scope === 'page' && e.target === pageKey)) out[e.type] = Math.min(1, out[e.type] + e.amount)
  }
  return out
}

/** Flood-fill the background from the image border (one-tap cut out). */
export function cutout(canvas: HTMLCanvasElement, tol = 38) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const W = canvas.width, H = canvas.height
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const seen = new Uint8Array(W * H)
  // reference colour: average of the corners
  const corners = [0, W - 1, (H - 1) * W, H * W - 1]
  let rr = 0, gg = 0, bb = 0
  for (const c of corners) { rr += d[c * 4]; gg += d[c * 4 + 1]; bb += d[c * 4 + 2] }
  rr /= 4; gg /= 4; bb /= 4
  const stack: number[] = []
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x) }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1) }
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    seen[p] = 1
    const i = p * 4
    if (d[i + 3] < 10) { /* already clear */ } else {
      const dr = d[i] - rr, dg = d[i + 1] - gg, db = d[i + 2] - bb
      if (Math.sqrt(dr * dr + dg * dg + db * db) > tol) continue
    }
    d[i + 3] = 0
    const x = p % W, y = (p / W) | 0
    if (x > 0) stack.push(p - 1)
    if (x < W - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - W)
    if (y < H - 1) stack.push(p + W)
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// ---------------------------------------------------------------- shader

export const FX_GLSL = /* glsl */ `
uniform vec4 uFxA; // halftone, dither, grain, photocopy
uniform vec4 uFxB; // scan, riso, bleed, texture
uniform vec2 uTexSize;
float zhash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float zb2(vec2 a){ a = floor(a); return fract(a.x / 2. + a.y * a.y * .75); }
float zb4(vec2 a){ return zb2(.5 * a) * .25 + zb2(a); }
vec3 zfx(vec3 lin, vec2 uv) {
  if (dot(uFxA, vec4(1.)) + dot(uFxB, vec4(1.)) < 0.001) return lin;
  vec3 c = pow(max(lin, 0.), vec3(1. / 2.2));
  vec2 px = uv * uTexSize;
  if (uFxB.z > 0.) {
    vec2 o = 1.6 / uTexSize;
    vec3 m = min(min(texture2D(map, uv + vec2(o.x, 0.)).rgb, texture2D(map, uv - vec2(o.x, 0.)).rgb),
                 min(texture2D(map, uv + vec2(0., o.y)).rgb, texture2D(map, uv - vec2(0., o.y)).rgb));
    m = pow(max(m, 0.), vec3(1. / 2.2));
    c = mix(c, min(c, m) * .92, uFxB.z);
  }
  if (uFxB.y > 0.) {
    vec2 o = vec2(4., 2.) / uTexSize * (0.5 + uFxB.y);
    float r = pow(texture2D(map, uv + o).r, 1. / 2.2);
    float b = pow(texture2D(map, uv - o).b, 1. / 2.2);
    vec3 rs = floor(vec3(r, c.g, b) * 4.) / 4. + .125;
    c = mix(c, rs, uFxB.y);
  }
  float l = dot(c, vec3(.299, .587, .114));
  if (uFxA.w > 0.) {
    float n = zhash(floor(px * .5));
    float t = smoothstep(.42, .58, l + (n - .5) * .15);
    vec3 pc = vec3(t) * vec3(.98, .97, .95) + .02;
    if (n > .996) pc = vec3(.1);
    c = mix(c, pc, uFxA.w);
  }
  if (uFxB.x > 0.) {
    float n = zhash(floor(px / 2.) + 3.);
    float band = .04 * sin(px.y * .05 + zhash(vec2(floor(px.y / 40.), 1.)) * 6.);
    vec3 sc = mix(vec3(l), c, .75) * vec3(1.02, 1., .94) + band;
    sc = (sc - .5) * 1.15 + .52;
    if (n > .997) sc *= .3;
    c = mix(c, sc, uFxB.x);
  }
  if (uFxA.x > 0.) {
    float cell = max(5., uTexSize.x / 160.);
    vec2 r = mat2(.7071, -.7071, .7071, .7071) * px;
    vec2 g = fract(r / cell) - .5;
    float d = length(g);
    float rad = sqrt(max(0., 1. - l)) * .62;
    float ink = 1. - smoothstep(rad - .07, rad + .07, d);
    vec3 ht = mix(vec3(.97, .96, .93), c * .55, ink);
    c = mix(c, ht, uFxA.x);
  }
  if (uFxA.y > 0.) {
    float th = zb4(floor(px / 2.));
    c = mix(c, step(vec3(th), c), uFxA.y);
  }
  if (uFxA.z > 0.) c += (zhash(px) - .5) * .2 * uFxA.z;
  if (uFxB.w > 0.) {
    float n = zhash(floor(px / 3.)) * .6 + zhash(px) * .4;
    c *= 1. - n * .16 * uFxB.w;
  }
  return pow(clamp(c, 0., 1.), vec3(2.2));
}
`

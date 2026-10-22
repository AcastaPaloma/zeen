// Animated GIFs on the paper. Browsers only ever hand a canvas the first frame of a GIF <img>, so GIF scraps
// are decoded here into their composited frames, and compose draws whichever frame is due.

interface Frames { frames: HTMLCanvasElement[]; ends: number[]; total: number }

// decoded GIFs by src. Whatever shows one redraws at its animation rate anyway (ZineScene's loop), so a GIF
// simply starts moving on the next redraw once it's ready.
const cache = new Map<string, Frames | 'loading' | 'failed'>()

/** Is this image a GIF (an imported data URL or a .gif file)? */
export const isGifSrc = (src: string) => src.startsWith('data:image/gif') || /\.gif($|[?#])/i.test(src)

/** Which frame of `src` is showing `ms` into its loop: -1 until it has decoded (starting that off). */
export function gifFrameIndex(src: string, ms: number): number {
  const g = cache.get(src)
  if (g === undefined) { load(src); return -1 }
  if (g === 'loading' || g === 'failed') return -1
  if (g.frames.length === 1) return 0
  const t = ((ms % g.total) + g.total) % g.total
  let i = 0
  while (i < g.ends.length - 1 && t >= g.ends[i]) i++
  return i
}

/** The frame of `src` that's showing `ms` into its loop, and its index, or null until it has decoded. */
export function gifFrame(src: string, ms: number): { img: HTMLCanvasElement; i: number } | null {
  const i = gifFrameIndex(src, ms)
  const g = cache.get(src)
  return i < 0 || !g || typeof g === 'string' ? null : { img: g.frames[i], i }
}

function load(src: string) {
  cache.set(src, 'loading')
  fetch(src)
    .then(r => r.arrayBuffer())
    .then(buf => {
      const f = decode(new Uint8Array(buf))
      cache.set(src, f ?? 'failed')
    })
    .catch(() => cache.set(src, 'failed'))
}

/** Decode a GIF87a/89a into full-size frames with disposal applied. */
function decode(d: Uint8Array): Frames | null {
  const sig = String.fromCharCode(...d.subarray(0, 6))
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null
  const W = d[6] | (d[7] << 8), H = d[8] | (d[9] << 8)
  if (!W || !H) return null
  const lsd = d[10]
  let p = 13
  let gct: Uint8Array | null = null
  if (lsd & 0x80) { const n = 3 * (1 << ((lsd & 7) + 1)); gct = d.subarray(p, p + n); p += n }

  const canvas = new Uint8ClampedArray(W * H * 4) // the composited picture so far
  const frames: HTMLCanvasElement[] = []
  const ends: number[] = []
  let total = 0
  let delay = 0, disposal = 0, transparent = -1

  const readBlocks = () => {
    const parts: Uint8Array[] = []
    let len = 0
    while (p < d.length) {
      const n = d[p++]
      if (!n) break
      parts.push(d.subarray(p, p + n)); len += n; p += n
    }
    const out = new Uint8Array(len)
    let o = 0
    for (const part of parts) { out.set(part, o); o += part.length }
    return out
  }

  while (p < d.length) {
    const b = d[p++]
    if (b === 0x3b) break // trailer
    if (b === 0x21) { // extension
      const label = d[p++]
      if (label === 0xf9 && d[p] === 4) {
        const packed = d[p + 1]
        disposal = (packed >> 2) & 7
        delay = (d[p + 2] | (d[p + 3] << 8)) * 10
        transparent = packed & 1 ? d[p + 4] : -1
        p += 6 // size, 4 bytes, terminator
      } else readBlocks()
      continue
    }
    if (b !== 0x2c) break // not an image: stop at what we have
    const x = d[p] | (d[p + 1] << 8), y = d[p + 2] | (d[p + 3] << 8)
    const w = d[p + 4] | (d[p + 5] << 8), h = d[p + 6] | (d[p + 7] << 8)
    const packed = d[p + 8]
    p += 9
    let ct = gct
    if (packed & 0x80) { const n = 3 * (1 << ((packed & 7) + 1)); ct = d.subarray(p, p + n); p += n }
    const interlaced = !!(packed & 0x40)
    const minCode = d[p++]
    const pixels = lzw(minCode, readBlocks(), w * h)
    if (!ct) return null

    const before = disposal === 3 ? canvas.slice() : null
    // paint this frame's rectangle (rows reordered if interlaced)
    const rowOf = interlaced ? interlaceRows(h) : null
    for (let r = 0; r < h; r++) {
      const ty = y + (rowOf ? rowOf[r] : r)
      if (ty >= H) continue
      for (let c = 0; c < w; c++) {
        const tx = x + c
        if (tx >= W) continue
        const ci = pixels[r * w + c]
        if (ci === transparent) continue
        const o = (ty * W + tx) * 4
        canvas[o] = ct[ci * 3]; canvas[o + 1] = ct[ci * 3 + 1]; canvas[o + 2] = ct[ci * 3 + 2]; canvas[o + 3] = 255
      }
    }
    const f = document.createElement('canvas')
    f.width = W; f.height = H
    f.getContext('2d')!.putImageData(new ImageData(canvas.slice(), W, H), 0, 0)
    frames.push(f)
    // like browsers: very short delays play at 100ms
    total += delay < 20 ? 100 : delay
    ends.push(total)
    // get ready for the next frame
    if (disposal === 2) {
      for (let r = y; r < Math.min(H, y + h); r++) canvas.fill(0, (r * W + x) * 4, (r * W + Math.min(W, x + w)) * 4)
    } else if (disposal === 3 && before) canvas.set(before)
    delay = 0; disposal = 0; transparent = -1
  }
  return frames.length ? { frames, ends, total } : null
}

/** Source row for each output row of an interlaced image (passes start 0, 4, 2, 1 with steps 8, 8, 4, 2). */
function interlaceRows(h: number) {
  const rows: number[] = []
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let r = start; r < h; r += step) rows.push(r)
  return rows
}

/** GIF's variable-width LZW. */
function lzw(minCode: number, data: Uint8Array, count: number) {
  const MAX = 4096
  const out = new Uint8Array(count)
  const prefix = new Int16Array(MAX), suffix = new Uint8Array(MAX), stack = new Uint8Array(MAX + 1)
  const clear = 1 << minCode, eoi = clear + 1
  let size = minCode + 1, mask = (1 << size) - 1, next = clear + 2, old = -1, first = 0
  for (let c = 0; c < clear; c++) suffix[c] = c
  let datum = 0, bits = 0, top = 0, pi = 0, bi = 0
  while (pi < count) {
    if (top === 0) {
      if (bits < size) {
        if (bi >= data.length) break
        datum |= data[bi++] << bits; bits += 8
        continue
      }
      let code = datum & mask
      datum >>>= size; bits -= size
      if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; next = clear + 2; old = -1; continue }
      if (code === eoi || code > next) break
      if (old === -1) { stack[top++] = suffix[code]; old = code; first = code; continue }
      const inCode = code
      if (code === next) { stack[top++] = first; code = old }
      while (code > clear) { stack[top++] = suffix[code]; code = prefix[code] }
      first = suffix[code]
      stack[top++] = first
      if (next < MAX) {
        prefix[next] = old; suffix[next] = first; next++
        if ((next & mask) === 0 && next < MAX) { size++; mask += next }
      }
      old = inCode
    }
    out[pi++] = stack[--top]
  }
  return out
}

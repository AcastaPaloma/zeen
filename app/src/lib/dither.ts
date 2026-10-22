// One dither look for the whole app: ordered (Bayer 16×16), 2 px cells, three levels per colour
// channel, brightness 100%, contrast 1. Thumbnails are dithered on a canvas (ditherPixels); live
// screens behind sheets and pop-ups use the SVG filter #zeen-dither (DitherDefs in ui/kit.tsx).

export const DITHER_CELL = 2
export const DITHER_LEVELS = 3

/** 16×16 Bayer threshold map, values 0..255, row by row. */
export const BAYER16: number[] = (() => {
  let m = [[0]]
  while (m.length < 16) {
    const n = m.length
    const out = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0))
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = m[y][x] * 4
      out[y][x] = v
      out[y][x + n] = v + 2
      out[y + n][x] = v + 3
      out[y + n][x + n] = v + 1
    }
    m = out
  }
  return m.flat()
})()

/** Threshold in (0, 1) for cell (x, y). */
export const bayerAt = (x: number, y: number) => (BAYER16[(y & 15) * 16 + (x & 15)] + 0.5) / 256

/** Dither pixels in place, one cell per pixel (draw the image at 1/DITHER_CELL scale first). */
export function ditherPixels(img: ImageData) {
  const L = DITHER_LEVELS - 1
  const { data, width, height } = img
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const t = bayerAt(x, y)
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(L, Math.floor((data[i + c] / 255) * L + t)) * (255 / L)
  }
}

/** The threshold map as a 32-unit tile (16 cells of 2 units), for the SVG filter's feImage. */
export const BAYER_TILE = (() => {
  const hex = (v: number) => Math.round(((v + 0.5) / 256) * 255).toString(16).padStart(2, '0')
  const cells = BAYER16.map((v, i) => {
    const h = hex(v)
    return `<rect x="${(i % 16) * DITHER_CELL}" y="${Math.floor(i / 16) * DITHER_CELL}" width="${DITHER_CELL}" height="${DITHER_CELL}" fill="#${h}${h}${h}"/>`
  }).join('')
  const s = 16 * DITHER_CELL
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" shape-rendering="crispEdges">${cells}</svg>`)}`
})()

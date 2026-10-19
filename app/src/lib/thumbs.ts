import { useEffect, useState } from 'react'
import { ZineScene } from '../three/ZineScene'
import { loadFonts, PAPER, preload } from './assets'
import type { ZineDoc } from './types'

// One hidden scene renders static cover images for feeds and shelves, one zine at a time.

const cache = new Map<string, string>()
const waiting = new Map<string, ((u: string) => void)[]>()
const queue: ZineDoc[] = []
let scene: ZineScene | null = null
let busy = false
let fontsReady: Promise<void> | null = null

const keyOf = (z: ZineDoc) => `${z.id}:${z.updatedAt}`

function ensureScene() {
  if (scene) return scene
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:360px;height:480px;pointer-events:none;opacity:0;'
  document.body.appendChild(host)
  scene = new ZineScene(host, { mode: 'page', preserve: true })
  scene.handlesEnabled = false
  scene.animateContent = false
  scene.bgParallax = false
  scene.fitMargin = 1.04
  return scene
}

async function pump() {
  if (busy) return
  busy = true
  fontsReady ??= loadFonts()
  await fontsReady
  while (queue.length) {
    const z = queue.shift()!
    const key = keyOf(z)
    if (cache.has(key)) continue
    try {
      const srcs = z.objects.flatMap(o => (o.kind === 'scrap' ? [o.src] : []))
      await preload([...srcs, ...Object.values(PAPER)])
      const s = ensureScene()
      s.setDoc(z, { keepAngles: false, structure: true })
      const kf = z.keyframes[z.publish.coverKeyframe] ?? z.keyframes[0]
      if (kf) s.setAngles(kf.angles, { animate: false })
      s.resetView(false)
      s.invalidateAll()
      s.renderOnce()
      const url = cropToContent(s.canvas)
      cache.set(key, url)
      waiting.get(key)?.forEach(f => f(url))
      waiting.delete(key)
    } catch (e) { console.warn('thumb failed', e) }
    await new Promise(r => setTimeout(r, 16))
  }
  busy = false
}

/** Crop the transparent margin around the rendered zine so cards size to the zine itself. */
function cropToContent(src: HTMLCanvasElement) {
  const W = src.width, H = src.height
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0)
  const d = ctx.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (d[(y * W + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 <= x0 || y1 <= y0) return src.toDataURL('image/webp', 0.86)
  const pad = 2
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad)
  const out = document.createElement('canvas')
  out.width = x1 - x0; out.height = y1 - y0
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/webp', 0.86)
}

export function renderThumb(z: ZineDoc): Promise<string> {
  const key = keyOf(z)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  return new Promise(res => {
    const list = waiting.get(key) ?? []
    list.push(res)
    waiting.set(key, list)
    if (!queue.some(q => keyOf(q) === key)) queue.push(z)
    pump()
  })
}

/** Cover image for a zine card: a rendered 3D cover, falling back to the flat cover art while it renders. */
export function useThumb(z: ZineDoc | undefined) {
  const key = z ? keyOf(z) : ''
  const [url, setUrl] = useState<string | null>(() => (z ? cache.get(key) ?? null : null))
  useEffect(() => {
    if (!z) return
    const hit = cache.get(key)
    if (hit) { setUrl(hit); return }
    let alive = true
    renderThumb(z).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return url ?? z?.coverImage ?? null
}

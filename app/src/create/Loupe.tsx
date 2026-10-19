import { useEffect, useRef } from 'react'
import type { ZineScene } from '../three/ZineScene'

/** Magnifier above the finger so the endpoint is never hidden. Copies the WebGL frame right after it renders. */
export function Loupe({ scene, overlay, at }: { scene: ZineScene; overlay: HTMLCanvasElement | null; at: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pos = useRef(at)
  pos.current = at
  useEffect(() => {
    const size = 104, zoom = 2
    return scene.on('frame', () => {
      const c = ref.current
      if (!c) return
      const dpr = Math.min(2, window.devicePixelRatio)
      if (c.width !== size * dpr) { c.width = size * dpr; c.height = size * dpr }
      const ctx = c.getContext('2d')!
      const [x, y] = pos.current
      const src = scene.canvas
      const k = src.width / src.clientWidth
      const half = size / zoom / 2
      ctx.fillStyle = '#F6F6F6'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(src, (x - half) * k, (y - half) * k, half * 2 * k, half * 2 * k, 0, 0, c.width, c.height)
      if (overlay) {
        const ko = overlay.width / overlay.clientWidth
        ctx.drawImage(overlay, (x - half) * ko, (y - half) * ko, half * 2 * ko, half * 2 * ko, 0, 0, c.width, c.height)
      }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'
      ctx.lineWidth = dpr
      ctx.beginPath()
      ctx.moveTo(c.width / 2 - 6 * dpr, c.height / 2); ctx.lineTo(c.width / 2 + 6 * dpr, c.height / 2)
      ctx.moveTo(c.width / 2, c.height / 2 - 6 * dpr); ctx.lineTo(c.width / 2, c.height / 2 + 6 * dpr)
      ctx.stroke()
    })
  }, [scene, overlay])
  // sit above the finger, flip below near the top edge
  const above = at[1] > 170
  return (
    <canvas ref={ref} className="loupe" aria-hidden
      style={{ transform: `translate(${at[0] - 52}px, ${above ? at[1] - 150 : at[1] + 46}px)` }} />
  )
}

import { useEffect, useRef, type CSSProperties } from 'react'
import type { ZineDoc } from '../lib/types'
import { ZineScene, type CameraMode } from '../three/ZineScene'

/**
 * React wrapper around a ZineScene. The scene is created once; `doc` updates are pushed in.
 * Use `onScene` to grab the instance for imperative control (angles, view, input handlers).
 */
export function ZineView({ doc, mode, onScene, className = '', style, shadow = true, handles = true, keepAngles = true }: {
  doc: ZineDoc | null
  mode: CameraMode
  onScene?: (s: ZineScene | null) => void
  className?: string
  style?: CSSProperties
  shadow?: boolean
  handles?: boolean
  keepAngles?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ZineScene | null>(null)
  const cb = useRef(onScene)
  cb.current = onScene

  useEffect(() => {
    const s = new ZineScene(host.current!, { mode })
    if (shadow) s.el.classList.add('shadowed')
    s.handlesEnabled = handles
    scene.current = s
    if (import.meta.env.DEV) (window as unknown as { __scene: ZineScene }).__scene = s
    if (doc) s.setDoc(doc, { keepAngles })
    cb.current?.(s)
    return () => { cb.current?.(null); s.dispose(); scene.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (doc && scene.current) scene.current.setDoc(doc, { keepAngles }) }, [doc, keepAngles])
  useEffect(() => { scene.current?.setMode(mode) }, [mode])
  useEffect(() => { scene.current?.setHandlesEnabled(handles) }, [handles])

  return <div ref={host} className={`zine-view ${className}`} style={{ position: 'absolute', inset: 0, ...style }} />
}

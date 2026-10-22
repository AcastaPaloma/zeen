import { useLayoutEffect, useRef } from 'react'
import { haptic, sfx } from '../lib/feedback'
import { useApp, type PublishLanding as Landing } from '../lib/store'
import './publish-landing.css'

const SLAM_DURATION = 1160
const CONTACT = 0.64

/** Lives above routes so the cover survives the handoff from the editor to the profile. */
export function PublishLanding() {
  const landing = useApp(s => s.publishLanding)
  return landing ? <CoverLanding key={landing.id} landing={landing} /> : null
}

function CoverLanding({ landing }: { landing: Landing }) {
  const overlay = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLImageElement>(null)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useLayoutEffect(() => {
    const host = overlay.current!
    const device = host.parentElement!
    let frame = 0
    let motion: Animation | null = null
    const effects: Animation[] = []
    let impactTimer = 0
    let struck = false
    let destination: HTMLElement | null = null
    let disposed = false
    const started = performance.now()
    const finish = () => {
      if (disposed) return
      clearTimeout(impactTimer)
      if (useApp.getState().publishLanding === landing) {
        useApp.setState({ publishLanding: null })
        // Wait for React to reveal the real card before handing keyboard focus to it.
        requestAnimationFrame(() => {
          const state = useApp.getState()
          if (destination?.isConnected && state.homePage === 'profile' && state.stack.at(-1)?.name === 'home') destination.focus({ preventScroll: true })
        })
      }
    }
    const cancel = () => { motion?.cancel(); effects.forEach(a => a.cancel()); finish() }
    const strike = () => {
      if (disposed || struck || reduced) return
      struck = true
      host.dataset.phase = 'impact'
      sfx('stamp')
      haptic('firm')
    }

    const findTarget = () => {
      const state = useApp.getState()
      if (state.stack.at(-1)?.name !== 'home' || state.homePage !== 'profile') { finish(); return }
      const profile = device.querySelector<HTMLElement>('.home-page[aria-label="Your profile"] .pf[data-own-work]')
      const card = profile?.querySelector<HTMLElement>(`.zcard[data-zine="${CSS.escape(landing.id)}"]`)
      destination = card ?? null
      const target = card?.querySelector<HTMLImageElement>('img')
      if (!card || !target?.complete || !target.naturalWidth) {
        if (performance.now() - started < 1200) frame = requestAnimationFrame(findTarget)
        else finish()
        return
      }

      // Scroll only the profile, keeping the new cover and its section heading clear of the phone's safe area.
      const scroller = card.closest<HTMLElement>('.pf-scroll')!
      const bounds = device.getBoundingClientRect()
      const safeTop = parseFloat(getComputedStyle(device).getPropertyValue('--safe-top')) || 0
      scroller.scrollTop += card.getBoundingClientRect().top - bounds.top - safeTop - 56
      // The scroll updates column parallax on the next render; measure after it has settled.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!cover.current || !landing.cover) { finish(); return }
          const img = cover.current
          const rect = target.getBoundingClientRect()
          const w = target.offsetWidth, h = target.offsetHeight
          const x = rect.left + rect.width / 2 - bounds.left
          const y = rect.top + rect.height / 2 - bounds.top
          const dx = landing.from.x + landing.from.width / 2 - x
          const dy = landing.from.y + landing.from.height / 2 - y
          const scale = Math.min(landing.from.width / w, landing.from.height / h)
          const tilt = parseFloat(card.style.getPropertyValue('--tilt')) || 0
          const heroScale = Math.min(bounds.width * 0.67 / w, bounds.height * 0.43 / h)
          const hoverX = bounds.width / 2 - x
          const hoverY = Math.max(safeTop + h * heroScale / 2 + 30, bounds.height * 0.37) - y
          Object.assign(img.style, { left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px`, visibility: 'visible' })
          const pose = (tx: number, ty: number, angle: number, size: number, pitch = 0) =>
            `perspective(900px) translate3d(${tx}px, ${ty}px, 0) rotateX(${pitch}deg) rotateZ(${angle}deg) scale(${size})`
          const rest = pose(0, 0, tilt, 1)
          const settledShadow = 'drop-shadow(0 6px 10px rgba(0,0,0,.14)) drop-shadow(0 1px 2px rgba(0,0,0,.1))'
          img.style.transform = rest
          motion = img.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
            { transform: pose(dx, dy, -3, scale), filter: settledShadow, offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' },
            { transform: pose(hoverX, hoverY - 18, -9, heroScale, 12), filter: 'drop-shadow(0 34px 24px rgba(0,0,0,.26))', offset: 0.23, easing: 'ease-in-out' },
            // Hang in the air, creeping upward, before accelerating into the profile.
            { transform: pose(hoverX, hoverY - 30, -6, heroScale * 1.035, 9), filter: 'drop-shadow(0 42px 28px rgba(0,0,0,.24))', offset: 0.46, easing: 'cubic-bezier(.78,0,1,.4)' },
            { transform: pose(0, 4, tilt, 1.04), filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.3))', offset: CONTACT, easing: 'cubic-bezier(.16,1,.3,1)' },
            { transform: pose(0, -13, tilt + 1.5, 1.025, -3), filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.16))', offset: 0.75, easing: 'ease-in' },
            { transform: pose(0, 2, tilt - 0.35, 0.997), filter: settledShadow, offset: 0.88, easing: 'ease-out' },
            { transform: rest, filter: settledShadow, offset: 1 },
          ], { duration: reduced ? 120 : SLAM_DURATION, easing: 'linear', fill: 'forwards' })

          if (!reduced) {
            const contactAt = SLAM_DURATION * CONTACT
            const veil = host.querySelector<HTMLElement>('.publish-landing-veil')!
            const ring = host.querySelector<HTMLElement>('.publish-impact-ring')!
            const shadow = host.querySelector<HTMLElement>('.publish-contact-shadow')!
            Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${w + 32}px`, height: `${h + 32}px`, rotate: `${tilt}deg` })
            Object.assign(shadow.style, { left: `${x}px`, top: `${y + h / 2}px`, width: `${w * 1.2}px` })
            effects.push(veil.animate([
              { opacity: 0, offset: 0 }, { opacity: 1, offset: 0.2 },
              { opacity: 1, offset: 0.46 }, { opacity: 0, offset: CONTACT }, { opacity: 0, offset: 1 },
            ], { duration: SLAM_DURATION, easing: 'ease-in-out', fill: 'both' }))
            effects.push(ring.animate([
              { transform: 'translate(-50%, -50%) scale(.88)', opacity: 0 },
              { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.65, offset: 0.12 },
              { transform: 'translate(-50%, -50%) scale(1.28)', opacity: 0 },
            ], { duration: 360, delay: contactAt, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }))
            effects.push(shadow.animate([
              { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
              { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.28, offset: 0.1 },
              { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0 },
            ], { duration: 300, delay: contactAt, easing: 'ease-out', fill: 'both' }))
            effects.push(profile!.animate([
              { transform: 'translateY(0) scale(1)' },
              { transform: 'translateY(6px) scale(.992)', offset: 0.16 },
              { transform: 'translateY(-2px) scale(1.002)', offset: 0.48 },
              { transform: 'translateY(0) scale(1)' },
            ], { duration: 300, delay: contactAt, easing: 'ease-out' }))
            impactTimer = window.setTimeout(strike, contactAt)
          }
          motion.onfinish = () => { if (reduced) haptic('tap'); else strike(); finish() }
        })
      })
    }

    frame = requestAnimationFrame(findTarget)
    window.addEventListener('resize', cancel)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      clearTimeout(impactTimer)
      motion?.cancel()
      effects.forEach(a => a.cancel())
      window.removeEventListener('resize', cancel)
    }
  }, [landing, reduced])

  return (
    <div ref={overlay} className="publish-landing" role="status" aria-live="polite">
      <span className="publish-announcement">{landing.title} published to your zines.</span>
      <div className="publish-landing-veil" aria-hidden="true" />
      <div className="publish-contact-shadow" aria-hidden="true" />
      <div className="publish-impact-ring" aria-hidden="true" />
      {landing.cover && <img ref={cover} className="publish-landing-cover" src={landing.cover} alt="" draggable={false}
        style={{ left: landing.from.x, top: landing.from.y, width: landing.from.width, height: landing.from.height, visibility: reduced ? 'hidden' : undefined }} />}
    </div>
  )
}

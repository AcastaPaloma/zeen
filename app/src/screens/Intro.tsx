import { useMemo, useRef, useState } from 'react'
import { haptic, sfx } from '../lib/feedback'
import { uid } from '../lib/geom'
import { newDoc } from '../lib/paper'
import { ME } from '../lib/samples'
import { useApp } from '../lib/store'
import type { ScrapObj, Side, TextObj, ZineDoc } from '../lib/types'
import { Button } from '../ui/kit'
import { ZineView } from '../ui/ZineView'
import type { ZineScene } from '../three/ZineScene'
import './social.css'

const text = (t: string, side: Side, x: number, y: number, size: number, font: TextObj['font'], color: string, p: Partial<TextObj> = {}): TextObj => ({
  id: uid('o'), kind: 'text', surface: 'sheet', side, name: t.slice(0, 16), text: t, font, color, style: 'plain', align: 'center',
  x, y, rot: 0, scale: 1, size, seed: 7 + t.length, ...p,
})
const sticker = (src: string, side: Side, x: number, y: number, w: number, h: number, rot = 0): ScrapObj => ({
  id: uid('o'), kind: 'scrap', surface: 'sheet', side, name: 'Sticker', src, x, y, rot, scale: 1, w, h, sticker: 0.16, shadow: true,
})

/** The three-panel intro, made as a real trifold zine: the reader learns the glowing dot by using it. */
function introDoc(): ZineDoc {
  const d = newDoc({ author: ME, template: 'trifold', color: '#FBFAF6' })
  d.id = 'z_intro'
  const f = d.surfaces[0].frame
  const pw = f.w / 3, ph = f.h
  // page coords: front panels left→right at x 0,pw,2pw; backs are mirrored (left door's back at 2pw)
  const cx = (i: number) => i * pw + pw / 2
  d.objects = [
    // cover: the left door's back
    text('Zeen', 'back', cx(2), ph * 0.36, 3.4, 'script', '#1A1A1A', { rot: -0.06 }),
    text('a zine about\nmaking zines', 'back', cx(2), ph * 0.58, 0.8, 'typewriter', '#555'),
    text('drag the light →', 'back', cx(2), ph * 0.86, 0.75, 'marker', '#FF4934', { rot: 0.03 }),
    // revealed when the left door opens
    text('1', 'front', cx(0), ph * 0.18, 2.4, 'grotesk', '#FF4934'),
    text('Make zines\nthat move.', 'front', cx(0), ph * 0.42, 1.25, 'grotesk', '#1A1A1A'),
    text('ink that boils, stickers\nthat wiggle, a soundtrack.', 'front', cx(0), ph * 0.62, 0.55, 'typewriter', '#555'),
    sticker('/assets/scraps/hamster-drums.webp', 'front', cx(0), ph * 0.82, 4, 4, -0.08),
    // the right door's back, seen next
    text('2', 'back', cx(0), ph * 0.18, 2.4, 'grotesk', '#245AE2'),
    text('Fold, cut,\ncollage.', 'back', cx(0), ph * 0.42, 1.25, 'grotesk', '#1A1A1A'),
    text('real paper physics,\nmade for your thumb.', 'back', cx(0), ph * 0.62, 0.55, 'typewriter', '#555'),
    sticker('/assets/scraps/bird-blue.webp', 'back', cx(0), ph * 0.82, 3.6, 4.2, 0.1),
    // fully open: centre + right panel fronts
    text('3', 'front', cx(1), ph * 0.18, 2.4, 'grotesk', '#4BA334'),
    text('Share with\nyour scene.', 'front', cx(1), ph * 0.42, 1.25, 'grotesk', '#1A1A1A'),
    text('communities, reply zines,\na shelf of your favourites.', 'front', cx(1), ph * 0.62, 0.55, 'typewriter', '#555'),
    sticker('/assets/stickers/glitter-heart.webp', 'front', cx(1), ph * 0.83, 3.2, 3.2, -0.2),
    text('ready?', 'front', cx(2), ph * 0.4, 2.2, 'script', '#FF4934', { rot: -0.08 }),
    text('make one\ntonight', 'front', cx(2), ph * 0.66, 1.1, 'ransom', '#111'),
  ]
  return d
}

/** The ghost-finger hint goes on the handle the reader can actually reach (the top door). */
function hintOn(s: ZineScene, crease: string) {
  s.overlay.querySelectorAll('.fold-handle.hint').forEach(e => e.classList.remove('hint'))
  s.overlay.querySelector(`.fold-handle[data-crease="${crease}"]`)?.classList.add('hint')
}

export default function Intro(_: { active: boolean }) {
  const doc = useMemo(introDoc, [])
  const back = useApp(s => s.back)
  const setSeenIntro = useApp(s => s.setSeenIntro)
  const [step, setStep] = useState(0) // how many doors are open
  const scene = useRef<ZineScene | null>(null)

  const finish = () => {
    setSeenIntro()
    haptic('tap'); sfx('stamp')
    back()
  }

  const onScene = (s: ZineScene | null) => {
    scene.current = s
    if (!s) return
    // the engine's default hint picks the first handle; here we point at the reachable one ourselves
    s.showHandleHint = false
    s.bgParallax = true
    s.fitMargin = 1.3
    s.syncHandles()
    setTimeout(() => hintOn(s, 'c2'), 60)
    // a released door always lands fully open or closed, so the reveal reads clearly
    s.on('handle-up', (id: string) => { s.setAngle(id, s.angle(id) < 110 ? 0 : 180) })
    // the zine folds itself up on arrival; only start counting once it's fully closed
    let armed = false
    s.on('angle', () => {
      if (!armed) { armed = doc.creases.every(c => s.angle(c.id) > 170); if (armed) hintOn(s, 'c2'); return }
      const open = doc.creases.filter(c => s.angle(c.id) < 12).length
      setStep(prev => {
        if (open > prev) {
          haptic('medium'); sfx('crease')
          // point at the next light once the first door is open
          if (open === 1) setTimeout(() => hintOn(s, 'c1'), 500)
        }
        return Math.max(prev, open)
      })
    })
  }

  const done = step >= doc.creases.length
  return (
    <div className="intro dots">
      <ZineView doc={doc} mode="page" onScene={onScene} keepAngles />
      <div className="intro-top">
        <span className="intro-logo">Zeen</span>
        <button className="intro-skip" onClick={finish}>Skip</button>
      </div>
      <div className="intro-bottom">
        <div className="intro-steps" aria-hidden>
          {[0, 1, 2].map(i => <span key={i} className={i === Math.min(step, 2) ? 'on' : ''} />)}
        </div>
        {done
          ? <Button className="intro-start" onClick={finish}>Start making</Button>
          : <p className="intro-hint">{step === 0 ? 'drag the glowing light to unfold' : 'one more — find the next light'}</p>}
      </div>
    </div>
  )
}

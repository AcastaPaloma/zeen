// Haptics + soft paper sounds, all synthesized. Follows an in-app mute toggle.

let muted = false
try { muted = localStorage.getItem('zeen.muted') === '1' } catch { /* private mode */ }
export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem('zeen.muted', m ? '1' : '0') } catch { /* ignore */ }
}

type Haptic = 'tick' | 'tap' | 'medium' | 'firm' | 'double'
const PATTERNS: Record<Haptic, number | number[]> = { tick: 6, tap: 12, medium: 18, firm: 28, double: [14, 60, 14] }

export function haptic(kind: Haptic = 'tick') {
  try { navigator.vibrate?.(PATTERNS[kind]) } catch { /* unsupported */ }
}

let ctx: AudioContext | null = null
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function noiseBuffer(ac: AudioContext, dur: number) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function burst(opts: { dur: number; freq: number; q: number; gain: number; type?: BiquadFilterType; attack?: number; at?: number }) {
  const ac = audio()
  const t0 = ac.currentTime + (opts.at ?? 0)
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, opts.dur)
  const f = ac.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.frequency.value = opts.freq
  f.Q.value = opts.q
  const g = ac.createGain()
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.004))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  src.connect(f).connect(g).connect(ac.destination)
  src.start(t0)
  src.stop(t0 + opts.dur + 0.02)
}

export type Sfx = 'snip' | 'crease' | 'click' | 'slap' | 'rustle' | 'stamp' | 'pop'

export function sfx(kind: Sfx) {
  if (muted) return
  try {
    switch (kind) {
      case 'snip':
        burst({ dur: 0.05, freq: 4200, q: 2.5, gain: 0.35 })
        burst({ dur: 0.07, freq: 2600, q: 3, gain: 0.25, at: 0.06 })
        break
      case 'crease':
        burst({ dur: 0.22, freq: 1400, q: 0.8, gain: 0.22, attack: 0.03 })
        burst({ dur: 0.06, freq: 900, q: 4, gain: 0.18, at: 0.18 })
        break
      case 'click':
        burst({ dur: 0.035, freq: 2000, q: 6, gain: 0.4 })
        break
      case 'slap':
        burst({ dur: 0.12, freq: 700, q: 1.2, gain: 0.5 })
        burst({ dur: 0.05, freq: 3000, q: 2, gain: 0.2 })
        break
      case 'rustle':
        burst({ dur: 0.35, freq: 2500, q: 0.5, gain: 0.08, attack: 0.08 })
        break
      case 'stamp':
        burst({ dur: 0.18, freq: 220, q: 1, gain: 0.7, type: 'lowpass' })
        burst({ dur: 0.05, freq: 1800, q: 2, gain: 0.25 })
        break
      case 'pop':
        burst({ dur: 0.05, freq: 1200, q: 8, gain: 0.25 })
        break
    }
  } catch { /* audio blocked until first gesture */ }
}

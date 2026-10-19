import { trackById, type Track } from './assets'
import { audio, isMuted } from './feedback'
import { rng } from './geom'

// A tiny step sequencer. Each track gets a deterministic groove from its mood, tempo and key,
// so a zine's soundtrack plays the same for every reader.

type Listener = (s: MusicState) => void
export interface MusicState { track: string | null; playing: boolean; muted: boolean }

const SCALES = { punk: [0, 3, 5, 7, 10], jazz: [0, 2, 3, 5, 7, 9, 10], indie: [0, 2, 4, 7, 9], dream: [0, 4, 7, 11, 14], riot: [0, 3, 5, 6, 7, 10] }

class Music {
  state: MusicState = { track: null, playing: false, muted: isMuted() }
  private listeners = new Set<Listener>()
  private master: GainNode | null = null
  private timer = 0
  private step = 0
  private nextTime = 0
  private pattern: { kick: number[]; snare: number[]; hat: number[]; bass: number[]; chord: number[][] } | null = null
  private track: Track | null = null
  private volume = 0.7
  private stopAt = 0
  private taps = new Set<AudioNode>()
  private comp: DynamicsCompressorNode | null = null

  /** Route the soundtrack into another node too (e.g. a MediaStream destination for video export). */
  addTap(node: AudioNode) { this.taps.add(node); this.comp?.connect(node) }
  removeTap(node: AudioNode) { this.taps.delete(node); try { this.comp?.disconnect(node) } catch { /* not connected */ } }

  subscribe(fn: Listener) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach(f => f(this.state)) }

  play(id: string, opts: { volume?: number; preview?: number; start?: number } = {}) {
    const t = trackById(id)
    if (!t) return
    const ac = audio()
    this.stop(false)
    this.track = t.track
    this.volume = opts.volume ?? this.volume
    this.master = ac.createGain()
    this.master.gain.value = 0
    this.master.gain.linearRampToValueAtTime(this.state.muted ? 0 : this.volume * 0.5, ac.currentTime + 0.6)
    const comp = ac.createDynamicsCompressor()
    this.master.connect(comp).connect(ac.destination)
    this.comp = comp
    for (const t of this.taps) comp.connect(t)
    this.pattern = makePattern(t.track)
    this.step = Math.floor((opts.start ?? 0) * (t.track.bpm / 60) * 4) % 64
    this.nextTime = ac.currentTime + 0.08
    this.stopAt = opts.preview ? ac.currentTime + opts.preview : 0
    this.state = { ...this.state, track: id, playing: true }
    this.emit()
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stop(emit = true) {
    clearInterval(this.timer)
    if (this.master) {
      const ac = audio()
      const g = this.master
      g.gain.cancelScheduledValues(ac.currentTime)
      g.gain.setValueAtTime(g.gain.value, ac.currentTime)
      g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.25)
      setTimeout(() => g.disconnect(), 400)
      this.master = null
    }
    if (emit) { this.state = { ...this.state, playing: false }; this.emit() }
  }

  toggle(id: string) { if (this.state.playing && this.state.track === id) this.stop(); else this.play(id) }

  setMuted(m: boolean) {
    this.state = { ...this.state, muted: m }
    if (this.master) this.master.gain.value = m ? 0 : this.volume * 0.5
    this.emit()
  }
  setVolume(v: number) { this.volume = v; if (this.master && !this.state.muted) this.master.gain.value = v * 0.5 }

  private schedule() {
    const ac = audio()
    if (!this.track || !this.pattern || !this.master) return
    if (this.stopAt && ac.currentTime > this.stopAt) { this.stop(); return }
    const spb = 60 / this.track.bpm / 4
    while (this.nextTime < ac.currentTime + 0.12) {
      this.voice(this.step % 64, this.nextTime, spb)
      this.nextTime += spb * (this.track.mood === 'jazz' && this.step % 2 === 0 ? 1.18 : this.track.mood === 'jazz' ? 0.82 : 1)
      this.step++
    }
  }

  private voice(s: number, t: number, spb: number) {
    const ac = audio(), out = this.master!, p = this.pattern!, tr = this.track!
    const root = 110 * Math.pow(2, tr.key / 12)
    if (p.kick[s]) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      g.gain.setValueAtTime(0.9 * p.kick[s], t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25)
    }
    if (p.snare[s]) noise(ac, out, t, 0.14, 1800, 0.45 * p.snare[s], 'bandpass')
    if (p.hat[s]) noise(ac, out, t, 0.03, 8000, 0.14 * p.hat[s], 'highpass')
    if (p.bass[s] >= 0) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter()
      o.type = tr.mood === 'jazz' || tr.mood === 'dream' ? 'triangle' : 'sawtooth'
      o.frequency.value = root / 2 * Math.pow(2, p.bass[s] / 12)
      f.type = 'lowpass'; f.frequency.value = tr.mood === 'punk' ? 900 : 500
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8)
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + spb * 2)
    }
    const ch = p.chord[s]
    if (ch.length) {
      for (const n of ch) {
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter()
        o.type = tr.mood === 'punk' || tr.mood === 'riot' ? 'square' : 'sine'
        o.frequency.value = root * Math.pow(2, n / 12)
        o.detune.value = (Math.random() - 0.5) * 12
        f.type = 'lowpass'; f.frequency.value = tr.mood === 'punk' ? 1600 : 1200
        const len = tr.mood === 'dream' || tr.mood === 'jazz' ? spb * 7 : spb * 3
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + len)
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + len + 0.05)
      }
    }
  }
}

function noise(ac: AudioContext, out: AudioNode, t: number, dur: number, freq: number, gain: number, type: BiquadFilterType) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource(); src.buffer = b
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.01)
}

function makePattern(t: Track) {
  const r = rng(hashStr(t.id))
  const sc = SCALES[t.mood]
  const kick = new Array(64).fill(0), snare = new Array(64).fill(0), hat = new Array(64).fill(0)
  const bass = new Array(64).fill(-1), chord: number[][] = Array.from({ length: 64 }, () => [])
  const prog = [0, sc[Math.floor(r() * sc.length)], sc[Math.floor(r() * sc.length)], sc[2 % sc.length]]
  for (let s = 0; s < 64; s++) {
    const beat = s % 16, bar = Math.floor(s / 16), deg = prog[bar]
    switch (t.mood) {
      case 'punk': case 'riot':
        if (beat % 8 === 0 || (beat === 10 && r() < 0.5)) kick[s] = 1
        if (beat % 8 === 4) snare[s] = 1
        if (beat % 2 === 0) hat[s] = 0.8
        if (beat % 2 === 0) bass[s] = deg
        if (beat % 4 === 0) chord[s] = [deg + 12, deg + 19]
        break
      case 'jazz':
        if (beat === 0 || beat === 10) kick[s] = 0.5
        if (beat % 4 === 2 && r() < 0.6) snare[s] = 0.35
        if (beat % 4 === 0 || beat % 4 === 3) hat[s] = 0.6
        if (beat % 4 === 0) bass[s] = deg + sc[Math.floor(r() * sc.length)] % 12
        if (beat === 0 || (beat === 6 && r() < 0.5)) chord[s] = [deg + 12, deg + 16, deg + 19, deg + 23]
        break
      case 'indie':
        if (beat === 0 || beat === 8 || (beat === 11 && r() < 0.4)) kick[s] = 0.8
        if (beat === 4 || beat === 12) snare[s] = 0.8
        if (beat % 2 === 0) hat[s] = 0.5
        if (beat % 4 === 0) bass[s] = deg
        if (beat % 8 === 0) chord[s] = [deg + 12, deg + 16, deg + 19]
        break
      case 'dream':
        if (beat === 0) kick[s] = 0.5
        if (beat === 8 && r() < 0.5) snare[s] = 0.25
        if (beat % 4 === 2) hat[s] = 0.3
        if (beat === 0 || beat === 8) bass[s] = deg
        if (beat === 0) chord[s] = [deg + 12, deg + 16, deg + 19, deg + 23]
        if (beat % 4 === 2 && r() < 0.5) chord[s] = [deg + 24 + sc[Math.floor(r() * sc.length)]]
        break
    }
  }
  return { kick, snare, hat, bass, chord }
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

/** Deterministic waveform bars for scrubbers. */
export function waveform(id: string, n = 64) {
  const r = rng(hashStr(id) + 1)
  const out: number[] = []
  let v = 0.5
  for (let i = 0; i < n; i++) { v = Math.max(0.12, Math.min(1, v + (r() - 0.5) * 0.5)); out.push(v * (0.7 + 0.3 * Math.sin(i / 5))) }
  return out
}

export const music = new Music()

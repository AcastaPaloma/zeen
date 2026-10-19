import type { TransitionFeel } from '../lib/types'

export const FEELS: Record<TransitionFeel, { k: number; c: number }> = {
  snappy: { k: 260, c: 24 },
  gentle: { k: 90, c: 18 },
  floppy: { k: 160, c: 9 },
}

/** Damped spring toward a target. Paper-weighted: slight overshoot by default. */
export class Spring {
  x: number
  v = 0
  target: number
  k: number
  c: number
  constructor(x: number, k = 260, c = 24) { this.x = x; this.target = x; this.k = k; this.c = c }
  set(x: number) { this.x = x; this.target = x; this.v = 0 }
  to(t: number, feel?: { k: number; c: number }) { this.target = t; if (feel) { this.k = feel.k; this.c = feel.c } }
  step(dt: number) {
    // semi-implicit Euler in small substeps for stability at low frame rates
    const n = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - this.target) - this.c * this.v
      this.v += a * h
      this.x += this.v * h
    }
    if (Math.abs(this.x - this.target) < 0.01 && Math.abs(this.v) < 0.05) { this.x = this.target; this.v = 0 }
  }
  get done() { return this.x === this.target && this.v === 0 }
}

export const easeOutBack = (t: number) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
export const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

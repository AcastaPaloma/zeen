import { create } from 'zustand'

/**
 * Case-study explorations: two earlier takes on cutting and folding, shown in place of the final one.
 * 0 is the app as it is; 1 and 2 open an exploration over it (Explorations.tsx).
 */
export type Exploration = 0 | 1 | 2

export const useExploration = create<{ which: Exploration; show: (w: Exploration) => void }>(set => ({
  which: 0,
  show: which => set({ which }),
}))

export const EXPLORATIONS: { n: Exploration; title: string; name: string; idea: string }[] = [
  { n: 0, title: 'Show final', name: 'Draw on the paper', idea: 'Draw a line straight on the paper. It lands on the page on top, and a fold always swings the free side.' },
  { n: 1, title: 'Show exploration 1', name: 'Measured', idea: 'Pick an edge, dial in a distance and an angle, then press the button. Every fold exact and repeatable.' },
  { n: 2, title: 'Show exploration 2', name: 'Dot to dot', idea: 'Tap a dot on the edge of the paper, then another, and choose Cut or Fold. One tool for both.' },
]

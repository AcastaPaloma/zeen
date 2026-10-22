import { create } from 'zustand'

/**
 * Case-study explorations: earlier takes on cutting and folding, and on reading a zine, shown in place of the
 * final ones. null is the app as it is; anything else opens that exploration over it (Explorations.tsx).
 */
export type Exploration = 'cut1' | 'cut2' | 'read1' | 'read2' | 'com1' | 'com2' | null

/** The site shows just the phone. The explorations come back with ?explore on the address, for the case study. */
export const EXPLORATIONS_ON = new URLSearchParams(window.location.search).has('explore')

export const useExploration = create<{ which: Exploration; show: (w: Exploration) => void }>(set => ({
  which: null,
  show: which => set({ which }),
}))

export interface ExplorationInfo { id: Exploration; title: string; name: string; idea: string }

export const FINAL: ExplorationInfo = { id: null, title: 'Show final', name: 'The app as designed', idea: '' }

export const GROUPS: { title: string; items: ExplorationInfo[] }[] = [
  {
    title: 'Cut & fold',
    items: [
      { id: 'cut1', title: 'Show exploration 1', name: 'Measured', idea: 'Pick an edge, dial in a distance and an angle, then press the button. Every fold exact and repeatable.' },
      { id: 'cut2', title: 'Show exploration 2', name: 'Dot to dot', idea: 'Point at an edge and a glowing dot appears. Click to drop it, drop a second, then choose Cut or Fold.' },
    ],
  },
  {
    title: 'Reading',
    items: [
      { id: 'read1', title: 'Show exploration 1', name: 'Page by page', idea: 'Every page laid out flat in a swipeable carousel, like a photo post. Quick to flip through, and familiar.' },
      { id: 'read2', title: 'Show exploration 2', name: 'Tap through', idea: 'Like stories: the zine unfolds a step at a time on its own. Tap right for the next fold, left to go back, hold to pause.' },
    ],
  },
  {
    title: 'Communities',
    items: [
      { id: 'com1', title: 'Show concept 1', name: 'Start a community', idea: 'A community starts like a zine: pick its look and rhythm, write the first prompt and a charter. It opens once three founders sign.' },
      { id: 'com2', title: 'Show concept 2', name: 'Keep it going', idea: "A host's corner that keeps the group making: a chain zine in motion, a vote on the next prompt, swap partners and a monthly anthology." },
    ],
  },
]

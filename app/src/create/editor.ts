import { create } from 'zustand'
import type { CutStyle } from '../lib/paper'
import { useApp, type CreateStep } from '../lib/store'
import type { InkTool, ZineDoc, ZObject } from '../lib/types'

export interface HistoryEntry { doc: ZineDoc; label: string; at: number }

export interface InkSettings {
  tool: InkTool
  color: string
  size: Record<InkTool, number>
  opacity: number
  jitter: number
  boil: boolean
  boilStrength: number
  boilSpeed: 2 | 3
  eraseMode: 'stroke' | 'area'
}

interface EditorState {
  doc: ZineDoc | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  label: string
  step: CreateStep
  selected: string | null
  cut: { style: CutStyle; roughness: number; ruler: boolean; snap: boolean; topOnly: boolean }
  ink: InkSettings
  load(doc: ZineDoc, step?: CreateStep): void
  /** Replace the doc and record an undo step. */
  commit(next: ZineDoc, label: string): void
  /** Replace the doc without an undo step (live drags); call commit when the gesture ends. */
  live(next: ZineDoc): void
  /** Patch objects without an undo step. */
  patchObject(id: string, p: Partial<ZObject>): void
  undo(): void
  redo(): void
  jump(i: number): void
  setStep(s: CreateStep): void
  select(id: string | null): void
  setCut(p: Partial<EditorState['cut']>): void
  setInk(p: Partial<InkSettings>): void
}

let base: ZineDoc | null = null // doc at the start of a live gesture

const save = (d: ZineDoc) => useApp.getState().saveZine(d)

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  label: 'Start',
  step: 'cut',
  selected: null,
  cut: { style: 'straight', roughness: 15, ruler: false, snap: true, topOnly: false },
  ink: {
    tool: 'pen', color: '#1A1A1A', size: { pencil: 0.12, pen: 0.1, marker: 0.32, eraser: 0.6 },
    opacity: 1, jitter: 0.1, boil: false, boilStrength: 0.5, boilSpeed: 2, eraseMode: 'area',
  },

  load(doc, step) {
    base = null
    set({ doc, past: [], future: [], label: 'Start', step: step ?? 'cut', selected: null })
  },
  commit(next, label) {
    const prev = base ?? get().doc
    base = null
    if (!prev) { set({ doc: next }); return }
    const entry: HistoryEntry = { doc: prev, label: get().label, at: Date.now() }
    set(s => ({ doc: next, past: [...s.past, entry].slice(-150), future: [], label }))
    save(next)
  },
  live(next) {
    if (!base) base = get().doc
    set({ doc: next })
  },
  patchObject(id, p) {
    const d = get().doc
    if (!d) return
    if (!base) base = d
    set({ doc: { ...d, objects: d.objects.map(o => (o.id === id ? ({ ...o, ...p } as ZObject) : o)) } })
  },
  undo() {
    const { past, doc, label } = get()
    if (!past.length || !doc) return
    base = null
    const e = past[past.length - 1]
    set(s => ({ doc: e.doc, past: s.past.slice(0, -1), future: [{ doc, label, at: Date.now() }, ...s.future], label: e.label }))
    save(e.doc)
    useApp.getState().showToast(`Undo: ${label}`, undefined, 1200)
  },
  redo() {
    const { future, doc, label } = get()
    if (!future.length || !doc) return
    base = null
    const e = future[0]
    set(s => ({ doc: e.doc, future: s.future.slice(1), past: [...s.past, { doc, label, at: Date.now() }], label: e.label }))
    save(e.doc)
    useApp.getState().showToast(`Redo: ${e.label}`, undefined, 1200)
  },
  jump(i) {
    // i indexes into [...past, current]
    const { past, future, doc, label } = get()
    if (!doc || i < 0 || i >= past.length) return
    const all = [...past, { doc, label, at: Date.now() }, ...future]
    const target = all[i]
    set({ doc: target.doc, past: all.slice(0, i), future: all.slice(i + 1), label: target.label })
    save(target.doc)
  },
  setStep(step) { set({ step, selected: null }) },
  select(id) { set({ selected: id }) },
  setCut(p) { set(s => ({ cut: { ...s.cut, ...p } })) },
  setInk(p) { set(s => ({ ink: { ...s.ink, ...p } })) },
}))

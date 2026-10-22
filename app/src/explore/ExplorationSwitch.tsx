import { FINAL, GROUPS, useExploration, type ExplorationInfo } from './state'
import './explore.css'

/** Buttons beside the phone mockup (wide screens only) that swap a screen for one of its explorations. */
export function ExplorationSwitch() {
  const which = useExploration(s => s.which)
  const show = useExploration(s => s.show)
  const btn = (e: ExplorationInfo) => (
    <button key={e.id ?? 'final'} className={`xs-btn ${which === e.id ? 'on' : ''}`} aria-pressed={which === e.id} onClick={() => show(e.id)}>
      <b>{e.title}</b>
      <small>{e.name}</small>
      {e.idea && <span>{e.idea}</span>}
    </button>
  )
  return (
    <aside className="explore-switch" aria-label="Explorations">
      {btn(FINAL)}
      {GROUPS.map(g => (
        <section key={g.title} className="xs-group">
          <h2>{g.title}</h2>
          {g.items.map(btn)}
        </section>
      ))}
    </aside>
  )
}

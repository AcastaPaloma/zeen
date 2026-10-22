import { EXPLORATIONS, useExploration } from './state'
import './explore.css'

/** Buttons beside the phone mockup (wide screens only) that swap the cut and fold screen for an exploration. */
export function ExplorationSwitch() {
  const which = useExploration(s => s.which)
  const show = useExploration(s => s.show)
  return (
    <aside className="explore-switch" aria-label="Cut and fold explorations">
      <h2>Cut &amp; fold</h2>
      {EXPLORATIONS.map(e => (
        <button key={e.n} className={`xs-btn ${which === e.n ? 'on' : ''}`} aria-pressed={which === e.n} onClick={() => show(e.n)}>
          <b>{e.title}</b>
          <small>{e.name}</small>
          <span>{e.idea}</span>
        </button>
      ))}
    </aside>
  )
}

import { useRef } from 'react'
import { haptic } from '../lib/feedback'
import { useApp } from '../lib/store'
import { Icon } from './Icon'

/** Home / + / Profile, with the search pull-up tab riding on top (home only). */
export function BottomNav({ current, search = true }: { current: 'home' | 'profile'; search?: boolean }) {
  const tab = useApp(s => s.tab)
  const setSearchOpen = useApp(s => s.setSearchOpen)
  const start = useRef<number | null>(null)
  return (
    <nav className="bottom-nav" aria-label="Main">
      {search && (
        <button className="bn-search" aria-label="Search Zeen"
          onClick={() => setSearchOpen(true)}
          onPointerDown={e => { start.current = e.clientY }}
          onPointerMove={e => { if (start.current !== null && start.current - e.clientY > 24) { start.current = null; setSearchOpen(true) } }}
          onPointerUp={() => { start.current = null }}>
          <Icon name="search" size={18} />
          <span>Search Zeen...</span>
          <Icon name="mic" size={18} />
        </button>
      )}
      <div className="bn-tabs">
        <button className={`bn-tab ${current === 'home' ? 'on' : ''}`} aria-label="Home" onClick={() => { haptic('tick'); tab('home') }}><Icon name="home" size={22} /></button>
        <button className="bn-plus" aria-label="Create a zine" onClick={() => { haptic('tap'); tab('create') }}><Icon name="plus" size={24} stroke={2.4} /></button>
        <button className={`bn-tab ${current === 'profile' ? 'on' : ''}`} aria-label="Profile" onClick={() => { haptic('tick'); tab('profile') }}><Icon name="user" size={22} /></button>
      </div>
    </nav>
  )
}

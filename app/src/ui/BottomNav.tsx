import { useId } from 'react'
import { haptic } from '../lib/feedback'
import { useApp } from '../lib/store'
import { Icon } from './Icon'

const ON = '#FF4934'
const OFF = '#BEBEBE'

/**
 * The tab row, drawn from the design file's "section navigation2.svg" (275 × 41 units, scaled to the
 * screen's width): home, the orange rounded-square create button, and profile. The current tab's icon
 * turns orange. Each third is a button.
 */
function NavTabs({ current, onTab }: { current: 'home' | 'profile'; onTab: (t: 'home' | 'create' | 'profile') => void }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const cell = (t: 'home' | 'create' | 'profile', label: string, x0: number, x1: number, children: React.ReactNode) => (
    <g className={`bn-cell ${t === 'create' ? 'bn-plus' : ''}`} role="button" tabIndex={0} aria-label={label} aria-current={t === current ? 'page' : undefined}
      onClick={() => onTab(t)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTab(t) } }}>
      <rect x={x0} y="0" width={x1 - x0} height="41.0391" fill="transparent" />
      <g className="bn-glyph">{children}</g>
    </g>
  )
  return (
    <svg className="bn-tabs" viewBox="0 0 274.962 41.0391" fill="none" aria-label="Main tabs">
      <defs>
        <filter id={`bd${id}`} x="123.336" y="2.74072" width="39.9497" height="39.9497" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="1.75" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <filter id={`bi${id}`} x="126.836" y="5.24072" width="32.9497" height="33.9497" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="1.05" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.524921 0 0 0 0 0.770379 0 0 0 0 1 0 0 0 0.36 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
        </filter>
      </defs>
      {cell('home', 'Home', 0, 118, (
        <path d="M74.8107 17.7453L78.7691 21.3078V27.4907H77.1857V22.7407H72.4357V27.4907H70.8524V21.3078L74.8107 17.7453V17.7453ZM74.8107 15.6157L66.8941 22.7407H69.2691V29.0741H74.0191V24.3241H75.6024V29.0741H80.3524V22.7407H82.7274L74.8107 15.6157Z" fill={current === 'home' ? ON : OFF} />
      ))}
      {cell('create', 'Create a zine', 118, 169, <>
        {/* the file nests the inner shadow around the drop shadow; applied to the square alone it reads the same without a halo */}
        <g filter={`url(#bd${id})`}><rect x="126.836" y="5.24072" width="32.9497" height="32.9497" rx="13" fill="#FF4934" /></g>
        <rect x="126.836" y="5.24072" width="32.9497" height="32.9497" rx="13" fill="#FF4934" filter={`url(#bi${id})`} />
        <path d="M148.644 23.0739H143.644V28.0739H141.977V23.0739H136.977V21.4072H141.977V16.4072H143.644V21.4072H148.644V23.0739Z" fill="white" />
      </>)}
      {cell('profile', 'Profile', 169, 274.962, (
        <path d="M206.763 16.886C207.681 16.886 208.426 17.6302 208.426 18.5485C208.426 19.4668 207.681 20.211 206.763 20.211C205.845 20.211 205.101 19.4668 205.101 18.5485C205.101 17.6302 205.845 16.886 206.763 16.886ZM206.763 24.011C209.114 24.011 211.592 25.1668 211.592 25.6735V26.5443H201.934V25.6735C201.934 25.1668 204.412 24.011 206.763 24.011ZM206.763 15.3818C205.013 15.3818 203.596 16.7989 203.596 18.5485C203.596 20.2981 205.013 21.7152 206.763 21.7152C208.513 21.7152 209.93 20.2981 209.93 18.5485C209.93 16.7989 208.513 15.3818 206.763 15.3818ZM206.763 22.5068C204.649 22.5068 200.43 23.5677 200.43 25.6735V28.0485H213.096V25.6735C213.096 23.5677 208.877 22.5068 206.763 22.5068Z" fill={current === 'profile' ? ON : OFF} />
      ))}
    </svg>
  )
}

/** Open search with the keyboard up: the field has to take focus inside the tap itself for phones to show it. */
function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('.search-sheet input')
  input?.focus({ preventScroll: true })
}

/**
 * Home / + / Profile. The app keeps one of these under the tab screens, so switching tabs only pages the
 * content. On home a search field sits on top; tapping it opens search, whose own field grows out of this one.
 */
export function BottomNav({ current, search = true, shown = true }: { current: 'home' | 'profile'; search?: boolean; shown?: boolean }) {
  const tab = useApp(s => s.tab)
  const setSearchOpen = useApp(s => s.setSearchOpen)
  const searchOpen = useApp(s => s.searchOpen)

  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    haptic('tap')
    setSearchOpen(true, e.currentTarget.getBoundingClientRect().top)
    focusSearch()
  }

  return (
    <nav className={`bottom-nav ${shown ? '' : 'away'} ${search ? '' : 'no-search'} ${searchOpen ? 'searching' : ''}`} aria-label="Main" aria-hidden={!shown}>
      <div className="bn-row">
        <button className="search-field bn-search" tabIndex={search ? 0 : -1} aria-label="Search Zeen" onClick={open}>
          <Icon name="search" size={18} />
          <span>Zines, makers, tags, songs</span>
          <Icon name="mic" size={18} />
        </button>
      </div>
      <NavTabs current={current} onTab={t => {
        // any tab puts the search sheet away first: back into the search field if we're staying on Home,
        // otherwise (that field is folding away too) it just slides down behind the tabs
        if (useApp.getState().searchOpen) setSearchOpen(false, t === 'home' ? undefined : null)
        if (t === 'create') { haptic('tap'); tab('create'); return }
        haptic('tick')
        // always act, even on the highlighted tab: Home brings you back to Discover from a community or
        // anything else on top, Profile back to your own profile
        tab(t)
      }} />
    </nav>
  )
}

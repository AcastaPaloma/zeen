import type { CSSProperties } from 'react'

const P: Record<string, string> = {
  back: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  enter: 'M20 5v7a3 3 0 0 1-3 3H5m0 0 4-4m-4 4 4 4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v1',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0-5 5v1',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  right: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  search: 'm20 20-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3',
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3 3-5 6-5s5.4 2 6 5m1-9a3 3 0 1 0-1-5.8M21 20c-.4-2.2-1.7-3.9-3.5-4.6',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  share: 'M12 15V3m0 0L8 7m4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  image: 'M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15.5 9.5h.01',
  play: 'M7 5v14l12-7L7 5Z',
  pause: 'M8 5v14M16 5v14',
  arrowLeft: 'M19 12H5m0 0 6-6m-6 6 6 6',
  arrowRight: 'M5 12h14m0 0-6-6m6 6-6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.3 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.5 1.4 1 2.2 1.3l.3 2.4h4l.3-2.4c.8-.3 1.5-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  flip: 'M12 3v18M8 7 3 12l5 5V7Zm8 0 5 5-5 5V7Z',
  flipV: 'M3 12h18M7 8l5-5 5 5H7Zm0 8 5 5 5-5H7Z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  duplicate: 'M8 8h12v12H8zM4 16V4h12',
  forward: 'M12 4 4 8l8 4 8-4-8-4Zm-8 8 8 4 8-4',
  backward: 'M4 16l8 4 8-4M12 12 4 8l8-4 8 4-8 4Z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'm3 3 18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 1 1 8 0v3',
  unlock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 7.7-1.5',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  wand: 'm4 20 11-11m2-5v2m0 4v2m-3-3h2m4 0h2M19 4l-1.4 1.4',
  hand: 'M8 13V5.5a1.5 1.5 0 1 1 3 0V12m0-6.5V4a1.5 1.5 0 1 1 3 0v8m0-6a1.5 1.5 0 1 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.8L3 14.5a1.5 1.5 0 0 1 2.5-1.6L8 16',
  xray: 'M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M8 12h8M12 8v8',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 1 1-4 0V4H6Zm0 4h4m4 0h4',
  ruler: 'M3 17 17 3l4 4L7 21l-4-4Zm4-2 2 2m1-5 2 2m1-5 2 2',
  dice: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3.5 4h.01M15.5 8h.01M12 12h.01M8.5 16h.01M15.5 16h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  page: 'M14 3H6v18h12V7l-4-4Zm0 0v4h4',
  pages: 'M8 4h11v14M5 7h11v14H5z',
  grid: 'M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H15a2 2 0 0 0-1.5 3.3A1.8 1.8 0 0 1 12 21ZM7.5 11h.01M10 7h.01M15 7h.01M17.5 11h.01',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  textStyle: 'M5 19 10 5h1l5 14M7 14h7',
  box: 'M4 6h16v12H4z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  folder: 'M3 6h6l2 2h10v11H3V6Z',
  gif: 'M4 5h16v14H4zM9 10H7.5v4H9v-1.5M12 10v4M15 14v-4h2M15 12h1.5',
  sticker: 'M4 4h16v9l-7 7H4V4Zm9 16v-5a2 2 0 0 1 2-2h5',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9h.01',
  expand: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  shrink: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  reply: 'M10 7 4 12l6 5v-3c4.5 0 7.5 1.5 10 5-1-5-4-9-10-10V7Z',
  flag: 'M5 21V4h12l-2 4 2 4H5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm12-.5a5 5 0 0 1 0 7',
  volumeOff: 'M4 9v6h4l5 4V5L8 9H4Zm12 0 5 6m0-6-5 6',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  pdf: 'M14 3H6v18h12V7l-4-4ZM9 13h1.5a1.5 1.5 0 0 1 0 3H9v-5h1.5M14 11v5h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  pin: 'M9 4h6l-1 6 4 4H6l4-4-1-6Zm3 10v7',
  spread: 'M3 6h8v12H3zM13 6h8v12h-8z',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  frame: 'M3 3h18v18H3z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  tag: 'M3 12V4h8l10 10-8 8L3 12Zm5-4h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2.1-13.9L20 18M8.1 16.9 20 6',
  fold: 'M4 20 12 4l8 16M8 12h8',
  shelf: 'M3 20h18M5 20V6h3v14M10 20V4h3v16M15 20l2-13 3 .5-2 12.5',
}

export type IconName = keyof typeof P

export function Icon({ name, size = 22, stroke = 1.8, style, className, fill }: {
  name: IconName; size?: number; stroke?: number; style?: CSSProperties; className?: string; fill?: string
}) {
  const filled = fill && fill !== 'none'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? fill : 'none'} stroke="currentColor"
      strokeWidth={name === 'more' || name === 'grid' ? 3.2 : stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className} aria-hidden>
      <path d={P[name]} />
    </svg>
  )
}

/** The cut style glyphs from the Figma toolbar (dashed path + arrow head). */
export function CutGlyph({ kind, active }: { kind: 'straight' | 'smooth' | 'jagged' | 'round'; active?: boolean }) {
  const col = active ? 'var(--accent)' : 'var(--ink)'
  const d = {
    straight: 'M5 20 19 6',
    smooth: 'M5 20c4 0 4-5 6-8s2-6 7-6',
    jagged: 'M5 19l3-2-1-3 4-1-1-3 4-1-1-3 4 0',
    round: 'M5 19c1-2 3-2 3 0s3-1 2-3 3-2 3 0 2-3 1-4 3-2 3 0',
  }[kind]
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke={col} strokeWidth={1.4} strokeDasharray="2.2 1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 5.2 19 5l-.5 3.4" stroke={col} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

import { asset } from './base'

const A = asset('/assets')

export const STICKERS = [
  'glitter-heart', 'glitter-smiley', 'gem-rainbow', 'glitter-apple', 'gem-flower', 'gem-heart', 'flower-smile', 'pink-stars',
].map(n => ({ id: 'st-' + n, src: `${A}/stickers/${n}.webp`, name: n.replace(/-/g, ' ') }))

/** [file, name, note, and 'gif' for the ones that move] */
export const SCRAPS = ([
  ['hiss-cat', 'Hissy Cat', 'not in the mood', 'gif'],
  ['bird-blue', 'Cool Bird Alert', 'bird i found on pinterest'],
  ['bird-yellow', 'Skater Budgie', 'kickflip king'],
  ['chick', 'Lil Chick', 'smallest skater in the park'],
  ['hamster-drums', 'Drummer Hamster', 'he has rhythm'],
  ['blue-doodle', 'Mushroom Guys', 'scanned from a notebook'],
  ['orcas', 'Orca Party', 'ocean stuff'],
  ['polaroid-stars', 'Starfish Polaroid', 'beach day'],
  ['face', 'Naheel', 'cut out of a flyer'],
  ['friends-cutout', 'Floor Crew', 'zine night at the studio'],
  ['friends', 'Zine Night', 'studio, 2am'],
  ['bike-rack', 'Bike Rack', 'montreal, found'],
  ['gate', 'Old Gate', 'photocopied twice'],
  ['night-lights', 'Night Lights', 'film, expired'],
  ['grass', 'Grass', 'go outside'],
  ['moodboard', 'Moodboard', 'brainstorm wall'],
  ['brush-stroke', 'Ink Swoosh', 'sumi brush'],
] as string[][]).map(([n, name, note, gif]) => ({ id: 'sc-' + n, src: `${A}/scraps/${n}.${gif ? 'gif' : 'webp'}`, name, note, gif: !!gif }))

/** Scraps that used to be stills and are GIFs now: old placements follow along (see the store's init). */
export const RENAMED_SCRAPS: Record<string, string> = { [`${A}/scraps/hiss-cat.webp`]: `${A}/scraps/hiss-cat.gif` }

export const COVERS: Record<string, string> = Object.fromEntries(
  ['levels', 'how-zeen', 'montreal', 'yellow-silhouettes', 'forever-young', 'june', 'svsd', 'svsd-spread',
    'also-right', 'desired-path', 'rewind-lucid', 'rewind-spread', 'lost-dog']
    .map(n => [n, `${A}/covers/${n}.webp`]),
)

/** The Zeen wordmark (with its scissors mark and orange dot) and the app icon, from the brand files. */
export const BRAND = {
  logo: `${A}/brand/zeen-logo.svg`,
  icon: `${A}/brand/zeen-icon.svg`,
}

export const TOOLS = {
  scissors: `${A}/tools/scissors.webp`,
  bonefolder: `${A}/tools/bonefolder.webp`,
  pencil: `${A}/tools/pencil.webp`,
  pen: `${A}/tools/pen.webp`,
  marker: `${A}/tools/marker.webp`,
  eraser: `${A}/tools/eraser.webp`,
}

export const PAPER = {
  kraft: `${A}/paper/kraft.webp`,
  crumpled: `${A}/paper/crumpled.webp`,
  lined: `${A}/paper/lined.webp`,
  watercolor: `${A}/paper/watercolor.webp`,
  newsprint: `${A}/paper/newsprint.webp`,
  spectrum: `${A}/paper/spectrum.webp`,
  templates: `${A}/paper/templates.webp`,
}

export interface Track { id: string; title: string; bpm: number; key: number; mood: 'punk' | 'jazz' | 'indie' | 'dream' | 'riot' }
export interface Album { id: string; title: string; artist: string; cover: string; tracks: Track[] }

const tr = (album: string, list: [string, number, number, Track['mood']][]): Track[] =>
  list.map(([title, bpm, key, mood], i) => ({ id: `${album}-${i}`, title, bpm, key, mood }))

export const ALBUMS: Album[] = [
  { id: 'liz', title: 'Exile in Guyville', artist: 'Liz Phair', cover: `${A}/albums/exile-in-guyville.webp`,
    tracks: tr('liz', [['Divorce Song', 104, 2, 'indie'], ['Never Said', 118, 7, 'indie'], ['Fuck and Run', 96, 0, 'indie'], ['Stratford-On-Guy', 126, 9, 'indie']]) },
  { id: 'miles', title: 'Bitches Brew', artist: 'Miles Davis', cover: `${A}/albums/bitches-brew.webp`,
    tracks: tr('miles', [['Giant Steps', 92, 5, 'jazz'], ['Spanish Key', 100, 10, 'jazz'], ['Sanctuary', 70, 3, 'jazz']]) },
  { id: 'pistols', title: 'Never Mind the Bollocks', artist: 'Sex Pistols', cover: `${A}/albums/never-mind.webp`,
    tracks: tr('pistols', [['Anarchy in the U.K.', 140, 4, 'punk'], ['Holidays in the Sun', 150, 9, 'punk'], ['Pretty Vacant', 136, 4, 'punk'], ['God Save the Queen', 146, 2, 'punk']]) },
  { id: 'minor', title: 'Minor Threat', artist: 'Minor Threat', cover: `${A}/albums/minor-threat.webp`,
    tracks: tr('minor', [['Filler', 172, 7, 'punk'], ['Straight Edge', 180, 2, 'punk'], ['I Don\'t Wanna Hear It', 168, 0, 'punk']]) },
  { id: 'ramones', title: 'Ramones', artist: 'Ramones', cover: `${A}/albums/ramones.webp`,
    tracks: tr('ramones', [['I Wanna Be Sedated', 160, 4, 'punk'], ['Blitzkrieg Bop', 176, 9, 'punk'], ['Judy Is a Punk', 168, 4, 'punk']]) },
  { id: 'huggy', title: 'Her Jazz', artist: 'Huggy Bear', cover: `${A}/albums/her-jazz.webp`,
    tracks: tr('huggy', [['Her Jazz', 150, 1, 'riot'], ['Prayer', 132, 6, 'riot']]) },
  { id: 'velvet', title: 'The Velvet Underground & Nico', artist: 'The Velvet Underground', cover: `${A}/albums/velvet-banana.webp`,
    tracks: tr('velvet', [['Sunday Morning', 84, 5, 'dream'], ['Femme Fatale', 90, 0, 'dream'], ['All Tomorrow\'s Parties', 76, 2, 'dream']]) },
]

export const trackById = (id: string | undefined) => {
  if (!id) return null
  for (const a of ALBUMS) for (const t of a.tracks) if (t.id === id) return { album: a, track: t }
  return null
}

// ---------------------------------------------------------------- image cache

const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()
const listeners = new Set<() => void>()

export function onImageLoad(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(src)
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => { cache.set(src, img); pending.delete(src); res(img); listeners.forEach(f => f()) }
      img.onerror = e => { pending.delete(src); rej(e) }
      img.src = src
    })
    pending.set(src, p)
  }
  return p
}

/** Returns the image if ready, otherwise kicks off a load and returns null. */
export function getImage(src: string): HTMLImageElement | null {
  const hit = cache.get(src)
  if (hit) return hit
  loadImage(src).catch(() => {})
  return null
}

export function preload(srcs: string[]) { return Promise.all(srcs.map(s => loadImage(s).catch(() => null))) }

export const ZINE_FONTS: Record<string, { css: string; label: string }> = {
  typewriter: { css: '"Special Elite", "Courier New", monospace', label: 'Typewriter' },
  marker: { css: '"Bricolage Grotesque", "DM Sans", sans-serif', label: 'Bold' },
  grotesk: { css: '"Anton", "Impact", sans-serif', label: 'Grotesk' },
  serif: { css: '"DM Serif Display", Georgia, serif', label: 'Serif' },
  stencil: { css: '"Stardos Stencil", "Impact", sans-serif', label: 'Stencil' },
  ransom: { css: '"Anton", sans-serif', label: 'Ransom' },
  script: { css: '"Pinyon Script", cursive', label: 'Script' },
  mono: { css: '"Rubik Mono One", monospace', label: 'Mono' },
}

export async function loadFonts() {
  if (!('fonts' in document)) return
  const fams = ['Special Elite', 'Bricolage Grotesque', 'Anton', 'DM Serif Display', 'Stardos Stencil', 'Pinyon Script', 'Rubik Mono One', 'Caveat', 'DM Sans']
  await Promise.all(fams.map(f => document.fonts.load(`40px "${f}"`).catch(() => null)))
  listeners.forEach(f => f())
}

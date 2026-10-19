import { del, entries, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { uid } from './geom'
import { COMMUNITIES, ME, SAMPLE_COMMENTS, SAMPLE_POSTS, sampleScrapbook, sampleZines, USERS } from './samples'
import type { Comment, Community, Post, ScrapItem, User, ZineDoc } from './types'

// ---------------------------------------------------------------- navigation

export type HomePage = 'discover' | 'following' | 'profile'

export type Route =
  | { name: 'home'; tab?: 'discover' | 'following' }
  | { name: 'preview'; id: string; from?: DOMRect | null }
  | { name: 'read'; id: string }
  | { name: 'community'; id: string }
  | { name: 'prompt'; id: string }
  | { name: 'profile'; id?: string }
  | { name: 'create'; id?: string; replyTo?: string; step?: CreateStep }
  | { name: 'scrapbook' }
  | { name: 'edit-profile' }
  | { name: 'intro' }

export type CreateStep = 'cut' | 'collage' | 'finalize' | 'publish'

export interface Shelf { id: string; name: string; zines: string[] }

interface Persisted {
  likes: string[]
  saves: string[]
  shelves: Shelf[]
  following: string[]
  joined: string[]
  me: User
  comments: Comment[]
  posts: Post[]
  readProgress: Record<string, number>
  seenIntro: boolean
  seenCoach: Record<string, boolean>
  recentSearches: string[]
  pinned: string[]
  downloads: string[]
  stickersOnZines: Record<string, boolean>
}

interface AppState extends Persisted {
  ready: boolean
  stack: Route[]
  dir: 1 | -1
  zines: Record<string, ZineDoc>
  users: User[]
  communities: Community[]
  scrapbook: ScrapItem[]
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null
  searchOpen: boolean
  /** where the home search field sits (client px, its top edge): the search sheet's field grows out of it */
  searchFrom: number | null
  /** home is a row of pages you swipe between: the two feeds, then your own profile */
  homePage: HomePage
  /** the feed home returns to from the profile tab */
  homeFeed: 'discover' | 'following'
  init(): Promise<void>
  go(r: Route): void
  replace(r: Route): void
  back(): void
  tab(name: 'home' | 'create' | 'profile'): void
  setHomePage(p: HomePage): void
  showToast(text: string, action?: { label: string; run: () => void }, ms?: number): void
  saveZine(z: ZineDoc): void
  deleteZine(id: string): void
  toggleLike(id: string): boolean
  toggleSave(id: string, shelf?: string): boolean
  moveToShelf(zine: string, shelf: string): void
  addShelf(name: string): string
  renameShelf(id: string, name: string): void
  toggleFollow(user: string): void
  toggleJoin(c: string): void
  addComment(zine: string, text: string): void
  addPost(community: string, text: string, zine?: string): void
  likePost(id: string): void
  replyPost(id: string, text: string): void
  setReadProgress(id: string, kf: number): void
  updateMe(p: Partial<User>): void
  addScraps(items: ScrapItem[]): void
  setSearchOpen(o: boolean, from?: number): void
  addRecentSearch(q: string): void
  markSeen(key: string): void
  setSeenIntro(): void
  togglePin(id: string): void
  markDownloaded(id: string): void
}

const LS_KEY = 'zeen.state.v1'
const IDB_ZINES = 'zeen.zine.'
const IDB_SCRAPS = 'zeen.scraps.v1'

const defaults = (): Persisted => ({
  likes: [], saves: ['z_levels', 'z_june', 'z_mtl', 'z_pace'],
  shelves: [
    { id: 'sh_all', name: 'Favourites', zines: ['z_levels', 'z_june'] },
    { id: 'sh_ref', name: 'Design reference', zines: ['z_mtl', 'z_pace'] },
  ],
  following: ['u_raf', 'u_naheel', 'u_ada'],
  joined: ['c_svsd', 'c_small'],
  me: USERS[0],
  comments: SAMPLE_COMMENTS.map(c => ({ ...c, id: uid('cm') })),
  posts: SAMPLE_POSTS.map(p => ({ ...p, id: uid('p') })),
  readProgress: {},
  seenIntro: false,
  seenCoach: {},
  recentSearches: ['halftone', 'small guys', 'riot grrrl'],
  pinned: ['z_howzeen'],
  downloads: [],
  stickersOnZines: {},
})

function loadLocal(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
  } catch { /* storage blocked */ }
  return defaults()
}

let saveTimer = 0
function persistLocal(s: AppState) {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const p: Persisted = {
      likes: s.likes, saves: s.saves, shelves: s.shelves, following: s.following, joined: s.joined, me: s.me,
      comments: s.comments, posts: s.posts, readProgress: s.readProgress, seenIntro: s.seenIntro, seenCoach: s.seenCoach,
      recentSearches: s.recentSearches, pinned: s.pinned, downloads: s.downloads, stickersOnZines: s.stickersOnZines,
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch { /* quota */ }
  }, 250)
}

const userZineTimers = new Map<string, number>()
function persistZine(z: ZineDoc) {
  clearTimeout(userZineTimers.get(z.id))
  userZineTimers.set(z.id, window.setTimeout(async () => {
    try { await set(IDB_ZINES + z.id, z) } catch (e) { console.warn('autosave failed', e) }
  }, 400))
}

export const useApp = create<AppState>((setS, getS) => ({
  ...loadLocal(),
  ready: false,
  stack: [{ name: 'home' }],
  dir: 1,
  zines: {},
  users: USERS,
  communities: COMMUNITIES,
  scrapbook: [],
  toast: null,
  searchOpen: false,
  searchFrom: null,
  homePage: 'discover',
  homeFeed: 'discover',

  async init() {
    const samples = sampleZines()
    const zines: Record<string, ZineDoc> = {}
    for (const z of samples) zines[z.id] = z
    try {
      for (const [k, v] of await entries()) if (String(k).startsWith(IDB_ZINES)) zines[(v as ZineDoc).id] = v as ZineDoc
    } catch { /* idb blocked */ }
    let scraps = sampleScrapbook()
    try {
      const extra = ((await get(IDB_SCRAPS)) as ScrapItem[] | undefined) ?? []
      scraps = [...extra, ...scraps]
    } catch { /* idb blocked */ }
    const s = getS()
    const start: Route[] = s.seenIntro ? [{ name: 'home' }] : [{ name: 'home' }, { name: 'intro' }]
    setS({ zines, scrapbook: scraps, ready: true, stack: start })
  },

  go(r) { setS(s => ({ stack: [...s.stack, r], dir: 1 })) },
  replace(r) { setS(s => ({ stack: [...s.stack.slice(0, -1), r], dir: 1 })) },
  back() { setS(s => (s.stack.length > 1 ? { stack: s.stack.slice(0, -1), dir: -1 } : s)) },
  tab(name) {
    setS(s => {
      // both tabs are pages of home: switching them only moves home's pager (and closes whatever is on top)
      if (name === 'home') return { stack: [{ name: 'home' }], dir: -1, homePage: s.homePage === 'profile' ? s.homeFeed : s.homePage }
      if (name === 'profile') return { stack: [{ name: 'home' }], dir: -1, homePage: 'profile' }
      return { stack: [...s.stack, { name: 'create' }], dir: 1 }
    })
  },

  setHomePage(p) { setS(s => ({ homePage: p, homeFeed: p === 'profile' ? s.homeFeed : p })) },

  showToast(text, action, ms = 2600) {
    const id = Date.now()
    setS({ toast: { id, text, action } })
    setTimeout(() => { if (getS().toast?.id === id) setS({ toast: null }) }, ms)
  },

  saveZine(z) {
    const nz = { ...z, updatedAt: Date.now() }
    setS(s => ({ zines: { ...s.zines, [z.id]: nz } }))
    persistZine(nz)
  },
  async deleteZine(id) {
    setS(s => { const zines = { ...s.zines }; delete zines[id]; return { zines } })
    try { await del(IDB_ZINES + id) } catch { /* ignore */ }
  },

  toggleLike(id) {
    const on = !getS().likes.includes(id)
    setS(s => ({ likes: on ? [...s.likes, id] : s.likes.filter(x => x !== id) }))
    persistLocal(getS())
    return on
  },
  toggleSave(id, shelf) {
    const on = !getS().saves.includes(id)
    setS(s => {
      const shelves = s.shelves.map(sh => ({ ...sh, zines: sh.zines.filter(z => z !== id) }))
      if (on) {
        const target = shelf ?? shelves[0]?.id
        const i = shelves.findIndex(sh => sh.id === target)
        if (i >= 0) shelves[i] = { ...shelves[i], zines: [id, ...shelves[i].zines] }
      }
      return { saves: on ? [id, ...s.saves] : s.saves.filter(x => x !== id), shelves }
    })
    persistLocal(getS())
    return on
  },
  moveToShelf(zine, shelf) {
    setS(s => ({
      shelves: s.shelves.map(sh => sh.id === shelf
        ? { ...sh, zines: [zine, ...sh.zines.filter(z => z !== zine)] }
        : { ...sh, zines: sh.zines.filter(z => z !== zine) }),
    }))
    persistLocal(getS())
  },
  addShelf(name) {
    const id = uid('sh_')
    setS(s => ({ shelves: [...s.shelves, { id, name, zines: [] }] }))
    persistLocal(getS())
    return id
  },
  renameShelf(id, name) {
    setS(s => ({ shelves: s.shelves.map(sh => (sh.id === id ? { ...sh, name } : sh)) }))
    persistLocal(getS())
  },
  toggleFollow(user) {
    setS(s => ({ following: s.following.includes(user) ? s.following.filter(x => x !== user) : [...s.following, user] }))
    persistLocal(getS())
  },
  toggleJoin(c) {
    setS(s => ({ joined: s.joined.includes(c) ? s.joined.filter(x => x !== c) : [...s.joined, c] }))
    persistLocal(getS())
  },
  addComment(zine, text) {
    setS(s => ({ comments: [{ id: uid('cm'), zine, user: ME, text, at: Date.now(), likes: 0 }, ...s.comments] }))
    persistLocal(getS())
  },
  addPost(community, text, zine) {
    setS(s => ({ posts: [{ id: uid('p'), community, user: ME, text, zine, at: Date.now(), likes: 0, replies: [] }, ...s.posts] }))
    persistLocal(getS())
  },
  likePost(id) {
    setS(s => ({ posts: s.posts.map(p => (p.id === id ? { ...p, likes: p.likes + 1 } : p)) }))
    persistLocal(getS())
  },
  replyPost(id, text) {
    setS(s => ({ posts: s.posts.map(p => (p.id === id ? { ...p, replies: [...p.replies, { user: ME, text, at: Date.now() }] } : p)) }))
    persistLocal(getS())
  },
  setReadProgress(id, kf) {
    setS(s => ({ readProgress: { ...s.readProgress, [id]: kf } }))
    persistLocal(getS())
  },
  updateMe(p) {
    setS(s => {
      const me = { ...s.me, ...p }
      return { me, users: s.users.map(u => (u.id === me.id ? me : u)) }
    })
    persistLocal(getS())
  },
  async addScraps(items) {
    setS(s => ({ scrapbook: [...items, ...s.scrapbook.filter(x => !items.some(i => i.id === x.id))] }))
    try {
      const mine = getS().scrapbook.filter(x => x.id.startsWith('u_'))
      await set(IDB_SCRAPS, mine)
    } catch { /* ignore */ }
  },
  setSearchOpen(o, from) { setS(s => ({ searchOpen: o, searchFrom: from ?? s.searchFrom })) },
  addRecentSearch(q) {
    if (!q.trim()) return
    setS(s => ({ recentSearches: [q, ...s.recentSearches.filter(x => x !== q)].slice(0, 8) }))
    persistLocal(getS())
  },
  markSeen(key) { setS(s => ({ seenCoach: { ...s.seenCoach, [key]: true } })); persistLocal(getS()) },
  setSeenIntro() { setS({ seenIntro: true }); persistLocal(getS()) },
  togglePin(id) {
    setS(s => ({ pinned: s.pinned.includes(id) ? s.pinned.filter(x => x !== id) : [id, ...s.pinned].slice(0, 3) }))
    persistLocal(getS())
  },
  markDownloaded(id) { setS(s => ({ downloads: [...new Set([...s.downloads, id])] })); persistLocal(getS()) },
}))

export const route = () => { const s = useApp.getState().stack; return s[s.length - 1] }

/** Published zines, newest first. */
export function published(zines: Record<string, ZineDoc>) {
  return Object.values(zines).filter(z => z.status === 'published' && z.publish.visibility !== 'private')
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

export function resetAll() {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
  entries().then(es => es.forEach(([k]) => { if (String(k).startsWith(IDB_ZINES)) del(k) })).catch(() => {})
  del(IDB_SCRAPS).catch(() => {})
}

// exposed for headless testing / debugging in dev builds
if (import.meta.env.DEV) (window as unknown as { zeen: unknown }).zeen = { useApp }

// ---------------------------------------------------------------- social extras (community / profile)

/** Post to a community discussion with an optional image (data URL) and/or attached zine. */
export function addCommunityPost(community: string, text: string, opts: { image?: string; zine?: string } = {}) {
  useApp.setState(s => ({
    posts: [{ id: uid('p'), community, user: ME, text, image: opts.image, zine: opts.zine, at: Date.now(), likes: 0, replies: [] }, ...s.posts],
  }))
  persistLocal(useApp.getState())
}

/** Remove an empty shelf (zines on it move to the first shelf). */
export function removeShelf(id: string) {
  useApp.setState(s => {
    const gone = s.shelves.find(sh => sh.id === id)
    const rest = s.shelves.filter(sh => sh.id !== id)
    if (!gone || !rest.length) return s
    rest[0] = { ...rest[0], zines: [...rest[0].zines, ...gone.zines.filter(z => !rest[0].zines.includes(z))] }
    return { shelves: rest }
  })
  persistLocal(useApp.getState())
}

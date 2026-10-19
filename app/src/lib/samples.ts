import { ALBUMS, COVERS, SCRAPS, STICKERS } from './assets'
import { uid } from './geom'
import manifest from './manifest.json'
import { kf, newDoc, type TemplateId } from './paper'
import type {
  Comment, Community, InkObj, Post, ScrapItem, ScrapObj, Side, TextObj, User, ZineDoc, ZineFont,
} from './types'

const M = manifest as unknown as Record<string, [number, number]>
const aspect = (src: string) => { const s = M[src]; return s ? s[1] / s[0] : 1 }

export const ME = 'u_me'

export const USERS: User[] = [
  {
    id: ME, name: 'zeen.user', handle: 'zeen.user', avatar: COVERS['forever-young'],
    bio: 'I make zines about design, student mental health and any ideas that grows in between pages',
    header: COVERS['forever-young'], tags: ['SVSD', 'design', 'studentmentalhealth'], followers: 23, following: 41,
    song: 'velvet-0', links: ['zeen.user.site'],
    stickers: [
      { src: '/assets/stickers/pink-stars.webp', x: 0.82, y: 0.12, rot: 0.2, s: 0.22 },
      { src: '/assets/stickers/gem-heart.webp', x: 0.1, y: 0.58, rot: -0.3, s: 0.14 },
    ],
  },
  { id: 'u_raf', name: 'raf.d', handle: 'raf.d', avatar: '/assets/scraps/face.webp', bio: 'type nerd. svsd crew. making zines about how to make zines', header: '#245AE2', tags: ['SVSD', 'type'], followers: 42, following: 12 },
  { id: 'u_naheel', name: 'naheel.jawaid', handle: 'naheel.jawaid', avatar: '/assets/scraps/face.webp', bio: 'intern-al screaming since 2024 · design + comedy', header: '#4BA334', tags: ['design', 'humor'], followers: 318, following: 90 },
  { id: 'u_ada', name: 'Ada', handle: 'ada.cuts', avatar: '/assets/stickers/glitter-smiley.webp', bio: 'calendar zines every month. scissors > software', header: '#F158A7', tags: ['collage', 'calendar'], followers: 756, following: 140 },
  { id: 'u_julien', name: 'Julien', handle: 'julien.mtl', avatar: '/assets/scraps/bike-rack.webp', bio: 'found objects, montreal streets, photocopiers', header: '#1A1A1A', tags: ['montreal', 'photo'], followers: 201, following: 66 },
  { id: 'u_mira', name: 'Mira K', handle: 'mira.k', avatar: '/assets/stickers/gem-rainbow.webp', bio: 'rave kid fanzines. levels forever', header: '#C0F6FF', tags: ['fandom', 'edm'], followers: 1203, following: 300 },
  { id: 'u_tove', name: 'Tove', handle: 'tove.prints', avatar: '/assets/stickers/gem-flower.webp', bio: 'riso misprints and slow poems', header: '#EBEFD7', tags: ['poetry', 'riso'], followers: 88, following: 77 },
  { id: 'u_leafy', name: 'leafy', handle: 'leafy', avatar: '/assets/scraps/grass.webp', bio: 'go outside (after reading this)', header: '#4BA334', tags: ['nature'], followers: 64, following: 20 },
]
export const userById = (id: string) => USERS.find(u => u.id === id)

export const COMMUNITIES: Community[] = [
  {
    id: 'c_svsd', tag: 'SVSD', name: 'Silicon Valley Design', color: '#245AE2',
    description: 'Sharing ideas, tips and memories from the Silicon Valley School of Design!! Welcoming all designers :)',
    members: 1200, perMonth: 87,
    prompt: { title: 'How to win', body: 'Make a zine about the best advice you ever got before a crit.', due: 'Sun' },
    rules: ['Be kind in crits', 'Credit your scraps', 'No spec work asks'], mods: ['u_raf', ME], created: 'Sep 2025',
  },
  {
    id: 'c_mtl', tag: 'MTLZINE', name: 'Montreal Zine Fest', color: '#1A1A1A',
    description: 'Year-round home for the fest. Trade, swap, and post your table zines.', members: 3400, perMonth: 212,
    prompt: { title: 'Found in the city', body: 'Photocopy something you found on the street this week.', due: 'Fri' },
    rules: ['Swap fair', 'Tag your table number'], mods: ['u_julien'], created: 'Mar 2024',
  },
  {
    id: 'c_small', tag: 'SMALLGUYS', name: 'Small Guys Club', color: '#F8D647',
    description: 'Zines about small guys. Birds on skateboards. Hamsters with drums. You know.', members: 9800, perMonth: 640,
    prompt: { title: 'Tiny hero', body: 'Give a small guy a big adventure in 4 pages.', due: 'Wed' },
    rules: ['Small guys only', 'No big guys'], mods: ['u_ada'], created: 'Jan 2025',
  },
  {
    id: 'c_riot', tag: 'RIOTGRRRL', name: 'Riot Grrrl Archive', color: '#FF4934',
    description: 'Scans, new work and history. Loud, messy, and ours.', members: 5100, perMonth: 133,
    prompt: { title: 'Her jazz', body: 'Answer a song with a zine.', due: 'Mon' },
    rules: ['Respect the archive', 'Content notes on heavy stuff'], mods: ['u_tove'], created: 'Jun 2023',
  },
]

// ---------------------------------------------------------------- doc builders

type Rect = { x: number; y: number; w: number; h: number }

function scrap(src: string, surface: string, side: Side, r: Rect, o: Partial<ScrapObj> = {}): ScrapObj {
  return {
    id: uid('o'), kind: 'scrap', surface, side, name: o.name ?? 'Scrap',
    src, x: r.x + r.w / 2, y: r.y + r.h / 2, rot: 0, scale: 1, w: r.w, h: r.h, sticker: 0, shadow: false, ...o,
  }
}
function sticker(src: string, side: Side, x: number, y: number, w: number, o: Partial<ScrapObj> = {}): ScrapObj {
  return scrap(src, 'sheet', side, { x: x - w / 2, y: y - (w * aspect(src)) / 2, w, h: w * aspect(src) }, { sticker: 0.18, shadow: true, name: 'Sticker', ...o })
}
function text(t: string, side: Side, x: number, y: number, size: number, font: ZineFont, color: string, o: Partial<TextObj> = {}): TextObj {
  return {
    id: uid('o'), kind: 'text', surface: 'sheet', side, name: t.split('\n')[0].slice(0, 18), text: t, font, color,
    style: 'plain', align: 'center', x, y, rot: 0, scale: 1, size, seed: Math.floor(Math.random() * 1e6), ...o,
  }
}
function scribble(side: Side, pts: number[], color: string, size: number, boil = true): InkObj {
  return {
    id: uid('o'), kind: 'ink', surface: 'sheet', side, name: 'Drawing',
    strokes: [{ tool: 'pen', color, size, opacity: 1, jitter: 0.1, seed: Math.floor(Math.random() * 1e6), boil: { on: boil, strength: 0.6, speed: 2 }, pts }],
  }
}

/** Page rectangles for a doc's panels, in page coords. */
function panelRects(doc: ZineDoc, n: number): { front: Rect[]; back: Rect[]; pw: number; ph: number } {
  const f = doc.surfaces[0].frame
  const pw = f.w / n, ph = f.h
  const front = Array.from({ length: n }, (_, i) => ({ x: i * pw, y: 0, w: pw, h: ph }))
  const back = Array.from({ length: n }, (_, i) => ({ x: (n - 1 - i) * pw, y: 0, w: pw, h: ph }))
  return { front, back, pw, ph }
}

function base(author: string, tpl: TemplateId, title: string, extra: Partial<ZineDoc['publish']> = {}): ZineDoc {
  const d = newDoc({ author, template: tpl })
  d.status = 'published'
  d.publish = { ...d.publish, title, ...extra }
  d.publishedAt = Date.now() - Math.floor(Math.random() * 6 * 864e5)
  d.stats = { likes: 20 + Math.floor(Math.random() * 400), saves: Math.floor(Math.random() * 90), reads: 100 + Math.floor(Math.random() * 3000), comments: 3 }
  return d
}

function svsd(): ZineDoc {
  const d = base('u_raf', 'half', 'How To Win A Design Competition', {
    description: 'Everything I wish someone told me before my first design comp. Read it on twos.', tags: ['SVSD', 'design', 'advice'], postTo: 'c_svsd',
  })
  d.id = 'z_svsd'
  d.coverImage = COVERS.svsd
  d.music = { track: 'velvet-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.objects = [
    scrap(COVERS.svsd, 'sheet', 'back', r.back[0], { name: 'Cover' }),
    scrap(COVERS['svsd-spread'], 'sheet', 'front', { x: 0, y: 0, w: r.pw * 2, h: r.ph }, { name: 'Spread' }),
    text('1. read the brief\n2. read it again\n3. make it weird', 'front', r.pw * 0.5, r.ph * 0.86, 0.62, 'typewriter', '#ffffff', { style: 'box', align: 'left', rot: -0.04 }),
    { ...sticker('/assets/stickers/glitter-heart.webp', 'front', r.pw * 1.78, r.ph * 0.2, 2.6), rot: 0.3 },
    text('see u at\nthe crit', 'back', r.back[1].x + r.pw / 2, r.ph * 0.45, 1.3, 'marker', '#245AE2', { rot: -0.08 }),
    sticker('/assets/scraps/bird-blue.webp', 'back', r.back[1].x + r.pw * 0.55, r.ph * 0.75, 4.2, { sticker: 0.14 }),
  ]
  d.effects = [{ id: uid('e'), type: 'grain', amount: 0.3, scope: 'zine' }]
  return d
}

function levels(): ZineDoc {
  const d = base('u_mira', 'half', 'Tomorrow and Levels', { description: 'a fanzine for the rave kids who never left the floor', tags: ['fandom', 'edm', 'levels'] })
  d.id = 'z_levels'
  d.coverImage = COVERS.levels
  d.music = { track: 'huggy-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.objects = [
    scrap(COVERS.levels, 'sheet', 'back', r.back[0], { name: 'Cover' }),
    scrap('/assets/scraps/night-lights.webp', 'sheet', 'front', { x: 0, y: 0, w: r.pw * 2, h: r.ph }, { name: 'Night lights' }),
    text('WE\nWERE\nTHERE', 'front', r.pw, r.ph * 0.4, 2.4, 'grotesk', '#F8D647', { rot: -0.05 }),
    text('levels — 2011 — forever', 'front', r.pw, r.ph * 0.82, 0.6, 'mono', '#ffffff', {}),
    sticker('/assets/stickers/gem-rainbow.webp', 'front', r.pw * 0.4, r.ph * 0.18, 3.2),
    sticker('/assets/stickers/glitter-smiley.webp', 'front', r.pw * 1.65, r.ph * 0.68, 3.4),
    scribble('front', [r.pw * 1.3, r.ph * 0.15, r.pw * 1.45, r.ph * 0.1, r.pw * 1.65, r.ph * 0.17, r.pw * 1.85, r.ph * 0.08], '#FF6CDD', 0.12),
  ]
  d.effects = [{ id: uid('e'), type: 'halftone', amount: 0.25, scope: 'zine' }]
  return d
}

function howZeen(): ZineDoc {
  const d = base(ME, 'half', 'How Zeen is keeping zine culture ALIVE', { description: 'a love letter to scrappy paper', tags: ['zines', 'design'], postTo: 'c_svsd' })
  d.id = 'z_howzeen'
  d.coverImage = COVERS['how-zeen']
  d.music = { track: 'liz-0', start: 0, volume: 0.6 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#C0F6FF'
  d.objects = [
    scrap(COVERS['how-zeen'], 'sheet', 'back', r.back[0], { name: 'Cover' }),
    text('no print run.\nno paywall.\njust paper\nthat moves.', 'front', r.pw * 0.5, r.ph * 0.4, 1.0, 'typewriter', '#1A1A1A', { align: 'left' }),
    sticker('/assets/scraps/hamster-drums.webp', 'front', r.pw * 1.5, r.ph * 0.36, 6, { sticker: 0.2, name: 'Drummer Hamster' }),
    text('make one\ntonight', 'front', r.pw * 1.5, r.ph * 0.78, 1.5, 'ransom', '#111', {}),
    sticker('/assets/stickers/glitter-apple.webp', 'front', r.pw * 0.75, r.ph * 0.82, 2.4),
    text('the end :)', 'back', r.back[1].x + r.pw / 2, r.ph / 2, 1.4, 'marker', '#FF4934'),
  ]
  return d
}

function montreal(): ZineDoc {
  const d = base('u_julien', 'accordion', 'Random Stuff Found in Montreal', { description: 'four blocks, one photocopier', tags: ['montreal', 'photo', 'found'], postTo: 'c_mtl' })
  d.id = 'z_mtl'
  d.coverImage = COVERS.montreal
  d.music = { track: 'ramones-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 4)
  d.surfaces[0].stock = 'newsprint'
  d.objects = [
    scrap(COVERS.montreal, 'sheet', 'front', r.front[0], { name: 'Cover' }),
    scrap('/assets/scraps/bike-rack.webp', 'sheet', 'front', { x: r.front[1].x + 0.6, y: 1.2, w: r.pw - 1.2, h: (r.pw - 1.2) * 0.75 }, { name: 'Bike rack', rot: 0.03 }),
    text('a bike rack\nshaped like\na zero', 'front', r.front[1].x + r.pw / 2, r.ph * 0.72, 0.85, 'typewriter', '#1A1A1A'),
    scrap('/assets/scraps/gate.webp', 'sheet', 'front', { x: r.front[2].x + 0.5, y: 0.8, w: r.pw - 1, h: (r.pw - 1) * 1.33 }, { name: 'Gate', rot: -0.02 }),
    scrap('/assets/scraps/night-lights.webp', 'sheet', 'front', { x: r.front[3].x, y: r.ph * 0.25, w: r.pw, h: r.pw * 0.67 }, { name: 'Lights' }),
    text('→ fin', 'front', r.front[3].x + r.pw / 2, r.ph * 0.85, 1.2, 'grotesk', '#1A1A1A'),
  ]
  d.effects = [{ id: uid('e'), type: 'photocopy', amount: 0.35, scope: 'zine' }, { id: uid('e'), type: 'grain', amount: 0.3, scope: 'zine' }]
  return d
}

function yellow(): ZineDoc {
  const d = base('u_naheel', 'half', 'Floor Crew', { description: 'zine night, 2am, everyone on the floor', tags: ['friends', 'zine night'], postTo: 'c_svsd' })
  d.id = 'z_floor'
  d.coverImage = COVERS['yellow-silhouettes']
  d.music = { track: 'miles-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#F5F324'
  d.objects = [
    scrap(COVERS['yellow-silhouettes'], 'sheet', 'back', r.back[0], { name: 'Cover' }),
    scrap('/assets/scraps/friends-cutout.webp', 'sheet', 'front', { x: 0.4, y: r.ph * 0.3, w: r.pw * 2 - 0.8, h: (r.pw * 2 - 0.8) * aspect('/assets/scraps/friends-cutout.webp') }, { name: 'Floor crew', shadow: true }),
    text('Jolly Times', 'front', r.pw, r.ph * 0.18, 2.2, 'script', '#1A1A1A', { rot: -0.06 }),
    sticker('/assets/stickers/pink-stars.webp', 'front', r.pw * 1.7, r.ph * 0.85, 3.4, { sticker: 0 }),
  ]
  return d
}

function foreverYoung(): ZineDoc {
  const d = base(ME, 'half', 'Forever Young', { description: 'birthday zine for my younger self', tags: ['studentmentalhealth', 'birthday'] })
  d.id = 'z_forever'
  d.coverImage = COVERS['forever-young']
  d.music = { track: 'velvet-1', start: 0, volume: 0.6 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#EBEFD7'
  d.objects = [
    scrap(COVERS['forever-young'], 'sheet', 'back', r.back[0], { name: 'Cover' }),
    text('dear me,\nit gets\nweirder\n(in a good way)', 'front', r.pw * 0.5, r.ph * 0.45, 1.05, 'script', '#245AE2', { rot: -0.05 }),
    sticker('/assets/stickers/gem-flower.webp', 'front', r.pw * 1.5, r.ph * 0.35, 4.6),
    sticker('/assets/stickers/glitter-heart.webp', 'front', r.pw * 1.3, r.ph * 0.75, 2.6, { rot: -0.3 }),
  ]
  d.effects = [{ id: uid('e'), type: 'dither', amount: 0.15, scope: 'zine' }]
  return d
}

function june(): ZineDoc {
  const d = base('u_ada', 'half', 'Zine 2: June', { description: 'my month, cut up and glued down', tags: ['calendar', 'collage'], postTo: 'c_small' })
  d.id = 'z_june'
  d.coverImage = COVERS.june
  d.music = { track: 'pistols-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#FFD5F4'
  d.objects = [
    scrap(COVERS.june, 'sheet', 'back', r.back[0], { name: 'Cover' }),
    sticker('/assets/scraps/bird-blue.webp', 'front', r.pw * 0.5, r.ph * 0.42, 6.4, { name: 'Cool Bird Alert' }),
    sticker('/assets/scraps/chick.webp', 'front', r.pw * 1.45, r.ph * 0.3, 4.4, { name: 'Lil Chick' }),
    text('small guys\nbig month', 'front', r.pw * 1.45, r.ph * 0.72, 1.3, 'marker', '#FF4934', { rot: 0.05 }),
    scribble('front', [1, r.ph * 0.88, 3, r.ph * 0.84, 5, r.ph * 0.9, 7, r.ph * 0.85, 9, r.ph * 0.9], '#1A1A1A', 0.1),
  ]
  return d
}

function samePace(): ZineDoc {
  const d = base('u_tove', 'trifold', 'At The Same Pace As You', { description: 'a slow poem in three doors', tags: ['poetry', 'riso'], postTo: 'c_riot' })
  d.id = 'z_pace'
  d.coverImage = COVERS['same-pace']
  d.music = { track: 'velvet-0', start: 0, volume: 0.6 }
  const r = panelRects(d, 3)
  d.surfaces[0].color = '#F9F7F4'
  d.objects = [
    scrap(COVERS['same-pace'], 'sheet', 'back', r.back[0], { name: 'Cover' }),
    text('i walk', 'front', r.pw * 0.5, r.ph * 0.5, 1.6, 'serif', '#245AE2'),
    text('you walk', 'front', r.pw * 1.5, r.ph * 0.5, 1.6, 'serif', '#E8614A'),
    text('we arrive', 'front', r.pw * 2.5, r.ph * 0.5, 1.6, 'serif', '#4BA334'),
    sticker('/assets/scraps/polaroid-stars.webp', 'front', r.pw * 2.5, r.ph * 0.22, 4, { sticker: 0, rot: 0.08 }),
  ]
  d.effects = [{ id: uid('e'), type: 'riso', amount: 0.45, scope: 'zine' }]
  return d
}

function grass(): ZineDoc {
  const d = base('u_leafy', 'half', 'Touch Some Grass', { description: 'a reminder, folded', tags: ['nature', 'mentalhealth'] })
  d.id = 'z_grass'
  d.music = { track: 'velvet-2', start: 0, volume: 0.5 }
  const r = panelRects(d, 2)
  d.objects = [
    scrap('/assets/scraps/grass.webp', 'sheet', 'back', r.back[0], { name: 'Grass' }),
    text('Touch', 'back', r.back[0].x + r.pw * 0.38, r.ph * 0.2, 2.1, 'script', '#ffffff', { rot: -0.08 }),
    text('some', 'back', r.back[0].x + r.pw * 0.62, r.ph * 0.45, 1.8, 'script', '#ffffff', { rot: 0.05 }),
    text('grass', 'back', r.back[0].x + r.pw * 0.5, r.ph * 0.78, 3.4, 'serif', '#ffffff', { rot: -0.04 }),
    scrap('/assets/scraps/grass.webp', 'sheet', 'front', { x: 0, y: 0, w: r.pw * 2, h: r.ph }, { name: 'Grass' }),
    text('ok now\ngo outside', 'front', r.pw, r.ph / 2, 2, 'marker', '#ffffff', { style: 'outline' }),
  ]
  return d
}

function internal(): ZineDoc {
  const d = base('u_naheel', 'half', 'INTERN-AL SCREAMING', { description: '5 years experience at 20 yo', tags: ['design', 'humor', 'internships'], postTo: 'c_svsd' })
  d.id = 'z_intern'
  d.music = { track: 'minor-0', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#245AE2'
  const c = r.back[0]
  d.objects = [
    { ...scribble('back', [c.x + 2, c.y + 6, c.x + 5, c.y + 3, c.x + 8.5, c.y + 6, c.x + 8, c.y + 11, c.x + 4, c.y + 13, c.x + 1.8, c.y + 10, c.x + 2, c.y + 6], '#FF6A13', 4.2, false), name: 'Blob' },
    text('INTERN-AL\nSCREAMING', 'back', c.x + c.w / 2, c.y + 3.6, 1.15, 'grotesk', '#FF4934', { style: 'plain' }),
    text('5 YEARS\nEXPERIENCE\nAT 20 YO', 'back', c.x + c.w / 2, c.y + 10.5, 1.15, 'grotesk', '#F8D647'),
    text('day 1: what is a jira', 'front', r.pw * 0.5, r.ph * 0.3, 0.7, 'typewriter', '#fff'),
    text('day 90: i am the jira', 'front', r.pw * 1.5, r.ph * 0.7, 0.7, 'typewriter', '#fff'),
    sticker('/assets/scraps/face.webp', 'front', r.pw * 1.5, r.ph * 0.35, 4.2),
  ]
  d.effects = [{ id: uid('e'), type: 'scan', amount: 0.35, scope: 'zine' }]
  return d
}

function naheel(): ZineDoc {
  const d = base('u_naheel', 'half', 'naheel jawaid', { description: 'about me, but make it a zine', tags: ['about', 'design'] })
  d.id = 'z_naheel'
  d.music = { track: 'liz-1', start: 0, volume: 0.7 }
  const r = panelRects(d, 2)
  d.surfaces[0].color = '#4BA334'
  const c = r.back[0]
  const star: number[] = []
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 2.4 : 5.2
    star.push(c.x + c.w / 2 + Math.cos(a) * rr, c.y + c.h * 0.62 + Math.sin(a) * rr)
  }
  d.objects = [
    { ...scribble('back', star, '#F158A7', 2.4, false), name: 'Star' },
    text('naheel\n   Jawaid', 'back', c.x + c.w / 2, c.y + 3.4, 1.7, 'script', '#1A1A1A', { rot: -0.06 }),
    sticker('/assets/scraps/face.webp', 'back', c.x + c.w / 2, c.y + c.h * 0.62, 4.6, { sticker: 0.1 }),
    text('hi. i make things\nand then i make\nzines about\nmaking things', 'front', r.pw, r.ph / 2, 1.0, 'typewriter', '#ffffff'),
  ]
  return d
}

export function sampleZines(): ZineDoc[] {
  return [svsd(), levels(), howZeen(), montreal(), yellow(), internal(), grass(), june(), foreverYoung(), samePace(), naheel()]
}

export const SAMPLE_COMMENTS: Omit<Comment, 'id'>[] = [
  { zine: 'z_svsd', user: 'u_naheel', text: 'step 3 is so real', at: Date.now() - 36e5 * 5, likes: 12 },
  { zine: 'z_svsd', user: 'u_ada', text: 'the dog sticker unfolding is so good', at: Date.now() - 36e5 * 9, likes: 4 },
  { zine: 'z_svsd', user: ME, text: 'printing this for the studio wall', at: Date.now() - 36e5 * 20, likes: 2 },
  { zine: 'z_june', user: 'u_mira', text: 'cool bird alert 🐦', at: Date.now() - 36e5 * 2, likes: 30 },
  { zine: 'z_mtl', user: 'u_tove', text: 'i know that gate!!', at: Date.now() - 36e5 * 30, likes: 6 },
]

export const SAMPLE_POSTS: Omit<Post, 'id'>[] = [
  { community: 'c_svsd', user: 'u_raf', text: 'Crit night Thursday — bring a zine, leave with three. Weekly prompt is up: "How to win".', at: Date.now() - 36e5 * 3, likes: 41, pinned: true, replies: [{ user: ME, text: 'im in!', at: Date.now() - 36e5 * 2 }] },
  { community: 'c_svsd', user: 'u_naheel', text: 'anyone have a good halftone setting for faces? mine look like soup', at: Date.now() - 36e5 * 7, likes: 9, replies: [{ user: 'u_ada', text: 'halftone at 40 + grain at 20, trust', at: Date.now() - 36e5 * 6 }] },
  { community: 'c_svsd', user: 'u_ada', text: 'made a reply zine to raf\'s comp guide', zine: 'z_june', at: Date.now() - 36e5 * 26, likes: 22, replies: [] },
  { community: 'c_mtl', user: 'u_julien', text: 'table 14 this year. swapping montreal found-object zines for anything with birds', at: Date.now() - 36e5 * 12, likes: 15, replies: [] },
  { community: 'c_small', user: 'u_ada', text: 'tiny hero prompt is live!! drummer hamster entries get bonus points', at: Date.now() - 36e5 * 1, likes: 88, pinned: true, replies: [] },
  { community: 'c_riot', user: 'u_tove', text: 'scanned 40 pages from the 1993 box. uploading slowly. content notes on.', at: Date.now() - 36e5 * 40, likes: 120, replies: [] },
]

export function sampleScrapbook(): ScrapItem[] {
  const from = ['"Zine 2" by Ada', '"Floor Crew" by naheel', '"How To Win" by raf.d', 'pinterest', 'camera roll']
  const items: ScrapItem[] = []
  SCRAPS.forEach((s, i) => items.push({
    id: s.id, src: s.src, name: s.name, note: s.note, kind: 'image',
    collection: i < 3 || s.id.includes('hamster') || s.id.includes('chick') ? 'Small guys' : s.id.includes('orca') || s.id.includes('polaroid') ? 'Ocean stuff' : 'Collection 1',
    addedAt: Date.now() - (i + 1) * 864e5 * 0.8, addedBy: i % 3 ? ME : 'u_ada', from: from[i % from.length], where: 'Zeen',
    edition: [10 + i * 3, 700 + i * 13], usedIn: i % 2 ? ['z_june'] : ['z_june', 'z_svsd'],
  }))
  STICKERS.forEach((s, i) => items.push({
    id: s.id, src: s.src, name: s.name, note: 'sticker pack: sparkle', kind: 'sticker', collection: 'Stickers',
    addedAt: Date.now() - i * 36e5 * 7, addedBy: ME, from: 'Sparkle pack', where: 'Zeen', edition: [i + 1, 2000], usedIn: ['z_levels'],
  }))
  return items
}

export const DEFAULT_TRACK = ALBUMS[0].tracks[0].id

// re-export for keyframe helper users
export { kf }

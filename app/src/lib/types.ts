// Zeen document model. Units for paper geometry are centimetres in "flat" space:
// the sheet laid out flat, x right, y up. Content lives in "page coords":
// origin at the surface frame's top-left, x right, y down, also in cm.

export type Vec2 = [number, number]
export type Ring = Vec2[]
export type Polygon = Ring[] // [outer, ...holes]
export type MultiPoly = Polygon[]

export type Side = 'front' | 'back'

export interface Frame { x: number; y: number; w: number; h: number }

export type PaperStock = 'plain' | 'newsprint' | 'kraft' | 'construction' | 'crumpled' | 'lined'

export interface Surface {
  id: string
  kind: 'sheet' | 'leaf'
  outline: MultiPoly
  frame: Frame
  color: string
  stock: PaperStock
}

/** A crease splits `panel` along a–b. For a leaf hinge, it attaches surface `leaf` to `panel` instead. */
export interface Crease {
  id: string
  panel: string
  a: Vec2
  b: Vec2
  /** Which side of a→b is the moving flap: +1 = left (cross > 0), -1 = right. */
  flapSide: 1 | -1
  /** +1 valley (swings toward the front face), -1 mountain. */
  dir: 1 | -1
  /** 0 = open/flat, 180 = closed. Degrees. */
  angle: number
  leaf?: string
  /** stacking order when several flaps close onto the same face */
  stack?: number
}

export interface Keyframe {
  id: string
  name: string
  angles: Record<string, number>
}

export type TransitionMode = 'together' | 'sequential'
export type TransitionFeel = 'gentle' | 'snappy' | 'floppy'

export type EffectType =
  | 'scan' | 'photocopy' | 'halftone' | 'dither' | 'bleed' | 'grain' | 'texture' | 'riso' | 'wear'

export interface Effect {
  id: string
  type: EffectType
  amount: number // 0..1
  scope: 'zine' | 'page' | 'scrap'
  /** page: `${panelId}:${side}`; scrap: object id */
  target?: string
}

export type InkTool = 'pencil' | 'pen' | 'marker' | 'eraser'

export interface Stroke {
  tool: InkTool
  color: string
  size: number // cm
  opacity: number
  jitter: number // 0..1
  seed: number
  boil: { on: boolean; strength: number; speed: 2 | 3 }
  erase?: boolean
  pts: number[] // flat list x,y in page coords
}

interface ObjBase {
  id: string
  surface: string
  side: Side
  name: string
  hidden?: boolean
  locked?: boolean
}

export interface InkObj extends ObjBase { kind: 'ink'; strokes: Stroke[] }

export type TextStyle = 'plain' | 'box' | 'outline'
export type ZineFont = 'typewriter' | 'marker' | 'grotesk' | 'serif' | 'stencil' | 'ransom' | 'script' | 'mono'

export interface TextObj extends ObjBase {
  kind: 'text'
  text: string
  font: ZineFont
  color: string
  style: TextStyle
  align: 'left' | 'center' | 'right'
  x: number; y: number; rot: number; scale: number
  size: number // cm, base font size
  seed: number
}

export interface ScrapObj extends ObjBase {
  kind: 'scrap'
  src: string
  x: number; y: number; rot: number; scale: number
  w: number; h: number // cm at scale 1
  flipX?: boolean
  sticker: number // die-cut border width in cm (0 = none)
  shadow: boolean
  gif?: boolean
  cutout?: boolean
  alt?: string
}

export type ZObject = InkObj | TextObj | ScrapObj

export type EdgeStyle = 'none' | 'jagged' | 'ripped' | 'deckle' | 'scallop'

export interface Finalize {
  edge: EdgeStyle
  edgeAmount: number
  outline: { on: boolean; color: string; width: number }
  boilAll: boolean
  breathe: boolean
  wiggle: boolean
  intro: 'drop' | 'slide' | 'flip'
}

export type Visibility = 'public' | 'followers' | 'unlisted' | 'private'

export interface PublishInfo {
  title: string
  description: string
  tags: string[]
  coverKeyframe: number
  postTo: string | null // community id
  visibility: Visibility
  allowReplies: boolean
  scrapReuse: boolean
  credits: string[]
  contentNote: string
  replyTo?: string
}

export interface ZineDoc {
  id: string
  author: string
  createdAt: number
  updatedAt: number
  publishedAt?: number
  status: 'draft' | 'published'
  surfaces: Surface[]
  creases: Crease[]
  keyframes: Keyframe[]
  transition: { mode: TransitionMode; feel: TransitionFeel }
  objects: ZObject[]
  effects: Effect[]
  bg: string
  music: { track: string; start: number; volume: number } | null
  finalize: Finalize
  publish: PublishInfo
  /** cached cover render for feeds */
  thumb?: string
  /** pre-rendered cover image used by seeded sample zines */
  coverImage?: string
  stats?: { likes: number; saves: number; reads: number; comments: number }
}

export interface User {
  id: string
  name: string
  handle: string
  avatar: string
  bio: string
  header: string // image url or colour
  headerZine?: string
  song?: string
  tags: string[]
  followers: number
  following: number
  links?: string[]
  stickers?: { src: string; x: number; y: number; rot: number; s: number }[]
}

export interface Community {
  id: string
  tag: string
  name: string
  description: string
  members: number
  perMonth: number
  color: string
  prompt: { title: string; body: string; due: string }
  rules: string[]
  mods: string[]
  created: string
}

export interface Comment {
  id: string
  zine: string
  user: string
  text: string
  at: number
  likes: number
}

export interface Post {
  id: string
  community: string
  user: string
  text: string
  image?: string
  zine?: string
  at: number
  likes: number
  pinned?: boolean
  replies: { user: string; text: string; at: number }[]
}

export interface ScrapItem {
  id: string
  src: string
  name: string
  note: string
  collection: string
  addedAt: number
  addedBy: string
  from: string
  where: string
  edition: [number, number]
  usedIn: string[]
  gif?: boolean
  kind: 'sticker' | 'image' | 'gif'
}

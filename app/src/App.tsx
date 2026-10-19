import { lazy, Suspense, useEffect, useState } from 'react'
import { loadFonts, preload, TOOLS } from './lib/assets'
import { useApp, type Route } from './lib/store'
import { BottomNav } from './ui/BottomNav'
import { DitherDefs, Toast } from './ui/kit'
import './ui/ui.css'
import './screens/screens.css'
import './create/create.css'

const Home = lazy(() => import('./screens/Home'))
const Preview = lazy(() => import('./screens/Preview'))
const Read = lazy(() => import('./screens/Read'))
const CommunityScreen = lazy(() => import('./screens/Community'))
const PromptScreen = lazy(() => import('./screens/Prompt'))
const Profile = lazy(() => import('./screens/Profile'))
const Scrapbook = lazy(() => import('./screens/Scrapbook'))
const EditProfile = lazy(() => import('./screens/EditProfile'))
const Intro = lazy(() => import('./screens/Intro'))
const Create = lazy(() => import('./create/Create'))

function Screen({ r, active }: { r: Route; active: boolean }) {
  switch (r.name) {
    case 'home': return <Home active={active} />
    case 'preview': return <Preview id={r.id} from={r.from ?? null} active={active} />
    case 'read': return <Read id={r.id} active={active} />
    case 'community': return <CommunityScreen id={r.id} active={active} />
    case 'prompt': return <PromptScreen id={r.id} active={active} />
    case 'profile': return <Profile id={r.id} active={active} />
    case 'create': return <Create id={r.id} replyTo={r.replyTo} step={r.step} active={active} />
    case 'scrapbook': return <Scrapbook active={active} />
    case 'edit-profile': return <EditProfile active={active} />
    case 'intro': return <Intro active={active} />
  }
}

/** Which transition a route uses when it enters. (Your own profile tab isn't a route: it's a page of home.) */
const enterKind = (r: Route) =>
  r.name === 'preview' ? 'lift' : r.name === 'read' ? 'fade' : r.name === 'create' ? 'up' : r.name === 'intro' ? 'fade' : 'push'
/** How long a popped screen stays mounted to animate out. */
const leaveMs = (r: Route) => (enterKind(r) === 'lift' ? 520 : 340)
/** Screens that sit on the bottom nav (it stays put while they change). */
const onNav = (r: Route) => r.name === 'home' || r.name === 'profile' || r.name === 'community'

export default function App() {
  const { ready, stack, dir, init } = useApp()
  const me = useApp(s => s.me.id)
  const homePage = useApp(s => s.homePage)
  const [leaving, setLeaving] = useState<{ r: Route; key: number } | null>(null)
  const [prevStack, setPrevStack] = useState(stack)
  // Note a popped screen in the same render the stack changes, so it is never left out of a commit: the
  // screen that animates out is the same instance that was on top (not a fresh one replaying its entrance).
  if (stack !== prevStack) {
    setPrevStack(stack)
    if (stack.length < prevStack.length) setLeaving({ r: prevStack[prevStack.length - 1], key: prevStack.length - 1 })
  }

  useEffect(() => {
    init()
    loadFonts()
    preload(Object.values(TOOLS))
  }, [init])

  // keep the popped screen around long enough to animate out
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(null), leaveMs(leaving.r))
    return () => clearTimeout(t)
  }, [leaving])

  if (!ready) return <div className="device boot"><div className="boot-mark">Zeen</div></div>

  // home stays mounted underneath everything; otherwise only the top two screens stay mounted.
  // A popped screen keeps its key while it animates out, so React keeps the same instance.
  const mountedIdx = new Set<number>([0, stack.length - 1, stack.length - 2].filter(i => i >= 0))
  const items = stack.map((r, i) => ({ r, i, leaving: false }))
  const out_ = leaving && leaving.key >= stack.length ? leaving : null
  if (out_) items.push({ r: out_.r, i: out_.key, leaving: true })
  const topR = stack[stack.length - 1]
  const onProfile = (topR.name === 'home' && homePage === 'profile') || (topR.name === 'profile' && (!topR.id || topR.id === me))
  return (
    <div className="device">
      {items.map(({ r, i, leaving: out }) => {
        if (!out && !mountedIdx.has(i)) return null
        const top = !out && i === stack.length - 1
        const under = !out && i === stack.length - 2
        const cls = out ? `layer leaving leave-${enterKind(r)}`
          : top ? `layer top enter-${enterKind(r)} ${dir > 0 ? 'fwd' : 'back'}` : under ? 'layer under' : 'layer hidden'
        return (
          <div key={`${i}:${r.name}`} className={cls} aria-hidden={!top}>
            <Suspense fallback={null}><Screen r={r} active={top} /></Suspense>
          </div>
        )
      })}
      <BottomNav current={onProfile ? 'profile' : 'home'} search={topR.name === 'home' && homePage !== 'profile'} shown={onNav(topR)} />
      <Toast />
      <DitherDefs />
    </div>
  )
}

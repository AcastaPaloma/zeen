import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { loadFonts, preload, TOOLS } from './lib/assets'
import { useApp, type Route } from './lib/store'
import { Toast } from './ui/kit'
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

/** Which transition a route uses when it enters. */
const enterKind = (r: Route) =>
  r.name === 'preview' ? 'lift' : r.name === 'read' ? 'fade' : r.name === 'create' ? 'up' : r.name === 'intro' ? 'fade' : 'push'

export default function App() {
  const { ready, stack, dir, init } = useApp()
  const [leaving, setLeaving] = useState<{ r: Route; key: number } | null>(null)
  const prev = useRef(stack)

  useEffect(() => {
    init()
    loadFonts()
    preload(Object.values(TOOLS))
  }, [init])

  // keep the popped screen around long enough to animate out
  useEffect(() => {
    const p = prev.current
    if (stack.length < p.length) {
      const r = p[p.length - 1]
      setLeaving({ r, key: p.length - 1 })
      const t = setTimeout(() => setLeaving(null), 340)
      prev.current = stack
      return () => clearTimeout(t)
    }
    prev.current = stack
  }, [stack])

  if (!ready) return <div className="device dots boot"><div className="boot-mark">Zeen</div></div>

  // home stays mounted underneath everything; otherwise only the top two screens stay mounted.
  // A popped screen keeps its key while it animates out, so React keeps the same instance.
  const mountedIdx = new Set<number>([0, stack.length - 1, stack.length - 2].filter(i => i >= 0))
  const items = stack.map((r, i) => ({ r, i, leaving: false }))
  if (leaving && leaving.key >= stack.length) items.push({ r: leaving.r, i: leaving.key, leaving: true })
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
      <Toast />
    </div>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ExplorationSwitch } from './explore/ExplorationSwitch'
import { EXPLORATIONS_ON } from './explore/state'
import { VideoLink } from './ui/VideoLink'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="phone-preview">
      <App />
      <VideoLink />
      {EXPLORATIONS_ON && <ExplorationSwitch />}
    </div>
  </StrictMode>,
)

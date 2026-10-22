import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ExplorationSwitch } from './explore/ExplorationSwitch'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="phone-preview">
      <App />
      <ExplorationSwitch />
    </div>
  </StrictMode>,
)

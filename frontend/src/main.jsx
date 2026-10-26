import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { liveCaseLinkActions, liveCounterLinkActions } from './utils/caseLinkService.js'
import { liveDmsGraceActions } from './utils/dmsService.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App caseLinkActions={liveCaseLinkActions} counterLinkActions={liveCounterLinkActions} dmsGraceActions={liveDmsGraceActions} />
  </StrictMode>,
)

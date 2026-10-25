import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { liveDmsGraceActions } from './utils/dmsService.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App caseLinkActions={null} counterLinkActions={null} dmsGraceActions={liveDmsGraceActions} />
  </StrictMode>,
)

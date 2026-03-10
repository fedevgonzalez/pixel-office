import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ServerConfigProvider } from './context/ServerConfigContext.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerConfigProvider>
      <App />
    </ServerConfigProvider>
  </StrictMode>,
)

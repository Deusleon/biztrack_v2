import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './contexts/ToastContext'
import { LanguageProvider } from './contexts/LanguageContext'
import PwaStatus from './components/PwaStatus'
import { registerPwa } from './utils/pwa'
import { fillScreenOnLaunch } from './utils/desktopWindow'

registerPwa()
fillScreenOnLaunch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <App />
        <PwaStatus />
      </ToastProvider>
    </LanguageProvider>
  </StrictMode>,
)

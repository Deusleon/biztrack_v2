import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './contexts/ToastContext'
import { LanguageProvider } from './contexts/LanguageContext'
import PwaStatus from './components/PwaStatus'
import { registerPwa } from './utils/pwa'
import { fillScreenOnLaunch } from './utils/desktopWindow'
import { startCardTables } from './utils/cardTables'

registerPwa()
startCardTables()
fillScreenOnLaunch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary level="app">
      <LanguageProvider>
        <ToastProvider>
          <App />
          <PwaStatus />
        </ToastProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)

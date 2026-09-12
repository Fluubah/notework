import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/index.css'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { useSync, watchForRemoteChanges } from './data/sync/syncStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

registerServiceWorker()

// Restores a signed-in session and swaps in the synced backends; a no-op when
// the build has no Supabase credentials.
useSync.getState().init()
watchForRemoteChanges()

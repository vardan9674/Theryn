import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// Statically imported on purpose: it has to paint before any lazy chunk lands.
import TherynLoader from './components/TherynLoader.jsx'

// Dev-only preview of the coach dashboard with sample data, no sign-in needed:
//   http://localhost:5173/?coachPreview=1
const previewCoach = import.meta.env.DEV && new URLSearchParams(window.location.search).has('coachPreview')

// Public client link: /f/<token>. Loads a small auth-free bundle; the main app never mounts.
// In dev, /f/preview renders sample data with no backend.
const linkMatch = window.location.pathname.match(/^\/f\/([A-Za-z0-9_-]{6,128})\/?$/)

const CoachPreview = lazy(async () => {
  const [{ default: CoachApp }, { createMockCoachData }] = await Promise.all([
    import('./coach/CoachApp.jsx'),
    import('./coach/data/mockCoachData.js'),
  ])
  const data = createMockCoachData()
  return { default: () => <CoachApp data={data} /> }
})

const ClientLink = lazy(async () => {
  const [{ default: LinkPage }, { createPreviewApi }] = await Promise.all([
    import('./link/LinkPage.jsx'),
    import('./link/linkApi.js'),
  ])
  const token = linkMatch[1]
  const api = import.meta.env.DEV && token === 'preview' ? createPreviewApi() : null
  return { default: () => <LinkPage token={token} api={api} /> }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {linkMatch
        ? <Suspense fallback={<TherynLoader />}><ClientLink /></Suspense>
        : previewCoach
        ? <Suspense fallback={<TherynLoader />}><CoachPreview /></Suspense>
        : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// Statically imported on purpose: it has to paint before any lazy chunk lands.
import TherynLoader from './components/TherynLoader.jsx'
import { takeJoinLink } from './link/joinReturn.js'

// Dev-only preview of the coach dashboard with sample data, no sign-in needed:
//   http://localhost:5173/?coachPreview=1
const previewCoach = import.meta.env.DEV && new URLSearchParams(window.location.search).has('coachPreview')

// Public client link: /f/<token>. Loads a small auth-free bundle; the main app never mounts.
// In dev, /f/preview renders sample data with no backend.
const linkMatch = window.location.pathname.match(/^\/f\/([A-Za-z0-9_-]{6,128})\/?$/)

// A client who tapped "set up my account" on their link, and whom Google sent
// to the site root instead of back to it (which happens when /f/* isn't on the
// project's allow-list). Send them back before anything else mounts, keeping
// the sign-in's own parameters so the session still completes there. The stored
// address is cleared as it is read, so this can never bounce twice.
if (!linkMatch) {
  const back = takeJoinLink()
  if (back) window.location.replace(back + window.location.search + window.location.hash)
}

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
  // Dev only: lets /f/preview be inspected from the console — what was sent,
  // and whether a change replaced it or added a second workout.
  if (api) window.__previewApi = api
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

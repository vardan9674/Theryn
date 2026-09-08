import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Dev-only preview of the coach dashboard with sample data, no sign-in needed:
//   http://localhost:5173/?coachPreview=1
const previewCoach = import.meta.env.DEV && new URLSearchParams(window.location.search).has('coachPreview')

const CoachPreview = lazy(async () => {
  const [{ default: CoachApp }, { createMockCoachData }] = await Promise.all([
    import('./coach/CoachApp.jsx'),
    import('./coach/data/mockCoachData.js'),
  ])
  const data = createMockCoachData()
  return { default: () => <CoachApp data={data} /> }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {previewCoach
        ? <Suspense fallback={null}><CoachPreview /></Suspense>
        : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

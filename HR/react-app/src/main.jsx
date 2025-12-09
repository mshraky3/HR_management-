import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Load critical CSS first - before any components
import './index.css'
// Load shared styles immediately to prevent FOUC (Flash of Unstyled Content)
import './styles/buttons.css'
import './styles/containers.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Add global error handler for unhandled errors
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

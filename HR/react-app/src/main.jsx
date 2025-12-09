import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Load critical CSS first - before any components
import './index.css'
// Load shared styles immediately to prevent FOUC (Flash of Unstyled Content)
import './styles/buttons.css'
import './styles/containers.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

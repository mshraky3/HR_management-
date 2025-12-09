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

// Verify root element exists before rendering
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
  document.body.innerHTML = '<div style="padding: 20px; font-family: Arial; color: red;">Error: Root element not found. Please check the HTML structure.</div>';
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error('Failed to render app:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: Arial; text-align: center;">
        <h1 style="color: #ef4444;">خطأ في تحميل التطبيق</h1>
        <p style="color: #64748b;">Error: ${error.message}</p>
        <button onclick="window.location.reload()" style="padding: 12px 24px; background: #b9d2cf; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">
          تحديث الصفحة
        </button>
      </div>
    `;
  }
}

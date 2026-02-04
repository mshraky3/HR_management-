/**
 * Error Boundary Component
 * Catches React rendering errors and displays a fallback UI
 */

import React from 'react';
import { reportRenderError } from '../utils/errorTracking.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Report render error via email notification
    reportRenderError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'Cairo, sans-serif'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '20px' }}>
            حدث خطأ في التطبيق
          </h1>
          <p style={{ color: '#64748b', marginBottom: '30px' }}>
            يرجى تحديث الصفحة أو المحاولة مرة أخرى
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4988C4',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            تحديث الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;


/**
 * Maintenance Page
 * Displayed when backend/database is unavailable
 */

import { useEffect } from 'react';
import { useBackendError } from '../contexts/BackendErrorContext';
import './MaintenancePage.css';

const MaintenancePage = () => {
  const { clearBackendError } = useBackendError();

  // Auto-retry: Attempt to reconnect every 30 seconds
  useEffect(() => {
    const retryInterval = setInterval(() => {
      clearBackendError();
      // Trigger a test request by reloading the page
      window.location.reload();
    }, 30000); // 30 seconds

    return () => clearInterval(retryInterval);
  }, [clearBackendError]);

  const handleManualRetry = () => {
    clearBackendError();
    window.location.reload();
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-container">
        <div className="maintenance-icon">
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="maintenance-title">التطبيق قيد التطوير حالياً</h1>
        <p className="maintenance-message">
          التطبيق قيد التطوير حالياً وسيعود قريباً
        </p>
        <p className="maintenance-message-en">
          The app is under development for now and it will be back soon
        </p>
        <div className="maintenance-actions">
          <button
            onClick={handleManualRetry}
            className="maintenance-retry-button"
          >
            إعادة المحاولة / Retry
          </button>
        </div>
        <p className="maintenance-note">
          سيتم إعادة المحاولة تلقائياً خلال 30 ثانية
          <br />
          Auto-retry in 30 seconds
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;


/**
 * Maintenance page: shown when the backend or database is unavailable. Retries by itself every 30 seconds.
 */
import { useEffect } from 'react';
import { Button, Icon } from '../ui';
import { useBackendError } from '../contexts/BackendErrorContext';
import './MaintenancePage.css';

const MaintenancePage = () => {
  const { clearBackendError } = useBackendError();

  const retry = () => {
    clearBackendError();
    window.location.reload();
  };

  useEffect(() => {
    const timer = setInterval(retry, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearBackendError]);

  return (
    <div className="mt-page" dir="rtl">
      <div className="mt-card">
        <span className="mt-icon"><Icon name="alert" size={40} /></span>
        <h1>التطبيق قيد التطوير حالياً</h1>
        <p>التطبيق قيد التطوير حالياً وسيعود قريباً</p>
        <p className="mt-en" dir="ltr">The app is under development for now and it will be back soon</p>
        <Button variant="primary" icon="refresh" onClick={retry}>إعادة المحاولة / Retry</Button>
        <p className="mt-note">سيتم إعادة المحاولة تلقائياً خلال 30 ثانية<br />Auto-retry in 30 seconds</p>
      </div>
    </div>
  );
};

export default MaintenancePage;

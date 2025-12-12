/**
 * NotificationSettings Component
 * UI for managing browser push notification preferences
 */

import { memo, useCallback } from 'react';
import { usePushNotifications } from '../contexts/PushNotificationContext';
import './NotificationSettings.css';

const NotificationSettings = ({ onClose }) => {
  const {
    isSupported,
    permission,
    preferences,
    isEnabled,
    requestPermission,
    updatePreferences,
  } = usePushNotifications();
  
  // Request permission handler
  const handleRequestPermission = useCallback(async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      updatePreferences({ enabled: true });
    }
  }, [requestPermission, updatePreferences]);
  
  // Toggle preference handler
  const handleToggle = useCallback((key) => {
    updatePreferences({ [key]: !preferences[key] });
  }, [preferences, updatePreferences]);
  
  // Not supported message
  if (!isSupported) {
    return (
      <div className="notification-settings">
        <div className="notification-settings-header">
          <h3>إعدادات الإشعارات</h3>
          {onClose && <button onClick={onClose} className="close-btn">×</button>}
        </div>
        <div className="notification-settings-body">
          <div className="not-supported">
            <span className="icon">⚠️</span>
            <p>متصفحك لا يدعم الإشعارات</p>
            <p className="hint">جرب استخدام متصفح Chrome أو Firefox</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Permission denied message
  if (permission === 'denied') {
    return (
      <div className="notification-settings">
        <div className="notification-settings-header">
          <h3>إعدادات الإشعارات</h3>
          {onClose && <button onClick={onClose} className="close-btn">×</button>}
        </div>
        <div className="notification-settings-body">
          <div className="permission-denied">
            <span className="icon">🚫</span>
            <p>تم رفض صلاحية الإشعارات</p>
            <p className="hint">لتفعيل الإشعارات، يرجى تغيير الإعدادات من المتصفح مباشرة</p>
            <ol className="steps">
              <li>اضغط على أيقونة القفل بجانب عنوان الموقع</li>
              <li>ابحث عن "الإشعارات" أو "Notifications"</li>
              <li>غيّر الإعداد إلى "السماح"</li>
              <li>أعد تحميل الصفحة</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }
  
  // Request permission prompt
  if (permission === 'default') {
    return (
      <div className="notification-settings">
        <div className="notification-settings-header">
          <h3>إعدادات الإشعارات</h3>
          {onClose && <button onClick={onClose} className="close-btn">×</button>}
        </div>
        <div className="notification-settings-body">
          <div className="permission-prompt">
            <span className="icon">🔔</span>
            <p>تفعيل إشعارات المتصفح</p>
            <p className="hint">احصل على إشعارات فورية للطلبات والردود الجديدة</p>
            <button 
              onClick={handleRequestPermission}
              className="btn-primary enable-btn"
            >
              تفعيل الإشعارات
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Settings UI (permission granted)
  return (
    <div className="notification-settings">
      <div className="notification-settings-header">
        <h3>إعدادات الإشعارات</h3>
        {onClose && <button onClick={onClose} className="close-btn">×</button>}
      </div>
      <div className="notification-settings-body">
        <div className="status-badge">
          <span className={`badge ${isEnabled ? 'badge-success' : 'badge-warning'}`}>
            {isEnabled ? '✓ مفعّلة' : '⚠ معطّلة'}
          </span>
        </div>
        
        <div className="settings-list">
          {/* Master toggle */}
          <div className="setting-item main-toggle">
            <label>
              <span className="setting-icon">🔔</span>
              <span className="setting-label">تفعيل الإشعارات</span>
            </label>
            <input
              type="checkbox"
              checked={preferences.enabled}
              onChange={() => handleToggle('enabled')}
              className="toggle-switch"
            />
          </div>
          
          <hr className="divider" />
          
          {/* Individual toggles */}
          <div className={`setting-item ${!preferences.enabled ? 'disabled' : ''}`}>
            <label>
              <span className="setting-icon">📝</span>
              <span className="setting-label">الطلبات الجديدة</span>
            </label>
            <input
              type="checkbox"
              checked={preferences.newRequests}
              onChange={() => handleToggle('newRequests')}
              disabled={!preferences.enabled}
              className="toggle-switch"
            />
          </div>
          
          <div className={`setting-item ${!preferences.enabled ? 'disabled' : ''}`}>
            <label>
              <span className="setting-icon">💬</span>
              <span className="setting-label">الردود الجديدة</span>
            </label>
            <input
              type="checkbox"
              checked={preferences.newResponses}
              onChange={() => handleToggle('newResponses')}
              disabled={!preferences.enabled}
              className="toggle-switch"
            />
          </div>
          
          <div className={`setting-item ${!preferences.enabled ? 'disabled' : ''}`}>
            <label>
              <span className="setting-icon">⚠️</span>
              <span className="setting-label">التنبيهات الذكية</span>
            </label>
            <input
              type="checkbox"
              checked={preferences.alerts}
              onChange={() => handleToggle('alerts')}
              disabled={!preferences.enabled}
              className="toggle-switch"
            />
          </div>
          
          <div className={`setting-item ${!preferences.enabled ? 'disabled' : ''}`}>
            <label>
              <span className="setting-icon">📄</span>
              <span className="setting-label">انتهاء المستندات</span>
            </label>
            <input
              type="checkbox"
              checked={preferences.documents}
              onChange={() => handleToggle('documents')}
              disabled={!preferences.enabled}
              className="toggle-switch"
            />
          </div>
        </div>
        
        <div className="settings-footer">
          <p className="hint">
            💡 الإشعارات ستظهر حتى عندما تكون على صفحة أخرى
          </p>
        </div>
      </div>
    </div>
  );
};

export default memo(NotificationSettings);


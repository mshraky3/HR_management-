/**
 * Push Notification Context
 * Manages browser push notification state and provides hooks
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  notify,
  NotificationTypes,
  getNotificationPreferences,
  saveNotificationPreferences,
  isNotificationTypeEnabled,
} from '../utils/pushNotifications';
import { useAuth } from './AuthContext';

const PushNotificationContext = createContext(null);

export const usePushNotifications = () => {
  const context = useContext(PushNotificationContext);
  if (!context) {
    throw new Error('usePushNotifications must be used within PushNotificationProvider');
  }
  return context;
};

export const PushNotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [permission, setPermission] = useState(getNotificationPermission());
  const [preferences, setPreferences] = useState(getNotificationPreferences());
  const [isSupported] = useState(isNotificationSupported());
  
  // Track last notification times to avoid spam
  const lastNotificationRef = useRef({});
  
  // Update permission state
  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);
  
  // Request notification permission
  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);
  
  // Update preferences
  const updatePreferences = useCallback((newPrefs) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    saveNotificationPreferences(updated);
  }, [preferences]);
  
  // Throttle notifications (prevent spam)
  const shouldShowNotification = useCallback((type, id = null) => {
    if (!preferences.enabled) return false;
    if (permission !== 'granted') return false;
    if (!isNotificationTypeEnabled(type)) return false;
    
    // Throttle: don't show same notification type within 5 seconds
    const key = `${type}_${id || 'default'}`;
    const now = Date.now();
    const lastTime = lastNotificationRef.current[key] || 0;
    
    if (now - lastTime < 5000) {
      return false;
    }
    
    lastNotificationRef.current[key] = now;
    return true;
  }, [permission, preferences.enabled]);
  
  // Show notification with checks
  const showNotification = useCallback((type, title, body, options = {}) => {
    if (!shouldShowNotification(type, options.id)) {
      return null;
    }
    
    // Call the appropriate notify function based on type
    switch (type) {
      case NotificationTypes.NEW_REQUEST:
        return notify.newRequest(title, body, options);
      case NotificationTypes.NEW_RESPONSE:
        return notify.newResponse(title, body, options);
      case NotificationTypes.ALERT:
        return notify.alert(title, body, options);
      case NotificationTypes.DOCUMENT:
        return notify.document(title, body, options);
      case NotificationTypes.SUCCESS:
        return notify.success(title, body, options);
      case NotificationTypes.WARNING:
        return notify.warning(title, body, options);
      case NotificationTypes.ERROR:
        return notify.error(title, body, options);
      default:
        return notify.info(title, body, options);
    }
  }, [shouldShowNotification]);
  
  // Convenience methods
  const notifyNewRequest = useCallback((requestName, branchName, onClick) => {
    return showNotification(
      NotificationTypes.NEW_REQUEST,
      'طلب جديد',
      `${requestName} من ${branchName}`,
      { onClick, id: `request_${Date.now()}` }
    );
  }, [showNotification]);
  
  const notifyNewResponse = useCallback((notificationTitle, branchName, onClick) => {
    return showNotification(
      NotificationTypes.NEW_RESPONSE,
      'رد جديد',
      `رد على "${notificationTitle}" من ${branchName}`,
      { onClick, id: `response_${Date.now()}` }
    );
  }, [showNotification]);
  
  const notifyAlert = useCallback((alertTitle, alertBody, onClick) => {
    return showNotification(
      NotificationTypes.ALERT,
      alertTitle,
      alertBody,
      { onClick, id: `alert_${Date.now()}` }
    );
  }, [showNotification]);
  
  const notifyDocumentExpiring = useCallback((documentName, daysLeft, onClick) => {
    return showNotification(
      NotificationTypes.DOCUMENT,
      'مستند قارب على الانتهاء',
      `${documentName} - متبقي ${daysLeft} يوم`,
      { onClick, id: `doc_${documentName}` }
    );
  }, [showNotification]);
  
  // Check if user should be prompted for permission
  const shouldPromptForPermission = useCallback(() => {
    return isSupported && permission === 'default' && isAuthenticated;
  }, [isSupported, permission, isAuthenticated]);
  
  const value = {
    // State
    isSupported,
    permission,
    preferences,
    isEnabled: permission === 'granted' && preferences.enabled,
    
    // Actions
    requestPermission,
    updatePreferences,
    showNotification,
    shouldPromptForPermission,
    
    // Convenience methods
    notifyNewRequest,
    notifyNewResponse,
    notifyAlert,
    notifyDocumentExpiring,
    
    // Types for reference
    NotificationTypes,
  };
  
  return (
    <PushNotificationContext.Provider value={value}>
      {children}
    </PushNotificationContext.Provider>
  );
};

export default PushNotificationContext;


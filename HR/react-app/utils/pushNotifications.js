/**
 * Browser Push Notifications Utility
 * Handles requesting permission and showing native browser notifications
 */

// Check if browser supports notifications
export const isNotificationSupported = () => {
  return 'Notification' in window;
};

// Get current notification permission status
export const getNotificationPermission = () => {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission; // 'default', 'granted', 'denied'
};

// Request permission to show notifications
export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    console.warn('Browser does not support notifications');
    return 'unsupported';
  }
  
  // If already granted or denied, return current status
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'error';
  }
};

// Default notification options
const defaultOptions = {
  icon: '/favicon.ico', // Update with your app icon
  badge: '/favicon.ico',
  dir: 'rtl', // Right-to-left for Arabic
  lang: 'ar',
  requireInteraction: false,
  silent: false,
};

/**
 * Show a browser notification
 * @param {string} title - Notification title
 * @param {Object} options - Notification options
 * @param {string} options.body - Notification body text
 * @param {string} options.icon - Icon URL
 * @param {string} options.tag - Tag to group notifications
 * @param {Object} options.data - Custom data to pass to click handler
 * @param {Function} onClick - Click handler function
 * @param {Function} onClose - Close handler function
 * @returns {Notification|null}
 */
export const showNotification = (title, options = {}, onClick = null, onClose = null) => {
  if (!isNotificationSupported()) {
    console.warn('Browser does not support notifications');
    return null;
  }
  
  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }
  
  try {
    const notification = new Notification(title, {
      ...defaultOptions,
      ...options,
    });
    
    // Handle click
    if (onClick) {
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        onClick(options.data);
        notification.close();
      };
    } else {
      // Default click behavior - focus window
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
    
    // Handle close
    if (onClose) {
      notification.onclose = () => onClose(options.data);
    }
    
    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
};

/**
 * Notification types with predefined styles
 */
export const NotificationTypes = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  NEW_REQUEST: 'new_request',
  NEW_RESPONSE: 'new_response',
  ALERT: 'alert',
  DOCUMENT: 'document',
};

// Type-specific icons (emojis as fallback, can be replaced with actual icon URLs)
const typeIcons = {
  [NotificationTypes.INFO]: '📢',
  [NotificationTypes.SUCCESS]: '✅',
  [NotificationTypes.WARNING]: '⚠️',
  [NotificationTypes.ERROR]: '❌',
  [NotificationTypes.NEW_REQUEST]: '📝',
  [NotificationTypes.NEW_RESPONSE]: '💬',
  [NotificationTypes.ALERT]: '🔔',
  [NotificationTypes.DOCUMENT]: '📄',
};

/**
 * Show a typed notification with predefined styling
 * @param {string} type - Notification type from NotificationTypes
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} options - Additional options
 */
export const showTypedNotification = (type, title, body, options = {}) => {
  const icon = typeIcons[type] || typeIcons[NotificationTypes.INFO];
  
  return showNotification(
    `${icon} ${title}`,
    {
      body,
      tag: type, // Group notifications of same type
      ...options,
    },
    options.onClick,
    options.onClose
  );
};

/**
 * Quick notification helpers
 */
export const notify = {
  info: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.INFO, title, body, options),
  
  success: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.SUCCESS, title, body, options),
  
  warning: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.WARNING, title, body, options),
  
  error: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.ERROR, title, body, options),
  
  newRequest: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.NEW_REQUEST, title, body, options),
  
  newResponse: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.NEW_RESPONSE, title, body, options),
  
  alert: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.ALERT, title, body, options),
  
  document: (title, body, options = {}) => 
    showTypedNotification(NotificationTypes.DOCUMENT, title, body, options),
};

/**
 * Storage key for notification preferences
 */
const NOTIFICATION_PREFS_KEY = 'hr_notification_preferences';

/**
 * Get notification preferences from localStorage
 */
export const getNotificationPreferences = () => {
  try {
    const prefs = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (prefs) {
      return JSON.parse(prefs);
    }
  } catch (e) {
    console.error('Error reading notification preferences:', e);
  }
  
  // Default preferences
  return {
    enabled: true,
    newRequests: true,
    newResponses: true,
    alerts: true,
    documents: true,
    sound: true,
  };
};

/**
 * Save notification preferences to localStorage
 */
export const saveNotificationPreferences = (prefs) => {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch (e) {
    console.error('Error saving notification preferences:', e);
    return false;
  }
};

/**
 * Check if a notification type is enabled
 */
export const isNotificationTypeEnabled = (type) => {
  const prefs = getNotificationPreferences();
  
  if (!prefs.enabled) return false;
  
  switch (type) {
    case NotificationTypes.NEW_REQUEST:
      return prefs.newRequests;
    case NotificationTypes.NEW_RESPONSE:
      return prefs.newResponses;
    case NotificationTypes.ALERT:
      return prefs.alerts;
    case NotificationTypes.DOCUMENT:
      return prefs.documents;
    default:
      return true;
  }
};

export default {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  showTypedNotification,
  notify,
  NotificationTypes,
  getNotificationPreferences,
  saveNotificationPreferences,
  isNotificationTypeEnabled,
};


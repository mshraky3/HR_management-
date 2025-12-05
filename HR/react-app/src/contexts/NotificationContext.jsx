/**
 * Notification Context
 * Provides toast notification functionality across the app
 */

import { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      message,
      type, // 'success', 'error', 'warning', 'info'
    };

    setNotifications((prev) => [...prev, notification]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);

    return id;
  }, []);

  const showSuccess = useCallback((message) => {
    return showNotification(message, 'success');
  }, [showNotification]);

  const showError = useCallback((message) => {
    return showNotification(message, 'error');
  }, [showNotification]);

  const showWarning = useCallback((message) => {
    return showNotification(message, 'warning');
  }, [showNotification]);

  const showInfo = useCallback((message) => {
    return showNotification(message, 'info');
  }, [showNotification]);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value = {
    notifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    removeNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Toast Notifications Container */}
      <div className="notifications-container">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`notification-toast notification-${notification.type}`}
            onClick={() => removeNotification(notification.id)}
          >
            <div className="notification-content">
              <span className="notification-icon">
                {notification.type === 'success' && '✓'}
                {notification.type === 'error' && '✗'}
                {notification.type === 'warning' && (
                  <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '20px', height: '20px' }} />
                )}
                {notification.type === 'info' && 'ℹ'}
              </span>
              <span className="notification-message">{notification.message}</span>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};


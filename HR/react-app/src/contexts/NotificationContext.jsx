/**
 * Notification Context
 * Provides toast notification functionality across the app
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";

// Ensure a single context instance even if Vite loads this module twice
// (e.g. different dev query strings like `?v=dev` causing duplicate module ids).
const NOTIFICATION_CONTEXT_KEY = "__HR_APP_NOTIFICATION_CONTEXT__";
const NotificationContext =
  typeof globalThis !== "undefined" && globalThis[NOTIFICATION_CONTEXT_KEY]
    ? globalThis[NOTIFICATION_CONTEXT_KEY]
    : createContext(null);
if (
  typeof globalThis !== "undefined" &&
  !globalThis[NOTIFICATION_CONTEXT_KEY]
) {
  globalThis[NOTIFICATION_CONTEXT_KEY] = NotificationContext;
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((message, type = "info", duration = 5000) => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      message,
      type, // 'success', 'error', 'warning', 'info', 'server-error'
    };

    setNotifications((prev) => [...prev, notification]);

    // Auto remove after duration
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, duration);

    return id;
  }, []);

  const showSuccess = useCallback(
    (message) => {
      return showNotification(message, "success");
    },
    [showNotification],
  );

  const showError = useCallback(
    (message) => {
      return showNotification(message, "error");
    },
    [showNotification],
  );

  const showWarning = useCallback(
    (message) => {
      return showNotification(message, "warning");
    },
    [showNotification],
  );

  const showInfo = useCallback(
    (message) => {
      return showNotification(message, "info");
    },
    [showNotification],
  );

  // Special notification for server errors (500) - longer duration, friendlier message
  const showServerError = useCallback(
    (originalMessage) => {
      const friendlyMessage = "حدث خطأ في النظام. تم إرسال تقرير تلقائي للإدارة وسيتم حل المشكلة خلال ٢-٣ ساعات. يرجى المحاولة لاحقاً.";
      return showNotification(friendlyMessage, "server-error", 12000); // 12 seconds
    },
    [showNotification],
  );

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Expose showServerError globally for api.js to use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__showServerError = showServerError;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__showServerError;
      }
    };
  }, [showServerError]);

  const value = {
    notifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showServerError,
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
                {notification.type === "success" && "✓"}
                {notification.type === "error" && "✗"}
                {notification.type === "warning" && (
                  <img
                    src="https://img.icons8.com/material-rounded/20/error.png"
                    alt="تحذير"
                    style={{ width: "20px", height: "20px" }}
                  />
                )}
                {notification.type === "info" && "ℹ"}
                {notification.type === "server-error" && "⚠️"}
              </span>
              <span className="notification-message">
                {notification.message}
              </span>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

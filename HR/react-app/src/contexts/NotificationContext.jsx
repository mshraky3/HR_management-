/**
 * Notification Context
 * Provides toast notification functionality across the app
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import Icon from "../ui/Icon";

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
    (_originalMessage) => {
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
      {/* Toasts: polite live region; errors are announced assertively */}
      <div className="ui-toasts" aria-live="polite" aria-atomic="false">
        {notifications.map((notification) => {
          const isError = notification.type === "error" || notification.type === "server-error";
          const icon = notification.type === "success" ? "check-circle"
            : isError ? "x-circle"
              : notification.type === "warning" ? "alert" : "info";
          return (
            <div
              key={notification.id}
              className={`ui-toast ui-toast-${notification.type}`}
              role={isError ? "alert" : "status"}
            >
              <Icon name={icon} size={20} />
              <span className="ui-toast-message">{notification.message}</span>
              <button
                type="button"
                className="ui-toast-close"
                onClick={() => removeNotification(notification.id)}
                aria-label="إغلاق التنبيه"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

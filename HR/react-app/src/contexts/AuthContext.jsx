/**
 * Authentication Context
 * Manages authentication state across the app
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { authAPI } from "../utils/api";

// Ensure a single context instance even if Vite loads this module twice
// (e.g. different dev query strings like `?v=dev` causing duplicate module ids).
const AUTH_CONTEXT_KEY = "__HR_APP_AUTH_CONTEXT__";

const AuthContext =
  typeof globalThis !== "undefined" && globalThis[AUTH_CONTEXT_KEY]
    ? globalThis[AUTH_CONTEXT_KEY]
    : createContext(null);

if (typeof globalThis !== "undefined" && !globalThis[AUTH_CONTEXT_KEY]) {
  globalThis[AUTH_CONTEXT_KEY] = AuthContext;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const logoutInProgressRef = useRef(false);

  // Inactivity auto-logout configuration
  const getEnv = (name, fallback) => {
    // Support Vite's import.meta.env (VITE_*) and legacy REACT_APP_* names; fallback to process.env if available
    const viteName = name.startsWith("REACT_APP_")
      ? name.replace(/^REACT_APP_/, "VITE_")
      : name;
    // Safely access import.meta.env using try/catch to avoid parser errors in environments that don't support it
    let metaEnv;
    try {
      metaEnv = import.meta?.env;
    } catch (e) {
      metaEnv = undefined;
    }

    if (metaEnv) {
      const v = metaEnv[viteName] ?? metaEnv[name];
      if (v !== undefined) return v;
    }
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env[name] !== undefined
    ) {
      return process.env[name];
    }
    return fallback;
  };

  const IDLE_TIMEOUT_MS = parseInt(
    getEnv("REACT_APP_IDLE_TIMEOUT_MS", String(10 * 60 * 1000)),
    10,
  ); // default 10 minutes
  const WARNING_MS = parseInt(
    getEnv("REACT_APP_IDLE_WARNING_MS", String(1 * 60 * 1000)),
    10,
  ); // default 1 minute warning

  const IS_DEV =
    import.meta?.env?.MODE === "development" ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "development");

  // Idle UI state
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState(
    Math.ceil(WARNING_MS / 1000),
  );

  // Timer refs
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  // Ref to always hold the latest logout function, avoiding TDZ in callbacks declared before logout
  const logoutRef = useRef(null);

  const setLastActivity = useCallback((ts = Date.now()) => {
    try {
      localStorage.setItem("lastActivity", String(ts));
      // Write a separate signal key to ensure storage events fire across tabs
      localStorage.setItem("activitySignal", String(ts));
    } catch (err) {
      // ignore storage errors (e.g., private mode)
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();

    const last = parseInt(
      localStorage.getItem("lastActivity") || String(Date.now()),
      10,
    );
    const elapsed = Date.now() - last;
    const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);

    const warningDelay = Math.max(0, remaining - WARNING_MS);

    warningTimerRef.current = setTimeout(() => {
      // Show warning and countdown
      setIdleWarningVisible(true);
      let remainingSeconds = Math.ceil(WARNING_MS / 1000);
      setIdleCountdownSeconds(remainingSeconds);
      countdownIntervalRef.current = setInterval(() => {
        remainingSeconds -= 1;
        setIdleCountdownSeconds(remainingSeconds);
        if (remainingSeconds <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, 1000);
    }, warningDelay);

    logoutTimerRef.current = setTimeout(async () => {
      // Force logout
      setIdleWarningVisible(false);
      try {
        await logoutRef.current?.();
      } catch (err) {
        // ignore
      }
      // broadcast force logout to other tabs
      try {
        localStorage.setItem("forceLogout", String(Date.now()));
      } catch (err) { }
    }, remaining + 50); // small buffer
  }, [IDLE_TIMEOUT_MS, WARNING_MS, clearTimers]);

  const userActivityHandler = useCallback(() => {
    // On any user activity, reset timers and hide warning
    setIdleWarningVisible(false);
    setIdleCountdownSeconds(Math.ceil(WARNING_MS / 1000));
    setLastActivity();
    scheduleTimers();
  }, [setLastActivity, scheduleTimers, WARNING_MS]);

  // Listen for cross-tab activity signals and force logout signals
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === "activitySignal" || e.key === "lastActivity") {
        // Another tab registered activity - reset timers
        setIdleWarningVisible(false);
        setIdleCountdownSeconds(Math.ceil(WARNING_MS / 1000));
        scheduleTimers();
      }
      if (e.key === "forceLogout") {
        // Another tab forced logout
        logoutRef.current?.();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scheduleTimers, WARNING_MS]);

  // Set up activity listeners on mount
  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];
    for (const ev of events) {
      window.addEventListener(ev, userActivityHandler, { passive: true });
    }

    // Also track visibility change
    const onVisibility = () => {
      if (!document.hidden) {
        userActivityHandler();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Initialize lastActivity and schedules
    if (!localStorage.getItem("lastActivity")) {
      setLastActivity();
    }
    scheduleTimers();

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, userActivityHandler);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
    };
  }, [userActivityHandler, scheduleTimers, clearTimers, setLastActivity]);

  // Load user on mount if token exists
  useEffect(() => {
    const loadUser = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          const response = await authAPI.getMe();
          if (response.data.success) {
            setUser(response.data.user);
            setToken(storedToken);
            // Update stored user data with fresh data from server
            localStorage.setItem("user", JSON.stringify(response.data.user));
          } else {
            // Invalid token or user data - only clear if API explicitly says so
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setToken(null);
          }
        } catch (error) {
          // Check if it's an authentication error (401) vs network error
          const isAuthError = error.response?.status === 401;
          const isNetworkError = !error.response; // No response = network issue

          if (isAuthError) {
            // Token is invalid or expired - clear it
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setToken(null);
          } else if (isNetworkError) {
            // Network error - keep token and use stored user data as fallback
            // This prevents logout on page reload when network is temporarily unavailable
            try {
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
                setToken(storedToken);
                // Log warning in development
                if (IS_DEV) {
                  console.warn(
                    "Network error loading user, using stored data:",
                    error,
                  );
                }
              } else {
                // No stored user data, but keep token for retry
                setToken(storedToken);
              }
            } catch (parseError) {
              // Stored user data is invalid, but keep token for retry
              setToken(storedToken);
              if (IS_DEV) {
                console.warn("Could not parse stored user data:", parseError);
              }
            }
          } else {
            // Other error (500, etc.) - keep token, might be temporary server issue
            try {
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
                setToken(storedToken);
              } else {
                setToken(storedToken);
              }
            } catch (parseError) {
              setToken(storedToken);
            }
            if (IS_DEV) {
              console.warn("Failed to load user, but keeping session:", error);
            }
          }
        }
      }
      // Always set loading to false, even if there's an error
      // This ensures the app doesn't get stuck in loading state
      setLoading(false);
    };

    loadUser();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await authAPI.login(username, password);
      if (response.data.success) {
        // Branch login: requires OTP step
        if (response.data.requiresOTP) {
          return {
            success: true,
            requiresOTP: true,
            maskedEmail: response.data.maskedEmail,
            username: response.data.username,
            isUserOTP: response.data.isUserOTP || false,
          };
        }
        // Main manager: direct login
        const { token: newToken, user: userData } = response.data;
        localStorage.setItem("token", newToken);
        localStorage.setItem("user", JSON.stringify(userData));
        setToken(newToken);
        setUser(userData);
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Login failed",
        noEmail: error.response?.data?.noEmail,
        username: error.response?.data?.username,
        branchName: error.response?.data?.branchName,
      };
    }
  };

  const completeOTPLogin = async (username, otp, isUserOTP = false) => {
    try {
      const response = await authAPI.verifyOTP(username, otp, isUserOTP);
      if (response.data.success) {
        const { token: newToken, user: userData } = response.data;
        localStorage.setItem("token", newToken);
        localStorage.setItem("user", JSON.stringify(userData));
        setToken(newToken);
        setUser(userData);
        return { success: true };
      }
      return { success: false, message: response.data.message, expired: response.data.expired };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "فشل التحقق من الرمز",
        expired: error.response?.data?.expired,
      };
    }
  };

  const logout = useCallback(async () => {
    // Prevent multiple simultaneous logout calls
    if (logoutInProgressRef.current) {
      return;
    }
    logoutInProgressRef.current = true;

    try {
      await authAPI.logout();
    } catch (error) {
      // Silently handle logout errors (token might be expired, which is fine)
      // Only log in development
      if (IS_DEV) {
        console.error("Logout error:", error);
      }
    } finally {
      try {
        localStorage.setItem("forceLogout", String(Date.now()));
      } catch (err) { }
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
      logoutInProgressRef.current = false;
    }
  }, []);
  // Keep ref in sync so scheduleTimers/onStorage always call the latest logout
  logoutRef.current = logout;

  // Keep-alive helper to mark activity (useful for API calls)
  const markActivity = useCallback(() => {
    try {
      localStorage.setItem("lastActivity", String(Date.now()));
      localStorage.setItem("activitySignal", String(Date.now()));
    } catch (err) { }
  }, []);

  const isMainManager = () => {
    return user?.role === "main_manager";
  };

  const isBranchManager = () => {
    return user?.role === "branch_manager";
  };

  const isBranchOperationsManager = () => {
    return user?.role === "branch_operations_manager";
  };

  const value = {
    user,
    token,
    loading,
    login,
    completeOTPLogin,
    logout,
    markActivity,
    isMainManager,
    isBranchManager,
    isBranchOperationsManager,
    isAuthenticated: !!token,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {idleWarningVisible && (
        <div
          className="modal-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 9999 }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 420, margin: "10% auto", padding: 20 }}
          >
            <h3>سيتم تسجيل الخروج لعدم النشاط</h3>
            <p>
              سيتم تسجيل الخروج خلال <strong>{idleCountdownSeconds}</strong>{" "}
              ثانية إن لم تقم بأي نشاط.
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                onClick={() => {
                  userActivityHandler();
                }}
                className="btn"
              >
                ابق مسجلاً
              </button>
              <button
                onClick={() => {
                  logout();
                }}
                className="btn btn-danger"
              >
                تسجيل الخروج الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

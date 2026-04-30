import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Load critical CSS first - before any components
import "./index.css";
// Load shared styles immediately to prevent FOUC (Flash of Unstyled Content)
import "./styles/buttons.css";
import "./styles/containers.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { initErrorTracking } from "./utils/errorTracking.js";

// Initialize error tracking for email notifications on critical errors
initErrorTracking();

const safeToString = (v) => {
  try {
    if (typeof v === "string") return v;
    if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack || ""}`;
    return JSON.stringify(v);
  } catch (e) {
    try {
      return String(v);
    } catch (e2) {
      return "[Unprintable error]";
    }
  }
};

// Some devtools/console hooks crash when logging non-primitive objects (e.g. AxiosError).
// Sanitize console output to prevent "Cannot convert object to primitive value" from breaking the app.
try {
  const wrap = (methodName) => {
    const original = console[methodName]?.bind(console);
    if (!original) return;
    console[methodName] = (...args) => {
      const safeArgs = args.map((a) => {
        const t = typeof a;
        if (a == null || t === "string" || t === "number" || t === "boolean")
          return a;
        return safeToString(a);
      });
      original(...safeArgs);
    };
  };
  wrap("error");
  wrap("warn");
} catch (e) {
  // ignore
}

// Add global error handler for unhandled errors
window.addEventListener("error", (event) => {
  const err = event?.error;
  console.error(`Global error: ${safeToString(err)}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  const payload = {
    message: error?.message || "Unknown error",
    stack: error?.stack,
    response: error?.response
      ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url,
        method: error.config?.method,
      }
      : null,
    code: error?.code,
    name: error?.name,
  };
  console.error(`Unhandled promise rejection: ${safeToString(payload)}`);

  // Check if this is a backend/database error
  const errorCode = error?.code || "";
  const errorErrno = error?.errno || "";
  const errorMessage = (error?.message || "").toLowerCase();

  const isBackendError =
    !error?.response || // Network error
    error.response?.status === 500 || // Server error
    error.response?.status === 503 || // Service unavailable
    errorCode === "ECONNREFUSED" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "CONNECTION_CLOSED" ||
    errorErrno === "CONNECTION_CLOSED" ||
    errorMessage.includes("connection_closed") ||
    errorMessage.includes("connection closed") ||
    (error.response?.status === 500 &&
      (error.response?.data?.message || "")
        .toLowerCase()
        .includes("connection"));

  // Set backend error state if available
  if (isBackendError && window.setBackendError) {
    window.setBackendError(error);
  }
});

// Verify root element exists before rendering
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
  document.body.innerHTML =
    '<div style="padding: 20px; font-family: Arial; color: red;">Error: Root element not found. Please check the HTML structure.</div>';
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
    // Mark that React has mounted
    window.reactMounted = true;
  } catch (error) {
    console.error("Failed to render app:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: Arial; text-align: center;">
        <h1 style="color: #ef4444;">خطأ في تحميل التطبيق</h1>
        <p style="color: #64748b;">Error: ${error.message}</p>
        <pre style="text-align: left; background: #f3f4f6; padding: 10px; border-radius: 4px; overflow: auto;">${error.stack || error.toString()}</pre>
        <button onclick="window.location.reload()" style="padding: 12px 24px; background: #4988C4; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">
          تحديث الصفحة
        </button>
      </div>
    `;
  }
}

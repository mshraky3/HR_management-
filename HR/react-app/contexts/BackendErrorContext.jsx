/**
 * Backend Error Context
 * Manages backend/database connection error state across the app
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Ensure a single context instance even if Vite loads this module twice
// (e.g. different dev query strings like `?v=dev` causing duplicate module ids).
const BACKEND_ERROR_CONTEXT_KEY = '__HR_APP_BACKEND_ERROR_CONTEXT__';
const BackendErrorContext =
  (typeof globalThis !== 'undefined' && globalThis[BACKEND_ERROR_CONTEXT_KEY])
    ? globalThis[BACKEND_ERROR_CONTEXT_KEY]
    : createContext(null);
if (typeof globalThis !== 'undefined' && !globalThis[BACKEND_ERROR_CONTEXT_KEY]) {
  globalThis[BACKEND_ERROR_CONTEXT_KEY] = BackendErrorContext;
}

export const useBackendError = () => {
  const context = useContext(BackendErrorContext);
  if (!context) {
    throw new Error('useBackendError must be used within BackendErrorProvider');
  }
  return context;
};

export const BackendErrorProvider = ({ children }) => {
  const [isBackendDown, setIsBackendDown] = useState(false);
  const [error, setError] = useState(null);

  const setBackendError = useCallback((errorObj) => {
    setError(errorObj);
    setIsBackendDown(true);
  }, []);

  const clearBackendError = useCallback(() => {
    setError(null);
    setIsBackendDown(false);
  }, []);

  // Expose setBackendError globally so api.js can call it
  // This is set up in useEffect to avoid issues during SSR
  useEffect(() => {
    window.setBackendError = setBackendError;
    return () => {
      delete window.setBackendError;
    };
  }, [setBackendError]);

  const value = {
    isBackendDown,
    error,
    setBackendError,
    clearBackendError,
  };

  return (
    <BackendErrorContext.Provider value={value}>
      {children}
    </BackendErrorContext.Provider>
  );
};


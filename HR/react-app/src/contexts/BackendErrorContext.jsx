/**
 * Backend Error Context
 * Manages backend/database connection error state across the app
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const BackendErrorContext = createContext(null);

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
    console.error('Backend/Database Error Detected:', {
      message: errorObj?.message || 'Unknown error',
      stack: errorObj?.stack,
      response: errorObj?.response ? {
        status: errorObj.response.status,
        statusText: errorObj.response.statusText,
        data: errorObj.response.data,
        url: errorObj.config?.url,
        method: errorObj.config?.method,
      } : null,
      code: errorObj?.code,
      name: errorObj?.name,
    });
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


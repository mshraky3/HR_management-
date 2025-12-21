/**
 * Authentication Context
 * Manages authentication state across the app
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  // Load user on mount if token exists
  useEffect(() => {
    const loadUser = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const response = await authAPI.getMe();
          if (response.data.success) {
            setUser(response.data.user);
            setToken(storedToken);
            // Update stored user data with fresh data from server
            localStorage.setItem('user', JSON.stringify(response.data.user));
          } else {
            // Invalid token or user data - only clear if API explicitly says so
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setToken(null);
          }
        } catch (error) {
          // Check if it's an authentication error (401) vs network error
          const isAuthError = error.response?.status === 401;
          const isNetworkError = !error.response; // No response = network issue
          
          if (isAuthError) {
            // Token is invalid or expired - clear it
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setToken(null);
          } else if (isNetworkError) {
            // Network error - keep token and use stored user data as fallback
            // This prevents logout on page reload when network is temporarily unavailable
            try {
              const storedUser = localStorage.getItem('user');
              if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
                setToken(storedToken);
                // Log warning in development
                if (process.env.NODE_ENV === 'development') {
                  console.warn('Network error loading user, using stored data:', error);
                }
              } else {
                // No stored user data, but keep token for retry
                setToken(storedToken);
              }
            } catch (parseError) {
              // Stored user data is invalid, but keep token for retry
              setToken(storedToken);
              if (process.env.NODE_ENV === 'development') {
                console.warn('Could not parse stored user data:', parseError);
              }
            }
          } else {
            // Other error (500, etc.) - keep token, might be temporary server issue
            try {
              const storedUser = localStorage.getItem('user');
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
            if (process.env.NODE_ENV === 'development') {
              console.warn('Failed to load user, but keeping session:', error);
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
        const { token: newToken, user: userData } = response.data;
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(newToken);
        setUser(userData);
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const isMainManager = () => {
    return user?.role === 'main_manager';
  };

  const isBranchManager = () => {
    return user?.role === 'branch_manager';
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isMainManager,
    isBranchManager,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


/**
 * API Configuration
 * Centralized API URL configuration for easy switching between environments
 *
 * HOW TO USE:
 * 1. For local development: Set CURRENT to 'LOCAL'
 * 2. For production: Set CURRENT to 'PRODUCTION' and update PRODUCTION URL
 * 3. Or use environment variable: Create .env file with VITE_API_URL=your-url
 *
 * Priority: Environment variable > CURRENT setting > Default LOCAL
 *
 * IMPORTANT: No auto-switching - CURRENT setting determines the API URL
 * Change CURRENT manually if you need to switch environments
 */

const API_CONFIG = {
  // Local development URL
  LOCAL: "http://localhost:3000",

  // Production URL (update this with your production API URL)
  PRODUCTION: "https://hr-management-azure.vercel.app",

  // Current environment - Change this to switch between LOCAL and PRODUCTION
  // Options: 'LOCAL' or 'PRODUCTION'
  // For production deployment, set to 'PRODUCTION' or use VITE_API_URL env variable
  CURRENT: "PRODUCTION", // <-- Change this to 'LOCAL' or 'PRODUCTION'
};

const getApiUrl = () => {
  // Check for environment variable first (highest priority)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Use CURRENT setting (no auto-switching)
  return API_CONFIG[API_CONFIG.CURRENT] || API_CONFIG.LOCAL;
};

// Export function to get current API URL
export const getCurrentApiUrl = () => getApiUrl();

// Export the API URL (used throughout the app)
export const API_URL = getApiUrl();

// Export config object for easy access and debugging
export default {
  API_URL,
  getCurrentApiUrl,
  config: API_CONFIG,
  // Check if currently using LOCAL environment
  isLocal: () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.includes("localhost");
    }
    return API_CONFIG.CURRENT === "LOCAL";
  },
  // Check if currently using PRODUCTION environment
  isProduction: () => {
    if (import.meta.env.VITE_API_URL) {
      return !import.meta.env.VITE_API_URL.includes("localhost");
    }
    return API_CONFIG.CURRENT === "PRODUCTION";
  },
  // Helper to get current environment name
  getCurrentEnv: () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.includes("localhost")
        ? "LOCAL"
        : "PRODUCTION";
    }
    return API_CONFIG.CURRENT;
  },
};

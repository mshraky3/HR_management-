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
 */

const API_CONFIG = {
  // Local development URL
  LOCAL: 'http://localhost:3000',
  
  // Production URL (update this with your production API URL)
  PRODUCTION: 'https://hr-management-azure.vercel.app/',
  
  // Current environment - Change this to switch between LOCAL and PRODUCTION
  // Options: 'LOCAL' or 'PRODUCTION'
  CURRENT: 'LOCAL'
};

/**
 * Get the API URL based on current environment
 * Priority: Environment variable > CURRENT setting > Default LOCAL
 */
const getApiUrl = () => {
  // First check for environment variable (Vite .env file)
  // This takes highest priority
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Otherwise use the CURRENT setting from config
  return API_CONFIG[API_CONFIG.CURRENT] || API_CONFIG.LOCAL;
};

// Export the API URL (used throughout the app)
export const API_URL = getApiUrl();

// Export config object for easy access and debugging
export default {
  API_URL,
  config: API_CONFIG,
  isLocal: () => API_CONFIG.CURRENT === 'LOCAL',
  isProduction: () => API_CONFIG.CURRENT === 'PRODUCTION',
  // Helper to get current environment name
  getCurrentEnv: () => API_CONFIG.CURRENT,
};


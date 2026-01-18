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
 * AUTO-FALLBACK:
 * If CURRENT is set to 'LOCAL' and localhost connection fails,
 * automatically switches to PRODUCTION URL via axios interceptor
 */

const API_CONFIG = {
  // Local development URL
  LOCAL: 'http://localhost:3000',

  // Production URL (update this with your production API URL)
  PRODUCTION: 'https://hr-management-azure.vercel.app',
  // Current environment - Change this to switch between LOCAL and PRODUCTION
  // Options: 'LOCAL' or 'PRODUCTION'
  // For production deployment, set to 'PRODUCTION' or use VITE_API_URL env variable
  CURRENT: 'LOCAL'
};

// Track if we've already switched to production (prevent infinite retry loops)
let switchedToProduction = false;

const getApiUrl = () => {

  if (switchedToProduction) {
    return API_CONFIG.PRODUCTION;
  }

  return API_CONFIG[API_CONFIG.CURRENT] || API_CONFIG.LOCAL;
};

// Export function to switch to production URL (used by axios interceptor)
export const switchToProductionUrl = () => {
  if (!switchedToProduction && API_CONFIG.CURRENT === 'LOCAL') {
    switchedToProduction = true;
    console.warn('[API Config] Localhost connection failed, switching to PRODUCTION URL');
  }
};

// Export function to get current API URL (can change dynamically)
export const getCurrentApiUrl = () => getApiUrl();

// Export the API URL (used throughout the app)
export const API_URL = getApiUrl();

// Export config object for easy access and debugging
export default {
  API_URL,
  getCurrentApiUrl,
  switchToProductionUrl,
  config: API_CONFIG,
  isLocal: () => API_CONFIG.CURRENT === 'LOCAL' && !switchedToProduction,
  isProduction: () => switchedToProduction || API_CONFIG.CURRENT === 'PRODUCTION',
  // Helper to get current environment name
  getCurrentEnv: () => switchedToProduction ? 'PRODUCTION' : API_CONFIG.CURRENT,
};


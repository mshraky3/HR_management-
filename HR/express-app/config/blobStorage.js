/**
 * Blob Storage Configuration
 * Centralized blob storage token management with support for dual blob stores
 * 
 * SWITCHING BETWEEN BLOB STORES:
 * ===============================
 * To use the ORIGINAL blob store (default):
 *   - Set USE_SPARE_BLOB=false in .env
 *   - OR remove USE_SPARE_BLOB from .env
 *   - OR don't set it at all
 * 
 * To use the SPARE blob store:
 *   - Set USE_SPARE_BLOB=true in .env
 * 
 * After changing USE_SPARE_BLOB, restart your server for changes to take effect.
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * ===============================
 * - BLOB_READ_WRITE_TOKEN: Original blob store token (required)
 * - SPARE_BLOB_READ_WRITE_TOKEN: Spare blob store token (optional, required if using spare)
 * - USE_SPARE_BLOB: 'true' or 'false' (optional, defaults to false/original)
 * 
 * Provides intelligent token selection and fallback mechanisms
 */

import dotenv from 'dotenv';

dotenv.config();

// Read blob storage tokens from environment
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const spareBlobToken = process.env.SPARE_BLOB_READ_WRITE_TOKEN;

// Determine which blob store to use
// Set USE_SPARE_BLOB=true in .env to use spare blob store
// Set USE_SPARE_BLOB=false or don't set it to use original blob store (default)
const useSpareBlob = process.env.USE_SPARE_BLOB === 'false';

/**
 * Get the original blob storage token
 * @returns {string|null} - Original blob token or null if not configured
 */
export function getOriginalBlobToken() {
  return originalBlobToken || null;
}

/**
 * Get the spare blob storage token
 * @returns {string|null} - Spare blob token or null if not configured
 */
export function getSpareBlobToken() {
  return spareBlobToken || null;
}

/**
 * Get the currently active blob storage token based on USE_SPARE_BLOB setting
 * @returns {string|null} - Active blob token or null if not configured
 */
export function getActiveBlobToken() {
  if (useSpareBlob) {
    return spareBlobToken || null;
  }
  return originalBlobToken || null;
}

/**
 * Get all blob tokens for failover scenarios
 * Returns [activeToken, fallbackToken] array
 * @returns {[string|null, string|null]} - [activeToken, fallbackToken]
 */
export function getAllBlobTokens() {
  const activeToken = getActiveBlobToken();
  const fallbackToken = useSpareBlob ? originalBlobToken : spareBlobToken;
  return [activeToken, fallbackToken || null];
}

/**
 * Get the name of the currently active blob store
 * @returns {string} - 'original' or 'spare'
 */
export function getBlobStoreName() {
  return useSpareBlob ? 'spare' : 'original';
}

/**
 * Check if at least one blob storage token is configured
 * @returns {boolean} - Whether at least one token is available
 */
export function isBlobStorageConfigured() {
  return !!(originalBlobToken || spareBlobToken);
}

/**
 * Get blob storage configuration status for debugging/logging
 * Shows which blob store is active and which tokens are configured
 * @returns {object} - Configuration status object
 */
export function getBlobStorageStatus() {
  const activeStore = getBlobStoreName();
  return {
    activeStore: activeStore,
    useSpareBlob: useSpareBlob,
    originalTokenConfigured: !!originalBlobToken,
    spareTokenConfigured: !!spareBlobToken,
    activeTokenConfigured: !!getActiveBlobToken(),
    message: `Using ${activeStore} blob store${originalBlobToken && spareBlobToken ? ' (both tokens available)' : ''}`
  };
}


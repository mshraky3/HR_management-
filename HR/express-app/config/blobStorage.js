/**
 * Blob Storage Configuration
 * Centralized blob storage token management
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * ===============================
 * - BLOB_READ_WRITE_TOKEN: Blob store token (required)
 */

import dotenv from 'dotenv';

dotenv.config();

// Read blob storage token from environment
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Get the blob storage token
 * @returns {string|null} - Blob token or null if not configured
 */
export function getBlobToken() {
  return blobToken || null;
}

/**
 * Check if blob storage is configured
 * @returns {boolean} - Whether blob token is available
 */
export function isBlobStorageConfigured() {
  return !!blobToken;
}

/**
 * Get blob storage configuration status for debugging/logging
 * @returns {object} - Configuration status object
 */
export function getBlobStorageStatus() {
  return {
    tokenConfigured: !!blobToken,
    message: blobToken ? 'Blob Storage is configured' : 'Blob Storage is not configured'
  };
}

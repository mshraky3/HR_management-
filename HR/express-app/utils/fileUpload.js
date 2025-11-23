/**
 * File Upload Utilities
 * Handles file uploads and storage
 * Updated for Vercel Blob Storage - keeping only utility functions still in use
 */

import path from 'path';

// Note: Storage directories and local file system functions are no longer used
// Files are now stored in Vercel Blob Storage
// Keeping these constants for backward compatibility if needed
export const STORAGE_BASE = null; // Deprecated - using Blob Storage
export const DOCUMENTS_DIR = null; // Deprecated - using Blob Storage
export const THUMBNAILS_DIR = null; // Deprecated - using Blob Storage
export const TEMP_DIR = null; // Deprecated - using Blob Storage

/**
 * Generate unique filename
 * Format: {YYYYMMDD_HHMMSS}_{sanitized_original_name}.{ext}
 */
export function generateFileName(originalName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const ext = path.extname(originalName);
  return `${timestamp}_${sanitized}${ext}`;
}

/**
 * DEPRECATED: These functions are no longer used with Vercel Blob Storage
 * Kept for reference but not exported/used
 * 
 * For new uploads, use functions from utils/blobStorage.js instead
 */

// getDocumentPath - Deprecated (use uploadToBlob from blobStorage.js)
// getBranchDocumentPath - Deprecated (use uploadBranchDocumentToBlob from blobStorage.js)
// getThumbnailPath - Deprecated (thumbnails can be generated from Blob URLs)
// deleteFile - Deprecated (use deleteFromBlob from blobStorage.js)

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif'
  };
  return mimeToExt[mimeType] || '';
}

// Directory initialization removed - no longer needed with Blob Storage


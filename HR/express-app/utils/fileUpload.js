/**
 * File Upload Utilities
 * Handles file uploads and storage
 * Updated for Vercel Blob Storage - keeping only utility functions still in use
 */

import path from 'path';
import { log } from './logger.js';

// Note: Storage directories and local file system functions are no longer used
// Files are now stored in Vercel Blob Storage
// Keeping these constants for backward compatibility if needed
export const STORAGE_BASE = null; // Deprecated - using Blob Storage
export const DOCUMENTS_DIR = null; // Deprecated - using Blob Storage
export const THUMBNAILS_DIR = null; // Deprecated - using Blob Storage
export const TEMP_DIR = null; // Deprecated - using Blob Storage

/**
 * Generate unique filename
 * Format: {YYYYMMDD_HHMMSS}_{sanitized_original_name}
 * The sanitized name already includes the original extension
 */
export function generateFileName(originalName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  // sanitized already contains the extension (e.g. "file.pdf" -> "file.pdf")
  // so we do NOT append ext again to avoid double extensions like ".pdf.pdf"
  return `${timestamp}_${sanitized}`;
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

/**
 * Fix filename encoding for Arabic characters
 * Handles cases where filename is incorrectly encoded (Latin-1 instead of UTF-8)
 * @param {string} fileName - Original file name
 * @returns {string} - Fixed file name with correct encoding
 */
export function fixFilenameEncoding(fileName) {
  if (!fileName) return fileName;

  try {
    // Check if filename appears to be incorrectly encoded (contains Latin-1 bytes that should be UTF-8)
    // If filename contains bytes in range 0x80-0xFF but no Arabic characters, it's likely misencoded
    if (/[\x80-\xFF]/.test(fileName) && !/[\u0600-\u06FF]/.test(fileName)) {
      // Try to decode from Latin-1 to UTF-8
      // Convert each byte to its UTF-8 equivalent
      const buffer = Buffer.from(fileName, 'latin1');
      return buffer.toString('utf8');
    }
    return fileName;
  } catch (error) {
    log.warn('Error fixing filename encoding:', error);
    // If decoding fails, use original filename
    return fileName;
  }
}

// Directory initialization removed - no longer needed with Blob Storage


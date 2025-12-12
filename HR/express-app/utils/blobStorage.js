/**
 * Vercel Blob Storage Utilities
 * Handles file uploads to Vercel Blob Storage
 * 
 * Requires BLOB_READ_WRITE_TOKEN environment variable to be set
 * This token is automatically provided by Vercel when using Blob Storage
 * For local development, use: vercel env pull
 */

import { put, del, head } from '@vercel/blob';
import { generateFileName } from './fileUpload.js';

/**
 * Check if Blob Storage is properly configured
 * @returns {boolean} - Whether BLOB_READ_WRITE_TOKEN is available
 */
export function isBlobStorageConfigured() {
  // @vercel/blob automatically reads BLOB_READ_WRITE_TOKEN from process.env
  // In Vercel, this is automatically set. For local dev, it should be in .env
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Validate Blob Storage configuration and throw if not configured
 */
function validateBlobConfig() {
  if (!isBlobStorageConfigured()) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not configured. ' +
      'Please set BLOB_READ_WRITE_TOKEN environment variable. ' +
      'For local development, run: vercel env pull'
    );
  }
}

/**
 * Upload file to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} employeeId - Employee ID
 * @param {string} documentType - Document type
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadToBlob(fileBuffer, fileName, mimeType, employeeId, documentType) {
  try {
    // Validate Blob Storage configuration
    validateBlobConfig();
    
    // Validate inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !employeeId || !documentType) {
      throw new Error('Missing required parameters for blob upload');
    }

    // Generate unique filename
    const uniqueFileName = generateFileName(fileName);
    
    // Create blob path: employees/{employeeId}/{documentType}/{filename}
    const blobPath = `employees/${employeeId}/${documentType}/${uniqueFileName}`;
    
    // Upload to Vercel Blob
    // @vercel/blob automatically uses BLOB_READ_WRITE_TOKEN from process.env
    const blob = await put(blobPath, fileBuffer, {
      access: 'public', // Make files publicly accessible
      contentType: mimeType,
      addRandomSuffix: false, // We already have unique names
      // token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
      // This shouldn't happen with Vercel Blob URLs, but log if it does
    }
    
    // Return the URL
    return blob.url;
  } catch (error) {
    console.error('Error uploading to Blob:', error);
    
    // Provide helpful error messages
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error; // Re-throw configuration errors as-is
    }
    
    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Upload branch document to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} branchId - Branch ID
 * @param {string} documentType - Document type
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadBranchDocumentToBlob(fileBuffer, fileName, mimeType, branchId, documentType) {
  try {
    // Validate Blob Storage configuration
    validateBlobConfig();
    
    // Validate inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !branchId || !documentType) {
      throw new Error('Missing required parameters for blob upload');
    }

    const uniqueFileName = generateFileName(fileName);
    const blobPath = `branches/${branchId}/${documentType}/${uniqueFileName}`;
    
    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      // token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }
    
    return blob.url;
  } catch (error) {
    console.error('Error uploading branch document to Blob:', error);
    
    // Provide helpful error messages
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error; // Re-throw configuration errors as-is
    }
    
    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Upload request attachment to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} requestId - Request ID
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadRequestAttachmentToBlob(fileBuffer, fileName, mimeType, requestId) {
  try {
    // Validate Blob Storage configuration
    validateBlobConfig();
    
    // Validate inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !requestId) {
      throw new Error('Missing required parameters for blob upload');
    }

    const uniqueFileName = generateFileName(fileName);
    const blobPath = `requests/${requestId}/attachments/${uniqueFileName}`;
    
    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      // token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }
    
    return blob.url;
  } catch (error) {
    console.error('Error uploading request attachment to Blob:', error);
    
    // Provide helpful error messages
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error; // Re-throw configuration errors as-is
    }
    
    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Delete file from Vercel Blob Storage
 * @param {string} blobUrl - Blob URL to delete
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteFromBlob(blobUrl) {
  try {
    // Only delete if it's a blob URL (starts with http/https)
    if (blobUrl && (blobUrl.startsWith('http://') || blobUrl.startsWith('https://'))) {
      // Validate Blob Storage configuration
      validateBlobConfig();
      
      // @vercel/blob automatically uses BLOB_READ_WRITE_TOKEN from process.env
      await del(blobUrl);
      return true;
    }
    // If it's a local file path, return true (no action needed)
    return true;
  } catch (error) {
    console.error('Error deleting from Blob:', error);
    // Don't throw - deletion failures shouldn't break the app
    return false;
  }
}

/**
 * Check if file exists in Blob Storage
 * @param {string} blobUrl - Blob URL to check
 * @returns {Promise<boolean>} - Whether file exists
 */
export async function blobFileExists(blobUrl) {
  try {
    if (blobUrl && (blobUrl.startsWith('http://') || blobUrl.startsWith('https://'))) {
      // Validate Blob Storage configuration
      validateBlobConfig();
      
      // @vercel/blob automatically uses BLOB_READ_WRITE_TOKEN from process.env
      await head(blobUrl);
      return true;
    }
    return false;
  } catch (error) {
    // File doesn't exist or error occurred
    return false;
  }
}

/**
 * Fetch file from Blob Storage
 * @param {string} blobUrl - Blob URL to fetch
 * @returns {Promise<{buffer: Buffer, contentType: string}>} - File buffer and content type
 */
export async function fetchFromBlob(blobUrl) {
  try {
    if (!blobUrl || (!blobUrl.startsWith('http://') && !blobUrl.startsWith('https://'))) {
      throw new Error('Invalid blob URL');
    }
    
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    return { buffer, contentType };
  } catch (error) {
    console.error('Error fetching from Blob:', error);
    throw new Error(`Failed to fetch file from Blob: ${error.message}`);
  }
}

/**
 * Upload notification attachment to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} notificationId - Notification ID
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadNotificationAttachmentToBlob(fileBuffer, fileName, mimeType, notificationId) {
  try {
    // Validate Blob Storage configuration
    validateBlobConfig();
    
    // Validate inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !notificationId) {
      throw new Error('Missing required parameters for blob upload');
    }

    const uniqueFileName = generateFileName(fileName);
    const blobPath = `notifications/${notificationId}/attachments/${uniqueFileName}`;
    
    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      // token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }
    
    return blob.url;
  } catch (error) {
    console.error('Error uploading notification attachment to Blob:', error);
    
    // Provide helpful error messages
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error; // Re-throw configuration errors as-is
    }
    
    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}


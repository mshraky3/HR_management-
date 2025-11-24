/**
 * Vercel Blob Storage Utilities
 * Handles file uploads to Vercel Blob Storage
 */

import { put, del, head } from '@vercel/blob';
import { generateFileName } from './fileUpload.js';

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
    const blob = await put(blobPath, fileBuffer, {
      access: 'public', // Make files publicly accessible
      contentType: mimeType,
      addRandomSuffix: false, // We already have unique names
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
    });
    
    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }
    
    return blob.url;
  } catch (error) {
    console.error('Error uploading branch document to Blob:', error);
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
      await del(blobUrl);
      return true;
    }
    // If it's a local file path, return true (no action needed)
    return true;
  } catch (error) {
    console.error('Error deleting from Blob:', error);
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
      await head(blobUrl);
      return true;
    }
    return false;
  } catch (error) {
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


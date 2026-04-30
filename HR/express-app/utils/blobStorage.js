/**
 * Vercel Blob Storage Utilities
 * Handles file uploads to Vercel Blob Storage
 * 
 * Uses centralized blob storage configuration from config/blobStorage.js
 */

import { put, del, head, copy } from '@vercel/blob';
import { generateFileName } from './fileUpload.js';
import {
  getBlobToken,
  isBlobStorageConfigured as checkBlobStorageConfigured
} from '../config/blobStorage.js';
import { uploadToR2Mirror } from './dualStorage.js';
import { log } from './logger.js';

/**
 * Check if Blob Storage is properly configured
 * @returns {boolean} - Whether blob token is available
 */
export function isBlobStorageConfigured() {
  return checkBlobStorageConfigured();
}

/**
 * Validate Blob Storage configuration and throw if not configured
 */
function validateBlobConfig() {
  if (!isBlobStorageConfigured()) {
    throw new Error(
      'Blob Storage is not configured. ' +
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
    let uniqueFileName = generateFileName(fileName);

    // Guard against double extensions (e.g. .pdf.pdf, .jpg.jpg)
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');

    // Create blob path: employees/{employeeId}/{documentType}/{filename}
    const blobPath = `employees/${employeeId}/${documentType}/${uniqueFileName}`;

    // Get blob token from configuration
    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    // Upload to Vercel Blob
    const blob = await put(blobPath, fileBuffer, {
      access: 'public', // Make files publicly accessible
      contentType: mimeType,
      addRandomSuffix: false, // We already have unique names
      token: token
    });

    // Validate URL length (database column is VARCHAR(500))
    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    // Mirror to R2 (non-blocking — failure won't break upload)
    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading to Blob:', { error: error.message });

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

    let uniqueFileName = generateFileName(fileName);
    // Guard against double extensions (e.g. .pdf.pdf, .jpg.jpg)
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.\2$/i, '$1');
    const blobPath = `branches/${branchId}/${documentType}/${uniqueFileName}`;

    // Get blob token from configuration
    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading branch document to Blob:', { error: error.message });

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

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');
    const blobPath = `requests/${requestId}/attachments/${uniqueFileName}`;

    // Get blob token from configuration
    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading request attachment to Blob:', { error: error.message });

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

      const token = getBlobToken();
      if (!token) {
        log.error('Error deleting from Blob: No blob token configured');
        return false;
      }

      try {
        await del(blobUrl, { token });
        if (process.env.LOG_BLOB_OPERATIONS === 'true') {
          log.info(`Deleted blob: ${blobUrl.substring(0, 50)}...`);
        }
        return true;
      } catch (error) {
        log.error('Error deleting from Blob:', { error: error.message });
        return false;
      }
    }
    // If it's a local file path, return true (no action needed)
    return true;
  } catch (error) {
    log.error('Error deleting from Blob:', { error: error.message });
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

      const token = getBlobToken();
      if (!token) {
        return false;
      }

      try {
        await head(blobUrl, { token });
        return true;
      } catch (error) {
        // File doesn't exist or is inaccessible
        return false;
      }
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
    log.error('Error fetching from Blob:', { error: error.message });
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

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');
    const blobPath = `notifications/${notificationId}/attachments/${uniqueFileName}`;

    // Get blob token from configuration
    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading notification attachment to Blob:', { error: error.message });

    // Provide helpful error messages
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error; // Re-throw configuration errors as-is
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Detect and fix double file extension in a blob URL
 * e.g. ".pdf.pdf" -> ".pdf", ".jpeg.jpeg" -> ".jpeg"
 * @param {string} url - Blob URL
 * @returns {string|null} - Fixed URL, or null if no double extension found
 */
export function fixDoubleExtensionUrl(url) {
  if (!url) return null;
  // Match common double extensions: .pdf.pdf, .jpg.jpg, .jpeg.jpeg, .png.png, .gif.gif etc.
  const doubleExtRegex = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)\.(\1)$/i;
  if (doubleExtRegex.test(url)) {
    return url.replace(doubleExtRegex, '.$1');
  }
  return null;
}

/**
 * Try adding a double extension to a URL
 * e.g. ".pdf" -> ".pdf.pdf" (for files uploaded with the double-extension bug)
 * @param {string} url - Blob URL
 * @returns {string|null} - URL with doubled extension, or null if no known extension found
 */
export function addDoubleExtensionUrl(url) {
  if (!url) return null;
  const singleExtRegex = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)$/i;
  const match = url.match(singleExtRegex);
  if (match) {
    // Only add if it doesn't already have a double extension
    const doubleExtRegex = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)\.\1$/i;
    if (!doubleExtRegex.test(url)) {
      return `${url}.${match[1]}`;
    }
  }
  return null;
}

/**
 * Copy a blob to a new path (used to fix double-extension files)
 * @param {string} sourceUrl - Source blob URL
 * @param {string} destinationPathname - New pathname in blob storage
 * @returns {Promise<string>} - New blob URL
 */
export async function copyBlob(sourceUrl, destinationPathname) {
  try {
    validateBlobConfig();
    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }
    const result = await copy(sourceUrl, destinationPathname, {
      access: 'public',
      token: token
    });
    return result.url;
  } catch (error) {
    log.error('Error copying blob:', { error: error.message });
    throw new Error(`Failed to copy blob: ${error.message}`);
  }
}

/**
 * Proxy-fetch a blob URL and return its content as a buffer.
 * Priority order:
 * 1. R2 storage (fast, reliable — primary storage)
 * 2. R2 by extracting key from blob URL (if r2Url not set but file was migrated)
 * 3. Vercel CDN direct fetch
 * 4. Vercel CDN with double extension fixes
 * Returns { buffer, contentType, fixedUrl, source }.
 * @param {string} blobUrl - Original blob URL
 * @param {string|null} [r2Url] - Optional R2 mirror URL
 * @returns {Promise<{buffer: Buffer, contentType: string, fixedUrl: string|null, source: string}>}
 */
export async function fetchBlobWithFallback(blobUrl, r2Url = null) {
  // Priority 1: Try R2 storage first (primary, fastest)
  if (r2Url) {
    try {
      const { fetchFromR2 } = await import('./r2Storage.js');
      const { buffer, contentType } = await fetchFromR2(r2Url);
      return { buffer, contentType, fixedUrl: null, source: 'r2' };
    } catch (e) {
      // R2 URL failed, try other methods
    }
  }

  // Priority 2: Try R2 by extracting key from blob URL path
  if (!r2Url && blobUrl) {
    try {
      const { fetchFromR2ByKey } = await import('./r2Storage.js');
      const { isR2StorageConfigured } = await import('../config/r2Storage.js');
      if (isR2StorageConfigured()) {
        const blobPath = new URL(blobUrl).pathname.slice(1);
        if (blobPath) {
          const { buffer, contentType } = await fetchFromR2ByKey(blobPath);
          return { buffer, contentType, fixedUrl: null, source: 'r2' };
        }
      }
    } catch (e) {
      // R2 key lookup failed, fall through to Vercel
    }
  }

  // Priority 3: Try Vercel CDN direct fetch
  try {
    const response = await fetch(blobUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      return { buffer, contentType, fixedUrl: null, source: 'vercel' };
    }
  } catch (e) {
    // CDN fetch failed
  }

  // Priority 4: Try Vercel with double extension fixes
  const withoutDouble = fixDoubleExtensionUrl(blobUrl);
  if (withoutDouble) {
    try {
      const response = await fetch(withoutDouble);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType, fixedUrl: withoutDouble, source: 'vercel' };
      }
    } catch (e) {
      // fallback also failed
    }
  }

  const withDouble = addDoubleExtensionUrl(blobUrl);
  if (withDouble) {
    try {
      const response = await fetch(withDouble);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType, fixedUrl: withDouble, source: 'vercel' };
      }
    } catch (e) {
      // fallback also failed
    }
  }

  throw new Error(`الملف غير متوفر في التخزين السحابي (URL: ${blobUrl.substring(0, 80)}...)`);
}

/**
 * Upload bus registration document to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} busId - Bus ID
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadBusRegistrationDocument(fileBuffer, fileName, mimeType, busId) {
  try {
    validateBlobConfig();

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !busId) {
      throw new Error('Missing required parameters for blob upload');
    }

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');
    const blobPath = `buses/${busId}/registration/${uniqueFileName}`;

    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading bus registration document to Blob:', { error: error.message });

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error;
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Upload driver license document to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} busId - Bus ID
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadDriverLicenseDocument(fileBuffer, fileName, mimeType, busId) {
  try {
    validateBlobConfig();

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !busId) {
      throw new Error('Missing required parameters for blob upload');
    }

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');
    const blobPath = `buses/${busId}/license/${uniqueFileName}`;

    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading driver license document to Blob:', { error: error.message });

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error;
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Upload bus lease contract document to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} busId - Bus ID
 * @returns {Promise<string>} - Blob URL
 */
export async function uploadBusLeaseContractDocument(fileBuffer, fileName, mimeType, busId) {
  try {
    validateBlobConfig();

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !busId) {
      throw new Error('Missing required parameters for blob upload');
    }

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.(\2)$/i, '$1');
    const blobPath = `buses/${busId}/lease-contract/${uniqueFileName}`;

    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading bus lease contract document to Blob:', { error: error.message });

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error;
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

/**
 * Upload treatment plan document to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File buffer data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {number} branchId - Branch ID
 * @returns {Promise<{url: string, r2Url: string|null}>} - Blob URL and R2 URL
 */
export async function uploadTreatmentPlanToBlob(fileBuffer, fileName, mimeType, branchId) {
  try {
    validateBlobConfig();

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }
    if (!fileName || !mimeType || !branchId) {
      throw new Error('Missing required parameters for blob upload');
    }

    let uniqueFileName = generateFileName(fileName);
    uniqueFileName = uniqueFileName.replace(/(\.(doc|docx))\.\2$/i, '$1');
    const blobPath = `treatment-plans/${branchId}/${uniqueFileName}`;

    const token = getBlobToken();
    if (!token) {
      throw new Error('Blob storage token is not configured');
    }

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      token: token
    });

    if (blob.url && blob.url.length > 500) {
      log.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    const r2Url = await uploadToR2Mirror(blobPath, fileBuffer, mimeType);

    return { url: blob.url, r2Url };
  } catch (error) {
    log.error('Error uploading treatment plan to Blob:', { error: error.message });

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error;
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

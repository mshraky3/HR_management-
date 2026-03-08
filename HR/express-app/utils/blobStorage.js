/**
 * Vercel Blob Storage Utilities
 * Handles file uploads to Vercel Blob Storage
 * 
 * Uses centralized blob storage configuration from config/blobStorage.js
 */

import { put, del, head, copy, get } from '@vercel/blob';
import { generateFileName } from './fileUpload.js';
import {
  getBlobToken,
  isBlobStorageConfigured as checkBlobStorageConfigured
} from '../config/blobStorage.js';

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

      const token = getBlobToken();
      if (!token) {
        console.error('Error deleting from Blob: No blob token configured');
        return false;
      }

      try {
        await del(blobUrl, { token });
        if (process.env.LOG_BLOB_OPERATIONS === 'true') {
          console.log(`Deleted blob: ${blobUrl.substring(0, 50)}...`);
        }
        return true;
      } catch (error) {
        console.error('Error deleting from Blob:', error.message);
        return false;
      }
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
    console.error('Error copying blob:', error);
    throw new Error(`Failed to copy blob: ${error.message}`);
  }
}

/**
 * Proxy-fetch a blob URL and return its content as a buffer.
 * If the original URL fails, automatically tries:
 * 1. Removing double extension (e.g. .pdf.pdf -> .pdf)
 * 2. Adding double extension (e.g. .pdf -> .pdf.pdf) for files uploaded with the bug
 * Returns { buffer, contentType, fixedUrl }.
 * @param {string} blobUrl - Original blob URL
 * @returns {Promise<{buffer: Buffer, contentType: string, fixedUrl: string|null}>}
 */
export async function fetchBlobWithFallback(blobUrl) {
  const token = getBlobToken();

  // Method 1: Try get() SDK with Bearer token (authenticated CDN access)
  if (token) {
    try {
      const result = await get(blobUrl, { access: 'public', token });
      if (result && result.statusCode === 200 && result.stream) {
        const chunks = [];
        for await (const chunk of result.stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const contentType = result.blob?.contentType || 'application/octet-stream';
        return { buffer, contentType, fixedUrl: null };
      }
    } catch (e) {
      // get() failed, try fallbacks
    }
  }

  // Method 2: Try plain fetch on original URL
  try {
    const response = await fetch(blobUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      return { buffer, contentType, fixedUrl: null };
    }
  } catch (e) {
    // original URL failed, will try fallbacks
  }

  // Fallback 1: Try with double extension removed (.pdf.pdf -> .pdf)
  const withoutDouble = fixDoubleExtensionUrl(blobUrl);
  if (withoutDouble) {
    try {
      const response = await fetch(withoutDouble);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType, fixedUrl: withoutDouble };
      }
    } catch (e) {
      // fallback 1 also failed
    }
  }

  // Fallback 2: Try with double extension added (.pdf -> .pdf.pdf)
  const withDouble = addDoubleExtensionUrl(blobUrl);
  if (withDouble) {
    try {
      const response = await fetch(withDouble);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType, fixedUrl: withDouble };
      }
    } catch (e) {
      // fallback 2 also failed
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
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    return blob.url;
  } catch (error) {
    console.error('Error uploading bus registration document to Blob:', error);

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
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    return blob.url;
  } catch (error) {
    console.error('Error uploading driver license document to Blob:', error);

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
      console.warn(`Warning: Blob URL length (${blob.url.length}) exceeds database VARCHAR(500) limit`);
    }

    return blob.url;
  } catch (error) {
    console.error('Error uploading bus lease contract document to Blob:', error);

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      throw error;
    }

    throw new Error(`Failed to upload file to Blob: ${error.message}`);
  }
}

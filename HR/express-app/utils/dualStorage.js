/**
 * Dual Storage Utilities
 * Handles simultaneous upload/delete to both Vercel Blob and Cloudflare R2
 * with failover reading between providers.
 */

import { uploadToR2, fetchFromR2, deleteFromR2, isR2StorageConfigured } from './r2Storage.js';
import { log } from './logger.js';

/**
 * Upload a file to R2 alongside Vercel Blob.
 * Call this AFTER a successful Vercel Blob upload.
 * Returns the R2 public URL, or null if R2 is not configured / upload fails.
 *
 * @param {string} blobPath - Same path used for Vercel Blob (e.g. employees/1/id/file.pdf)
 * @param {Buffer} fileBuffer - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<string|null>} - R2 public URL or null
 */
export async function uploadToR2Mirror(blobPath, fileBuffer, contentType) {
    if (!isR2StorageConfigured()) return null;

    try {
        const r2Url = await uploadToR2(blobPath, fileBuffer, contentType);
        return r2Url;
    } catch (error) {
        log.error('R2 mirror upload failed (non-blocking):', error.message);
        return null;
    }
}

/**
 * Fetch a file with failover: try Vercel Blob first, then R2.
 * @param {Function} blobFetchFn - Async function that fetches from Vercel Blob, returns {buffer, contentType, fixedUrl}
 * @param {string|null} r2Url - R2 URL (if available)
 * @returns {Promise<{buffer: Buffer, contentType: string, fixedUrl: string|null, source: string}>}
 */
export async function fetchWithFailover(blobFetchFn, r2Url) {
    // Try Vercel Blob first
    try {
        const result = await blobFetchFn();
        return { ...result, source: 'vercel' };
    } catch (blobError) {
        // Vercel failed — try R2
        if (r2Url && isR2StorageConfigured()) {
            try {
                const { buffer, contentType } = await fetchFromR2(r2Url);
                return { buffer, contentType, fixedUrl: null, source: 'r2' };
            } catch (r2Error) {
                // Both failed — throw the original blob error with R2 context
                throw new Error(
                    `الملف غير متوفر من كلا مزودي التخزين. ` +
                    `Vercel: ${blobError.message} | R2: ${r2Error.message}`
                );
            }
        }
        // No R2 URL — just throw the blob error
        throw blobError;
    }
}

/**
 * Delete a file from R2 (non-blocking).
 * Call alongside deleteFromBlob.
 * @param {string|null} r2Url - R2 URL to delete
 * @returns {Promise<boolean>}
 */
export async function deleteFromR2Mirror(r2Url) {
    if (!r2Url || !isR2StorageConfigured()) return true;

    try {
        return await deleteFromR2(r2Url);
    } catch (error) {
        log.error('R2 mirror delete failed (non-blocking):', error.message);
        return false;
    }
}

/**
 * Background-mirror a Vercel-served file to R2 using its already-fetched buffer.
 * Call fire-and-forget (no await) from download/preview handlers.
 * Returns the R2 public URL, or null on failure.
 *
 * @param {string} vercelUrl - Original Vercel Blob URL
 * @param {Buffer} fileBuffer - Already-fetched file content
 * @param {string} contentType - MIME type
 * @returns {Promise<string|null>} - R2 public URL or null
 */
export async function mirrorVercelFileToR2(vercelUrl, fileBuffer, contentType) {
    if (!isR2StorageConfigured()) return null;
    try {
        const key = new URL(vercelUrl).pathname.slice(1);
        if (!key) return null;
        return await uploadToR2(key, fileBuffer, contentType);
    } catch (error) {
        log.error('R2 lazy-mirror failed (non-blocking):', error.message);
        return null;
    }
}

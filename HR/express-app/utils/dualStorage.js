/**
 * R2 copy clean-up
 *
 * Rows that were migrated from Vercel Blob carry a separate r2_file_path next
 * to file_path. Delete routes remove both; this deletes the r2_file_path one.
 */

import { deleteFromR2, isR2StorageConfigured } from './r2Storage.js';
import { log } from './logger.js';

/**
 * Delete a file from R2 (non-blocking: failures are logged, never thrown).
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

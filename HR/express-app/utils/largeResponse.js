/**
 * Large generated files (PDF exports that merge employee/branch documents)
 *
 * Vercel caps function responses at ~4.5 MB. A generated file above the API
 * limit is stored in R2 under exports/ (random, unguessable name) and the
 * client gets { success, direct_url } instead of the bytes; the SPA's axios
 * interceptor turns that back into a Blob, so callers see no difference.
 */

import { randomUUID } from 'crypto';
import { MAX_API_UPLOAD_BYTES } from '../middleware/upload.js';
import { uploadToR2, presignR2Get, isR2StorageConfigured } from './r2Storage.js';

/**
 * Sends a JSON link instead of the file when it is too large for a response.
 * @returns {Promise<boolean>} true when the response was sent (caller returns).
 */
export async function sendLargeFileAsLink(res, buffer, fileName, contentType = 'application/pdf') {
  if (!buffer || buffer.length <= MAX_API_UPLOAD_BYTES || !isR2StorageConfigured()) return false;
  const date = new Date().toISOString().slice(0, 10);
  const key = `exports/${date}/${randomUUID()}.pdf`;
  await uploadToR2(key, buffer, contentType);
  const directUrl = await presignR2Get(key, { fileName, contentType, inline: false });
  res.json({ success: true, direct_url: directUrl });
  return true;
}

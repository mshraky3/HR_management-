/**
 * Large generated files (PDF exports that merge employee/branch documents)
 *
 * Vercel caps function responses at ~4.5 MB. A generated file above the API
 * limit is stored in R2 under exports/ (random, unguessable name) and the
 * client gets { success, direct_url } instead of the bytes; the SPA's axios
 * interceptor turns that back into a Blob, so callers see no difference.
 *
 * These files are only needed for the few minutes the download link lives,
 * so every new export first deletes the ones older than a day. That keeps
 * exports/ from growing without any bucket configuration.
 */

import { randomUUID } from 'crypto';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { MAX_API_UPLOAD_BYTES } from '../middleware/upload.js';
import { uploadToR2, presignR2Get, isR2StorageConfigured } from './r2Storage.js';
import { getR2Client, getR2Bucket } from '../config/r2Storage.js';
import { log } from './logger.js';

const EXPORT_PREFIX = 'exports/';
const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Delete exports/ objects older than a day. Never throws. */
export async function pruneOldExports(now = Date.now()) {
  try {
    const client = getR2Client();
    if (!client) return 0;
    const { Contents = [] } = await client.send(new ListObjectsV2Command({
      Bucket: getR2Bucket(),
      Prefix: EXPORT_PREFIX,
      MaxKeys: 1000,
    }));
    const stale = Contents
      .filter((o) => o.LastModified && now - new Date(o.LastModified).getTime() > EXPORT_MAX_AGE_MS)
      .map((o) => ({ Key: o.Key }));
    if (stale.length === 0) return 0;
    await client.send(new DeleteObjectsCommand({ Bucket: getR2Bucket(), Delete: { Objects: stale, Quiet: true } }));
    return stale.length;
  } catch (error) {
    log.warn('Could not prune old exports (non-blocking):', error.message);
    return 0;
  }
}

/**
 * Sends a JSON link instead of the file when it is too large for a response.
 * @returns {Promise<boolean>} true when the response was sent (caller returns).
 */
export async function sendLargeFileAsLink(res, buffer, fileName, contentType = 'application/pdf') {
  if (!buffer || buffer.length <= MAX_API_UPLOAD_BYTES || !isR2StorageConfigured()) return false;
  await pruneOldExports();
  const date = new Date().toISOString().slice(0, 10);
  const key = `${EXPORT_PREFIX}${date}/${randomUUID()}.pdf`;
  await uploadToR2(key, buffer, contentType);
  const directUrl = await presignR2Get(key, { fileName, contentType, inline: false });
  res.json({ success: true, direct_url: directUrl });
  return true;
}

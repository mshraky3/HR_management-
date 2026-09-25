/**
 * File storage (Cloudflare R2)
 *
 * All HR files live in R2 (bucket hr1). Vercel Blob is no longer used (it was
 * over its free quota and blocked, so it could not be read anyway). Files were
 * copied from Blob to R2 under the same path, so older database rows that
 * still hold a Vercel Blob URL in file_path are read from R2 by that path.
 *
 * The module keeps its historical name and the *ToBlob function names so the
 * many callers did not have to change.
 */

import { generateFileName } from './fileUpload.js';
import { uploadToR2, fetchFromR2ByKey, deleteFromR2, extractKeyFromR2Url, r2PublicUrlForKey } from './r2Storage.js';
import { log } from './logger.js';

const DOUBLE_EXTENSION = /(\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx))\.\2$/i;

async function uploadFile(prefix, fileBuffer, fileName, mimeType, requiredParams) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer provided');
  }
  if (!fileName || !mimeType || requiredParams.some((p) => !p)) {
    throw new Error('Missing required parameters for file upload');
  }
  const uniqueFileName = generateFileName(fileName).replace(DOUBLE_EXTENSION, '$1');
  const r2Url = await uploadToR2(`${prefix}/${uniqueFileName}`, fileBuffer, mimeType);
  return { url: r2Url, r2Url };
}

/** Employee document -> employees/{id}/{type}/... Returns { url, r2Url } (same URL). */
export function uploadToBlob(fileBuffer, fileName, mimeType, employeeId, documentType) {
  return uploadFile(`employees/${employeeId}/${documentType}`, fileBuffer, fileName, mimeType, [employeeId, documentType]);
}

export function uploadBranchDocumentToBlob(fileBuffer, fileName, mimeType, branchId, documentType) {
  return uploadFile(`branches/${branchId}/${documentType}`, fileBuffer, fileName, mimeType, [branchId, documentType]);
}

export function uploadRequestAttachmentToBlob(fileBuffer, fileName, mimeType, requestId) {
  return uploadFile(`requests/${requestId}/attachments`, fileBuffer, fileName, mimeType, [requestId]);
}

export function uploadNotificationAttachmentToBlob(fileBuffer, fileName, mimeType, notificationId) {
  return uploadFile(`notifications/${notificationId}/attachments`, fileBuffer, fileName, mimeType, [notificationId]);
}

export function uploadBusRegistrationDocument(fileBuffer, fileName, mimeType, busId) {
  return uploadFile(`buses/${busId}/registration`, fileBuffer, fileName, mimeType, [busId]);
}

export function uploadDriverLicenseDocument(fileBuffer, fileName, mimeType, busId) {
  return uploadFile(`buses/${busId}/license`, fileBuffer, fileName, mimeType, [busId]);
}

export function uploadBusLeaseContractDocument(fileBuffer, fileName, mimeType, busId) {
  return uploadFile(`buses/${busId}/lease-contract`, fileBuffer, fileName, mimeType, [busId]);
}

/**
 * Delete the stored file behind a URL (an R2 URL or an old Vercel Blob URL,
 * whose path is the R2 key). Never throws: a failed delete must not break the
 * request that triggered it.
 */
export async function deleteFromBlob(fileUrl) {
  try {
    const key = extractKeyFromR2Url(fileUrl);
    if (!key) return true;
    return await deleteFromR2(r2PublicUrlForKey(key));
  } catch (error) {
    log.error('Error deleting stored file:', { error: error.message });
    return false;
  }
}

/** R2 keys to try for a stored file, most likely first. */
function candidateKeys(fileUrl, r2Url) {
  const keys = [];
  const add = (key) => { if (key && !keys.includes(key)) keys.push(key); };
  for (const url of [r2Url, fileUrl]) {
    const key = extractKeyFromR2Url(url);
    if (!key) continue;
    add(key);
    try { add(decodeURIComponent(key)); } catch { /* not percent-encoded */ }
  }
  // Files saved by the old double-extension bug ("x.pdf.pdf") were copied to
  // the clean name; very old rows may reference either form.
  for (const key of [...keys]) {
    if (DOUBLE_EXTENSION.test(key)) {
      add(key.replace(DOUBLE_EXTENSION, '$1'));
    } else {
      const ext = key.match(/\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)$/i);
      if (ext) add(`${key}.${ext[1]}`);
    }
  }
  return keys;
}

/**
 * Read a stored file from R2.
 * @param {string} fileUrl - file_path from the database (R2 or old Blob URL)
 * @param {string|null} [r2Url] - r2_file_path, when the row has one
 * @returns {Promise<{buffer: Buffer, contentType: string, fixedUrl: null, source: 'r2'}>}
 */
export async function fetchBlobWithFallback(fileUrl, r2Url = null) {
  for (const key of candidateKeys(fileUrl, r2Url)) {
    try {
      const { buffer, contentType } = await fetchFromR2ByKey(key);
      return { buffer, contentType, fixedUrl: null, source: 'r2' };
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`الملف غير متوفر في التخزين السحابي (URL: ${String(fileUrl || r2Url).substring(0, 80)}...)`);
}

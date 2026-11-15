/**
 * File access for the branch achievements / partnerships routes, behind one small object so the
 * integration tests can replace it (they must never write to the real R2 bucket):
 *   fileStore.put(buffer, fileName, mimeType, branchId, kind) -> { url }
 *   fileStore.remove(url)                                      -> best effort, never throws
 *   fileStore.read(url)                                        -> { buffer, contentType }
 *   fileStore.directUrl(record)                                -> signed R2 link for files above the API limit, else null
 */
import { uploadBranchRecordFile, deleteFromBlob, fetchBlobWithFallback } from './blobStorage.js';
import { presignR2Get, extractKeyFromR2Url, isR2StorageConfigured } from './r2Storage.js';
import { MAX_API_UPLOAD_BYTES } from '../middleware/upload.js';

export const fileStore = {
  async put(buffer, fileName, mimeType, branchId, kind) {
    const { url } = await uploadBranchRecordFile(buffer, fileName, mimeType, branchId, kind);
    return { url };
  },
  async remove(url) {
    if (!url) return true;
    return deleteFromBlob(url);
  },
  async read(url) {
    return fetchBlobWithFallback(url, null);
  },
  async directUrl(record) {
    if (!record?.file_size || record.file_size <= MAX_API_UPLOAD_BYTES) return null;
    if (!isR2StorageConfigured()) return null;
    const key = extractKeyFromR2Url(record.file_path);
    if (!key) return null;
    return presignR2Get(key, { fileName: record.file_name, contentType: record.mime_type });
  },
};

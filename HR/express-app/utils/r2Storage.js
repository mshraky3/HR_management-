/**
 * Cloudflare R2 Storage Utilities
 * Handles file uploads, downloads, and deletion on R2
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { log } from './logger.js';
import { getR2Client, getR2Bucket, getR2PublicUrl, isR2StorageConfigured } from '../config/r2Storage.js';

/**
 * Upload a file to R2
 * @param {string} key - Object key (path in bucket)
 * @param {Buffer} fileBuffer - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Public URL of uploaded file
 */
export async function uploadToR2(key, fileBuffer, contentType) {
    const client = getR2Client();
    if (!client) {
        throw new Error('R2 Storage is not configured');
    }

    await client.send(new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
    }));

    const publicBase = getR2PublicUrl();
    return `${publicBase}/${key}`;
}

/**
 * Fetch a file from R2 by its key
 * @param {string} key - Object key in bucket
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function fetchFromR2ByKey(key) {
    const client = getR2Client();
    if (!client) {
        throw new Error('R2 Storage is not configured');
    }

    const response = await client.send(new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
    }));

    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }

    return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType || 'application/octet-stream',
    };
}

/**
 * Fetch a file from R2 using its public URL
 * Extracts the key from the URL and uses the S3 API (bypasses CDN)
 * @param {string} r2Url - Public R2 URL
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function fetchFromR2(r2Url) {
    const key = extractKeyFromR2Url(r2Url);
    if (!key) {
        throw new Error(`Cannot extract R2 key from URL: ${r2Url}`);
    }
    return fetchFromR2ByKey(key);
}

/**
 * Delete a file from R2
 * @param {string} r2Url - Public R2 URL
 * @returns {Promise<boolean>}
 */
export async function deleteFromR2(r2Url) {
    try {
        const client = getR2Client();
        if (!client) return false;

        const key = extractKeyFromR2Url(r2Url);
        if (!key) return false;

        await client.send(new DeleteObjectCommand({
            Bucket: getR2Bucket(),
            Key: key,
        }));

        return true;
    } catch (error) {
        log.error('Error deleting from R2:', { error: error.message });
        return false;
    }
}

/**
 * Check if a file exists in R2
 * @param {string} r2Url - Public R2 URL
 * @returns {Promise<boolean>}
 */
export async function r2FileExists(r2Url) {
    try {
        const client = getR2Client();
        if (!client) return false;

        const key = extractKeyFromR2Url(r2Url);
        if (!key) return false;

        await client.send(new HeadObjectCommand({
            Bucket: getR2Bucket(),
            Key: key,
        }));

        return true;
    } catch {
        return false;
    }
}

/**
 * Extract the object key from an R2 public URL
 * @param {string} r2Url - e.g. https://pub-xxx.r2.dev/employees/1/id/file.pdf
 * @returns {string|null} - e.g. employees/1/id/file.pdf
 */
export function extractKeyFromR2Url(r2Url) {
    if (!r2Url) return null;
    const publicBase = getR2PublicUrl();
    if (publicBase && r2Url.startsWith(publicBase)) {
        return r2Url.slice(publicBase.length + 1); // +1 for the /
    }
    // Fallback: try to extract after the domain
    try {
        const url = new URL(r2Url);
        return url.pathname.slice(1); // remove leading /
    } catch {
        return null;
    }
}

// ============================================================================
// Direct browser <-> R2 transfers
//
// Vercel caps function request AND response bodies at ~4.5 MB, so larger files
// never pass through the API: the browser PUTs them to a short-lived signed URL
// and downloads them from one. The bucket's CORS policy allows PUT/GET/HEAD
// from the SPA's origin.
// ============================================================================

const SIGNED_URL_TTL_SECONDS = 10 * 60;

/** Signed URL the browser can PUT one file to. The Content-Type is signed. */
export async function presignR2Put(key, contentType) {
    const client = getR2Client();
    if (!client) throw new Error('R2 Storage is not configured');
    return getSignedUrl(client, new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        ContentType: contentType,
    }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}

/** Signed URL for reading one object, served with the given type and file name. */
export async function presignR2Get(key, { fileName, contentType, inline = true } = {}) {
    const client = getR2Client();
    if (!client) throw new Error('R2 Storage is not configured');
    const safeName = encodeURIComponent(fileName || key.split('/').pop());
    return getSignedUrl(client, new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        ResponseContentType: contentType || undefined,
        ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
    }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}

/** { size, contentType } of an object, or null when it does not exist. */
export async function headR2Object(key) {
    const client = getR2Client();
    if (!client) throw new Error('R2 Storage is not configured');
    try {
        const head = await client.send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
        return { size: Number(head.ContentLength || 0), contentType: head.ContentType || null };
    } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
    }
}

/** First `length` bytes of an object (for file-signature checks). */
export async function readR2Prefix(key, length = 8) {
    const client = getR2Client();
    if (!client) throw new Error('R2 Storage is not configured');
    const response = await client.send(new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Range: `bytes=0-${length - 1}`,
    }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/** Public URL stored in the DB for a key (same form uploadToR2 returns). */
export function r2PublicUrlForKey(key) {
    return `${getR2PublicUrl()}/${key}`;
}

export { isR2StorageConfigured };

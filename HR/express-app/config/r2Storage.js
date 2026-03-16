/**
 * Cloudflare R2 Storage Configuration
 * Centralized R2 storage client management
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * ===============================
 * - R2_Access_Key_ID: R2 access key (required)
 * - Secret_Access_Key: R2 secret key (required)
 * - Account_ID: Cloudflare account ID (required)
 * - R2_Public_Development_URL: Public URL for R2 bucket (required)
 */

import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const R2_BUCKET = 'hr1';

let s3Client = null;

/**
 * Get or create the S3-compatible client for R2
 * @returns {S3Client|null}
 */
export function getR2Client() {
    if (s3Client) return s3Client;

    const accessKeyId = process.env.R2_Access_Key_ID;
    const secretAccessKey = process.env.Secret_Access_Key;
    const accountId = process.env.Account_ID;

    if (!accessKeyId || !secretAccessKey || !accountId) {
        return null;
    }

    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    return s3Client;
}

/**
 * Get the R2 bucket name
 * @returns {string}
 */
export function getR2Bucket() {
    return R2_BUCKET;
}

/**
 * Get the R2 public URL base
 * @returns {string|null}
 */
export function getR2PublicUrl() {
    return process.env.R2_Public_Development_URL || null;
}

/**
 * Check if R2 storage is configured
 * @returns {boolean}
 */
export function isR2StorageConfigured() {
    return !!(
        process.env.R2_Access_Key_ID &&
        process.env.Secret_Access_Key &&
        process.env.Account_ID &&
        process.env.R2_Public_Development_URL
    );
}

/**
 * Firebase Admin SDK initialization
 * Used to verify Firebase ID tokens from phone auth
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, isAbsolute, join } from 'path';
import { log } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let firebaseAdmin = null;

function loadServiceAccount() {
    // Option 1: Full JSON in env var (for Vercel / serverless)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }

    // Option 2: File path (for local development)
    const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
    const keyPath = isAbsolute(configuredPath)
        ? configuredPath
        : join(__dirname, '..', configuredPath);

    if (!existsSync(keyPath)) {
        throw new Error(
            `Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_JSON env var (for production) or place ${configuredPath} in express-app/ (for local).`
        );
    }

    return JSON.parse(readFileSync(keyPath, 'utf8'));
}

export function getFirebaseAdmin() {
    if (firebaseAdmin) return firebaseAdmin;

    try {
        const serviceAccount = loadServiceAccount();

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        }

        firebaseAdmin = admin;
        log.info('Firebase Admin SDK initialized');
    } catch (error) {
        log.error('Failed to initialize Firebase Admin SDK', { error: error.message });
        throw new Error('Firebase Admin initialization failed: ' + error.message);
    }

    return firebaseAdmin;
}

/**
 * Normalize phone number to E.164 format for Saudi Arabia
 * Examples:
 *   05xxxxxxxx   → +9665xxxxxxxx
 *   5xxxxxxxx    → +9665xxxxxxxx
 *   009665...    → +9665...
 */
export function normalizePhoneE164(phone) {
    if (!phone) return null;
    phone = phone.replace(/[\s\-()]/g, '');
    if (phone.startsWith('+')) return phone;
    if (phone.startsWith('00')) return '+' + phone.slice(2);
    if (phone.startsWith('05')) return '+966' + phone.slice(1);
    if (phone.startsWith('5')) return '+9665' + phone.slice(1);
    return '+966' + phone;
}

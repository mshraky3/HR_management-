/**
 * Error Tracking Service
 * Captures and reports critical errors to the backend for email notification
 */

import { API_URL } from '../config/api.js';

// Configuration
const ERROR_REPORT_ENDPOINT = `${API_URL}/api/error-report`;
const BATCH_REPORT_ENDPOINT = `${API_URL}/api/error-report/batch`;

// Queue for offline errors
let errorQueue = [];
const MAX_QUEUE_SIZE = 50;

// Rate limiting for client-side
const reportedErrors = new Map();
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown for same error

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    CRITICAL: 'CRITICAL',  // System down, data loss risk
    HIGH: 'HIGH',          // Major feature broken
    MEDIUM: 'MEDIUM',      // Feature partially broken
    LOW: 'LOW',            // Minor issue
};

/**
 * Error types for classification
 */
export const ErrorTypes = {
    API_ERROR: 'API_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RENDER_ERROR: 'RENDER_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    CONNECTION_ERROR: 'CONNECTION_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
};

/**
 * Determine if error should be reported
 */
function shouldReportError(error, statusCode) {
    // Always report 500+ errors
    if (statusCode >= 500) return true;

    // Report connection/network errors
    if (!error.response && error.message?.toLowerCase().includes('network')) return true;

    // Report database errors
    if (error.message?.toLowerCase().includes('database') ||
        error.message?.toLowerCase().includes('connection') ||
        error.message?.toLowerCase().includes('postgres')) return true;

    // Report timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) return true;

    // Report unhandled errors (no response, not cancelled)
    if (!error.response && !error.__CANCEL__) return true;

    // Don't report 4xx client errors by default (user mistakes)
    if (statusCode >= 400 && statusCode < 500) return false;

    return false;
}

/**
 * Check rate limiting
 */
function isRateLimited(errorKey) {
    const lastReported = reportedErrors.get(errorKey);
    if (!lastReported) return false;

    const elapsed = Date.now() - lastReported;
    return elapsed < COOLDOWN_MS;
}

/**
 * Mark error as reported
 */
function markReported(errorKey) {
    reportedErrors.set(errorKey, Date.now());

    // Clean up old entries
    if (reportedErrors.size > 100) {
        const now = Date.now();
        for (const [key, time] of reportedErrors) {
            if (now - time > COOLDOWN_MS * 5) {
                reportedErrors.delete(key);
            }
        }
    }
}

/**
 * Classify error type
 */
function classifyError(error, statusCode) {
    const message = (error.message || '').toLowerCase();
    const responseMessage = (error.response?.data?.message || '').toLowerCase();

    if (statusCode === 401 || statusCode === 403) {
        return ErrorTypes.AUTH_ERROR;
    }

    if (message.includes('network') || !error.response) {
        return ErrorTypes.NETWORK_ERROR;
    }

    if (message.includes('timeout') || error.code === 'ECONNABORTED') {
        return ErrorTypes.TIMEOUT_ERROR;
    }

    if (message.includes('database') || message.includes('postgres') ||
        responseMessage.includes('database') || responseMessage.includes('connection')) {
        return ErrorTypes.DATABASE_ERROR;
    }

    if (message.includes('connection') || responseMessage.includes('connection')) {
        return ErrorTypes.CONNECTION_ERROR;
    }

    if (statusCode >= 500) {
        return ErrorTypes.API_ERROR;
    }

    if (statusCode >= 400 && statusCode < 500) {
        return ErrorTypes.VALIDATION_ERROR;
    }

    return ErrorTypes.UNKNOWN_ERROR;
}

/**
 * Get user info from localStorage
 */
function getUserInfo() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return null;

        // Decode JWT payload (without verification)
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return {
            userId: payload.id,
            username: payload.username,
            branchId: payload.branch_id,
        };
    } catch {
        return null;
    }
}

/**
 * Send error report to backend
 */
async function sendErrorReport(errorData) {
    try {
        const token = localStorage.getItem('token');

        const response = await fetch(ERROR_REPORT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
            },
            body: JSON.stringify(errorData),
        });

        return response.ok;
    } catch (e) {
        // Queue for later if network fails
        queueError(errorData);
        return false;
    }
}

/**
 * Queue error for later sending
 */
function queueError(errorData) {
    if (errorQueue.length >= MAX_QUEUE_SIZE) {
        errorQueue.shift(); // Remove oldest
    }
    errorQueue.push(errorData);

    // Try to persist to localStorage
    try {
        localStorage.setItem('error_queue', JSON.stringify(errorQueue));
    } catch {
        // Storage full or unavailable
    }
}

/**
 * Load queued errors from localStorage
 */
function loadQueuedErrors() {
    try {
        const stored = localStorage.getItem('error_queue');
        if (stored) {
            errorQueue = JSON.parse(stored);
        }
    } catch {
        errorQueue = [];
    }
}

/**
 * Flush queued errors
 */
async function flushErrorQueue() {
    if (errorQueue.length === 0) return;

    const errors = [...errorQueue];
    errorQueue = [];

    try {
        localStorage.removeItem('error_queue');

        const token = localStorage.getItem('token');
        await fetch(BATCH_REPORT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
            },
            body: JSON.stringify({ errors }),
        });
    } catch {
        // Re-queue if failed
        errorQueue = [...errors, ...errorQueue].slice(0, MAX_QUEUE_SIZE);
    }
}

/**
 * Report an API error
 * Call this from API interceptors
 */
export function reportApiError(error, config = {}) {
    const statusCode = error.response?.status || 0;

    // Check if should report
    if (!shouldReportError(error, statusCode)) {
        return;
    }

    const errorType = classifyError(error, statusCode);
    const endpoint = config.url || error.config?.url || 'unknown';
    const method = config.method?.toUpperCase() || error.config?.method?.toUpperCase() || 'UNKNOWN';

    // Generate error key for rate limiting
    const errorKey = `${errorType}:${method}:${endpoint}:${statusCode}`;

    if (isRateLimited(errorKey)) {
        return;
    }

    const userInfo = getUserInfo();

    const errorData = {
        errorType,
        message: error.message || 'Unknown error',
        endpoint,
        method,
        statusCode,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        userId: userInfo?.userId,
        username: userInfo?.username,
        branchId: userInfo?.branchId,
        stackTrace: error.stack,
        requestData: sanitizeData(config.data || error.config?.data),
        responseData: sanitizeData(error.response?.data),
        additionalInfo: {
            url: window.location.href,
            timestamp: new Date().toISOString(),
            errorCode: error.code,
        },
    };

    markReported(errorKey);
    sendErrorReport(errorData);
}

/**
 * Report a render/component error (for Error Boundaries)
 */
export function reportRenderError(error, errorInfo) {
    const errorKey = `RENDER:${error.message}`;

    if (isRateLimited(errorKey)) {
        return;
    }

    const userInfo = getUserInfo();

    const errorData = {
        errorType: ErrorTypes.RENDER_ERROR,
        message: error.message || 'Render error',
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        userId: userInfo?.userId,
        username: userInfo?.username,
        branchId: userInfo?.branchId,
        stackTrace: error.stack,
        additionalInfo: {
            componentStack: errorInfo?.componentStack,
            url: window.location.href,
            timestamp: new Date().toISOString(),
        },
    };

    markReported(errorKey);
    sendErrorReport(errorData);
}

/**
 * Report an unhandled error
 */
export function reportUnhandledError(error, source = 'window') {
    const errorKey = `UNHANDLED:${source}:${error.message}`;

    if (isRateLimited(errorKey)) {
        return;
    }

    const userInfo = getUserInfo();

    const errorData = {
        errorType: ErrorTypes.UNKNOWN_ERROR,
        message: error.message || 'Unhandled error',
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        userId: userInfo?.userId,
        username: userInfo?.username,
        branchId: userInfo?.branchId,
        stackTrace: error.stack,
        additionalInfo: {
            source,
            url: window.location.href,
            timestamp: new Date().toISOString(),
        },
    };

    markReported(errorKey);
    sendErrorReport(errorData);
}

/**
 * Sanitize sensitive data
 */
function sanitizeData(data) {
    if (!data) return null;

    try {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;

        if (typeof parsed !== 'object') return parsed;

        const sanitized = { ...parsed };
        const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie', 'apikey', 'api_key'];

        const sanitizeObj = (obj) => {
            for (const key of Object.keys(obj)) {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObj(obj[key]);
                }
            }
        };

        sanitizeObj(sanitized);
        return sanitized;
    } catch {
        return null;
    }
}

/**
 * Initialize error tracking
 * Call this once when app starts
 */
export function initErrorTracking() {
    // Load queued errors
    loadQueuedErrors();

    // Flush queue on load (if online)
    if (navigator.onLine) {
        flushErrorQueue();
    }

    // Flush when coming back online
    window.addEventListener('online', flushErrorQueue);

    // Global error handler
    window.addEventListener('error', (event) => {
        reportUnhandledError(event.error || new Error(event.message), 'window.error');
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
        reportUnhandledError(error, 'unhandledrejection');
    });
}

export default {
    reportApiError,
    reportRenderError,
    reportUnhandledError,
    initErrorTracking,
    ErrorTypes,
    ErrorSeverity,
};

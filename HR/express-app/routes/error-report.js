/**
 * Error Reporting Routes
 * API endpoints for receiving and processing error reports from frontend
 */

import express from 'express';
import { sendErrorNotification } from '../utils/errorNotificationService.js';
import { log } from '../utils/logger.js';
import { optionalAuth } from '../middleware/auth.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

/**
 * POST /api/error-report
 * Receive error reports from frontend
 * Uses optional auth - works even if user is not logged in
 */
router.post('/', optionalAuth, async (req, res) => {
    try {
        const {
            errorType,
            message,
            endpoint,
            method,
            statusCode,
            page,
            stackTrace,
            requestData,
            responseData,
            additionalInfo,
            userAgent,
        } = req.body;

        // Basic validation
        if (!errorType && !message && !endpoint) {
            return res.status(400).json({
                success: false,
                message: 'At least one of errorType, message, or endpoint is required',
            });
        }

        // Build error data object
        const errorData = {
            errorType: errorType || 'FRONTEND_ERROR',
            message: message || 'No message provided',
            endpoint,
            method: method || 'UNKNOWN',
            statusCode: statusCode || 0,
            page: page || req.headers.referer,
            userAgent: userAgent || req.headers['user-agent'],
            userId: req.user?.id,
            username: req.user?.username,
            branchId: req.user?.branch_id,
            stackTrace,
            requestData,
            responseData,
            additionalInfo,
            timestamp: new Date().toISOString(),
            source: 'FRONTEND',
        };

        // Log the error
        log.error('Frontend error reported', {
            errorType: errorData.errorType,
            endpoint: errorData.endpoint,
            statusCode: errorData.statusCode,
            userId: errorData.userId,
        });

        // Send email notification (async - don't wait)
        sendErrorNotification(errorData).catch(err => {
            log.error('Failed to send error notification from route', { error: err.message });
        });

        res.json({
            success: true,
            message: 'Error report received',
        });
    } catch (error) {
        log.error('Error processing error report', { error: error.message });
        handleRouteError(error, req, res, 'Failed to process error report');
    }
});

/**
 * POST /api/error-report/batch
 * Receive multiple error reports at once (for offline/queued errors)
 */
router.post('/batch', optionalAuth, async (req, res) => {
    try {
        const { errors } = req.body;

        if (!Array.isArray(errors) || errors.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'errors array is required',
            });
        }

        // Limit batch size
        const maxBatchSize = 10;
        const errorsToProcess = errors.slice(0, maxBatchSize);

        let processed = 0;

        for (const error of errorsToProcess) {
            const errorData = {
                errorType: error.errorType || 'FRONTEND_ERROR',
                message: error.message || 'No message provided',
                endpoint: error.endpoint,
                method: error.method || 'UNKNOWN',
                statusCode: error.statusCode || 0,
                page: error.page || req.headers.referer,
                userAgent: error.userAgent || req.headers['user-agent'],
                userId: req.user?.id,
                username: req.user?.username,
                branchId: req.user?.branch_id,
                stackTrace: error.stackTrace,
                requestData: error.requestData,
                responseData: error.responseData,
                additionalInfo: error.additionalInfo,
                timestamp: error.timestamp || new Date().toISOString(),
                source: 'FRONTEND_BATCH',
            };

            // Send notifications (don't wait for each)
            sendErrorNotification(errorData).catch(() => { });
            processed++;
        }

        res.json({
            success: true,
            message: `Processed ${processed} error reports`,
            processed,
        });
    } catch (error) {
        log.error('Error processing batch error reports', { error: error.message });
        handleRouteError(error, req, res, 'Failed to process batch error reports');
    }
});

export default router;

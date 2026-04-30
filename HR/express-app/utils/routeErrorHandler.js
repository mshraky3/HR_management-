import { reportBackendError } from './errorNotificationService.js';
import { log } from './logger.js';

export function handleRouteError(error, req, res, defaultMessage = 'حدث خطأ في الخادم') {
    const isDev = process.env.NODE_ENV !== 'production';
    reportBackendError(error, req).catch(e => {
        log.error('Failed to send error notification', { error: e.message });
    });
    return res.status(500).json({
        success: false,
        message: isDev ? (error.message || defaultMessage) : defaultMessage,
        ...(isDev && { stack: error.stack }),
    });
}

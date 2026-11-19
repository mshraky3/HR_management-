import { reportBackendErrorAwaited } from './errorNotificationService.js';
import { log } from './logger.js';

/**
 * Postgres error codes that mean "the request was invalid", not "the server
 * broke". Returning 500 for these was wrong twice over: the branch saw a
 * generic "حدث خطأ في الخادم" with no idea what to correct, and every
 * occurrence fired an error-notification email — so one branch repeatedly
 * saving a row that violates a CHECK constraint turns into an alert flood
 * during the year rollover, when 20 branches are editing at once.
 *
 * Routes that can produce a *better* message for a specific code still catch it
 * themselves first; this is the floor, not a replacement.
 */
const CLIENT_ERROR_CODES = {
    '23514': 'قيمة غير مقبولة في أحد الحقول. يرجى مراجعة البيانات المدخلة',   // check_violation
    '23505': 'هذا السجل مسجل بالفعل',                                          // unique_violation
    '23503': 'السجل المرتبط غير موجود',                                        // foreign_key_violation
    '23502': 'يوجد حقل مطلوب لم يتم تعبئته',                                   // not_null_violation
    '22P02': 'صيغة أحد الحقول غير صحيحة',                                      // invalid_text_representation
    '22003': 'قيمة رقمية خارج النطاق المسموح',                                 // numeric_value_out_of_range
};

/**
 * Answers a failed request. It is async because a 500 now waits (hard timeout) for the alert
 * mail; call sites that `return handleRouteError(...)` from an async route need no change.
 * It never rejects: a call site that does not await it cannot cause an unhandled rejection.
 */
export async function handleRouteError(error, req, res, defaultMessage = 'حدث خطأ في الخادم') {
    try {
        return await respondToRouteError(error, req, res, defaultMessage);
    } catch (e) {
        log.error('handleRouteError failed', { error: e?.message });
    }
}

async function respondToRouteError(error, req, res, defaultMessage) {
    const isDev = process.env.NODE_ENV !== 'production';

    const clientMessage = CLIENT_ERROR_CODES[error?.code];
    if (clientMessage) {
        // Logged, but deliberately NOT reported as a backend error — this is a
        // rejected input, and the constraint doing the rejecting is the system
        // working as intended.
        log.warn('Rejected request (database constraint)', {
            code: error.code,
            constraint: error.constraint_name || error.constraint,
            detail: error.detail,
            path: req?.originalUrl,
        });
        return res.status(400).json({
            success: false,
            message: clientMessage,
            error: error.code,
            ...(isDev && { detail: error.detail }),
        });
    }

    // Wait for the mail (hard timeout, never throws), see errorHandler.js.
    await reportBackendErrorAwaited(error, req);
    return res.status(500).json({
        success: false,
        message: isDev ? (error.message || defaultMessage) : defaultMessage,
        ...(isDev && { stack: error.stack }),
    });
}

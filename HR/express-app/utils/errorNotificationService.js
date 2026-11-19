/**
 * Error Notification Service
 * Sends email notifications for critical system errors
 */

import { log } from './logger.js';
import { emailTransporter } from './emailService.js';

import { createEmailClient, GatewayError } from './email-client.js';

/**
 * Error alerts follow the same switch as every other HR mail, EMAIL_GATEWAY_MODE
 * (same client, same reading of the variable as emailService.js):
 *   off     (default) direct SMTP only, exactly as before; the gateway is never called
 *   shadow  direct SMTP sends; the gateway only records what it would do
 *   on      the gateway sends; direct SMTP is the fallback (see deliverErrorMail)
 */
const _gateway = createEmailClient({
  baseUrl: process.env.EMAIL_GATEWAY_URL,
  apiKey: process.env.EMAIL_GATEWAY_KEY,
  mode: process.env.EMAIL_GATEWAY_MODE || 'off',
  legacy: (p) => emailTransporter.sendMail({
    from: p.from, to: p.to, subject: p.subject, html: p.html, text: p.text,
  }),
  log: (m, e) => log.warn(`[gateway] ${m}`, { error: e }),
});

const ERROR_MAIL_FROM_NAME = 'نظام الإنذارات - HR System';

function sendViaGateway({ fromName, to, subject, html, text, event, severity, sourceOrigin, idempotencyKey }) {
  return _gateway.send({
    from: `"${fromName}" <${process.env.MAIL_FROM_ADDRESS}>`,
    fromName, to, subject, html, text, event, severity, sourceOrigin, idempotencyKey,
  });
}

/**
 * Single delivery point for error mail. With EMAIL_GATEWAY_MODE=off this is one direct
 * SMTP send, identical to the old code. With mode "on" the gateway client already falls
 * back to SMTP on network errors, timeouts and 5xx; this adds the cases it deliberately
 * does not: a gateway 4xx (bad key, bad payload) or a "failed" outcome. For an alert to
 * the owner, silence is the worst result, so a rejection by the gateway must not end in
 * "no mail". A deliberate gateway decision (suppressed, dropped, throttled, duplicate)
 * is still respected. An error thrown by SMTP itself is never retried.
 */
async function deliverErrorMail({ to, subject, html, text, event, severity, sourceOrigin }) {
  const mail = { to, subject, html, text };
  try {
    const result = await sendViaGateway({
      fromName: ERROR_MAIL_FROM_NAME, ...mail, event, severity, sourceOrigin,
    });
    if (result && (result.status === 'failed' || result.status === 'error')) {
      throw new GatewayError('http', `gateway outcome ${result.status}`, 502, result);
    }
    return result;
  } catch (err) {
    if (!(err instanceof GatewayError)) throw err;
    log.warn('Error mail: gateway did not send, using direct SMTP', { kind: err.kind, status: err.status });
    return emailTransporter.sendMail({
      from: `"${ERROR_MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`, ...mail,
    });
  }
}

/** The mail only counts as sent when the gateway says "sent" (SMTP results carry no status). */
function gatewayStatusOf(result) {
  return result && typeof result.status === 'string' ? result.status : null;
}

// Developer email for error notifications
const DEVELOPER_EMAIL = 'alshraky3@gmail.com';

// Rate limiting to prevent email spam
const errorRateLimit = {
  lastSent: {},
  cooldownMs: 5 * 60 * 1000, // 5 minutes between same error type
  maxEmailsPerHour: 20,
  emailsSentThisHour: 0,
  hourStartTime: Date.now(),
};

// Error frequency tracking (for showing patterns)
const errorFrequency = {
  counts: {},  // { errorKey: count }
  lastReset: Date.now(),
  resetInterval: 60 * 60 * 1000, // Reset every hour
};

/**
 * Get error frequency count
 */
function getErrorFrequency(errorKey) {
  const now = Date.now();

  // Reset if hour passed
  if (now - errorFrequency.lastReset > errorFrequency.resetInterval) {
    errorFrequency.counts = {};
    errorFrequency.lastReset = now;
  }

  // Increment and return count
  errorFrequency.counts[errorKey] = (errorFrequency.counts[errorKey] || 0) + 1;
  return errorFrequency.counts[errorKey];
}

/**
 * Get total errors in last hour
 */
function getTotalErrorsLastHour() {
  return Object.values(errorFrequency.counts).reduce((sum, count) => sum + count, 0);
}

/**
 * Check if we should send this error (rate limiting)
 */
function shouldSendError(errorKey) {
  const now = Date.now();

  // Reset hourly counter
  if (now - errorRateLimit.hourStartTime > 60 * 60 * 1000) {
    errorRateLimit.emailsSentThisHour = 0;
    errorRateLimit.hourStartTime = now;
  }

  // Check max emails per hour
  if (errorRateLimit.emailsSentThisHour >= errorRateLimit.maxEmailsPerHour) {
    log.warn('Error notification rate limit reached', { errorKey });
    return false;
  }

  // Check cooldown for same error type
  const lastSent = errorRateLimit.lastSent[errorKey];
  if (lastSent && (now - lastSent) < errorRateLimit.cooldownMs) {
    log.debug('Error notification skipped (cooldown)', { errorKey });
    return false;
  }

  return true;
}

/**
 * Mark error as sent (for rate limiting)
 */
function markErrorSent(errorKey) {
  errorRateLimit.lastSent[errorKey] = Date.now();
  errorRateLimit.emailsSentThisHour++;
}

/**
 * Determine error severity
 */
export function getErrorSeverity(errorData) {
  const { statusCode, errorType, endpoint } = errorData;

  // A page chunk that failed to load and was fixed by the frontend's automatic reload
  // (react-app utils/chunkReload.js): logged, not mailed. If the reload does not fix it,
  // the frontend reports a RENDER_ERROR instead, which stays HIGH below.
  if (errorType === 'CHUNK_LOAD_ERROR') {
    return 'LOW';
  }

  // Critical errors
  if (statusCode >= 500 || errorType === 'DATABASE_ERROR' || errorType === 'CONNECTION_ERROR') {
    return 'CRITICAL';
  }

  // High severity
  if (statusCode === 401 || statusCode === 403 || errorType === 'AUTH_ERROR') {
    return 'HIGH';
  }

  // Medium severity
  if (statusCode >= 400 && statusCode < 500) {
    return 'MEDIUM';
  }

  // Unknown errors are treated as high
  if (errorType === 'UNKNOWN_ERROR' || errorType === 'UNHANDLED_ERROR' || errorType === 'RENDER_ERROR') {
    return 'HIGH';
  }

  return 'LOW';
}

/**
 * Get severity color for email
 */
function getSeverityColor(severity) {
  switch (severity) {
    case 'CRITICAL': return '#dc2626'; // Red
    case 'HIGH': return '#ea580c'; // Orange
    case 'MEDIUM': return '#ca8a04'; // Yellow
    default: return '#2563eb'; // Blue
  }
}

/**
 * Get severity label in Arabic
 */
function getSeverityLabel(severity) {
  switch (severity) {
    case 'CRITICAL': return 'حرج';
    case 'HIGH': return 'مرتفع';
    case 'MEDIUM': return 'متوسط';
    default: return 'منخفض';
  }
}

/**
 * Generate error report HTML
 */
function generateErrorEmailHtml(errorData, frequencyInfo = {}) {
  const {
    errorType,
    message,
    endpoint,
    method,
    statusCode,
    page,
    userAgent,
    userId,
    username,
    branchId,
    timestamp,
    stackTrace,
    requestData,
    responseData,
    additionalInfo,
  } = errorData;

  const { errorCount = 1, totalErrorsLastHour = 1 } = frequencyInfo;

  const severity = getErrorSeverity(errorData);
  const severityColor = getSeverityColor(severity);
  const severityLabel = getSeverityLabel(severity);

  const formattedTime = new Date(timestamp).toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تقرير خطأ - ${errorType}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 20px;">
        <tr>
          <td align="center">
            <table width="700" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${severityColor} 0%, #1e293b 100%); padding: 25px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">
                    🚨 تقرير خطأ في النظام
                  </h1>
                  <div style="margin-top: 10px;">
                    <span style="display: inline-block; background: rgba(255,255,255,0.2); padding: 6px 16px; border-radius: 20px; margin: 3px;">
                      <span style="color: #ffffff; font-size: 14px; font-weight: 500;">
                        درجة الخطورة: ${severityLabel}
                      </span>
                    </span>
                    ${errorCount > 1 ? `
                    <span style="display: inline-block; background: rgba(220,38,38,0.3); padding: 6px 16px; border-radius: 20px; margin: 3px;">
                      <span style="color: #ffffff; font-size: 14px; font-weight: 500;">
                        🔄 تكرار: ${errorCount} مرة
                      </span>
                    </span>
                    ` : ''}
                    ${totalErrorsLastHour > 5 ? `
                    <span style="display: inline-block; background: rgba(234,88,12,0.3); padding: 6px 16px; border-radius: 20px; margin: 3px;">
                      <span style="color: #ffffff; font-size: 14px; font-weight: 500;">
                        ⚠️ ${totalErrorsLastHour} خطأ/ساعة
                      </span>
                    </span>
                    ` : ''}
                  </div>
                </td>
              </tr>

              <!-- Error Type Badge -->
              <tr>
                <td style="padding: 25px 25px 15px 25px;">
                  <div style="background: linear-gradient(135deg, #fee2e2 0%, #fef3c7 100%); border-radius: 8px; padding: 15px; border-right: 4px solid ${severityColor};">
                    <h2 style="margin: 0; color: #991b1b; font-size: 18px;">
                      ${errorType || 'UNKNOWN_ERROR'}
                    </h2>
                    <p style="margin: 8px 0 0 0; color: #78350f; font-size: 14px;">
                      ${message || 'لا توجد رسالة خطأ'}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Details Section -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    📋 تفاصيل الخطأ
                  </h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; width: 35%;">الوقت</td>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #1e293b;" dir="ltr">${formattedTime}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">الصفحة</td>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;" dir="ltr">${page || 'غير محدد'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">Endpoint</td>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #1e293b;" dir="ltr">
                        <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${method || 'GET'} ${endpoint || 'N/A'}</code>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">Status Code</td>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
                        <span style="background: ${statusCode >= 500 ? '#fee2e2' : statusCode >= 400 ? '#fef3c7' : '#dcfce7'}; color: ${statusCode >= 500 ? '#991b1b' : statusCode >= 400 ? '#92400e' : '#166534'}; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                          ${statusCode || 'N/A'}
                        </span>
                      </td>
                    </tr>
                    ${userId ? `
                    <tr>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">المستخدم</td>
                      <td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
                        ${username || 'غير معروف'} (ID: ${userId})${branchId ? ` - فرع: ${branchId}` : ''}
                      </td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">المتصفح</td>
                      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 12px;" dir="ltr">${userAgent || 'غير معروف'}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${requestData ? `
              <!-- Request Data -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    📤 بيانات الطلب
                  </h3>
                  <pre style="background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all;" dir="ltr">${JSON.stringify(requestData, null, 2)}</pre>
                </td>
              </tr>
              ` : ''}

              ${responseData ? `
              <!-- Response Data -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    📥 رد الخادم
                  </h3>
                  <pre style="background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all;" dir="ltr">${JSON.stringify(responseData, null, 2)}</pre>
                </td>
              </tr>
              ` : ''}

              ${stackTrace ? `
              <!-- Stack Trace -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    🔍 Stack Trace
                  </h3>
                  <pre style="background: #450a0a; color: #fca5a5; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 200px;" dir="ltr">${stackTrace}</pre>
                </td>
              </tr>
              ` : ''}

              ${additionalInfo ? `
              <!-- Additional Info -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    ℹ️ معلومات إضافية
                  </h3>
                  <pre style="background: #f8fafc; color: #475569; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; border: 1px solid #e2e8f0;" dir="ltr">${typeof additionalInfo === 'string' ? additionalInfo : JSON.stringify(additionalInfo, null, 2)}</pre>
                </td>
              </tr>
              ` : ''}

              <!-- Quick Actions -->
              <tr>
                <td style="padding: 0 25px 20px 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                    ⚡ إجراءات سريعة
                  </h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px; text-align: center;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5174'}${page || ''}" 
                           style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; margin: 5px;">
                          🌐 فتح الصفحة
                        </a>
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5174'}/admin/system-logs" 
                           style="display: inline-block; background: #6366f1; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; margin: 5px;">
                          📋 سجلات النظام
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Environment Badge -->
              <tr>
                <td style="padding: 0 25px 20px 25px; text-align: center;">
                  <span style="display: inline-block; background: ${process.env.NODE_ENV === 'production' ? '#dc2626' : '#059669'}; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    ${process.env.NODE_ENV === 'production' ? '🔴 Production' : '🟢 Development'}
                  </span>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 5px 0; color: #64748b; font-size: 13px;">
                    تم إرسال هذا التقرير تلقائياً من نظام إدارة الموارد البشرية
                  </p>
                  <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                    للتحقق: تفقد سجلات الخادم أو اتصل بفريق التطوير
                  </p>
                  <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 10px;">
                    Error ID: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
}

/**
 * Send error notification email
 * @param {Object} errorData - Error details
 */
export async function sendErrorNotification(errorData) {
  try {
    const {
      errorType = 'UNKNOWN_ERROR',
      endpoint = '',
      statusCode = 0,
    } = errorData;

    // Generate a key for rate limiting
    const errorKey = `${errorType}:${endpoint}:${statusCode}`;

    // Check severity - only send for CRITICAL and HIGH
    const severity = getErrorSeverity(errorData);
    if (severity !== 'CRITICAL' && severity !== 'HIGH') {
      log.debug('Error notification skipped (low severity)', { errorKey, severity });
      return { success: false, reason: 'low_severity' };
    }

    // Check rate limiting
    if (!shouldSendError(errorKey)) {
      return { success: false, reason: 'rate_limited' };
    }

    // Get frequency info
    const errorCount = getErrorFrequency(errorKey);
    const totalErrorsLastHour = getTotalErrorsLastHour();

    const frequencyInfo = {
      errorCount,
      totalErrorsLastHour,
    };

    const subject = `🚨 [${severity}] خطأ في النظام: ${errorType}${errorCount > 1 ? ` (×${errorCount})` : ''}`;
    const htmlContent = generateErrorEmailHtml({
      ...errorData,
      timestamp: errorData.timestamp || new Date().toISOString(),
    }, frequencyInfo);

    const result = await deliverErrorMail({
      to: DEVELOPER_EMAIL,
      subject,
      html: htmlContent,
      text: `خطأ في النظام\n\nنوع الخطأ: ${errorType}\nالرسالة: ${errorData.message}\nEndpoint: ${errorData.method} ${endpoint}\nStatus: ${statusCode}\nالتكرار: ${errorCount} مرة\n\nالرجاء التحقق من سجلات الخادم.`,
      event: 'hr.owner.system_error',
      severity,
      sourceOrigin: errorData.sourceOrigin,
    });
    markErrorSent(errorKey);

    const gatewayStatus = gatewayStatusOf(result);
    if (gatewayStatus && gatewayStatus !== 'sent') {
      // The gateway answered on purpose (dropped / throttled / suppressed / duplicate): nothing went out.
      log.warn('Error notification not sent by the gateway', { errorType, endpoint, gatewayStatus, reason: result.reason });
      return { success: false, reason: `gateway_${gatewayStatus}` };
    }

    const messageId = result?.messageId || result?.id;
    log.info('Error notification email sent', {
      errorType,
      endpoint,
      messageId,
      errorCount,
      totalErrorsLastHour,
    });

    return { success: true, messageId };
  } catch (error) {
    log.error('Failed to send error notification email', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Report backend error (called from error handler)
 */
export async function reportBackendError(error, req) {
  try {
    const errorData = {
      errorType: error.name || 'SERVER_ERROR',
      message: error.message,
      endpoint: req?.originalUrl || req?.url,
      method: req?.method,
      statusCode: error.statusCode || error.status || 500,
      page: req?.headers?.referer,
      userAgent: req?.headers?.['user-agent'],
      userId: req?.user?.id,
      username: req?.user?.username,
      branchId: req?.user?.branch_id,
      stackTrace: error.stack,
      requestData: {
        body: sanitizeData(req?.body),
        query: req?.query,
        params: req?.params,
      },
      timestamp: new Date().toISOString(),
    };

    return await sendErrorNotification(errorData);
  } catch (e) {
    log.error('Failed to report backend error', { error: e.message });
    return { success: false, error: e.message };
  }
}

/**
 * Sanitize sensitive data before sending
 */
function sanitizeData(data) {
  if (!data) return null;

  const sanitized = { ...data };
  const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

// ── awaited sends, OTP failures, heartbeat ─────────────────────────────────

/** Hard limit for one awaited error-mail send, so a slow SMTP server never hangs a response. */
export const DEFAULT_ERROR_MAIL_TIMEOUT_MS = 8000;

/** ERROR_MAIL_TIMEOUT_MS overrides the 8 s default (read at call time; used by the tests). */
function errorMailTimeoutMs() {
  const n = Number(process.env.ERROR_MAIL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ERROR_MAIL_TIMEOUT_MS;
}

/**
 * Runs `work` and gives up waiting after `ms`. Never rejects and never throws: a failure or
 * a timeout comes back as { success: false, ... }. On timeout the work itself is not
 * cancelled (it may still finish if the process stays alive); we only stop waiting for it.
 */
export async function settleWithin(work, ms = errorMailTimeoutMs()) {
  let timer;
  const guarded = Promise.resolve()
    .then(work)
    .catch((e) => ({ success: false, error: e?.message || String(e) }));
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ success: false, reason: 'timeout' }), ms);
  });
  try {
    const result = await Promise.race([guarded, timeout]);
    if (result?.reason === 'timeout') {
      log.error('Error notification timed out', { timeoutMs: ms });
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Report a backend error and wait for the mail (up to the timeout). Use this in the
 * request path instead of fire-and-forget: on Vercel the function can be frozen as soon
 * as the response is sent, which drops a mail that is still on its way. Never throws.
 */
export function reportBackendErrorAwaited(error, req) {
  return settleWithin(() => reportBackendError(error, req));
}

/** Keeps only a short, harmless token (class names, status codes); never free text. */
function safeToken(value) {
  if (value === undefined || value === null) return 'unknown';
  return String(value).replace(/[^\w.:-]/g, '').slice(0, 40) || 'unknown';
}

/**
 * Mail the owner that a login code could not be sent. Carries only the account kind
 * ("branch" or "user"), the error class and the status; never the code, the address or the
 * phone number. Goes through the normal cooldown: one mail per 5 minutes per kind.
 * Awaited with the hard timeout; never throws.
 */
export function reportOtpSendFailure({ kind, errorName, errorStatus } = {}) {
  const cls = safeToken(errorName);
  const status = safeToken(errorStatus);
  return settleWithin(() => sendErrorNotification({
    errorType: 'OTP_SEND_FAILED',
    message: `Login code e-mail could not be sent (${cls}, status ${status})`,
    endpoint: `OTP:${safeToken(kind)}`,
    method: 'POST',
    statusCode: 500,
    additionalInfo: { accountKind: safeToken(kind), errorClass: cls, errorStatus: status },
    timestamp: new Date().toISOString(),
  }));
}

/**
 * One check of the error-mail path, without sending anything: which route is configured,
 * whether SMTP answers (nodemailer verify) and, in gateway mode "on", whether the gateway
 * answers its health call. Returns booleans and short words only.
 */
export async function runErrorMailSelfCheck() {
  const mode = _gateway.mode;
  const check = {
    mode,
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM_ADDRESS),
    gatewayConfigured: Boolean(process.env.EMAIL_GATEWAY_URL && process.env.EMAIL_GATEWAY_KEY),
    smtpVerify: 'failed',
    gatewayHealth: 'skipped',
    ok: false,
  };

  const verified = await settleWithin(async () => {
    await emailTransporter.verify();
    return { success: true };
  });
  check.smtpVerify = verified.success ? 'ok' : (verified.reason === 'timeout' ? 'timeout' : 'failed');

  if (mode === 'on') {
    const health = await settleWithin(async () => {
      await _gateway.health();
      return { success: true };
    });
    check.gatewayHealth = health.success ? 'ok' : (health.reason === 'timeout' ? 'timeout' : 'failed');
  }

  check.ok = check.smtpConfigured && check.smtpVerify === 'ok' && check.gatewayHealth !== 'failed' && check.gatewayHealth !== 'timeout';
  return check;
}

/**
 * Daily "the error-mail path is alive" mail. One short plain-text message to the error-report
 * recipient only (the same address the error mails use). Never throws.
 * The count of error mails sent in the last 24 h is left out on purpose: the counters live in
 * memory per serverless instance, so the cron instance cannot know them.
 */
export async function sendErrorHeartbeat({ now = new Date() } = {}) {
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(now);
    const check = await runErrorMailSelfCheck();
    const lines = [
      'HR system: error-mail heartbeat',
      `Date (Riyadh): ${date}`,
      `Self-check: ${check.ok ? 'OK' : 'FAILED'}`,
      `  mail route mode: ${check.mode}`,
      `  SMTP configured: ${check.smtpConfigured ? 'yes' : 'no'}`,
      `  SMTP verify: ${check.smtpVerify}`,
      `  gateway health: ${check.gatewayHealth}`,
      '',
      'If this mail stops arriving, the error-mail path or the daily cron is down.',
    ];
    const result = await settleWithin(() => deliverErrorMail({
      to: DEVELOPER_EMAIL,
      subject: `[HR] Error-mail heartbeat ${date}: ${check.ok ? 'OK' : 'self-check FAILED'}`,
      text: lines.join('\n'),
      event: 'hr.owner.error_heartbeat',
    }), errorMailTimeoutMs());
    const gatewayStatus = gatewayStatusOf(result);
    const sent = result?.success !== false && (!gatewayStatus || gatewayStatus === 'sent');
    return {
      sent,
      selfCheck: check,
      ...(sent ? {} : { reason: result?.reason || (gatewayStatus ? `gateway_${gatewayStatus}` : 'send_failed') }),
    };
  } catch (e) {
    log.error('Error heartbeat failed', { error: e?.message });
    return { sent: false, reason: 'heartbeat_failed' };
  }
}

export default {
  sendErrorNotification,
  reportBackendError,
  reportBackendErrorAwaited,
  reportOtpSendFailure,
  sendErrorHeartbeat,
};

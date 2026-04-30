/**
 * Error Notification Service
 * Sends email notifications for critical system errors
 */

import { log } from './logger.js';
import { emailTransporter } from './emailService.js';

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
function getErrorSeverity(errorData) {
  const { statusCode, errorType, endpoint } = errorData;

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
  if (errorType === 'UNKNOWN_ERROR' || errorType === 'UNHANDLED_ERROR') {
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

    const mailOptions = {
      from: '"نظام الإنذارات - HR System" <alshrakynodeapp@gmail.com>',
      to: DEVELOPER_EMAIL,
      subject,
      html: htmlContent,
      text: `خطأ في النظام\n\nنوع الخطأ: ${errorType}\nالرسالة: ${errorData.message}\nEndpoint: ${errorData.method} ${endpoint}\nStatus: ${statusCode}\nالتكرار: ${errorCount} مرة\n\nالرجاء التحقق من سجلات الخادم.`,
    };

    const result = await emailTransporter.sendMail(mailOptions);
    markErrorSent(errorKey);

    log.info('Error notification email sent', {
      errorType,
      endpoint,
      messageId: result.messageId,
      errorCount,
      totalErrorsLastHour,
    });

    return { success: true, messageId: result.messageId };
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

export default {
  sendErrorNotification,
  reportBackendError,
};

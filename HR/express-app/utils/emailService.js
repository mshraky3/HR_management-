/**
 * Email Service
 * Handles sending emails for notifications
 */

import nodemailer from 'nodemailer';
import { createEmailClient } from './email-client.js';
import dotenv from 'dotenv';
import { log } from './logger.js';

dotenv.config();

// Create email transporter
export const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const MAIL_FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS;

// Verify email connection
emailTransporter.verify((error, success) => {
  if (error) {
    log.error('Email transporter connection failed', { error: error.message });
  } else {
    log.info('Email transporter ready to send emails');
  }
});

/**
 * Send email notification to main manager
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.message - Notification message
 * @param {string} params.notificationType - Type of notification
 * @param {string} params.appUrl - URL to the app
 * @param {Object} params.data - Additional data for the email
 */

// ── central email gateway ───────────────────────────────────────────────────
//
// Added 2026-08-01. All mail now routes through
// https://email-services-nu.vercel.app instead of going straight to SMTP.
//
// WHY: this app and SQB were sending through the SAME Resend account, the same
// API key and the same verified domain, with no shared accounting. Resend free
// is 100 emails/day across BOTH. The gateway rations that by priority, so a
// "notify all branches" fan-out can never starve a branch login OTP, and it
// routes owner-facing mail over Gmail where it costs no Resend quota at all.
//
// EMAIL_GATEWAY_MODE:
//   off     legacy SMTP only — exactly the previous behaviour
//   shadow  legacy SMTP still sends; the gateway only RECORDS what it would do
//   on      the gateway sends, falling back to SMTP only on infra failure
// Rollback is one env var.

/** notificationType -> the event type registered on the gateway. */
const EVENT_BY_TYPE = {
  branch_email_update_request: 'hr.owner.email_update_request',
  expiry_alert_summary:        'hr.owner.expiry_summary',
  new_request:                 'hr.owner.new_request',
  new_suggestion:              'hr.owner.new_suggestion',
  notification_created:        'hr.owner.notification_created',
  notification_response:       'hr.owner.branch_replied',
  statistics_alert:            'hr.owner.daily_critical_stats',
  test:                        'hr.owner.test_email',
  request_response:            'hr.request.answered_user',
  daily_expiry_alert:          'hr.branch.daily_expiry',
  expiry_alert:                'hr.branch.manual_expiry',
  branch_notification:         'hr.branch.notify_all',
};

const gateway = createEmailClient({
  baseUrl: process.env.EMAIL_GATEWAY_URL,
  apiKey: process.env.EMAIL_GATEWAY_KEY,
  mode: process.env.EMAIL_GATEWAY_MODE || 'off',
  legacy: (p) => emailTransporter.sendMail({
    from: p.from, to: p.to, subject: p.subject, html: p.html, text: p.text,
  }),
  log: (m, e) => log.warn(`[gateway] ${m}`, { error: e }),
});

/**
 * Single delivery point. Everything in this file goes through here.
 *
 * `sourceOrigin` matters: the gateway DROPS mail whose origin is not a known
 * production host, which is what stops a frontend running on localhost against
 * the production backend from firing real error alerts.
 */
async function deliver({ fromName, to, subject, html, text, event, severity, sourceOrigin, idempotencyKey }) {
  return gateway.send({
    from: `"${fromName}" <${MAIL_FROM_ADDRESS}>`,
    fromName,
    to, subject, html, text,
    event: event || 'hr.legacy',
    severity, sourceOrigin, idempotencyKey,
  });
}

export async function sendNotificationEmail({ to, subject, message, notificationType, appUrl, data = {} }) {
  try {
    const htmlContent = generateEmailHtml({ subject, message, notificationType, appUrl, data });

    const result = await deliver({
      fromName: 'HR system',
      to,
      subject,
      html: htmlContent,
      text: message, // Plain text fallback
      event: EVENT_BY_TYPE[notificationType] || 'hr.legacy',
      sourceOrigin: data?.sourceOrigin,
    });
    log.info('Email sent successfully', { to, subject, messageId: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    log.error('Failed to send email', { to, subject, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Generate HTML content for email
 */
function generateEmailHtml({ subject, message, notificationType, appUrl, data }) {
  const currentDate = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build additional data rows
  let dataRows = '';
  if (data && Object.keys(data).length > 0) {
    dataRows = Object.entries(data)
      .map(([key, value]) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #4a5568;">${key}:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #2d3748;">${value}</td>
        </tr>
      `)
      .join('');
  }

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7fafc;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7fafc; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                    نظام إدارة الموارد البشرية
                  </h1>
                  <p style="margin: 10px 0 0 0; color: #e6e6ff; font-size: 14px;">
                    إشعار جديد
                  </p>
                </td>
              </tr>

              <!-- Subject -->
              <tr>
                <td style="padding: 30px 30px 20px 30px;">
                  <h2 style="margin: 0 0 10px 0; color: #2d3748; font-size: 20px; font-weight: 600;">
                    ${subject}
                  </h2>
                  <p style="margin: 0; color: #718096; font-size: 14px;">
                    ${currentDate}
                  </p>
                </td>
              </tr>

              <!-- Message -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <div style="background-color: #edf2f7; border-right: 4px solid #667eea; padding: 20px; border-radius: 4px;">
                    <p style="margin: 0; color: #2d3748; font-size: 16px; line-height: 1.6;">
                      ${message}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Additional Data -->
              ${dataRows ? `
                <tr>
                  <td style="padding: 0 30px 20px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                      ${dataRows}
                    </table>
                  </td>
                </tr>
              ` : ''}

              <!-- Call to Action -->
              <tr>
                <td style="padding: 0 30px 30px 30px; text-align: center;">
                  <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">
                    عرض في التطبيق
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px;">
                    هذا إشعار تلقائي من نظام إدارة الموارد البشرية
                  </p>
                  <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                    © ${new Date().getFullYear()} شركة الرعاية المتناهية. جميع الحقوق محفوظة.
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
 * Send critical statistics alert email
 */
export async function sendStatisticsAlertEmail({ to, appUrl, alerts }) {
  const subject = '⚠️ تنبيهات مهمة - نظام إدارة الموارد البشرية';

  let message = 'تم رصد التنبيهات التالية التي تحتاج إلى اهتمامكم:';

  const data = {};
  if (alerts.expiredContracts > 0) {
    data['عقود منتهية'] = `${alerts.expiredContracts} موظف`;
  }
  if (alerts.expiringSoon > 0) {
    data['عقود تنتهي قريباً'] = `${alerts.expiringSoon} موظف`;
  }
  if (alerts.expiredIds > 0) {
    data['هويات منتهية'] = `${alerts.expiredIds} موظف`;
  }
  if (alerts.idsExpiringSoon > 0) {
    data['هويات تنتهي قريباً'] = `${alerts.idsExpiringSoon} موظف`;
  }
  if (alerts.incompleteData > 0) {
    data['بيانات ناقصة'] = `${alerts.incompleteData} موظف`;
  }

  return sendNotificationEmail({
    to,
    subject,
    message,
    notificationType: 'statistics_alert',
    appUrl,
    data,
  });
}

/**
 * Send OTP code email for branch login
 */
export async function sendOTPEmail(toEmail, code, branchName) {
  const subject = 'رمز التحقق لتسجيل الدخول';

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f7fafc;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);overflow:hidden;">
            <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:24px;">HR system</h1>
              <p style="margin:10px 0 0;color:#e6e6ff;font-size:14px;">رمز التحقق</p>
            </td></tr>
            <tr><td style="padding:30px;text-align:center;">
              <p style="margin:0 0 10px;color:#4a5568;font-size:16px;">مرحباً <strong>${branchName}</strong></p>
              <p style="margin:0 0 20px;color:#718096;font-size:14px;">استخدم الرمز التالي لتسجيل الدخول:</p>
              <div style="background:#edf2f7;border-radius:8px;padding:20px;display:inline-block;margin:0 auto;">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2d3748;">${code}</span>
              </div>
              <p style="margin:20px 0 0;color:#e53e3e;font-size:13px;">ينتهي الرمز خلال 10 دقائق. لا تشاركه مع أحد.</p>
            </td></tr>
            <tr><td style="background-color:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#a0aec0;font-size:12px;">© ${new Date().getFullYear()} شركة الرعاية المتناهية. جميع الحقوق محفوظة.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;

  try {
    // P0 on the gateway: a branch account is blocked on this code, so it is
    // sent inline and holds a reserved slice of the daily budget that no
    // amount of bulk mail can consume.
    const result = await deliver({
      fromName: 'HR system',
      to: toEmail,
      subject,
      html: htmlContent,
      text: `رمز التحقق الخاص بك: ${code} - ينتهي خلال 10 دقائق`,
      event: 'hr.otp.login',
      idempotencyKey: `hr-otp:${toEmail}:${code}`,
    });
    log.info('OTP email sent', { to: toEmail, messageId: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    log.error('Failed to send OTP email', { to: toEmail, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send email notification to a branch
 */
export async function sendBranchEmail({ to, subject, message, appUrl, data = {} }) {
  return sendNotificationEmail({ to, subject, message, notificationType: 'branch_notification', appUrl, data });
}

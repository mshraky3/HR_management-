/**
 * Email Service
 * Handles sending emails for notifications
 */

import nodemailer from 'nodemailer';
import { log } from './logger.js';

// Create email transporter
export const emailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'alshrakynodeapp@gmail.com',
    pass: 'ssjpnctdsyqxylxd', // Updated app password Feb 2026
  },
});

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
export async function sendNotificationEmail({ to, subject, message, notificationType, appUrl, data = {} }) {
  try {
    const htmlContent = generateEmailHtml({ subject, message, notificationType, appUrl, data });

    const mailOptions = {
      from: '"HR system" <alshrakynodeapp@gmail.com>',
      to,
      subject,
      html: htmlContent,
      text: message, // Plain text fallback
    };

    const result = await emailTransporter.sendMail(mailOptions);
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
    const result = await emailTransporter.sendMail({
      from: '"HR system" <alshrakynodeapp@gmail.com>',
      to: toEmail,
      subject,
      html: htmlContent,
      text: `رمز التحقق الخاص بك: ${code} - ينتهي خلال 10 دقائق`,
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

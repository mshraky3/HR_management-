import { emailTransporter, sendNotificationEmail } from '../utils/emailService.js';

const to = process.argv[2] || 'alshraky3@gmail.com';

emailTransporter.verify((error) => {
  if (error) {
    console.error('Transporter verify failed:', error.message);
    process.exit(1);
  }
  console.log('Transporter verified OK (Resend SMTP auth succeeded).');
});

const result = await sendNotificationEmail({
  to,
  subject: 'اختبار نظام البريد - HR System',
  message: 'هذه رسالة اختبار للتأكد من عمل نظام البريد الجديد عبر Resend.',
  notificationType: 'test',
  appUrl: 'https://example.com',
});

console.log('Send result:', result);
process.exit(result.success ? 0 : 1);

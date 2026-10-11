/**
 * Which frontend error reports become alert e-mails. Unit test: no database needed.
 *   node --test test/error-severity.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Never reach a real SMTP server (the transporter verifies its connection at import)
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.EMAIL_GATEWAY_MODE = 'off';

const { getErrorSeverity, sendErrorNotification } = await import('../utils/errorNotificationService.js');
const email = await import('../utils/emailService.js');

const outbox = [];
email.emailTransporter.sendMail = async (mail) => {
  outbox.push(mail);
  return { messageId: `test-${outbox.length}` };
};

test('a chunk load fixed by the automatic reload is LOW and sends no e-mail', async () => {
  const report = {
    errorType: 'CHUNK_LOAD_ERROR',
    message: 'Importing a module script failed.',
    page: '/employees',
    statusCode: 0,
  };
  assert.equal(getErrorSeverity(report), 'LOW');

  const before = outbox.length;
  const result = await sendErrorNotification(report);
  assert.deepEqual(result, { success: false, reason: 'low_severity' });
  assert.equal(outbox.length, before);
});

test('real render errors still alert as HIGH', async () => {
  const report = {
    errorType: 'RENDER_ERROR',
    message: 'Objects are not valid as a React child',
    page: '/employees',
    statusCode: 0,
  };
  assert.equal(getErrorSeverity(report), 'HIGH');
  // a chunk that still fails after the reload reaches the error boundary as a RENDER_ERROR
  assert.equal(getErrorSeverity({ ...report, message: 'Importing a module script failed.' }), 'HIGH');

  const before = outbox.length;
  const result = await sendErrorNotification(report);
  assert.equal(result.success, true);
  assert.equal(outbox.length, before + 1);
  assert.match(outbox.at(-1).subject, /\[HIGH\].*RENDER_ERROR/);
});

test('other severities are unchanged', () => {
  assert.equal(getErrorSeverity({ errorType: 'API_ERROR', statusCode: 500 }), 'CRITICAL');
  assert.equal(getErrorSeverity({ errorType: 'DATABASE_ERROR', statusCode: 0 }), 'CRITICAL');
  assert.equal(getErrorSeverity({ errorType: 'AUTH_ERROR', statusCode: 401 }), 'HIGH');
  assert.equal(getErrorSeverity({ errorType: 'VALIDATION_ERROR', statusCode: 422 }), 'MEDIUM');
  assert.equal(getErrorSeverity({ errorType: 'UNKNOWN_ERROR', statusCode: 0 }), 'HIGH');
  assert.equal(getErrorSeverity({ errorType: 'NETWORK_ERROR', statusCode: 0 }), 'LOW');
});

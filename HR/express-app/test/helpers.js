/**
 * Integration-test helpers. Boots the real Express app against a LOCAL scratch
 * Postgres (restored from a production dump) and drives it with fetch.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/hrscratch npm test
 *
 * Refuses to run against anything that is not localhost: these tests write rows.
 */
import http from 'node:http';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a local scratch database (see test/README.md)');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  throw new Error(`Refusing to run tests against non-local database host "${host}"`);
}

process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'test-secret';
process.env.VERCEL = '1';              // app does not call listen(); we do
process.env.INIT_DB_ON_STARTUP = 'false';
process.env.EMAIL_GATEWAY_MODE = 'off';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';
// Never reach a real SMTP server from a test run (the transporter verifies its connection at import).
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';

const { default: sql } = await import('../config/database.js');
const { default: app } = await import('../server.js');
const email = await import('../utils/emailService.js');

/** Captured outgoing mail; the SMTP transport is replaced so nothing leaves the machine. */
export const outbox = [];
email.emailTransporter.sendMail = async (mail) => {
  outbox.push(mail);
  return { messageId: `test-${outbox.length}` };
};

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
export const baseUrl = `http://127.0.0.1:${server.address().port}`;

export async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

/** Last 6-digit code from the captured OTP mail. */
export function lastOtpCode() {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const m = String(outbox[i].text || '').match(/\b(\d{6})\b/);
    if (m) return m[1];
  }
  return null;
}

export async function closeAll() {
  server.close();
  await sql.end({ timeout: 2 });
}

export { sql };

/**
 * Error mail through the e-mail gateway (EMAIL_GATEWAY_MODE=on) with fallback to direct SMTP.
 * Unit test: the gateway is a fake `fetch`, SMTP is a fake transporter. No network, no real e-mail.
 *   node --test test/error-mail-gateway.test.js
 * Mode "off" (the default, nothing changes) is covered in test/error-mail-hardening.test.js and
 * test/error-severity.test.js.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.MAIL_FROM_ADDRESS = 'alerts@example.org';
// The mode is read once when the module loads.
process.env.EMAIL_GATEWAY_MODE = 'on';
process.env.EMAIL_GATEWAY_URL = 'http://gateway.invalid';
process.env.EMAIL_GATEWAY_KEY = 'test-key-not-real';

const email = await import('../utils/emailService.js');
const svc = await import('../utils/errorNotificationService.js');

let smtp;
let smtpBehaviour;
let gatewayCalls;
let gatewayBehaviour;

email.emailTransporter.sendMail = async (mail) => {
  await smtpBehaviour(mail);
  smtp.push(mail);
  return { messageId: `smtp-${smtp.length}` };
};
email.emailTransporter.verify = async () => true;

globalThis.fetch = async (url, init) => {
  gatewayCalls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  return gatewayBehaviour(String(url));
};

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  smtp = [];
  gatewayCalls = [];
  smtpBehaviour = async () => {};
  gatewayBehaviour = async () => reply(200, { status: 'sent', id: 'gw-1' });
});

let n = 0;
const report = () => {
  n += 1; // a new endpoint per call: the cooldown is per error type + endpoint
  return { errorType: 'GW_TEST', endpoint: `/gw-${n}`, method: 'GET', statusCode: 500, message: 'boom' };
};

test('mode on: the error mail goes through the gateway, not SMTP', async () => {
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, true);
  assert.equal(r.messageId, 'gw-1');
  assert.equal(smtp.length, 0);
  assert.equal(gatewayCalls.length, 1);
  assert.match(gatewayCalls[0].url, /\/api\/v1\/send$/);
  assert.equal(gatewayCalls[0].body.event, 'hr.owner.system_error');
  assert.equal(gatewayCalls[0].body.severity, 'CRITICAL');
  assert.ok(gatewayCalls[0].body.subject.includes('GW_TEST'));
});

test('gateway unreachable (network error): falls back to direct SMTP', async () => {
  gatewayBehaviour = async () => { throw new TypeError('fetch failed'); };
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, true);
  assert.equal(smtp.length, 1);
  assert.equal(gatewayCalls.length, 1);
});

test('gateway 5xx: falls back to direct SMTP', async () => {
  gatewayBehaviour = async () => reply(503, { error: 'down' });
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, true);
  assert.equal(smtp.length, 1);
});

test('gateway 4xx (for example a bad key): error mail still goes out over SMTP', async () => {
  gatewayBehaviour = async () => reply(401, { error: 'bad key' });
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, true);
  assert.equal(smtp.length, 1);
});

test('gateway outcome "failed": falls back to direct SMTP', async () => {
  gatewayBehaviour = async () => reply(200, { status: 'failed', id: 'gw-x', error: 'provider' });
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, true);
  assert.equal(smtp.length, 1);
});

test('a deliberate gateway decision (dropped) is respected: no SMTP, reported as not sent', async () => {
  gatewayBehaviour = async () => reply(200, { status: 'dropped', reason: 'non-production origin' });
  const r = await svc.sendErrorNotification(report());
  assert.deepEqual(r, { success: false, reason: 'gateway_dropped' });
  assert.equal(smtp.length, 0);
});

test('gateway down and SMTP down: no throw, success false, SMTP tried exactly once', async () => {
  gatewayBehaviour = async () => { throw new TypeError('fetch failed'); };
  let attempts = 0;
  smtpBehaviour = async () => { attempts += 1; throw new Error('SMTP down'); };
  const r = await svc.sendErrorNotification(report());
  assert.equal(r.success, false);
  assert.equal(attempts, 1);
});

test('the awaited wrapper copes with a hanging gateway and SMTP', async () => {
  gatewayBehaviour = () => new Promise(() => {});
  smtpBehaviour = () => new Promise(() => {});
  process.env.ERROR_MAIL_TIMEOUT_MS = '60';
  const t0 = Date.now();
  const r = await svc.reportBackendErrorAwaited(Object.assign(new Error('x'), { status: 500 }), { originalUrl: '/hang', method: 'GET', headers: {} });
  assert.deepEqual(r, { success: false, reason: 'timeout' });
  assert.ok(Date.now() - t0 < 2000);
  delete process.env.ERROR_MAIL_TIMEOUT_MS;
});

test('heartbeat goes through the gateway too, and its self-check calls the gateway health', async () => {
  gatewayBehaviour = async (url) => (url.endsWith('/health') ? reply(200, { ok: true }) : reply(200, { status: 'sent', id: 'gw-hb' }));
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  const r = await svc.sendErrorHeartbeat();
  assert.equal(r.sent, true);
  assert.equal(r.selfCheck.mode, 'on');
  assert.equal(r.selfCheck.gatewayHealth, 'ok');
  assert.equal(smtp.length, 0);
  const send = gatewayCalls.find((c) => c.url.endsWith('/send'));
  assert.equal(send.body.event, 'hr.owner.error_heartbeat');
  assert.equal(send.body.html, undefined);
});

/**
 * Error mail hardening, direct-SMTP mode (EMAIL_GATEWAY_MODE=off, the default).
 * Unit test: no database, no network, no real e-mail. The SMTP transporter is replaced by fakes.
 *   node --test test/error-mail-hardening.test.js
 * The gateway side is in test/error-mail-gateway.test.js (the mode is read once at import).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.EMAIL_GATEWAY_MODE = 'off';
process.env.MAIL_FROM_ADDRESS = 'alerts@example.org';

// Mode "off" must never touch the network: any fetch is a failure of the test.
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('network is not allowed in this test'); };

const email = await import('../utils/emailService.js');
const svc = await import('../utils/errorNotificationService.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { handleRouteError } = await import('../utils/routeErrorHandler.js');
const { LevelConsoleTransport } = await import('../utils/logger.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let outbox;
let order;
let sendBehaviour;
let verifyBehaviour;

email.emailTransporter.sendMail = async (mail) => {
  await sendBehaviour(mail);
  outbox.push(mail);
  order.push('mail');
  return { messageId: `smtp-${outbox.length}` };
};
email.emailTransporter.verify = async () => verifyBehaviour();

beforeEach(() => {
  outbox = [];
  order = [];
  sendBehaviour = async () => {};
  verifyBehaviour = async () => true;
  process.env.ERROR_MAIL_TIMEOUT_MS = '3000'; // generous: the first mail renders ICU data
  fetchCalls = 0;
});

let n = 0;
const fakeReq = () => {
  n += 1; // a new path per call: the cooldown is per error type + endpoint
  return { path: `/p${n}`, originalUrl: `/api/thing-${n}`, method: 'GET', headers: {}, body: { password: 'secret-pw', name: 'x' }, query: {}, params: {} };
};
const fakeRes = () => ({
  statusCode: null,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; order.push('response'); return this; },
});
const boom = () => Object.assign(new Error('db exploded'), { status: 500 });

// -- awaiting handlers -------------------------------------------------------

test('errorHandler waits for the mail before it answers (500)', async () => {
  sendBehaviour = async () => { await sleep(25); };
  const res = fakeRes();
  await errorHandler(boom(), fakeReq(), res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(order, ['mail', 'response'], 'the mail left before the response');
  assert.equal(outbox.length, 1);
  assert.equal(fetchCalls, 0);
});

test('errorHandler still answers when the mailer fails', async () => {
  sendBehaviour = async () => { throw new Error('SMTP down'); };
  const res = fakeRes();
  await assert.doesNotReject(errorHandler(boom(), fakeReq(), res, () => {}));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(outbox.length, 0);
});

test('errorHandler answers after the timeout when the mailer hangs', async () => {
  sendBehaviour = () => new Promise(() => {}); // never settles
  process.env.ERROR_MAIL_TIMEOUT_MS = '60';
  const res = fakeRes();
  const t0 = Date.now();
  await errorHandler(boom(), fakeReq(), res, () => {});
  const took = Date.now() - t0;
  assert.equal(res.statusCode, 500);
  assert.ok(took >= 50, `waited for the timeout (${took} ms)`);
  assert.ok(took < 2000, `but not forever (${took} ms)`);
});

test('errorHandler does not mail 4xx answers', async () => {
  const res = fakeRes();
  await errorHandler(Object.assign(new Error('nope'), { status: 404 }), fakeReq(), res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(outbox.length, 0);
});

test('handleRouteError waits for the mail, survives a failing mailer and a hanging one', async () => {
  sendBehaviour = async () => { await sleep(25); };
  let res = fakeRes();
  await handleRouteError(boom(), fakeReq(), res, 'failed');
  assert.deepEqual(order, ['mail', 'response']);
  assert.equal(res.statusCode, 500);

  sendBehaviour = async () => { throw new Error('SMTP down'); };
  res = fakeRes();
  await assert.doesNotReject(handleRouteError(boom(), fakeReq(), res, 'failed'));
  assert.equal(res.statusCode, 500);

  sendBehaviour = () => new Promise(() => {});
  process.env.ERROR_MAIL_TIMEOUT_MS = '60';
  res = fakeRes();
  const t0 = Date.now();
  await handleRouteError(boom(), fakeReq(), res, 'failed');
  assert.equal(res.statusCode, 500);
  assert.ok(Date.now() - t0 < 2000);
});

test('handleRouteError: a rejected input (constraint code) is answered 400 and sends no mail', async () => {
  const res = fakeRes();
  await handleRouteError(Object.assign(new Error('dup'), { code: '23505' }), fakeReq(), res, 'failed');
  assert.equal(res.statusCode, 400);
  assert.equal(outbox.length, 0);
});

test('handleRouteError never rejects, even if the response itself throws', async () => {
  const res = { status() { return this; }, json() { throw new Error('headers already sent'); } };
  await assert.doesNotReject(handleRouteError(boom(), fakeReq(), res, 'failed'));
});

test('the request body in the mail has its password redacted', async () => {
  const res = fakeRes();
  await errorHandler(boom(), fakeReq(), res, () => {});
  assert.equal(outbox[0].html.includes('secret-pw'), false);
});

// -- timeout helper ----------------------------------------------------------

test('settleWithin: result, failure and timeout all come back as values', async () => {
  assert.deepEqual(await svc.settleWithin(async () => ({ success: true }), 100), { success: true });
  const failed = await svc.settleWithin(async () => { throw new Error('x'); }, 100);
  assert.equal(failed.success, false);
  const t0 = Date.now();
  const slow = await svc.settleWithin(() => new Promise(() => {}), 40);
  assert.deepEqual(slow, { success: false, reason: 'timeout' });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(svc.DEFAULT_ERROR_MAIL_TIMEOUT_MS, 8000);
});

test('without a valid ERROR_MAIL_TIMEOUT_MS the helper still works (default 8 s)', async () => {
  delete process.env.ERROR_MAIL_TIMEOUT_MS;
  assert.deepEqual(await svc.settleWithin(async () => ({ success: true })), { success: true });
  process.env.ERROR_MAIL_TIMEOUT_MS = 'abc';
  assert.deepEqual(await svc.settleWithin(async () => ({ success: true })), { success: true });
});

// -- OTP failure mail --------------------------------------------------------

test('sendOTPEmail reports the error class and status of a failure', async () => {
  sendBehaviour = async () => { throw Object.assign(new Error('Invalid recipient <victim@example.org>'), { code: 'EENVELOPE', responseCode: 553 }); };
  const r = await email.sendOTPEmail('victim@example.org', '482913', 'Branch One');
  assert.equal(r.success, false);
  assert.equal(r.errorName, 'Error');
  assert.equal(r.errorStatus, 553);
});

test('an OTP send failure mails the owner once per cooldown, with no code and no address', async () => {
  const first = await svc.reportOtpSendFailure({ kind: 'branch', errorName: 'Error', errorStatus: 553 });
  assert.equal(first.success, true);
  assert.equal(outbox.length, 1);
  const body = `${outbox[0].subject}\n${outbox[0].text}\n${outbox[0].html}`;
  assert.match(outbox[0].subject, /OTP_SEND_FAILED/);
  assert.match(body, /553/);
  assert.equal(body.includes('victim@example.org'), false);
  assert.equal(body.includes('482913'), false);

  const second = await svc.reportOtpSendFailure({ kind: 'branch', errorName: 'Error', errorStatus: 553 });
  assert.deepEqual(second, { success: false, reason: 'rate_limited' });
  assert.equal(outbox.length, 1, 'cooldown: still one mail');

  const other = await svc.reportOtpSendFailure({ kind: 'user', errorName: 'Error', errorStatus: 553 });
  assert.equal(other.success, true, 'another account kind has its own cooldown');
  assert.equal(outbox.length, 2);
});

test('an OTP failure report never throws, even with a dead mailer or odd input', async () => {
  sendBehaviour = async () => { throw new Error('SMTP down'); };
  await assert.doesNotReject(svc.reportOtpSendFailure({ kind: 'zzz', errorName: 'A@b.c <x>', errorStatus: undefined }));
  await assert.doesNotReject(svc.reportOtpSendFailure());
});

// -- heartbeat ---------------------------------------------------------------

test('sendErrorHeartbeat: one plain mail to the error-report recipient only, with date and self-check', async () => {
  // Learn the error-report recipient from a real error mail.
  await svc.sendErrorNotification({ errorType: 'X_ERR', endpoint: '/recipient-probe', statusCode: 500, message: 'm', method: 'GET' });
  const errorRecipient = outbox[0].to;
  outbox = [];

  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  const r = await svc.sendErrorHeartbeat({ now: new Date('2026-11-20T21:30:00Z') });
  assert.equal(r.sent, true);
  assert.equal(r.selfCheck.ok, true);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, errorRecipient);
  assert.equal(outbox[0].html, undefined, 'plain text only');
  assert.match(outbox[0].text, /2026-11-21/, 'Riyadh date');
  assert.match(outbox[0].text, /Self-check: OK/);
  assert.match(outbox[0].subject, /OK/);
  assert.equal(fetchCalls, 0);
});

test('sendErrorHeartbeat: a failing SMTP verify is reported, the mail is still tried', async () => {
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  verifyBehaviour = async () => { throw new Error('connect ECONNREFUSED'); };
  const r = await svc.sendErrorHeartbeat();
  assert.equal(r.selfCheck.ok, false);
  assert.equal(r.selfCheck.smtpVerify, 'failed');
  assert.match(outbox[0].subject, /FAILED/);
  assert.match(outbox[0].text, /Self-check: FAILED/);
});

test('sendErrorHeartbeat never throws: a dead mailer gives sent=false', async () => {
  sendBehaviour = async () => { throw new Error('SMTP down'); };
  const r = await svc.sendErrorHeartbeat();
  assert.equal(r.sent, false);
});

test('a hanging SMTP verify is cut off by the timeout', async () => {
  verifyBehaviour = () => new Promise(() => {});
  process.env.ERROR_MAIL_TIMEOUT_MS = '60';
  const r = await svc.runErrorMailSelfCheck();
  assert.equal(r.smtpVerify, 'timeout');
  assert.equal(r.ok, false);
});

// -- logger ------------------------------------------------------------------

test('logger transport: errors go to console.error, warnings to console.warn, info does not', () => {
  const LEVEL = Symbol.for('level');
  const MESSAGE = Symbol.for('message');
  const seen = [];
  const real = { error: console.error, warn: console.warn };
  console.error = (m) => seen.push(['error', m]);
  console.warn = (m) => seen.push(['warn', m]);
  try {
    const t = new LevelConsoleTransport({ silent: false });
    let done = 0;
    t.log({ [LEVEL]: 'error', [MESSAGE]: 'E-line' }, () => { done += 1; });
    t.log({ [LEVEL]: 'warn', [MESSAGE]: 'W-line' }, () => { done += 1; });
    const stdout = [];
    const realWrite = console._stdout?.write;
    if (console._stdout) console._stdout.write = (m) => { stdout.push(String(m)); return true; };
    try {
      t.log({ [LEVEL]: 'info', [MESSAGE]: 'I-line' }, () => { done += 1; });
    } finally {
      if (console._stdout) console._stdout.write = realWrite;
    }
    assert.deepEqual(seen, [['error', 'E-line'], ['warn', 'W-line']]);
    assert.equal(done, 3, 'every callback ran');
    assert.ok(stdout.join('').includes('I-line') || !console._stdout, 'info still goes to stdout');
  } finally {
    console.error = real.error;
    console.warn = real.warn;
  }
});

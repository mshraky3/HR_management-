/**
 * Daily alerts cron endpoint. Unit test: no database, no network, no real e-mail.
 * `sql`, the e-mail functions and the expiry summary are replaced by fakes.
 *   node --test test/daily-alerts-cron.test.js
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

// Importing the modules builds a lazy postgres client and an SMTP transporter; point both at
// a dead local port so nothing can leave the machine even by mistake.
process.env.DATABASE_URL = 'postgres://nobody:nothing@127.0.0.1:1/none';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.EMAIL_GATEWAY_MODE = 'off';
process.env.NODE_ENV = 'test';

const { createDailyAlertsHandler, hasValidBearer, riyadhDate } = await import('../routes/cron.js');
const { maskEmail, DEFAULT_MAIN_MANAGER_EMAIL } = await import('../utils/dailyAlerts.js');

const SECRET = 'unit-test-secret-value';
const MAIN = 'Sharaksa@gmail.com';

let statsRow;
let branchRows;
let sentMain;
let sentBranch;
let sqlCalls;
let mailResult;

const fakeSql = async () => { sqlCalls += 1; return [statsRow]; };
const deps = {
  sql: fakeSql,
  getExpirySummary: async () => ({ byBranch: branchRows }),
  sendStatisticsAlertEmail: async (args) => { sentMain.push(args); return mailResult; },
  sendNotificationEmail: async (args) => { sentBranch.push(args); return mailResult; },
};

function makeServer(options = {}) {
  const app = express();
  app.get('/api/cron/daily-alerts', createDailyAlertsHandler({ deps, ...options }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function call(server, { path = '', token } = {}) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/cron/daily-alerts${path}`, {
    headers: token === undefined ? {} : { Authorization: token },
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
}

const bearer = (s = SECRET) => `Bearer ${s}`;
const servers = [];
async function fresh(options) {
  const s = await makeServer(options);
  servers.push(s);
  return s;
}

beforeEach(() => {
  delete process.env.DAILY_ALERTS_ENABLED;
  delete process.env.DAILY_ALERTS_BRANCHES;
  delete process.env.DAILY_ALERTS_MAIN_EMAIL;
  process.env.CRON_SECRET = SECRET;
  statsRow = { expired_contracts: 2, expiring_soon: 1, expired_ids: 0, ids_expiring_soon: 0, incomplete_data: 0 };
  branchRows = [
    { branch_name: 'A', branch_email: 'manager.a@example.org', expired_count: 1, expiring_soon_count: 2 },
    { branch_name: 'B', branch_email: 'manager.b@example.org', expired_count: 0, expiring_soon_count: 0 },
    { branch_name: 'C', branch_email: null, expired_count: 4, expiring_soon_count: 0 },
  ];
  sentMain = [];
  sentBranch = [];
  sqlCalls = 0;
  mailResult = { success: true };
});

after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

test('503 when CRON_SECRET is not set, even with a header', async () => {
  delete process.env.CRON_SECRET;
  const server = await fresh();
  const r = await call(server, { token: bearer() });
  assert.equal(r.status, 503);
  assert.equal(sentMain.length + sentBranch.length, 0);
});

test('401 for a missing or wrong secret, nothing is read or sent', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  const server = await fresh();
  for (const token of [undefined, bearer('wrong'), bearer(SECRET + 'x'), SECRET, 'Basic abc']) {
    const r = await call(server, { token });
    assert.equal(r.status, 401, `token ${token}`);
  }
  assert.equal(sqlCalls, 0);
  assert.equal(sentMain.length + sentBranch.length, 0);
});

test('hasValidBearer compares the exact secret', () => {
  assert.equal(hasValidBearer('Bearer abc', 'abc'), true);
  assert.equal(hasValidBearer('Bearer abcd', 'abc'), false);
  assert.equal(hasValidBearer('Bearer ', 'abc'), false);
  assert.equal(hasValidBearer(undefined, 'abc'), false);
  assert.equal(hasValidBearer('Bearer abc', ''), false);
});

test('switch off (unset or not exactly "true"): 200 skipped, nothing read or sent', async () => {
  const server = await fresh();
  for (const value of [undefined, 'TRUE', '1', 'yes', ' true']) {
    if (value === undefined) delete process.env.DAILY_ALERTS_ENABLED;
    else process.env.DAILY_ALERTS_ENABLED = value;
    const r = await call(server, { token: bearer() });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, skipped: true, reason: 'disabled' });
  }
  assert.equal(sqlCalls, 0);
  assert.equal(sentMain.length + sentBranch.length, 0);
});

test('enabled, branches off: only the main manager summary is sent', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  const server = await fresh();
  const r = await call(server, { token: bearer() });
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(sentMain.length, 1);
  assert.equal(sentMain[0].to, DEFAULT_MAIN_MANAGER_EMAIL);
  assert.equal(sentBranch.length, 0);
  assert.equal(r.body.mainManager.sent, 1);
  assert.equal(r.body.branches.included, false);
  assert.equal(r.text.includes('@'), false, 'no e-mail address in the answer');
});

test('DAILY_ALERTS_MAIN_EMAIL overrides the main manager address', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  process.env.DAILY_ALERTS_MAIN_EMAIL = 'boss@example.org';
  const server = await fresh();
  await call(server, { token: bearer() });
  assert.equal(sentMain[0].to, 'boss@example.org');
});

test('branches only when DAILY_ALERTS_BRANCHES is exactly "true"', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  process.env.DAILY_ALERTS_BRANCHES = 'yes';
  let server = await fresh();
  await call(server, { token: bearer() });
  assert.equal(sentBranch.length, 0);

  sentMain = [];
  process.env.DAILY_ALERTS_BRANCHES = 'true';
  server = await fresh(); // new instance = new duplicate guard
  const r = await call(server, { token: bearer() });
  assert.equal(r.status, 200);
  assert.equal(sentMain.length, 1);
  // branch A has alerts and an e-mail; B has none; C has no e-mail
  assert.equal(sentBranch.length, 1);
  assert.equal(sentBranch[0].to, 'manager.a@example.org');
  assert.equal(r.body.branches.sent, 1);
  assert.equal(r.body.branches.withEmail, 2);
  assert.equal(r.text.includes('@'), false);
});

test('no critical alerts: nothing is sent to the main manager', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  statsRow = { expired_contracts: 0, expiring_soon: 0, expired_ids: 0, ids_expiring_soon: 0, incomplete_data: 3 };
  const server = await fresh();
  const r = await call(server, { token: bearer() });
  assert.equal(r.status, 200);
  assert.equal(sentMain.length, 0);
  assert.equal(r.body.mainManager.hasAlerts, false);
});

test('dry run needs the secret, sends nothing, works while disabled, and masks addresses', async () => {
  process.env.DAILY_ALERTS_BRANCHES = 'true';
  const server = await fresh();

  const denied = await call(server, { path: '?dry=1' });
  assert.equal(denied.status, 401);
  assert.equal(sqlCalls, 0);

  const r = await call(server, { path: '?dry=1', token: bearer() });
  assert.equal(r.status, 200);
  assert.equal(r.body.dry, true);
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.counts.expiredContracts, 2);
  assert.equal(r.body.mainManager.recipients, 1);
  assert.equal(r.body.branches.withEmail, 2);
  assert.equal(r.body.branches.recipients, 1);
  assert.equal(sentMain.length + sentBranch.length, 0);
  assert.equal(r.body.mainManager.maskedAddress, 'S***@g***.com');
  assert.equal(r.text.includes('Sharaksa'), false);
  assert.equal(r.text.includes('gmail'), false);
  assert.equal(r.text.includes('manager.a'), false);
  assert.equal(r.text.includes('example.org'), false);
});

test('dry run does not use up the day: a real run still goes out afterwards', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  const server = await fresh();
  await call(server, { path: '?dry=1', token: bearer() });
  const r = await call(server, { token: bearer() });
  assert.equal(r.body.mainManager.sent, 1);
  assert.equal(sentMain.length, 1);
});

test('second real run on the same Riyadh date is refused (partial guard), next day is allowed', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  let clock = new Date('2026-11-20T05:00:00Z');
  const server = await fresh({ now: () => clock });

  const first = await call(server, { token: bearer() });
  assert.equal(first.body.mainManager.sent, 1);

  clock = new Date('2026-11-20T20:30:00Z'); // 23:30 in Riyadh, same date
  const second = await call(server, { token: bearer() });
  assert.deepEqual(second.body, { success: true, skipped: true, reason: 'already_sent_today' });
  assert.equal(sentMain.length, 1);

  clock = new Date('2026-11-20T21:30:00Z'); // 00:30 on 21 Nov in Riyadh
  const third = await call(server, { token: bearer() });
  assert.equal(third.body.mainManager.sent, 1);
  assert.equal(sentMain.length, 2);
});

test('a run where nothing could be sent answers 500 and may be retried', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  mailResult = { success: false, error: 'smtp down' };
  const server = await fresh();
  const r = await call(server, { token: bearer() });
  assert.equal(r.status, 500);
  assert.equal(r.body.success, false);
  mailResult = { success: true };
  const retry = await call(server, { token: bearer() });
  assert.equal(retry.status, 200);
});

test('helpers: Riyadh date and masking', () => {
  assert.equal(riyadhDate(new Date('2026-11-20T21:30:00Z')), '2026-11-21');
  assert.equal(riyadhDate(new Date('2026-11-20T20:59:00Z')), '2026-11-20');
  assert.equal(maskEmail(MAIN), 'S***@g***.com');
  assert.equal(maskEmail('nonsense'), '***');
});

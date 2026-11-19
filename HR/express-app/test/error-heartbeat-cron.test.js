/**
 * Error-mail heartbeat inside the daily alerts cron route. Unit test: no database, no network,
 * no real e-mail; `sql`, the e-mail functions and the heartbeat sender are fakes.
 *   node --test test/error-heartbeat-cron.test.js
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

process.env.DATABASE_URL = 'postgres://nobody:nothing@127.0.0.1:1/none';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.EMAIL_GATEWAY_MODE = 'off';
process.env.NODE_ENV = 'test';

const { createDailyAlertsHandler } = await import('../routes/cron.js');

const SECRET = 'unit-test-secret-value';

let sentMain;
let heartbeatCalls;
let heartbeatResult;
let heartbeatThrows;

const deps = {
  sql: async () => [{ expired_contracts: 2, expiring_soon: 1, expired_ids: 0, ids_expiring_soon: 0, incomplete_data: 0 }],
  getExpirySummary: async () => ({ byBranch: [] }),
  sendStatisticsAlertEmail: async (args) => { sentMain.push(args); return { success: true }; },
  sendNotificationEmail: async () => ({ success: true }),
  sendErrorHeartbeat: async (args) => {
    heartbeatCalls.push(args);
    if (heartbeatThrows) throw new Error('heartbeat exploded');
    return heartbeatResult;
  },
};

const servers = [];
async function fresh(options) {
  const app = express();
  app.get('/api/cron/daily-alerts', createDailyAlertsHandler({ deps, ...options }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return server;
}

async function call(server, { path = '' } = {}) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/cron/daily-alerts${path}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
}

beforeEach(() => {
  delete process.env.DAILY_ALERTS_ENABLED;
  delete process.env.DAILY_ALERTS_BRANCHES;
  delete process.env.ERROR_HEARTBEAT_ENABLED;
  process.env.CRON_SECRET = SECRET;
  sentMain = [];
  heartbeatCalls = [];
  heartbeatResult = { sent: true, selfCheck: { ok: true, mode: 'off', smtpVerify: 'ok' } };
  heartbeatThrows = false;
});

after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

test('off by default: no heartbeat, no "heartbeat" key, alerts unchanged', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  const server = await fresh();
  const r = await call(server);
  assert.equal(r.status, 200);
  assert.equal('heartbeat' in r.body, false);
  assert.equal(heartbeatCalls.length, 0);
  assert.equal(sentMain.length, 1);
});

test('only the exact string "true" switches it on', async () => {
  const server = await fresh();
  for (const value of ['TRUE', '1', 'yes', ' true', 'false', '']) {
    process.env.ERROR_HEARTBEAT_ENABLED = value;
    const r = await call(server);
    assert.equal('heartbeat' in r.body, false, `value ${JSON.stringify(value)}`);
  }
  assert.equal(heartbeatCalls.length, 0);
});

test('on ("true"): one heartbeat is sent and the alerts still go out', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  const server = await fresh({ now: () => new Date('2026-11-20T05:00:00Z') });
  const r = await call(server);
  assert.equal(r.status, 200);
  assert.equal(heartbeatCalls.length, 1);
  assert.equal(r.body.heartbeat.sent, true);
  assert.equal(r.body.heartbeat.enabled, true);
  assert.equal(r.body.mainManager.sent, 1);
  assert.equal(sentMain.length, 1);
  assert.equal(r.text.includes('@'), false, 'no e-mail address in the answer');
});

test('on, alerts switched off: the heartbeat still runs (it checks the error-mail path, not the alerts)', async () => {
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  const server = await fresh();
  const r = await call(server);
  assert.equal(r.status, 200);
  assert.equal(r.body.skipped, true);
  assert.equal(r.body.reason, 'disabled');
  assert.equal(r.body.heartbeat.sent, true);
  assert.equal(heartbeatCalls.length, 1);
  assert.equal(sentMain.length, 0);
});

test('dry run: nothing is sent, the answer only says it would', async () => {
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  const server = await fresh();
  const r = await call(server, { path: '?dry=1' });
  assert.equal(r.status, 200);
  assert.equal(heartbeatCalls.length, 0);
  assert.deepEqual(r.body.heartbeat, { enabled: true, dry: true, sent: false });
  assert.equal(sentMain.length, 0);
});

test('dry run with the switch off: no heartbeat key', async () => {
  const server = await fresh();
  const r = await call(server, { path: '?dry=1' });
  assert.equal('heartbeat' in r.body, false);
  assert.equal(heartbeatCalls.length, 0);
});

test('a failing heartbeat never breaks the alerts', async () => {
  process.env.DAILY_ALERTS_ENABLED = 'true';
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  heartbeatThrows = true;
  const server = await fresh();
  const r = await call(server);
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.mainManager.sent, 1);
  assert.deepEqual(r.body.heartbeat, { enabled: true, sent: false, reason: 'heartbeat_failed' });
});

test('a heartbeat that could not be sent is reported and may be retried; a sent one is not repeated the same day', async () => {
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  const server = await fresh({ now: () => new Date('2026-11-20T05:00:00Z') });

  heartbeatResult = { sent: false, reason: 'send_failed' };
  const failed = await call(server);
  assert.equal(failed.body.heartbeat.sent, false);
  assert.equal(failed.status, 200, 'the alerts answer is not changed by it');

  heartbeatResult = { sent: true, selfCheck: { ok: true } };
  const retry = await call(server);
  assert.equal(retry.body.heartbeat.sent, true);

  const again = await call(server);
  assert.deepEqual(again.body.heartbeat, { enabled: true, skipped: true, reason: 'already_sent_today' });
  assert.equal(heartbeatCalls.length, 2);
});

test('auth still comes first: no secret, no heartbeat', async () => {
  process.env.ERROR_HEARTBEAT_ENABLED = 'true';
  const server = await fresh();
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/cron/daily-alerts`);
  assert.equal(res.status, 401);
  assert.equal(heartbeatCalls.length, 0);
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, closeAll, api } from './helpers.js';
import { ensureCriticalSchema, healAndRetry, CRITICAL_COLUMNS, schemaState } from '../database/criticalSchema.js';

const present = async () => (await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'employees' AND column_name LIKE 'work_start_date%'`).map((r) => r.column_name).sort();

after(async () => { await closeAll(); });

test('ensureCriticalSchema adds a dropped critical column and reports it', async () => {
  await sql`ALTER TABLE employees DROP COLUMN IF EXISTS work_start_date_gregorian`;
  assert.equal((await present()).includes('work_start_date_gregorian'), false);

  const result = await ensureCriticalSchema();
  assert.equal(result.errorCode, null);
  assert.deepEqual(result.applied, ['employees.work_start_date_gregorian']);
  assert.deepEqual(await present(), ['work_start_date_gregorian', 'work_start_date_hijri']);
  assert.equal(schemaState().errorCode, null);
});

test('ensureCriticalSchema is a no-op when nothing is missing', async () => {
  const result = await ensureCriticalSchema();
  assert.deepEqual(result.applied, []);
});

test('healAndRetry repairs a missing column once and re-runs the query', async () => {
  await sql`ALTER TABLE employees DROP COLUMN IF EXISTS work_start_date_hijri`;
  let calls = 0;
  const value = await healAndRetry(async () => {
    calls += 1;
    const [row] = await sql`SELECT work_start_date_hijri FROM employees LIMIT 1`;
    return row ? 'ran' : 'ran-empty';
  });
  assert.match(value, /^ran/);
  assert.equal(calls, 2);
});

test('healAndRetry does not hide other errors', async () => {
  await assert.rejects(() => healAndRetry(async () => { throw Object.assign(new Error('boom'), { code: '23505' }); }), /boom/);
});

test('/api/health/schema reports the critical columns as ok', async () => {
  const { status, body } = await api('/api/health/schema');
  assert.equal(status, 200);
  assert.equal(body.critical, 'ok');
  assert.ok(CRITICAL_COLUMNS.length >= 2);
});

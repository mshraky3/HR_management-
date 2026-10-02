import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, closeAll } from './helpers.js';
import { reportTermIds, currentTermIdForType } from '../utils/reportTerms.js';
import { BusTransportation } from '../models/BusTransportation.js';

// ids 930100-930199 belong to this file
const BRANCH_ID = 930101;
let currentTermId; let oldTermId;

async function cleanup() {
  await sql`DELETE FROM bus_transportation WHERE branch_id = ${BRANCH_ID}`;
  await sql`DELETE FROM branches WHERE id = ${BRANCH_ID}`;
}

before(async () => {
  await cleanup();
  currentTermId = await currentTermIdForType('school');
  assert.ok(currentTermId, 'scratch DB needs a school term');
  const [old] = await sql`SELECT id FROM terms WHERE branch_type = 'school' AND id <> ${currentTermId} ORDER BY id LIMIT 1`;
  assert.ok(old, 'scratch DB needs a second school term');
  oldTermId = old.id;
  await sql`
    INSERT INTO branches (id, branch_name, branch_location, branch_type, username, password, is_active)
    VALUES (${BRANCH_ID}, 'Test report terms', 'test', 'school', 'r_branch_terms', 'pw-123456', true)
  `;
  await sql`INSERT INTO bus_transportation (branch_id, term_id, bus_number) VALUES (${BRANCH_ID}, ${oldTermId}, 'OLD-1')`;
  await sql`INSERT INTO bus_transportation (branch_id, term_id, bus_number) VALUES (${BRANCH_ID}, ${currentTermId}, 'NEW-1')`;
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

test('reportTermIds defaults to the current term of each branch type', async () => {
  const ids = await reportTermIds(undefined, ['school', 'school']);
  assert.deepEqual(ids, [currentTermId]);
});

test('an explicit termId wins over the current term', async () => {
  assert.deepEqual(await reportTermIds(String(oldTermId), ['school']), [oldTermId]);
});

test('bus lists with term_ids only contain that term, without it they mix both years', async () => {
  const mixed = await BusTransportation.findByBranchIds([BRANCH_ID]);
  assert.deepEqual(mixed.map((b) => b.bus_number).sort(), ['NEW-1', 'OLD-1']);

  const current = await BusTransportation.findByBranchIds([BRANCH_ID], { term_ids: [currentTermId] });
  assert.deepEqual(current.map((b) => b.bus_number), ['NEW-1']);

  const old = await BusTransportation.findByBranchIds([BRANCH_ID], { term_ids: [oldTermId] });
  assert.deepEqual(old.map((b) => b.bus_number), ['OLD-1']);
});

test('findAll with term_id isolates the term', async () => {
  const rows = await BusTransportation.findAll({ branch_id: BRANCH_ID, term_id: currentTermId });
  assert.deepEqual(rows.map((b) => b.bus_number), ['NEW-1']);
});

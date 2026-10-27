/**
 * New-year beneficiary review: a student whose new-term row is archived (or already reviewed and seated on a
 * bus) used to be stuck - the review could not save him ("cannot edit archived data") and "not continuing" was
 * refused ("delete him from the new term first", which an archived row does not allow).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, closeAll } from './helpers.js';
import { applyDecisions, getRolloverStatus, getUnreviewedNewRows } from '../services/beneficiaryRolloverService.js';
import Beneficiary from '../models/Beneficiary.js';

const stamp = Date.now();
let sourceTerm;
let targetTerm;
const branchIds = [];
let counter = 0;

const insertTerm = async (label, start, end) => {
  const [t] = await sql`
    INSERT INTO terms (branch_type, term_name, term_number, start_date, end_date, academic_year_start, academic_year_end, academic_year_label, is_active)
    VALUES ('healthcare_center', ${`اختبار ${label}`}, 1, ${start}, ${end}, ${start}, ${end}, ${`T${stamp}${label}`}, true)
    RETURNING *`;
  return t;
};

const newBranch = async () => {
  const [b] = await sql`
    INSERT INTO branches (branch_name, branch_location, branch_type, username, password)
    VALUES (${`فرع اختبار ${stamp}-${++counter}`}, 'x', 'healthcare_center', ${`rollover-test-${stamp}-${counter}`}, 'x')
    RETURNING id`;
  branchIds.push(b.id);
  const [bus] = await sql`
    INSERT INTO bus_transportation (branch_id, term_id, bus_number) VALUES (${b.id}, ${targetTerm.id}, '1') RETURNING id`;
  return { branchId: b.id, busId: bus.id };
};

const insertBeneficiary = async (branchId, termId, name, civil, extra = {}) => {
  const [r] = await sql`
    INSERT INTO beneficiaries (
      branch_id, term_id, sequence_number, beneficiary_number, enrollment_period, beneficiary_name, civil_id,
      contact_number, gender, age, transport_service, free_student, is_archived, continuity_status,
      carried_from_beneficiary_id, carry_review_status
    ) VALUES (
      ${branchId}, ${termId}, ${++counter}, '1234567', 'صباحية', ${name}, ${civil},
      '0500000000', 'ذكر', 7, ${extra.transport ?? false}, ${extra.free ?? false}, ${extra.archived ?? false},
      ${extra.continuity ?? null}, ${extra.carriedFrom ?? null}, ${extra.review ?? 'reviewed'}
    ) RETURNING *`;
  return r;
};

const pair = async (branchId, name, civil, { targetArchived, transport = false }) => {
  const source = await insertBeneficiary(branchId, sourceTerm.id, name, civil, { archived: true, continuity: 'continuing' });
  const target = await insertBeneficiary(branchId, targetTerm.id, name, civil, {
    archived: targetArchived, carriedFrom: source.id, transport, free: true,
  });
  return { source, target };
};

before(async () => {
  sourceTerm = await insertTerm('S', '2001-09-01', '2002-01-15');
  targetTerm = await insertTerm('T', '2099-01-01', '2099-06-01');
});

after(async () => {
  await sql`DELETE FROM bus_students WHERE term_id IN (${sourceTerm.id}, ${targetTerm.id})`;
  await sql`UPDATE beneficiaries SET carried_from_beneficiary_id = NULL WHERE branch_id = ANY(${branchIds})`;
  await sql`DELETE FROM beneficiaries WHERE branch_id = ANY(${branchIds})`;
  await sql`DELETE FROM bus_transportation WHERE branch_id = ANY(${branchIds})`;
  await sql`DELETE FROM branches WHERE id = ANY(${branchIds})`;
  await sql`DELETE FROM terms WHERE id IN (${sourceTerm.id}, ${targetTerm.id})`;
  await closeAll();
});

const decide = (branchId, decisions) =>
  applyDecisions({ branchId, targetTermId: targetTerm.id, decisions, actor: { existsInDb: false } });

test('"not continuing" works when the new-term row is archived, reviewed and seated on a bus', async () => {
  const { branchId, busId } = await newBranch();
  const { source, target } = await pair(branchId, 'طالب اختبار أول', '9000000001', { targetArchived: true, transport: true });
  await sql`INSERT INTO bus_students (bus_id, term_id, student_full_name, contact_mobile_number, address)
            VALUES (${busId}, ${targetTerm.id}, ${target.beneficiary_name}, '0500000000', '')`;

  const { results } = await decide(branchId, [{ beneficiary_id: source.id, decision: 'not_continuing', reason: 'لن يستمر' }]);

  assert.equal(results[0].ok, true, results[0].error);
  const [left] = await sql`SELECT id FROM beneficiaries WHERE id = ${target.id}`;
  assert.equal(left, undefined, 'the new-term row is removed');
  const seats = await sql`SELECT id FROM bus_students WHERE bus_id = ${busId}`;
  assert.equal(seats.length, 0, 'his bus seat is removed too');
  const [src] = await sql`SELECT continuity_status, is_archived FROM beneficiaries WHERE id = ${source.id}`;
  assert.equal(src.continuity_status, 'not_continuing');
  assert.equal(src.is_archived, true);
});

test('"continuing" brings an archived new-term row back and keeps its free flag', async () => {
  const { branchId } = await newBranch();
  const { source, target } = await pair(branchId, 'طالب اختبار ثان', '9000000002', { targetArchived: true });

  const { results } = await decide(branchId, [{ beneficiary_id: source.id, decision: 'continuing' }]);

  assert.equal(results[0].ok, true, results[0].error);
  assert.equal(results[0].skipped_reason, 'reactivated');
  assert.equal(results[0].target.is_archived, false);
  const [row] = await sql`SELECT is_archived, free_student FROM beneficiaries WHERE id = ${target.id}`;
  assert.equal(row.is_archived, false);
  assert.equal(row.free_student, true);
});

test('the status warns about "continuing" students whose new-term row is archived', async () => {
  const { branchId } = await newBranch();
  await pair(branchId, 'طالب اختبار ثالث', '9000000003', { targetArchived: true });
  await pair(branchId, 'طالب اختبار رابع', '9000000004', { targetArchived: false });

  const status = await getRolloverStatus(branchId, { targetTermId: targetTerm.id, readOnly: true });

  assert.equal(status.counts.continuing_without_active_row, 1);
  assert.deepEqual(status.counts.continuing_without_active_row_names, ['طالب اختبار ثالث']);
});

test('new-term rows awaiting review that the step-by-step review cannot list are returned, and clearing them lets the branch confirm', async () => {
  const { branchId } = await newBranch();
  // a normal carried-over row, decided and reviewed
  await pair(branchId, 'طالب اختبار خامس', '9000000005', { targetArchived: false });
  // a carried-over row still pending: the wizard shows this one, so it must NOT be in the unlisted set
  const { source: s6 } = await pair(branchId, 'طالب اختبار سادس', '9000000006', { targetArchived: false });
  await sql`UPDATE beneficiaries SET carry_review_status = 'pending' WHERE carried_from_beneficiary_id = ${s6.id}`;
  // two rows entered in the new term with no link to last term, still pending (what blocked the client: "29")
  const orphanA = await insertBeneficiary(branchId, targetTerm.id, 'طالب اختبار سابع', '9000000007', { review: 'pending' });
  const orphanB = await insertBeneficiary(branchId, targetTerm.id, 'طالب اختبار ثامن', '9000000008', { review: 'pending' });

  const listed = await getUnreviewedNewRows(branchId, { targetTermId: targetTerm.id });
  assert.deepEqual(listed.map((r) => r.id).sort(), [orphanA.id, orphanB.id].sort());

  const blocked = await getRolloverStatus(branchId, { targetTermId: targetTerm.id, readOnly: true });
  assert.equal(blocked.counts.pending_review, 3, 'the server counts the two unlisted rows plus the listed one');

  const updated = await Beneficiary.markReviewed([orphanA.id, orphanB.id], branchId, targetTerm.id);
  assert.equal(updated, 2);
  assert.equal((await getUnreviewedNewRows(branchId, { targetTermId: targetTerm.id })).length, 0);
  const after = await getRolloverStatus(branchId, { targetTermId: targetTerm.id, readOnly: true });
  assert.equal(after.counts.pending_review, 1, 'only the row the wizard itself lists is left');
});

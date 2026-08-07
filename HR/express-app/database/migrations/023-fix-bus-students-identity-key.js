/**
 * Migration 023: Fix the bus_students duplicate-rider key
 *
 * `bus_students_bus_contact_term_unique` was UNIQUE (bus_id,
 * contact_mobile_number, term_id) — it treated the CONTACT PHONE as if it
 * identified a student. It does not: it identifies a family. Siblings share a
 * parent's mobile number, so the second sibling assigned to the same bus was
 * rejected with "يوجد طالب بنفس رقم التواصل مسجل بالفعل في هذه الحافلة",
 * which reads to the branch like they made a duplicate-entry mistake.
 *
 * This is not hypothetical: at the time of writing, 32 sibling groups (35
 * beneficiaries) with transport_service share a phone within one branch+term,
 * and existing bus_students rows show sibling pairs already split across two
 * different buses because the constraint never let them ride together. The
 * new-year rollover (setBeneficiaryBus / POST rollover/assign-bus) would hit
 * this for every one of them.
 *
 * The replacement key is the rider's name scoped to bus+term, normalised with
 * LOWER(TRIM(...)) — which is exactly how the rest of the app already resolves
 * a bus_students row back to a beneficiary (see Beneficiary.findRolloverCandidates
 * and setBeneficiaryBus, which both join on LOWER(TRIM(student_full_name))).
 * So this makes the constraint agree with the identity rule the code already
 * uses, and still blocks genuinely entering the same student on the same bus
 * twice.
 *
 * Verified before writing: zero existing rows violate the new key.
 *
 * Idempotent: drops by name and creates with IF NOT EXISTS.
 *
 * Run with: node database/migrations/023-fix-bus-students-identity-key.js
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`ALTER TABLE bus_students DROP CONSTRAINT IF EXISTS bus_students_bus_contact_term_unique`;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS bus_students_bus_term_name_unique
      ON bus_students (bus_id, term_id, LOWER(TRIM(student_full_name)))
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 023 (would re-block siblings from sharing a bus).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/023-fix-bus-students-identity-key.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 023 standalone...');
  up(sql)
    .then(() => { console.log('Migration 023 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 023 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}

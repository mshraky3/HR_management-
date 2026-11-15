/**
 * Migration 030: branch achievements (thank-you certificates) and partnerships
 *
 * Two lists for healthcare centres, shown inside the branch-documents pages:
 *  - branch_achievements: name, description, optional file
 *  - branch_partnerships: partner, government / private, service, optional contract file and dates
 * The DDL lives in database/branchRecordsSchema.js (shared with init.js and the critical-schema guard).
 *
 * Additive and idempotent.
 */

import sql from '../../config/database.js';
import { ensureBranchRecordTables } from '../branchRecordsSchema.js';

export async function up(db = sql) {
  await ensureBranchRecordTables(db);
}

export async function down() {
  console.warn('Rollback not supported for migration 030 (additive).');
  return { success: false, message: 'Rollback not supported' };
}

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 030 standalone...');
  up(sql)
    .then(() => { console.log('Migration 030 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 030 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}

/**
 * Schema of the two healthcare-branch record lists (migration 030):
 *  - branch_achievements: thank-you certificates and accomplishments of a centre (name, description, optional file)
 *  - branch_partnerships: the centre's partners ("الشراكات"), government or private, with an optional contract file
 *
 * ONE definition, used by migration 030, database/init.js and database/criticalSchema.js (which repairs a
 * missing table on a cold start / after a 42P01 error), so the three can never drift apart.
 * Every statement is idempotent.
 */
import sql from '../config/database.js';

export const BRANCH_RECORD_TABLES = ['branch_achievements', 'branch_partnerships'];

export async function ensureBranchRecordTables(db = sql) {
  await db`
    CREATE TABLE IF NOT EXISTS branch_achievements (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      issuer VARCHAR(255),
      achievement_date DATE,
      achievement_date_hijri VARCHAR(50),
      file_name VARCHAR(255),
      file_path VARCHAR(500),
      file_size INTEGER,
      mime_type VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_branch_achievements_branch ON branch_achievements (branch_id, is_active)`;

  await db`
    CREATE TABLE IF NOT EXISTS branch_partnerships (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      partner_name VARCHAR(255) NOT NULL,
      partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('government', 'private')),
      service_type VARCHAR(150),
      description TEXT,
      contact_name VARCHAR(255),
      contact_phone VARCHAR(50),
      contract_start_date DATE,
      contract_start_date_hijri VARCHAR(50),
      contract_end_date DATE,
      contract_end_date_hijri VARCHAR(50),
      file_name VARCHAR(255),
      file_path VARCHAR(500),
      file_size INTEGER,
      mime_type VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_branch_partnerships_branch ON branch_partnerships (branch_id, is_active)`;
  await db`CREATE INDEX IF NOT EXISTS idx_branch_partnerships_type ON branch_partnerships (partner_type)`;
}

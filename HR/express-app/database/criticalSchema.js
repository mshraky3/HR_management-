/**
 * Critical schema: columns the application code reads or writes. Independent of the migration runner
 * (its table, its ordering, its failures), so a release can never serve a request that needs a column the
 * database does not have yet (outages on 2026-10-03 and 2026-10-07/08 were exactly that).
 *
 * RULE: when a change adds a column that routes or models use, add it here AS WELL as in a migration.
 * Every statement is idempotent. One information_schema query per cold start when nothing is missing.
 */
import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const CRITICAL_COLUMNS = [
  { table: 'employees', column: 'work_start_date_hijri', ddl: 'VARCHAR(50)' },
  { table: 'employees', column: 'work_start_date_gregorian', ddl: 'DATE' },
];

const state = { checkedAt: null, missing: [], applied: [], errorCode: null, errorMessage: null };

/** What the last check found (shown, without detail, by /api/health). */
export const schemaState = () => ({ ...state });

/**
 * Adds every missing critical column. Never throws: the outcome is in the returned object and in schemaState().
 */
export async function ensureCriticalSchema(db = sql) {
  try {
    const rows = await db`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY(${[...new Set(CRITICAL_COLUMNS.map((c) => c.table))]})`;
    const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = CRITICAL_COLUMNS.filter((c) => !present.has(`${c.table}.${c.column}`));
    const applied = [];
    for (const { table, column, ddl } of missing) {
      // identifiers come from the constant list above, never from input
      await db.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
      applied.push(`${table}.${column}`);
    }
    if (applied.length) log.warn('Critical schema: added missing columns', { applied });
    Object.assign(state, { checkedAt: new Date().toISOString(), missing: [], applied, errorCode: null, errorMessage: null });
  } catch (error) {
    log.error('Critical schema check failed', { error: error.message, code: error.code });
    Object.assign(state, { checkedAt: new Date().toISOString(), missing: ['unknown'], errorCode: error.code || 'ERR', errorMessage: error.message });
  }
  return schemaState();
}

/**
 * Runs `fn`; if Postgres says a column is missing (42703), repairs the critical schema once and runs it again.
 * A user's save then succeeds instead of failing while a release's schema change is still pending.
 */
export async function healAndRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error?.code !== '42703') throw error;
    log.warn('Missing column during a query; repairing the critical schema and retrying once', { error: error.message });
    const result = await ensureCriticalSchema();
    if (result.errorCode) throw error;
    return await fn();
  }
}

/**
 * Audit trail helpers (table audit_log, migration 026).
 *
 * Branch managers have no row in `users`, so an actor is described as
 * { kind: 'user' | 'branch', userId, branchId, name } instead of a single FK.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { clientIp } from '../middleware/rateLimit.js';

/** Builds the actor description from an authenticated request (or a ready-made actor). */
export function actorFromReq(req) {
  const u = req?.user;
  if (!u) return { kind: null, userId: null, branchId: null, name: 'system', role: null };
  const isBranch = u.kind === 'branch' || u.role === 'branch_manager';
  return {
    kind: isBranch ? 'branch' : 'user',
    userId: isBranch ? null : u.id ?? null,
    branchId: isBranch ? (u.branch_id ?? u.id ?? null) : null,
    name: u.username || null,
    role: u.role || null,
    ip: req?.headers ? String(clientIp(req)).slice(0, 64) : null
  };
}

/**
 * Writes one audit row. Never throws by default: auditing must not break the action it
 * describes, except when called with a transaction (`db`) where the caller wants
 * all-or-nothing and passes `{ strict: true }`.
 */
export async function recordAudit(
  { entityType, entityId, action, actor, branchId = null, changes = null },
  { db = sql, strict = false } = {}
) {
  try {
    await db`
      INSERT INTO audit_log (entity_type, entity_id, action, actor_kind, actor_user_id, actor_branch_id,
                             actor_name, branch_id, changes, ip_address)
      VALUES (${entityType}, ${entityId ?? null}, ${action}, ${actor?.kind ?? null}, ${actor?.userId ?? null},
              ${actor?.branchId ?? null}, ${actor?.name ?? null}, ${branchId},
              ${changes ? db.json(changes) : null}, ${actor?.ip ?? null})
    `;
  } catch (err) {
    if (strict) throw err;
    log.warn('Could not write audit log', { error: err.message, entityType, action });
  }
}

/** Shallow diff of two row objects restricted to `fields`; returns { field: [before, after] }. */
export function diffFields(before, after, fields) {
  const out = {};
  for (const f of fields) {
    const a = before?.[f] ?? null;
    const b = after?.[f] ?? null;
    const norm = (v) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) out[f] = [a, b];
  }
  return out;
}

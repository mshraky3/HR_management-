/**
 * Employee lifecycle service: the single place where an employee's status changes.
 *
 * Before this existed seven code paths wrote `employees.status` on their own (status route,
 * delete, non-renewal, year review, archive restore, branch deletion, date-fix tool) with
 * different permission rules. Every change now goes through changeEmployeeStatus(), which
 *   - applies one role rule table,
 *   - requires a reason when archiving (falls back to the status label),
 *   - stores last working day / exit notes / rehire eligibility,
 *   - writes employee_status_history and audit_log in the same transaction,
 *   - clears the caches that show headcounts.
 */

import sql from '../config/database.js';
import { clearByPrefix } from '../utils/simpleCache.js';
import { recordAudit } from './auditService.js';

export const ACTIVE_STATUSES = ['active', 'pending'];
export const ARCHIVED_STATUSES = [
  'terminated_article_80',
  'terminated_article_77',
  'resigned',
  'contract_ended',
  'non_renewal',
  'other'
];
export const VALID_STATUSES = [...ACTIVE_STATUSES, ...ARCHIVED_STATUSES];

export const STATUS_LABELS = {
  active: 'نشط',
  pending: 'قيد التجديد',
  terminated_article_80: 'إنهاء المادة 80',
  terminated_article_77: 'إنهاء المادة 77',
  resigned: 'استقالة',
  contract_ended: 'انتهاء العقد',
  non_renewal: 'عدم التجديد',
  other: 'أخرى'
};

export class LifecycleError extends Error {
  constructor(message, code = 'LIFECYCLE_ERROR', httpStatus = 400, details = {}) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export const isArchivedStatus = (status) => Boolean(status) && !ACTIVE_STATUSES.includes(status);

function clearHeadcountCaches(branchIds) {
  for (const id of new Set(branchIds.filter(Boolean))) clearByPrefix(`dashboard:summary:${id}`);
  clearByPrefix('branch-statistics');
  clearByPrefix('employees');
}

/**
 * Role rule table. Throws LifecycleError when the actor may not make this change.
 *  - main manager: any change; restoring needs an active branch (checked by the caller).
 *  - branch manager: archive, or pending -> active, only for an employee whose primary branch is theirs.
 *  - operations manager and anyone else: nothing.
 */
export function assertTransitionAllowed(actor, employee, toStatus) {
  const role = actor?.role;
  const fromArchived = isArchivedStatus(employee.status);
  const toArchived = isArchivedStatus(toStatus);

  if (role === 'main_manager') return;

  if (role === 'branch_manager') {
    if (!actor.branchId || employee.branch_id !== actor.branchId) {
      throw new LifecycleError('غير مصرح لك بتغيير حالة هذا الموظف', 'FORBIDDEN', 403);
    }
    if (fromArchived) {
      throw new LifecycleError(
        'الموظف مؤرشف. يمكن للمدير العام فقط استعادته من الأرشيف.',
        'ONLY_MAIN_MANAGER_RESTORES',
        403
      );
    }
    const allowed = toArchived || (employee.status === 'pending' && toStatus === 'active');
    if (!allowed) {
      throw new LifecycleError('هذا التغيير في الحالة غير متاح لمدير الفرع', 'TRANSITION_NOT_ALLOWED', 403);
    }
    return;
  }

  throw new LifecycleError('غير مصرح لك بتغيير حالة الموظفين', 'FORBIDDEN', 403);
}

/** Reads a row and locks it for the rest of the transaction. */
async function lockEmployee(tx, employeeId) {
  const [employee] = await tx`SELECT * FROM employees WHERE id = ${employeeId} FOR UPDATE`;
  if (!employee) throw new LifecycleError('الموظف غير موجود', 'EMPLOYEE_NOT_FOUND', 404);
  return employee;
}

async function dropLeavingDecision(tx, employee) {
  // A restore contradicts a "leaving" decision for the year the branch is preparing; leaving the
  // row would keep the year review showing this employee as leaving and never ask again.
  const [branch] = await tx`SELECT branch_type FROM branches WHERE id = ${employee.branch_id}`;
  if (!branch?.branch_type) return;
  const { getPreparationAcademicYear } = await import('./termLifecycleService.js');
  const { year } = await getPreparationAcademicYear(branch.branch_type);
  if (!year) return;
  await tx`
    DELETE FROM employee_year_transitions
    WHERE employee_id = ${employee.id} AND year_label = ${year.year_label} AND decision = 'leaving'
  `;
}

/**
 * Changes one employee's status.
 *
 * @param {object} p
 * @param {number} p.employeeId
 * @param {string} p.toStatus            one of VALID_STATUSES
 * @param {string} [p.reasonText]        free text; defaults to the status label when archiving
 * @param {string} [p.lastWorkingDay]    YYYY-MM-DD, archiving only
 * @param {string} [p.exitNotes]
 * @param {boolean|null} [p.rehireEligible]
 * @param {object} p.actor               from auditService.actorFromReq()
 * @param {string} [p.source]            where the change came from (status_route, offboard, year_review, ...)
 * @param {object} [p.tx]                an open transaction to join (otherwise one is opened)
 * @param {boolean} [p.skipRoleCheck]    for system flows that already authorised the actor
 * @returns {{ employee, previousStatus, action }}
 */
export async function changeEmployeeStatus(p) {
  const run = async (tx) => {
    if (!VALID_STATUSES.includes(p.toStatus)) {
      throw new LifecycleError('حالة غير صحيحة', 'INVALID_STATUS');
    }
    const employee = await lockEmployee(tx, p.employeeId);
    if (employee.status === p.toStatus) {
      return { employee, previousStatus: employee.status, action: 'unchanged' };
    }

    if (!p.skipRoleCheck) assertTransitionAllowed(p.actor, employee, p.toStatus);

    const fromArchived = isArchivedStatus(employee.status);
    const toArchived = isArchivedStatus(p.toStatus);

    if (fromArchived && !toArchived) {
      const [branch] = await tx`SELECT is_active FROM branches WHERE id = ${employee.branch_id}`;
      if (!branch || branch.is_active === false) {
        throw new LifecycleError(
          'لا يمكن استعادة موظف فرعه محذوف. يجب استعادة الفرع أولاً',
          'BRANCH_INACTIVE_FOR_RESTORE',
          409,
          { branchId: employee.branch_id }
        );
      }
    }

    const reasonText = (p.reasonText && String(p.reasonText).trim())
      || (toArchived ? STATUS_LABELS[p.toStatus] : fromArchived ? 'تمت الاستعادة من الأرشيف' : null);
    const lastWorkingDay = toArchived && p.lastWorkingDay ? p.lastWorkingDay : null;
    const actorUserId = p.actor?.kind === 'user' ? p.actor.userId : null;

    const [updated] = await tx`
      UPDATE employees SET
        status = ${p.toStatus},
        is_active = ${!toArchived},
        status_changed_at = CURRENT_TIMESTAMP,
        status_changed_by = ${actorUserId},
        status_change_reason = ${reasonText},
        last_working_day = ${toArchived ? lastWorkingDay : null},
        exit_notes = ${toArchived ? (p.exitNotes ?? null) : null},
        rehire_eligible = ${toArchived ? (p.rehireEligible ?? null) : null},
        archived_via_branch_id = ${toArchived && p.archivedViaBranchId ? p.archivedViaBranchId : null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${p.employeeId}
      RETURNING *
    `;

    await tx`
      INSERT INTO employee_status_history
        (employee_id, from_status, to_status, reason_code, reason_text, effective_date, last_working_day,
         source, actor_kind, actor_user_id, actor_branch_id, actor_name)
      VALUES
        (${p.employeeId}, ${employee.status}, ${p.toStatus}, ${toArchived ? p.toStatus : null}, ${reasonText},
         CURRENT_DATE, ${lastWorkingDay}, ${p.source || null}, ${p.actor?.kind ?? null}, ${actorUserId},
         ${p.actor?.branchId ?? null}, ${p.actor?.name ?? null})
    `;

    await recordAudit({
      entityType: 'employee',
      entityId: p.employeeId,
      action: fromArchived && !toArchived ? 'restore' : toArchived ? 'archive' : 'status_change',
      actor: p.actor,
      branchId: employee.branch_id,
      changes: { status: [employee.status, p.toStatus], reason: reasonText, last_working_day: lastWorkingDay, source: p.source || null }
    }, { db: tx, strict: true });

    if (fromArchived && !toArchived) await dropLeavingDecision(tx, employee);

    return {
      employee: updated,
      previousStatus: employee.status,
      action: fromArchived && !toArchived ? 'restored' : toArchived ? 'archived' : 'status_updated'
    };
  };

  const result = p.tx ? await run(p.tx) : await sql.begin(run);
  if (result.action !== 'unchanged') clearHeadcountCaches([result.employee.branch_id]);
  return result;
}

/** Archives many employees; each is its own transaction so one failure does not block the rest. */
export async function bulkChangeStatus({ employeeIds, toStatus, reasonText, lastWorkingDay, exitNotes, rehireEligible, actor, source }) {
  const results = [];
  for (const employeeId of employeeIds) {
    try {
      const r = await changeEmployeeStatus({
        employeeId, toStatus, reasonText, lastWorkingDay, exitNotes, rehireEligible, actor, source: source || 'bulk'
      });
      results.push({ id: employeeId, ok: true, action: r.action });
    } catch (err) {
      if (!(err instanceof LifecycleError)) throw err;
      results.push({ id: employeeId, ok: false, code: err.code, message: err.message });
    }
  }
  return results;
}

/**
 * Moves an employee's primary branch. Main manager only (enforced by the route).
 * The old link is removed unless keepOldAsSecondary: leaving it made the old branch keep
 * seeing and editing the employee while every count attributed them to the new branch.
 */
export async function transferEmployee({ employeeId, targetBranchId, keepOldAsSecondary = false, actor }) {
  const result = await sql.begin(async (tx) => {
    const employee = await lockEmployee(tx, employeeId);
    if (isArchivedStatus(employee.status)) {
      throw new LifecycleError('لا يمكن نقل موظف مؤرشف. استعده من الأرشيف أولاً.', 'EMPLOYEE_ARCHIVED', 409);
    }
    const [target] = await tx`SELECT id, branch_name, is_active FROM branches WHERE id = ${targetBranchId}`;
    if (!target || target.is_active === false) {
      throw new LifecycleError('الفرع المستهدف غير موجود أو محذوف', 'TARGET_BRANCH_INVALID', 404);
    }
    if (employee.branch_id === targetBranchId) {
      throw new LifecycleError('الموظف موجود بالفعل في هذا الفرع', 'SAME_BRANCH');
    }

    const oldBranchId = employee.branch_id;
    await tx`UPDATE employees SET branch_id = ${targetBranchId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${employeeId}`;
    // The year review scopes by the transition row's branch_id; keep it with the employee.
    await tx`
      UPDATE employee_year_transitions SET branch_id = ${targetBranchId}, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = ${employeeId} AND branch_id <> ${targetBranchId}
    `;
    await tx`UPDATE employee_branches SET is_primary = false WHERE employee_id = ${employeeId} AND is_primary`;
    await tx`
      INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_by)
      VALUES (${employeeId}, ${targetBranchId}, true, ${actor?.kind === 'user' ? actor.userId : null})
      ON CONFLICT (employee_id, branch_id) DO UPDATE SET is_primary = true
    `;
    if (!keepOldAsSecondary && oldBranchId) {
      await tx`DELETE FROM employee_branches WHERE employee_id = ${employeeId} AND branch_id = ${oldBranchId}`;
    }

    await recordAudit({
      entityType: 'employee',
      entityId: employeeId,
      action: 'transfer',
      actor,
      branchId: targetBranchId,
      changes: { branch_id: [oldBranchId, targetBranchId], kept_old_as_secondary: keepOldAsSecondary }
    }, { db: tx, strict: true });

    return { oldBranchId, targetBranch: target };
  });

  clearHeadcountCaches([result.oldBranchId, targetBranchId]);
  return result;
}

/**
 * Deactivates a branch together with its employees, in one transaction.
 * Employees are archived as "other" with archived_via_branch_id set, and their previous status is
 * kept in employee_status_history, so reactivateBranch can restore exactly them.
 */
export async function deactivateBranch({ branchId, actor }) {
  const result = await sql.begin(async (tx) => {
    const [branch] = await tx`
      UPDATE branches SET is_active = false, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${branchId}
      RETURNING id, branch_name, is_active
    `;
    if (!branch) throw new LifecycleError('الفرع غير موجود', 'BRANCH_NOT_FOUND', 404);

    const affected = await tx`
      SELECT id, status FROM employees
      WHERE branch_id = ${branchId} AND (status IN ('active', 'pending') OR is_active = true)
      FOR UPDATE
    `;
    const actorUserId = actor?.kind === 'user' ? actor.userId : null;
    for (const e of affected) {
      await tx`
        UPDATE employees SET status = 'other', is_active = false, status_changed_at = CURRENT_TIMESTAMP,
               status_changed_by = ${actorUserId}, status_change_reason = 'تم حذف الفرع',
               archived_via_branch_id = ${branchId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${e.id}
      `;
      await tx`
        INSERT INTO employee_status_history
          (employee_id, from_status, to_status, reason_code, reason_text, effective_date, source,
           actor_kind, actor_user_id, actor_branch_id, actor_name)
        VALUES (${e.id}, ${e.status}, 'other', 'other', 'تم حذف الفرع', CURRENT_DATE, 'branch_deactivated',
                ${actor?.kind ?? null}, ${actorUserId}, ${actor?.branchId ?? null}, ${actor?.name ?? null})
      `;
    }
    // Operations managers keep no access to a branch that is gone.
    await tx`DELETE FROM user_branch_assignments WHERE branch_id = ${branchId}`;

    await recordAudit({
      entityType: 'branch',
      entityId: branchId,
      action: 'deactivate',
      actor,
      branchId,
      changes: { employees_archived: affected.length }
    }, { db: tx, strict: true });

    return { branch, archivedEmployeesCount: affected.length };
  });
  clearHeadcountCaches([branchId]);
  clearByPrefix('branch');
  return result;
}

/** Reactivates a branch; with restoreEmployees, brings back the employees its deactivation archived. */
export async function reactivateBranch({ branchId, actor, restoreEmployees = true }) {
  const result = await sql.begin(async (tx) => {
    const [branch] = await tx`
      UPDATE branches SET is_active = true, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${branchId}
      RETURNING id, branch_name, is_active
    `;
    if (!branch) throw new LifecycleError('الفرع غير موجود', 'BRANCH_NOT_FOUND', 404);

    let restored = 0;
    if (restoreEmployees) {
      const candidates = await tx`
        SELECT e.id,
               COALESCE((
                 SELECT h.from_status FROM employee_status_history h
                 WHERE h.employee_id = e.id AND h.source = 'branch_deactivated'
                 ORDER BY h.created_at DESC LIMIT 1
               ), 'active') AS previous_status
        FROM employees e
        WHERE e.archived_via_branch_id = ${branchId} AND e.status = 'other'
        FOR UPDATE OF e
      `;
      for (const c of candidates) {
        const to = ACTIVE_STATUSES.includes(c.previous_status) ? c.previous_status : 'active';
        await changeEmployeeStatus({
          employeeId: c.id,
          toStatus: to,
          reasonText: 'تمت الاستعادة مع إعادة تفعيل الفرع',
          actor,
          source: 'branch_reactivated',
          tx,
          skipRoleCheck: true
        });
        restored += 1;
      }
    }

    await recordAudit({
      entityType: 'branch',
      entityId: branchId,
      action: 'reactivate',
      actor,
      branchId,
      changes: { employees_restored: restored }
    }, { db: tx, strict: true });
    return { branch, restoredEmployeesCount: restored };
  });
  clearHeadcountCaches([branchId]);
  clearByPrefix('branch');
  return result;
}

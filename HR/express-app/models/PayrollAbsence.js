/**
 * Payroll Absence Model
 * Handles monthly absence cycles, branch windows, submissions, and exports.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const VIEW_ONLY_DAYS = 4;
const ENTRY_OPEN_DAYS = 4; // Entry stays open for 4 days after auto_open_at
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const formatDateOnly = (date) => {
  if (!date) return null;
  return new Date(date).toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const getCycleDates = (targetDate = new Date()) => {
  const current = new Date(targetDate);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();

  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const autoOpenAt = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0)); // start of last day

  return { monthStart, monthEnd, autoOpenAt };
};

/**
 * Determines which cycle should be active based on the current date.
 * If we're within ENTRY_OPEN_DAYS after the previous month's auto_open_at,
 * we should still be in the previous month's cycle (entry still open).
 */
const getActiveCycleDate = (now = new Date()) => {
  const current = new Date(now);
  const currentDay = current.getUTCDate();

  // If we're in the first few days of the month, check if previous month's entry is still open
  if (currentDay <= ENTRY_OPEN_DAYS) {
    // Get previous month (use day 1 to avoid month-boundary edge cases)
    const prevMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
    return prevMonth;
  }

  return current;
};

const getNextMonthDate = (cycle) => {
  const monthEnd = new Date(cycle.month_end || cycle.monthStart);
  return addDays(monthEnd, 1);
};

const buildFullName = (row) => {
  return [row.first_name, row.second_name, row.third_name, row.fourth_name]
    .filter(Boolean)
    .join(' ')
    .trim();
};

export const PayrollAbsence = {
  async ensureCycle(targetDate = new Date()) {
    const { monthStart, monthEnd, autoOpenAt } = getCycleDates(targetDate);
    const monthStartStr = formatDateOnly(monthStart);
    const monthEndStr = formatDateOnly(monthEnd);

    const [existing] = await sql`
      SELECT * FROM absence_cycles WHERE month_start = ${monthStartStr}
    `;
    if (existing) return existing;

    const [cycle] = await sql`
      INSERT INTO absence_cycles (month_start, month_end, auto_open_at)
      VALUES (${monthStartStr}, ${monthEndStr}, ${autoOpenAt.toISOString()})
      ON CONFLICT (month_start) DO UPDATE SET month_end = EXCLUDED.month_end
      RETURNING *
    `;
    return cycle;
  },

  async ensureCycleById(cycleId) {
    const [cycle] = await sql`SELECT * FROM absence_cycles WHERE id = ${cycleId}`;
    if (!cycle) {
      throw new Error('Cycle not found');
    }
    return cycle;
  },

  async ensureWindowsForCycle(cycle) {
    await sql`
      INSERT INTO branch_absence_windows (cycle_id, branch_id, status, entry_open_at)
      SELECT ${cycle.id}, b.id, 'countdown', ${cycle.auto_open_at}
      FROM branches b
      WHERE NOT EXISTS (
        SELECT 1 FROM branch_absence_windows w 
        WHERE w.cycle_id = ${cycle.id} AND w.branch_id = b.id
      )
    `;
  },

  async ensureBranchWindow(cycle, branchId) {
    const [existing] = await sql`
      SELECT * FROM branch_absence_windows 
      WHERE cycle_id = ${cycle.id} AND branch_id = ${branchId}
    `;
    if (existing) return existing;

    const [window] = await sql`
      INSERT INTO branch_absence_windows (
        cycle_id, branch_id, status, entry_open_at
      )
      VALUES (${cycle.id}, ${branchId}, 'countdown', ${cycle.auto_open_at})
      RETURNING *
    `;
    return window;
  },

  async getBranchEmployees(branchId) {
    const employees = await sql`
      SELECT id, id_or_residency_number, first_name, second_name, third_name, fourth_name
      FROM employees
      WHERE branch_id = ${branchId}
        AND (status IS NULL OR status IN ('active','pending'))
      ORDER BY first_name ASC
    `;
    return employees.map((e) => ({
      id: e.id,
      employee_id: e.id_or_residency_number,
      full_name: buildFullName(e)
    }));
  },

  async getLastSubmission(branchId, cycleId) {
    const [submission] = await sql`
      SELECT * FROM branch_absence_submissions
      WHERE branch_id = ${branchId}
        AND cycle_id = ${cycleId}
        AND (is_superseded IS NULL OR is_superseded = FALSE)
      ORDER BY submitted_at DESC
      LIMIT 1
    `;
    return submission || null;
  },

  async getSubmissionEntries(submissionId) {
    if (!submissionId) return [];
    const rows = await sql`
      SELECT 
        ea.employee_id,
        ea.absences,
        ea.excused_absences,
        ea.unexcused_absences,
        ea.notes,
        emp.id_or_residency_number,
        emp.first_name, emp.second_name, emp.third_name, emp.fourth_name
      FROM employee_absences ea
      INNER JOIN employees emp ON emp.id = ea.employee_id
      WHERE ea.submission_id = ${submissionId}
      ORDER BY emp.first_name ASC
    `;
    return rows.map((row) => ({
      employee_id: row.employee_id,
      absences: row.absences,
      excused_absences: row.excused_absences ?? 0,
      unexcused_absences: row.unexcused_absences ?? 0,
      notes: row.notes,
      employee_id_number: row.id_or_residency_number,
      full_name: buildFullName(row)
    }));
  },

  async getBranchState(branchId, { cycleId = null, now = new Date() } = {}) {
    const referenceDate = new Date(now);
    // Use getActiveCycleDate to determine which month's cycle we should be working with
    const activeCycleDate = getActiveCycleDate(referenceDate);
    let cycle = cycleId ? await this.ensureCycleById(cycleId) : await this.ensureCycle(activeCycleDate);

    await this.ensureWindowsForCycle(cycle);
    let window = await this.ensureBranchWindow(cycle, branchId);

    const nowTs = referenceDate.getTime();

    // Check previous month for a manually-reopened or active view_only window.
    // Handles: admin reopens a branch after the normal entry period has passed
    // (e.g. it's April 6 but admin reopened for the March cycle).
    if (!cycleId) {
      const curManualExpires = window.manual_expires_at ? new Date(window.manual_expires_at) : null;
      const curManualActive = window.manual_opened && (!curManualExpires || nowTs <= curManualExpires.getTime());

      if (!curManualActive) {
        const prevMonthDate = new Date(Date.UTC(
          activeCycleDate.getUTCFullYear(),
          activeCycleDate.getUTCMonth() - 1,
          15
        ));
        const { monthStart: prevMonthStart } = getCycleDates(prevMonthDate);
        const [prevCycleRow] = await sql`
          SELECT * FROM absence_cycles WHERE month_start = ${formatDateOnly(prevMonthStart)}
        `;

        if (prevCycleRow) {
          const [prevWindow] = await sql`
            SELECT * FROM branch_absence_windows
            WHERE cycle_id = ${prevCycleRow.id} AND branch_id = ${branchId}
          `;

          if (prevWindow) {
            const pExpires = prevWindow.manual_expires_at ? new Date(prevWindow.manual_expires_at) : null;
            const pManualActive = prevWindow.manual_opened && (!pExpires || nowTs <= pExpires.getTime());
            const pViewActive = (prevWindow.submission_count || 0) > 0
              && prevWindow.view_until
              && new Date(prevWindow.view_until).getTime() >= nowTs;

            if (pManualActive || pViewActive) {
              cycle = prevCycleRow;
              window = prevWindow;
            }
          }
        }
      }
    }

    const entryOpenAt = new Date(window.entry_open_at);
    const entryCloseAt = addDays(entryOpenAt, ENTRY_OPEN_DAYS); // Entry stays open for 4 days
    const viewUntil = window.view_until ? new Date(window.view_until) : null;
    const manualExpires = window.manual_expires_at ? new Date(window.manual_expires_at) : null;
    const manualActive = window.manual_opened && (!manualExpires || nowTs <= manualExpires.getTime());

    let state = 'countdown';
    let targetOpenAt = entryOpenAt;
    let activeCycle = cycle;
    let nextCycle = null;

    // Check if we're within the entry window (from auto_open_at to auto_open_at + ENTRY_OPEN_DAYS)
    const isWithinEntryWindow = nowTs >= entryOpenAt.getTime() && nowTs <= entryCloseAt.getTime();

    if (manualActive) {
      state = 'entry_open';
    } else if ((window.submission_count || 0) === 0) {
      // No submission yet - check if entry window is open
      state = isWithinEntryWindow ? 'entry_open' : (nowTs < entryOpenAt.getTime() ? 'countdown' : 'closed');
    } else if (viewUntil && nowTs <= viewUntil.getTime()) {
      state = 'view_only';
    } else {
      state = 'countdown_next';
      nextCycle = await this.ensureCycle(getNextMonthDate(cycle));
      await this.ensureWindowsForCycle(nextCycle);
      targetOpenAt = new Date(nextCycle.auto_open_at);
      activeCycle = nextCycle;

      // Mark current window closed if view period ended
      await sql`
        UPDATE branch_absence_windows
        SET status = 'closed', manual_opened = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${window.id}
      `;
    }

    // Keep window status in sync
    const desiredStatus =
      state === 'view_only'
        ? 'view_only'
        : state === 'entry_open'
          ? 'entry_open'
          : state === 'countdown'
            ? 'countdown'
            : 'closed';

    if (window.status !== desiredStatus || window.manual_opened !== manualActive) {
      await sql`
        UPDATE branch_absence_windows
        SET status = ${desiredStatus},
            manual_opened = ${manualActive},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${window.id}
      `;
      window.status = desiredStatus;
    }

    const daysUntilOpen = targetOpenAt
      ? Math.max(0, Math.ceil((targetOpenAt.getTime() - nowTs) / MS_PER_DAY))
      : null;

    const lastSubmission = await this.getLastSubmission(branchId, cycle.id);
    let entries = [];
    if (lastSubmission && state !== 'entry_open') {
      entries = await this.getSubmissionEntries(lastSubmission.id);
    }

    let employees = [];
    if (state === 'entry_open') {
      // Get all current employees
      const allEmployees = await this.getBranchEmployees(branchId);

      // If there was a previous submission, merge with existing data
      if (lastSubmission) {
        const previousEntries = await this.getSubmissionEntries(lastSubmission.id);
        const previousMap = new Map(previousEntries.map(e => [e.employee_id, e]));

        employees = allEmployees.map(emp => {
          const prev = previousMap.get(emp.id);
          if (prev) {
            // Employee was in previous submission - pre-fill their data
            return {
              ...emp,
              excused_absences: prev.excused_absences || 0,
              unexcused_absences: prev.unexcused_absences || 0,
              notes: prev.notes || '',
              is_new: false
            };
          } else {
            // New employee added after previous submission
            return {
              ...emp,
              excused_absences: 0,
              unexcused_absences: 0,
              notes: '',
              is_new: true
            };
          }
        });
      } else {
        // First submission - all employees start with 0
        employees = allEmployees.map(emp => ({
          ...emp,
          excused_absences: 0,
          unexcused_absences: 0,
          notes: '',
          is_new: false
        }));
      }
    }

    return {
      state,
      cycle,
      active_cycle: activeCycle,
      next_cycle: nextCycle,
      target_open_at: targetOpenAt,
      days_until_open: daysUntilOpen,
      view_until: viewUntil,
      window,
      last_submission: lastSubmission,
      entries,
      employees
    };
  },

  async submitBranchAbsences(branchId, userId, payload = {}) {
    const now = new Date();
    const cycle = payload.cycle_id
      ? await this.ensureCycleById(payload.cycle_id)
      : await this.ensureCycle(now);

    await this.ensureWindowsForCycle(cycle);
    const window = await this.ensureBranchWindow(cycle, branchId);

    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (entries.length === 0) {
      throw new Error('لا توجد بيانات للحفظ');
    }

    const manualExpires = window.manual_expires_at ? new Date(window.manual_expires_at) : null;
    const manualActive = window.manual_opened && (!manualExpires || now <= manualExpires);

    const entryOpenAt = new Date(window.entry_open_at);
    if (!manualActive && window.submission_count > 0) {
      throw new Error('تم حفظ بيانات هذا الشهر بالفعل');
    }
    if (!manualActive && now < entryOpenAt) {
      throw new Error('لا يمكن الحفظ قبل فتح فترة التسجيل');
    }

    // Validate employees belong to branch
    const employees = await this.getBranchEmployees(branchId);
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const invalidIds = entries.filter((e) => !employeeMap.has(e.employee_id)).map((e) => e.employee_id);
    if (invalidIds.length > 0) {
      throw new Error('بعض الموظفين غير تابعين لهذا الفرع');
    }

    const submissionNumber = (window.submission_count || 0) + 1;
    const viewUntil = addDays(now, VIEW_ONLY_DAYS);

    // Validate absence values are non-negative
    for (const entry of entries) {
      const excused = parseInt(entry.excused_absences, 10) || 0;
      const unexcused = parseInt(entry.unexcused_absences, 10) || 0;

      if (excused < 0 || unexcused < 0) {
        throw new Error('لا يمكن أن تكون الغيابات سالبة');
      }
    }

    const totalAbsences = entries.reduce((sum, e) => {
      const excused = parseInt(e.excused_absences, 10) || 0;
      const unexcused = parseInt(e.unexcused_absences, 10) || 0;
      return sum + excused + unexcused;
    }, 0);

    // Only set submitted_by if the user exists to avoid FK violations
    let submittedBy = null;
    if (userId) {
      const [userRow] = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;
      if (userRow?.id) {
        submittedBy = userRow.id;
      }
    }

    const result = await sql.begin(async (trx) => {
      // Lock window row
      const [lockedWindow] = await trx`
        SELECT * FROM branch_absence_windows WHERE id = ${window.id} FOR UPDATE
      `;

      if (!lockedWindow) {
        throw new Error('نافذة الإدخال غير موجودة');
      }

      const lockedManualExpires = lockedWindow.manual_expires_at ? new Date(lockedWindow.manual_expires_at) : null;
      const lockedManualActive = lockedWindow.manual_opened && (!lockedManualExpires || now <= lockedManualExpires);

      if (!lockedManualActive && lockedWindow.submission_count > 0) {
        throw new Error('تم حفظ بيانات هذا الشهر بالفعل');
      }

      // Supersede old submissions and clear old rows when re-submitting
      await trx`
        UPDATE branch_absence_submissions
        SET is_superseded = TRUE
        WHERE branch_id = ${branchId} AND cycle_id = ${cycle.id}
      `;
      await trx`
        DELETE FROM employee_absences
        WHERE branch_id = ${branchId} AND cycle_id = ${cycle.id}
      `;

      const [submission] = await trx`
        INSERT INTO branch_absence_submissions (
          cycle_id, branch_id, submission_number, submitted_by, total_absences, note, manual_reopen
        )
        VALUES (
          ${cycle.id},
          ${branchId},
          ${submissionNumber},
          ${submittedBy},
          ${totalAbsences},
          ${payload.note || null},
          ${lockedManualActive}
        )
        RETURNING *
      `;

      for (const entry of entries) {
        const excused = parseInt(entry.excused_absences, 10) || 0;
        const unexcused = parseInt(entry.unexcused_absences, 10) || 0;
        await trx`
          INSERT INTO employee_absences (
            submission_id,
            cycle_id,
            branch_id,
            employee_id,
            absences,
            excused_absences,
            unexcused_absences,
            notes
          ) VALUES (
            ${submission.id},
            ${cycle.id},
            ${branchId},
            ${entry.employee_id},
            ${excused + unexcused},
            ${excused},
            ${unexcused},
            ${entry.notes || null}
          )
        `;
      }

      await trx`
        UPDATE branch_absence_windows
        SET submission_count = ${submissionNumber},
            last_submission_at = ${now.toISOString()},
            view_until = ${viewUntil.toISOString()},
            status = 'view_only',
            manual_opened = FALSE,
            manual_opened_by = NULL,
            manual_opened_at = NULL,
            manual_expires_at = NULL,
            manual_note = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${window.id}
      `;

      return submission;
    });

    return {
      submission: result,
      view_until: viewUntil,
      total_absences: totalAbsences
    };
  },

  async getBranchSubmissionDetail(cycleId, branchId) {
    const [submission] = await sql`
      SELECT *
      FROM branch_absence_submissions
      WHERE cycle_id = ${cycleId}
        AND branch_id = ${branchId}
        AND (is_superseded IS NULL OR is_superseded = FALSE)
      ORDER BY submitted_at DESC
      LIMIT 1
    `;

    if (!submission) {
      return { submission: null, entries: [] };
    }

    const entries = await this.getSubmissionEntries(submission.id);
    return { submission, entries };
  },

  async listCycles() {
    // Ensure current month exists so the admin page always has at least one cycle
    await this.ensureCycle(new Date());
    const cycles = await sql`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM branch_absence_submissions s WHERE s.cycle_id = c.id AND (s.is_superseded IS NULL OR s.is_superseded = FALSE)) AS submission_count,
        (SELECT MAX(submitted_at) FROM branch_absence_submissions s2 WHERE s2.cycle_id = c.id AND (s2.is_superseded IS NULL OR s2.is_superseded = FALSE)) AS last_submitted_at
      FROM absence_cycles c
      ORDER BY c.month_start DESC
    `;
    return cycles;
  },

  async closeBranches(cycleId, branchIds) {
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      throw new Error('يجب اختيار فرع واحد على الأقل');
    }

    await sql`
      UPDATE branch_absence_windows
      SET manual_opened = FALSE,
          manual_opened_by = NULL,
          manual_opened_at = NULL,
          manual_expires_at = NULL,
          manual_note = NULL,
          status = 'closed',
          updated_at = CURRENT_TIMESTAMP
      WHERE cycle_id = ${cycleId}
        AND branch_id = ANY(${branchIds})
    `;

    return { success: true };
  },

  async resetCycle(cycleId) {
    const cycle = await this.ensureCycleById(cycleId);
    await this.ensureWindowsForCycle(cycle);

    await sql.begin(async (trx) => {
      await trx`
        DELETE FROM employee_absences
        WHERE cycle_id = ${cycle.id}
      `;
      await trx`
        DELETE FROM branch_absence_submissions
        WHERE cycle_id = ${cycle.id}
      `;
      await trx`
        UPDATE branch_absence_windows
        SET status = 'countdown',
            submission_count = 0,
            last_submission_at = NULL,
            view_until = NULL,
            manual_opened = FALSE,
            manual_opened_by = NULL,
            manual_opened_at = NULL,
            manual_expires_at = NULL,
            manual_note = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE cycle_id = ${cycle.id}
      `;
    });

    return { success: true };
  },

  async getBranchesForCycle(cycleId) {
    const cycle = await this.ensureCycleById(cycleId);
    await this.ensureWindowsForCycle(cycle);

    const rows = await sql`
      SELECT 
        b.id AS branch_id,
        b.branch_name,
        b.branch_type,
        w.status,
        w.submission_count,
        w.manual_opened,
        w.manual_expires_at,
        w.view_until,
        w.entry_open_at,
        w.last_submission_at,
        w.manual_note,
        COALESCE(SUM(ea.excused_absences), 0) AS total_excused,
        COALESCE(SUM(ea.unexcused_absences), 0) AS total_unexcused,
        COALESCE(SUM(ea.absences), 0) AS total_absences,
        MAX(s.submitted_at) AS last_submitted_at,
        MAX(s.submission_number) AS last_submission_number
      FROM branches b
      LEFT JOIN branch_absence_windows w ON w.branch_id = b.id AND w.cycle_id = ${cycleId}
      LEFT JOIN branch_absence_submissions s ON s.branch_id = b.id AND s.cycle_id = ${cycleId} AND (s.is_superseded IS NULL OR s.is_superseded = FALSE)
      LEFT JOIN employee_absences ea ON ea.branch_id = b.id AND ea.cycle_id = ${cycleId}
      WHERE b.is_active = TRUE
      GROUP BY b.id, w.id
      ORDER BY b.branch_name ASC
    `;
    return { cycle, branches: rows };
  },

  async reopenBranches(cycleId, branchIds, openedBy, note = null, expiresAt = null) {
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      throw new Error('يجب اختيار فرع واحد على الأقل');
    }

    const cycle = await this.ensureCycleById(cycleId);
    await this.ensureWindowsForCycle(cycle);

    const now = new Date();
    await sql`
      UPDATE branch_absence_windows
      SET manual_opened = TRUE,
          manual_opened_by = ${openedBy || null},
          manual_opened_at = ${now.toISOString()},
          manual_expires_at = ${expiresAt ? new Date(expiresAt).toISOString() : null},
          manual_note = ${note || null},
          status = 'entry_open',
          view_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE cycle_id = ${cycleId}
        AND branch_id = ANY(${branchIds})
    `;

    return { success: true };
  },

  async getExportRows(cycleId, branchIds) {
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      throw new Error('لا يوجد فروع للتصدير');
    }

    const rows = await sql`
      SELECT 
        b.branch_name,
        b.branch_type,
        ea.branch_id,
        ea.employee_id,
        ea.absences,
        ea.excused_absences,
        ea.unexcused_absences,
        ea.notes,
        emp.id_or_residency_number,
        emp.first_name, emp.second_name, emp.third_name, emp.fourth_name,
        s.submission_number,
        s.submitted_at
      FROM employee_absences ea
      INNER JOIN branch_absence_submissions s ON s.id = ea.submission_id AND (s.is_superseded IS NULL OR s.is_superseded = FALSE)
      INNER JOIN employees emp ON emp.id = ea.employee_id
      INNER JOIN branches b ON b.id = ea.branch_id
      WHERE ea.cycle_id = ${cycleId}
        AND ea.branch_id = ANY(${branchIds})
      ORDER BY b.branch_name ASC, emp.first_name ASC
    `;

    return rows.map((row) => ({
      branch_name: row.branch_name,
      branch_type: row.branch_type,
      branch_id: row.branch_id,
      employee_id: row.employee_id,
      employee_id_number: row.id_or_residency_number,
      full_name: buildFullName(row),
      absences: row.absences,
      excused_absences: row.excused_absences ?? 0,
      unexcused_absences: row.unexcused_absences ?? 0,
      notes: row.notes,
      submission_number: row.submission_number,
      submitted_at: row.submitted_at
    }));
  }
};

export default PayrollAbsence;

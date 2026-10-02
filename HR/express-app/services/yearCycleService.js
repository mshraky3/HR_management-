/**
 * Year-cycle compliance: for the head office, which branches have done the new-year update and which have not.
 *
 * One call returns every active branch with the same checklist the branch itself sees:
 *   review        employees decided + data reviewed + review confirmed (target academic year)
 *   data          every active/pending employee has complete data
 *   documents     every required branch document is uploaded
 *   beneficiaries healthcare only: rollover reviewed / confirmed (or registered when there is no history)
 *   buses         buses exist in the current term (when the branch had buses before)
 *   activity      the branch signed in during the last 14 days
 *
 * Employee and document figures are set-based (one query for all branches); beneficiary rollover reuses the
 * per-branch service in read-only mode with a small concurrency limit.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { getRequiredBranchDocuments } from '../utils/dataCompletionUtils.js';
import { getPreparationAcademicYear, getCurrentAcademicYearWithState, getCurrentTermWithState } from './termLifecycleService.js';
import { getRolloverStatus } from './beneficiaryRolloverService.js';

const ACTIVITY_DAYS = 14;

async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 100);

/** @returns {Promise<{ years, branches, summary }>} */
export async function getYearCycleCompliance({ branchType = null } = {}) {
  const types = branchType ? [branchType] : ['school', 'healthcare_center'];

  // Target (preparation) year for each branch type
  const years = {};
  for (const type of types) {
    const { year, lifecycleState } = await getPreparationAcademicYear(type);
    years[type] = year ? { id: year.id, label: year.year_label, start: year.year_start, end: year.year_end, review_deadline: year.review_deadline || null, lifecycle_state: lifecycleState } : { label: null, lifecycle_state: lifecycleState };
  }

  const branches = await sql`
    SELECT id, branch_name, branch_type, phone_number, email, last_login_at
    FROM branches WHERE is_active = true AND branch_type = ANY(${types}::text[])
    ORDER BY branch_name
  `;
  if (branches.length === 0) return { years, branches: [], summary: emptySummary() };

  const labelRows = types.filter((t) => years[t].label).map((t) => ({ branch_type: t, year_label: years[t].label }));
  const targetValues = labelRows.length > 0 ? labelRows : [{ branch_type: '-', year_label: '-' }];

  const [reviewRows, confirmRows, incompleteRows, docRows, busRows] = await Promise.all([
    sql`
      WITH target AS (SELECT * FROM jsonb_to_recordset(${sql.json(targetValues)}) AS x(branch_type text, year_label text))
      SELECT e.branch_id,
             COUNT(*)::int AS total_source,
             COUNT(*) FILTER (WHERE t.decision IS NULL)::int AS undecided,
             COUNT(*) FILTER (WHERE t.decision = 'continuing')::int AS continuing,
             COUNT(*) FILTER (WHERE t.decision = 'leaving')::int AS leaving,
             COUNT(*) FILTER (WHERE t.decision = 'continuing' AND t.data_reviewed = false)::int AS pending_review
      FROM branches b
      JOIN target ty ON ty.branch_type = b.branch_type
      JOIN employees e ON e.branch_id = b.id
      LEFT JOIN employee_year_transitions t ON t.employee_id = e.id AND t.year_label = ty.year_label
      WHERE b.is_active = true
        AND ((e.status IN ('active', 'pending') AND (e.academic_year IS NULL OR e.academic_year <> ty.year_label))
             OR t.employee_id IS NOT NULL)
      GROUP BY e.branch_id
    `,
    sql`
      WITH target AS (SELECT * FROM jsonb_to_recordset(${sql.json(targetValues)}) AS x(branch_type text, year_label text))
      SELECT c.branch_id, c.confirmed_at
      FROM employee_review_confirmations c
      JOIN branches b ON b.id = c.branch_id
      JOIN target ty ON ty.branch_type = b.branch_type AND ty.year_label = c.year_label
    `,
    sql`
      SELECT branch_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE data_completion_status IS DISTINCT FROM 'complete')::int AS incomplete
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      GROUP BY branch_id
    `,
    sql`SELECT branch_id, document_type FROM branch_documents WHERE is_active = true`,
    sql`
      SELECT bt.branch_id, t.branch_type, bt.term_id, COUNT(*)::int AS n, MAX(t.end_date) AS term_end
      FROM bus_transportation bt JOIN terms t ON t.id = bt.term_id
      GROUP BY bt.branch_id, t.branch_type, bt.term_id
    `,
  ]);

  const byBranch = (rows) => new Map(rows.map((r) => [r.branch_id, r]));
  const reviewBy = byBranch(reviewRows);
  const confirmBy = byBranch(confirmRows);
  const incompleteBy = byBranch(incompleteRows);
  const docsBy = new Map();
  for (const r of docRows) {
    if (!docsBy.has(r.branch_id)) docsBy.set(r.branch_id, new Set());
    docsBy.get(r.branch_id).add(r.document_type);
  }

  // Current terms (for buses) per type
  const currentTerm = {};
  for (const type of types) {
    const { term } = await getCurrentTermWithState(type);
    currentTerm[type] = term || null;
  }

  // Beneficiary rollover (healthcare only), read-only, limited concurrency
  const healthcare = branches.filter((b) => b.branch_type === 'healthcare_center');
  const rolloverResults = new Map();
  await mapWithLimit(healthcare, 4, async (b) => {
    try {
      rolloverResults.set(b.id, await getRolloverStatus(b.id, { readOnly: true }));
    } catch (error) {
      log.error('Compliance: rollover status failed', { branchId: b.id, error: error.message });
    }
  });

  const now = Date.now();
  const rows = branches.map((b) => {
    const year = years[b.branch_type];
    const items = {};

    // --- employee review
    const r = reviewBy.get(b.id);
    if (year?.label && r && r.total_source > 0) {
      const open = r.undecided + r.pending_review;
      const confirmed = Boolean(confirmBy.get(b.id));
      items.review = {
        applicable: true,
        done: confirmed && open === 0,
        state: confirmed && open === 0 ? 'done' : (r.continuing + r.leaving > 0 || confirmed) ? 'in_progress' : 'not_started',
        detail: confirmed && open === 0 ? 'معتمدة' : `${open} بانتظار قرار/مراجعة من ${r.total_source}`,
        counts: { total: r.total_source, undecided: r.undecided, pending_review: r.pending_review, continuing: r.continuing, leaving: r.leaving, confirmed },
      };
    } else {
      items.review = { applicable: false };
    }

    // --- data completeness
    const inc = incompleteBy.get(b.id);
    if (!inc || inc.total === 0) {
      items.data = { applicable: true, done: false, state: 'not_started', detail: 'لم تُسجَّل بيانات موظفين', counts: { total: 0, incomplete: 0 } };
    } else {
      const doneCount = inc.total - inc.incomplete;
      items.data = {
        applicable: true,
        done: inc.incomplete === 0,
        state: inc.incomplete === 0 ? 'done' : doneCount === 0 ? 'not_started' : 'in_progress',
        detail: inc.incomplete === 0 ? 'كل البيانات مكتملة' : `${inc.incomplete} موظف ناقص البيانات من ${inc.total}`,
        counts: { total: inc.total, incomplete: inc.incomplete, percent: pct(doneCount, inc.total) },
      };
    }

    // --- branch documents
    const required = getRequiredBranchDocuments(b.branch_type);
    const present = docsBy.get(b.id) || new Set();
    const missing = required.filter((t) => !present.has(t));
    items.documents = {
      applicable: required.length > 0,
      done: missing.length === 0,
      state: missing.length === 0 ? 'done' : missing.length === required.length ? 'not_started' : 'in_progress',
      detail: missing.length === 0 ? 'كل المستندات مرفوعة' : `ينقص ${missing.length} من ${required.length} مستند`,
      counts: { required: required.length, missing: missing.length },
    };

    // --- beneficiaries (healthcare)
    const roll = rolloverResults.get(b.id);
    if (b.branch_type === 'healthcare_center' && roll?.is_active) {
      const c = roll.counts;
      if (c.total_source === 0 && c.target_total === 0) {
        items.beneficiaries = { applicable: true, done: false, state: 'not_started', detail: 'لا يوجد مستفيدون مسجلون', counts: { total: 0 } };
      } else {
        const open = c.undecided + c.pending_review;
        const confirmed = Boolean(roll.confirmation);
        items.beneficiaries = {
          applicable: true,
          done: confirmed && open === 0,
          state: confirmed && open === 0 ? 'done' : (c.decided > 0 || confirmed) ? 'in_progress' : 'not_started',
          detail: confirmed && open === 0 ? 'معتمدة' : `${open} بانتظار قرار/مراجعة`,
          counts: { source: c.total_source, undecided: c.undecided, pending_review: c.pending_review, confirmed },
        };
      }
    } else {
      items.beneficiaries = { applicable: false };
    }

    // --- buses (had buses before, none in the current term)
    const term = currentTerm[b.branch_type];
    const busList = busRows.filter((x) => x.branch_id === b.id);
    if (term && busList.length > 0) {
      const inCurrent = busList.find((x) => x.term_id === term.id)?.n || 0;
      const hadBefore = busList.some((x) => x.term_id !== term.id && new Date(x.term_end) < new Date(term.start_date));
      if (hadBefore || inCurrent > 0) {
        items.buses = {
          applicable: true,
          done: inCurrent > 0,
          state: inCurrent > 0 ? 'done' : 'not_started',
          detail: inCurrent > 0 ? `${inCurrent} باص في الفصل الحالي` : 'لا توجد باصات في الفصل الحالي',
          counts: { current: inCurrent },
        };
      } else {
        items.buses = { applicable: false };
      }
    } else {
      items.buses = { applicable: false };
    }

    // --- activity
    const daysSince = b.last_login_at ? Math.floor((now - new Date(b.last_login_at).getTime()) / 86400000) : null;
    items.activity = {
      applicable: true,
      done: daysSince !== null && daysSince <= ACTIVITY_DAYS,
      state: daysSince !== null && daysSince <= ACTIVITY_DAYS ? 'done' : 'not_started',
      detail: daysSince === null ? 'لم تسجّل دخولاً' : daysSince === 0 ? 'دخلت اليوم' : `آخر دخول قبل ${daysSince} يوم`,
      counts: { days_since_login: daysSince },
    };

    const applicable = Object.values(items).filter((i) => i.applicable);
    const score = pct(applicable.filter((i) => i.done).length, applicable.length);
    const allDone = applicable.every((i) => i.done);
    const deadline = year?.review_deadline ? new Date(year.review_deadline) : null;
    const overdue = !allDone && deadline && deadline < new Date(new Date().toDateString());
    const anyProgress = applicable.some((i) => i.state === 'in_progress' || (i.done && i !== items.activity));
    const status = allDone ? 'complete' : overdue ? 'overdue' : anyProgress ? 'in_progress' : 'not_started';

    return {
      id: b.id,
      name: b.branch_name,
      branch_type: b.branch_type,
      phone_number: b.phone_number,
      email: b.email,
      last_login_at: b.last_login_at,
      items,
      score,
      status,
    };
  });

  const summary = emptySummary();
  summary.total = rows.length;
  for (const row of rows) {
    summary[row.status] += 1;
    const t = (summary.by_type[row.branch_type] ||= { total: 0, complete: 0 });
    t.total += 1;
    if (row.status === 'complete') t.complete += 1;
  }
  summary.average_score = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
  const reviewable = rows.filter((r) => r.items.review.applicable);
  summary.review = { applicable: reviewable.length, confirmed: reviewable.filter((r) => r.items.review.done).length };

  return { years, branches: rows, summary };
}

function emptySummary() {
  return { total: 0, complete: 0, in_progress: 0, not_started: 0, overdue: 0, average_score: 0, by_type: {}, review: { applicable: 0, confirmed: 0 } };
}

/**
 * What "end year" would do (termLifecycleService.endAcademicYearTransactional): every ACTIVE employee of the
 * type who was not carried into the new year (academic_year empty or still the ending year) becomes pending,
 * and every unarchived beneficiary of the ending year's terms is archived. Read-only.
 */
export async function getEndYearPreview(branchType) {
  const [{ year: target }, { year: ending }] = await Promise.all([
    getPreparationAcademicYear(branchType),
    getCurrentAcademicYearWithState(branchType),
  ]);
  if (!ending) {
    return { ending_year: null, target_year: null, branches: [], totals: { employees_to_pending: 0, unconfirmed_branches: 0, beneficiaries_to_archive: 0, branches: 0 } };
  }

  const rows = await sql`
    SELECT b.id AS branch_id, b.branch_name,
           (SELECT COUNT(*)::int FROM employees e
             WHERE e.branch_id = b.id AND e.status = 'active' AND e.is_active = true
               AND (e.academic_year IS NULL OR e.academic_year = ${ending.year_label})) AS to_pending,
           (SELECT COUNT(*)::int FROM beneficiaries bf
             WHERE bf.branch_id = b.id AND bf.is_archived = false
               AND bf.term_id IN (SELECT id FROM terms WHERE branch_type = ${branchType} AND academic_year_label = ${ending.year_label})) AS beneficiaries_to_archive,
           ${target
             ? sql`EXISTS (SELECT 1 FROM employee_review_confirmations c WHERE c.branch_id = b.id AND c.year_label = ${target.year_label})`
             : sql`false`} AS confirmed
    FROM branches b
    WHERE b.is_active = true AND b.branch_type = ${branchType}
    ORDER BY to_pending DESC, b.branch_name
  `;

  return {
    ending_year: { id: ending.id, label: ending.year_label },
    target_year: target ? { id: target.id, label: target.year_label } : null,
    branches: rows,
    totals: {
      employees_to_pending: rows.reduce((s, r) => s + r.to_pending, 0),
      beneficiaries_to_archive: rows.reduce((s, r) => s + r.beneficiaries_to_archive, 0),
      unconfirmed_branches: rows.filter((r) => !r.confirmed).length,
      branches: rows.length,
    },
  };
}

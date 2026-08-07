/**
 * Employee Year Transition Service
 *
 * Drives the between-years employee review: a branch goes through last year's
 * roster one by one, decides who continues and who leaves (with a mandatory
 * reason), reviews what data is missing, and confirms when it has finished
 * 100% of the updates.
 *
 * Deliberately mirrors services/beneficiaryRolloverService.js — same shape,
 * same error class pattern — so both features are maintained as one idea.
 *
 * All multi-table writes live here so routes stay thin.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { Employee } from '../models/Employee.js';
import { checkEmployeeDataCompletion } from '../utils/employeeDataCompletion.js';
import { getPreparationAcademicYear, getCurrentTermWithState } from './termLifecycleService.js';

/** Thrown for expected, user-facing problems. Routes map .status onto the response. */
export class TransitionError extends Error {
    constructor(message, status = 400, code = 'TRANSITION_ERROR') {
        super(message);
        this.name = 'TransitionError';
        this.status = status;
        this.code = code;
    }
}

const ARCHIVED_STATUSES = [
    'terminated_article_80',
    'terminated_article_77',
    'resigned',
    'contract_ended',
    'non_renewal',
    'other'
];

/**
 * Renewal documents advisory rule. Never blocks — see evaluateRenewalDocuments.
 *
 * Only `employment_contract` is checked. The legacy renewal gate (before this
 * feature) also checked `employment_letter` and, for female employees,
 * `medical_examination` — but neither is a real document type: they are not
 * in isValidDocumentType (utils/validators.js) and no upload screen anywhere
 * in the app offers them. Keeping them would show every employee a "missing
 * document" warning that can never be resolved, which is worse than showing
 * nothing — an unfixable nag reads as a bug, not a reminder. Re-add them here
 * if/when a real upload path for those document types is built.
 */
const RENEWAL_DOCUMENT_TYPES = ['employment_contract'];

/** users(id) FK — branch managers are rows in `branches` and have no users row. */
const actorUserId = (actor) => (actor?.existsInDb ? actor.id : null);

const actorLabel = (actor, branchName) => {
    if (actor?.existsInDb) return actor.full_name || actor.username || `مستخدم #${actor.id}`;
    return branchName || 'مدير الفرع';
};

/**
 * Resolve the branch's branch_type and the year being prepared / the one being
 * left behind. Mirrors resolveRolloverTerms in beneficiaryRolloverService.js,
 * including the same "don't target an already-ended year" guard: without it,
 * a branch whose new year has not been created yet would fall through to the
 * most recently ended year and "review" a year that already finished.
 */
export const resolveTransitionYears = async (branchId) => {
    const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
    if (!branch?.branch_type) {
        return { targetYear: null, previousYear: null, branchType: null, lifecycleState: 'no_branch' };
    }
    const branchType = branch.branch_type;

    // Shared with Employee.create — see getPreparationAcademicYear. Both must
    // resolve the SAME year or a new hire added mid-review is stamped with the
    // old one and reappears as a review candidate.
    const { year: targetYear, lifecycleState } = await getPreparationAcademicYear(branchType);

    if (!targetYear) {
        return { targetYear: null, previousYear: null, branchType, lifecycleState: lifecycleState || 'no_year' };
    }

    const [previousYear] = await sql`
        SELECT * FROM academic_years
        WHERE branch_type = ${branchType}
          AND id <> ${targetYear.id}
          AND year_end < ${targetYear.year_start}
        ORDER BY year_end DESC
        LIMIT 1
    `;

    return { targetYear, previousYear: previousYear || null, branchType, lifecycleState };
};

/**
 * Missing / stale renewal documents, computed from an already-fetched list of
 * {document_type, uploaded_at} rows for this employee. "Stale" means uploaded
 * before the new year started, i.e. not renewed FOR this year. Pure — no I/O —
 * so a caller iterating many employees can fetch once and call this per row
 * instead of paying a query per employee (see getTransitionCandidates below,
 * which reuses the SAME document batch it already fetches for
 * checkEmployeeDataCompletion rather than querying twice).
 */
const computeRenewalDocumentStatus = (employee, yearStart, documents) => {
    const required = [...RENEWAL_DOCUMENT_TYPES];

    const latestByType = new Map();
    for (const doc of documents) {
        if (!required.includes(doc.document_type)) continue;
        if (!latestByType.has(doc.document_type)) latestByType.set(doc.document_type, doc.uploaded_at);
    }

    const missing = required.filter(type => !latestByType.has(type));
    const stale = required.filter(type => {
        const uploadedAt = latestByType.get(type);
        return uploadedAt && new Date(uploadedAt) < new Date(yearStart);
    });

    return { missing, stale, required };
};

/**
 * Missing / stale renewal documents for ONE employee — advisory only, never
 * blocks. Replaces the old hard 90-day gate, which required
 * employment_contract + employment_letter (+ medical_examination for
 * females) all re-uploaded within 90 days and blocked 100% of active
 * employees in production. For checking many employees at once, fetch their
 * documents in a batch and call computeRenewalDocumentStatus directly instead
 * of calling this in a loop.
 */
export const evaluateRenewalDocuments = async (employee, yearStart) => {
    const documents = await sql`
        SELECT document_type, uploaded_at FROM employee_documents
        WHERE employee_id = ${employee.id} AND is_active = true
    `;
    return computeRenewalDocumentStatus(employee, yearStart, documents);
};

const emptyCounts = {
    total_source: 0, undecided: 0, continuing: 0, leaving: 0,
    decided: 0, pending_review: 0, new_hires: 0
};

/**
 * Counters + confirmation state for one branch's employee review.
 */
export const getTransitionStatus = async (branchId) => {
    const { targetYear, previousYear, lifecycleState } = await resolveTransitionYears(branchId);

    if (!targetYear) {
        return {
            is_active: false,
            lifecycle_state: lifecycleState,
            target_year: null,
            previous_year: null,
            counts: { ...emptyCounts },
            confirmation: null,
            can_confirm: false,
            blocking_reason: lifecycleState === 'target_year_ended'
                ? 'انتهت السنة الدراسية الحالية ولم يتم إنشاء السنة الدراسية الجديدة بعد'
                : 'لا توجد سنة دراسية للسنة الجديدة'
        };
    }

    // Deciding "continuing" immediately stamps the employee's academic_year with
    // the target year (that is how renewForYear works) — so a row can be BOTH
    // "already renewed" and "still pending review" at the same time. Filtering
    // this query the same way getTransitionCandidates does (excluding anyone
    // already stamped with the target year) would make pending_review always
    // read 0 the instant a decision is applied. Counting here is therefore
    // "still an undecided candidate" UNION "already has a transition row for
    // this year", regardless of what their academic_year says right now.
    const [counts] = await sql`
        SELECT
            COUNT(*)::int AS total_source,
            COUNT(*) FILTER (WHERE t.decision IS NULL)::int AS undecided,
            COUNT(*) FILTER (WHERE t.decision = 'continuing')::int AS continuing,
            COUNT(*) FILTER (WHERE t.decision = 'leaving')::int AS leaving,
            COUNT(*) FILTER (WHERE t.decision = 'continuing' AND t.data_reviewed = false)::int AS pending_review,
            MAX(t.updated_at) AS last_change_at
        FROM employees e
        LEFT JOIN employee_year_transitions t
               ON t.employee_id = e.id AND t.year_label = ${targetYear.year_label}
        WHERE e.branch_id = ${branchId}
          AND (
            (e.status IN ('active', 'pending') AND (e.academic_year IS NULL OR e.academic_year <> ${targetYear.year_label}))
            OR t.employee_id IS NOT NULL
          )
    `;

    // A "new hire" was created directly for the target year and never went
    // through a decision — excluding anyone with a transition row keeps renewed
    // (carried-over) employees out of this count.
    const [newHires] = await sql`
        SELECT COUNT(*)::int AS n FROM employees e
        WHERE e.branch_id = ${branchId} AND e.academic_year = ${targetYear.year_label}
          AND NOT EXISTS (
            SELECT 1 FROM employee_year_transitions t
            WHERE t.employee_id = e.id AND t.year_label = ${targetYear.year_label}
          )
    `;

    const [confirmation] = await sql`
        SELECT * FROM employee_review_confirmations
        WHERE branch_id = ${branchId} AND year_label = ${targetYear.year_label}
    `;

    let blockingReason = null;
    if (counts.undecided > 0) {
        blockingReason = `يوجد ${counts.undecided} موظف لم يتم اتخاذ قرار بشأنه`;
    } else if (counts.pending_review > 0) {
        blockingReason = `يوجد ${counts.pending_review} موظف لم تتم مراجعة بياناته`;
    }

    return {
        is_active: true,
        lifecycle_state: lifecycleState,
        target_year: targetYear,
        previous_year: previousYear,
        counts: {
            total_source: counts.total_source,
            undecided: counts.undecided,
            continuing: counts.continuing,
            leaving: counts.leaving,
            decided: counts.continuing + counts.leaving,
            pending_review: counts.pending_review,
            new_hires: newHires.n
        },
        confirmation: confirmation
            ? {
                ...confirmation,
                // Display-only: data changed after the branch confirmed. Never
                // blocks — confirmation is a status flag, not a lock.
                is_stale: Boolean(
                    counts.last_change_at &&
                    new Date(counts.last_change_at) > new Date(confirmation.confirmed_at)
                )
            }
            : null,
        can_confirm: !blockingReason,
        blocking_reason: blockingReason
    };
};

/**
 * The branch's employees for the target year, each enriched with their missing
 * data (reusing checkEmployeeDataCompletion verbatim) and missing/stale
 * renewal documents. Batches the document/classification/certificate lookups
 * once for the whole branch instead of firing them per employee.
 */
export const getTransitionCandidates = async (branchId, { status } = {}) => {
    const { targetYear, branchType } = await resolveTransitionYears(branchId);
    if (!targetYear) return [];

    const employees = await Employee.findYearReviewCandidates(branchId, targetYear.year_label);
    if (employees.length === 0) return [];

    const employeeIds = employees.map(e => e.id);

    const [documents, classifications, certificates] = await Promise.all([
        // uploaded_at is fetched here too so this one batch also feeds
        // computeRenewalDocumentStatus below — no second per-employee query.
        sql`SELECT employee_id, document_type, uploaded_at FROM employee_documents WHERE employee_id = ANY(${employeeIds}) AND is_active = true`,
        sql`SELECT employee_id, profession FROM employee_professional_classifications WHERE employee_id = ANY(${employeeIds})`,
        sql`SELECT employee_id, course_type FROM employee_course_certificates WHERE employee_id = ANY(${employeeIds})`
    ]);

    const groupBy = (rows) => {
        const map = new Map();
        for (const row of rows) {
            if (!map.has(row.employee_id)) map.set(row.employee_id, []);
            map.get(row.employee_id).push(row);
        }
        return map;
    };
    const docsByEmployee = groupBy(documents);
    const classByEmployee = groupBy(classifications);
    const certsByEmployee = groupBy(certificates);

    const results = [];
    for (const employee of employees) {
        const employeeDocs = docsByEmployee.get(employee.id) || [];
        const completion = await checkEmployeeDataCompletion(employee, {
            branchType,
            documents: employeeDocs,
            classifications: classByEmployee.get(employee.id) || [],
            certificates: certsByEmployee.get(employee.id) || [],
            skipContractDocument: true
        });
        const docStatus = computeRenewalDocumentStatus(employee, targetYear.year_start, employeeDocs);

        results.push({
            ...employee,
            missing_fields_live: completion.missingFields,
            renewal_documents: docStatus
        });
    }

    if (!status || status === 'all') return results;
    if (status === 'undecided') return results.filter(r => !r.decision);
    return results.filter(r => r.decision === status);
};

/**
 * Apply continue / leaving decisions for one branch's employees.
 *
 * One transaction, per-item results (a bad row must not abort the batch),
 * mirroring applyDecisions in beneficiaryRolloverService.js. Upserts on
 * (employee_id, year_label), so re-deciding the same employee is a no-op
 * update rather than a duplicate — the same idempotency guarantee the
 * beneficiary rollover gets from its partial unique index.
 */
export const applyEmployeeDecisions = async ({ branchId, decisions, actor }) => {
    const { targetYear, previousYear, branchType } = await resolveTransitionYears(branchId);
    if (!targetYear) {
        throw new TransitionError('لا توجد سنة دراسية للسنة الجديدة. يجب إنشاء السنة الدراسية الجديدة وفصولها أولاً', 400, 'NO_TARGET_YEAR');
    }

    const { term: currentTerm } = await getCurrentTermWithState(branchType);
    const decidedBy = actorUserId(actor);
    const [branch] = await sql`SELECT branch_name FROM branches WHERE id = ${branchId}`;
    const decidedByLabel = actorLabel(actor, branch?.branch_name);

    return sql.begin(async tx => {
        const results = [];

        for (const decision of decisions) {
            const employeeId = parseInt(decision.employee_id, 10);
            const verdict = decision.decision;

            if (!employeeId || !['continuing', 'leaving'].includes(verdict)) {
                results.push({ employee_id: decision.employee_id, ok: false, error: 'قرار غير صالح' });
                continue;
            }

            // No status restriction here: a "leaving" reversed back to "continuing"
            // arrives with an already-archived status (that's the whole point of
            // the reversal), so gating this lookup on active/pending would make
            // the reversal permanently fail after the first decision. The
            // candidates list is what controls who is reachable from the UI in
            // the first place; this just needs to find the row for this branch.
            const [employee] = await tx`
                SELECT * FROM employees
                WHERE id = ${employeeId} AND branch_id = ${branchId}
                FOR UPDATE
            `;
            if (!employee) {
                results.push({ employee_id: employeeId, ok: false, error: 'الموظف غير موجود' });
                continue;
            }

            let missingFieldsSnapshot = null;
            let missingDocumentsSnapshot = null;
            try {
                const completion = await checkEmployeeDataCompletion(employee, { branchType, skipContractDocument: true });
                missingFieldsSnapshot = completion.missingFields;
                const docStatus = await evaluateRenewalDocuments(employee, targetYear.year_start);
                missingDocumentsSnapshot = docStatus;
            } catch (snapshotError) {
                log.error('Error snapshotting employee completion for transition decision', {
                    employeeId, error: snapshotError.message
                });
            }

            if (verdict === 'leaving') {
                const leavingStatus = decision.leaving_status;
                const reason = String(decision.reason || '').trim();
                if (!leavingStatus || !ARCHIVED_STATUSES.includes(leavingStatus)) {
                    results.push({ employee_id: employeeId, ok: false, error: 'يجب اختيار سبب أرشيفي صحيح' });
                    continue;
                }

                await tx`
                    INSERT INTO employee_year_transitions (
                        employee_id, branch_id, year_label, previous_year_label,
                        decision, leaving_status, leaving_reason, data_reviewed,
                        missing_fields, missing_documents,
                        decided_by_user_id, decided_by_branch_id, decided_by_label
                    )
                    VALUES (
                        ${employeeId}, ${branchId}, ${targetYear.year_label}, ${previousYear?.year_label || null},
                        'leaving', ${leavingStatus}, ${reason}, true,
                        ${sql.json(missingFieldsSnapshot)}, ${sql.json(missingDocumentsSnapshot)},
                        ${decidedBy}, ${branchId}, ${decidedByLabel}
                    )
                    ON CONFLICT (employee_id, year_label) DO UPDATE SET
                        decision = 'leaving',
                        leaving_status = EXCLUDED.leaving_status,
                        leaving_reason = EXCLUDED.leaving_reason,
                        data_reviewed = true,
                        missing_fields = EXCLUDED.missing_fields,
                        missing_documents = EXCLUDED.missing_documents,
                        decided_at = CURRENT_TIMESTAMP,
                        decided_by_user_id = EXCLUDED.decided_by_user_id,
                        decided_by_branch_id = EXCLUDED.decided_by_branch_id,
                        decided_by_label = EXCLUDED.decided_by_label,
                        updated_at = CURRENT_TIMESTAMP
                `;

                // If this employee had already been decided "continuing" (which
                // stamps academic_year with the target year) and is now being
                // reversed to "leaving", undo that stamp — they never actually
                // carried into the new year, so leaving them stamped with it
                // would misreport their last real year in the archive. Employees
                // decided "leaving" directly (never renewed) keep whatever
                // academic_year they already had, untouched.
                const [updated] = await tx`
                    UPDATE employees
                    SET status = ${leavingStatus},
                        is_active = false,
                        academic_year = CASE WHEN academic_year = ${targetYear.year_label}
                                              THEN ${previousYear?.year_label || null} ELSE academic_year END,
                        current_term_id = CASE WHEN academic_year = ${targetYear.year_label}
                                                THEN NULL ELSE current_term_id END,
                        status_changed_at = CURRENT_TIMESTAMP,
                        status_changed_by = ${decidedBy},
                        status_change_reason = ${reason},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${employeeId}
                    RETURNING *
                `;

                results.push({ employee_id: employeeId, ok: true, decision: 'leaving', employee: updated });
                continue;
            }

            // verdict === 'continuing'
            await tx`
                INSERT INTO employee_year_transitions (
                    employee_id, branch_id, year_label, previous_year_label,
                    decision, leaving_status, leaving_reason, data_reviewed,
                    missing_fields, missing_documents,
                    decided_by_user_id, decided_by_branch_id, decided_by_label
                )
                VALUES (
                    ${employeeId}, ${branchId}, ${targetYear.year_label}, ${previousYear?.year_label || null},
                    'continuing', NULL, NULL, false,
                    ${sql.json(missingFieldsSnapshot)}, ${sql.json(missingDocumentsSnapshot)},
                    ${decidedBy}, ${branchId}, ${decidedByLabel}
                )
                ON CONFLICT (employee_id, year_label) DO UPDATE SET
                    decision = 'continuing',
                    leaving_status = NULL,
                    leaving_reason = NULL,
                    -- Re-deciding "continuing" after having reviewed it should not
                    -- silently re-open the review step; only reset it coming from
                    -- 'leaving', where nothing has been reviewed yet.
                    data_reviewed = CASE WHEN employee_year_transitions.decision = 'leaving'
                                          THEN false ELSE employee_year_transitions.data_reviewed END,
                    missing_fields = EXCLUDED.missing_fields,
                    missing_documents = EXCLUDED.missing_documents,
                    decided_at = CURRENT_TIMESTAMP,
                    decided_by_user_id = EXCLUDED.decided_by_user_id,
                    decided_by_branch_id = EXCLUDED.decided_by_branch_id,
                    decided_by_label = EXCLUDED.decided_by_label,
                    updated_at = CURRENT_TIMESTAMP
            `;

            const updated = await Employee.renewForYear(tx, employeeId, {
                yearLabel: targetYear.year_label,
                termId: currentTerm?.id || null,
                actorUserId: decidedBy
            });

            if (!updated) {
                results.push({ employee_id: employeeId, ok: false, error: 'تعذر تحديث حالة الموظف' });
                continue;
            }

            results.push({ employee_id: employeeId, ok: true, decision: 'continuing', employee: updated });
        }

        return {
            results,
            counts: {
                applied: results.filter(r => r.ok).length,
                failed: results.filter(r => !r.ok).length
            }
        };
    });
};

/**
 * Mark employees' data as reviewed without editing them ("تم التحقق").
 *
 * Scoped through employees.branch_id rather than the transition row's own
 * branch_id: employees.branch_id is what decides who appears in this branch's
 * queue in the first place (getTransitionStatus, findYearReviewCandidates), so
 * it is the only column that cannot disagree with the list the branch is
 * looking at. The transition row's copy is stamped when the decision is made
 * and goes stale on transfer — filtering on it matched zero rows for a
 * transferred employee while still reporting success, leaving pending_review
 * permanently above zero. Migration-free: this fixes rows transferred before
 * transferToBranch started moving them too.
 *
 * Returns the ids actually flipped so the caller can avoid claiming it
 * reviewed employees it did not touch.
 */
export const markEmployeeDataReviewed = async ({ branchId, employeeIds }) => {
    const { targetYear } = await resolveTransitionYears(branchId);
    if (!targetYear) {
        throw new TransitionError('لا توجد سنة دراسية للسنة الجديدة', 400, 'NO_TARGET_YEAR');
    }

    const rows = await sql`
        UPDATE employee_year_transitions t
        SET data_reviewed = true, updated_at = CURRENT_TIMESTAMP
        FROM employees e
        WHERE e.id = t.employee_id
          AND e.branch_id = ${branchId}
          AND t.year_label = ${targetYear.year_label}
          AND t.employee_id = ANY(${employeeIds})
          AND t.decision = 'continuing'
          AND t.data_reviewed = false
        RETURNING t.employee_id
    `;
    return { updated: rows.length, employeeIds: rows.map(r => r.employee_id) };
};

/**
 * A branch declares its employee updates 100% complete for the year. Upsert,
 * so re-confirming refreshes the timestamp and bumps the counter instead of
 * failing. Does not lock anything — the branch may keep editing.
 */
export const confirmEmployeeReview = async ({ branchId, note, actor }) => {
    const status = await getTransitionStatus(branchId);
    if (!status.is_active) {
        throw new TransitionError('لا توجد سنة دراسية للسنة الجديدة. يجب إنشاء السنة الدراسية الجديدة وفصولها أولاً', 400, 'NO_TARGET_YEAR');
    }
    if (!status.can_confirm) {
        throw new TransitionError(`لا يمكن التأكيد: ${status.blocking_reason}`, 400, 'REVIEW_INCOMPLETE');
    }

    const [branch] = await sql`SELECT branch_name FROM branches WHERE id = ${branchId}`;

    const [confirmation] = await sql`
        INSERT INTO employee_review_confirmations (
            branch_id, year_label, previous_year_label,
            confirmed_by_user_id, confirmed_by_branch_id, confirmed_by_label,
            total_continuing, total_leaving, total_new_hires, note
        )
        VALUES (
            ${branchId}, ${status.target_year.year_label}, ${status.previous_year?.year_label || null},
            ${actorUserId(actor)}, ${branchId}, ${actorLabel(actor, branch?.branch_name)},
            ${status.counts.continuing}, ${status.counts.leaving}, ${status.counts.new_hires},
            ${note || null}
        )
        ON CONFLICT (branch_id, year_label) DO UPDATE SET
            confirmed_at = CURRENT_TIMESTAMP,
            confirmation_count = employee_review_confirmations.confirmation_count + 1,
            previous_year_label = EXCLUDED.previous_year_label,
            confirmed_by_user_id = EXCLUDED.confirmed_by_user_id,
            confirmed_by_branch_id = EXCLUDED.confirmed_by_branch_id,
            confirmed_by_label = EXCLUDED.confirmed_by_label,
            total_continuing = EXCLUDED.total_continuing,
            total_leaving = EXCLUDED.total_leaving,
            total_new_hires = EXCLUDED.total_new_hires,
            note = EXCLUDED.note,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;

    log.info('Employee year review confirmed', { branchId, yearLabel: status.target_year.year_label });
    return confirmation;
};

export const unconfirmEmployeeReview = async ({ branchId }) => {
    const { targetYear } = await resolveTransitionYears(branchId);
    if (!targetYear) {
        throw new TransitionError('لا توجد سنة دراسية للسنة الجديدة', 400, 'NO_TARGET_YEAR');
    }

    const [removed] = await sql`
        DELETE FROM employee_review_confirmations
        WHERE branch_id = ${branchId} AND year_label = ${targetYear.year_label}
        RETURNING id
    `;
    if (!removed) {
        throw new TransitionError('لا يوجد تأكيد لإلغائه', 404, 'NO_CONFIRMATION');
    }
    return removed;
};

/**
 * Per-branch employee review progress for the main manager. LEFT JOINs from
 * branches so branches that have done nothing still show up (as unconfirmed).
 */
export const getEmployeeTransitionOverview = async (yearLabel, branchType) => {
    if (!branchType) {
        throw new TransitionError('يجب تحديد نوع الفرع', 400, 'MISSING_PARAMS');
    }

    // The main manager only picks a branch type — resolve the year being
    // prepared from any active branch of that type, the same year every branch
    // of that type would resolve to individually.
    let resolvedYearLabel = yearLabel;
    if (!resolvedYearLabel) {
        const [anyBranch] = await sql`
            SELECT id FROM branches WHERE branch_type = ${branchType} AND is_active = true LIMIT 1
        `;
        if (anyBranch) {
            const { targetYear } = await resolveTransitionYears(anyBranch.id);
            resolvedYearLabel = targetYear?.year_label || null;
        }
    }
    if (!resolvedYearLabel) {
        throw new TransitionError('لا توجد سنة دراسية جديدة لهذا النوع من الفروع', 400, 'NO_TARGET_YEAR');
    }
    yearLabel = resolvedYearLabel;

    return await sql`
        WITH src AS (
            -- Same union as findYearReviewCandidates/getTransitionStatus: a decision
            -- (continuing or leaving) moves the employee's status/academic_year away
            -- from the "still undecided" shape, so counting only that shape would
            -- make decided/pending_review collapse to zero the moment a branch
            -- starts deciding. Anyone with a transition row for this year counts too.
            SELECT e.branch_id,
                   COUNT(*)::int AS source_total,
                   COUNT(*) FILTER (WHERE t.decision IS NULL)::int AS undecided,
                   COUNT(*) FILTER (WHERE t.decision = 'continuing')::int AS continuing,
                   COUNT(*) FILTER (WHERE t.decision = 'leaving')::int AS leaving,
                   COUNT(*) FILTER (WHERE t.decision = 'continuing' AND t.data_reviewed = false)::int AS pending_review
            FROM employees e
            LEFT JOIN employee_year_transitions t
                   ON t.employee_id = e.id AND t.year_label = ${yearLabel}
            WHERE (
                (e.status IN ('active', 'pending') AND (e.academic_year IS NULL OR e.academic_year <> ${yearLabel}))
                OR t.employee_id IS NOT NULL
            )
            GROUP BY e.branch_id
        ),
        hires AS (
            SELECT e.branch_id, COUNT(*)::int AS new_hires
            FROM employees e
            WHERE e.academic_year = ${yearLabel}
              AND NOT EXISTS (
                SELECT 1 FROM employee_year_transitions t
                WHERE t.employee_id = e.id AND t.year_label = ${yearLabel}
              )
            GROUP BY e.branch_id
        )
        SELECT
            br.id AS branch_id,
            br.branch_name,
            COALESCE(src.source_total, 0) AS source_total,
            COALESCE(src.undecided, 0) AS undecided,
            COALESCE(src.continuing, 0) AS continuing,
            COALESCE(src.leaving, 0) AS leaving,
            COALESCE(src.continuing, 0) + COALESCE(src.leaving, 0) AS decided,
            COALESCE(src.pending_review, 0) AS pending_review,
            COALESCE(hires.new_hires, 0) AS new_hires,
            c.confirmed_at,
            c.confirmed_by_label,
            c.confirmation_count,
            c.note,
            (c.id IS NOT NULL) AS is_confirmed
        FROM branches br
        LEFT JOIN src ON src.branch_id = br.id
        LEFT JOIN hires ON hires.branch_id = br.id
        LEFT JOIN employee_review_confirmations c
               ON c.branch_id = br.id AND c.year_label = ${yearLabel}
        WHERE br.branch_type = ${branchType} AND br.is_active = true
        ORDER BY br.branch_name
    `;
};

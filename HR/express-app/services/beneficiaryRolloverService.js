/**
 * Beneficiary Rollover Service
 *
 * Drives the between-years review: a healthcare-center branch goes through last
 * term's beneficiaries one by one, decides who continues and who does not, and
 * confirms when it has finished 100% of the updates.
 *
 * All multi-table writes live here so routes stay thin and there is exactly one
 * place that knows how a decision becomes rows in the database.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import Beneficiary from '../models/Beneficiary.js';
import { getCurrentTermWithState } from './termLifecycleService.js';

/** Thrown for expected, user-facing problems. Routes map .status onto the response. */
export class RolloverError extends Error {
    constructor(message, status = 400, code = 'ROLLOVER_ERROR') {
        super(message);
        this.name = 'RolloverError';
        this.status = status;
        this.code = code;
    }
}

/** Same advisory-lock key as Beneficiary.create and copyFromTerm, so all three serialise. */
const sequenceLockKey = (branchId, termId) => branchId * 100000 + termId;

/** users(id) FK — branch managers are rows in `branches` and have no users row. */
const actorUserId = (actor) => (actor?.existsInDb ? actor.id : null);

const actorLabel = (actor, branchName) => {
    if (actor?.existsInDb) return actor.full_name || actor.username || `مستخدم #${actor.id}`;
    return branchName || 'مدير الفرع';
};

/**
 * Resolve the pair of terms the rollover works across.
 *
 * target = the term we are preparing (today's term, else the next upcoming one).
 * source = the most recent term this branch ACTUALLY has beneficiaries in, before
 *          the target. Data-driven rather than calendar-driven so a branch that
 *          skipped a term still gets its real last dataset. It deliberately does
 *          not filter terms.is_active: last year's terms were deactivated when the
 *          year was closed.
 */
export const resolveRolloverTerms = async (branchId, { targetTermId } = {}) => {
    let targetTerm = null;
    let lifecycleState = null;

    if (targetTermId) {
        const [term] = await sql`
            SELECT * FROM terms WHERE id = ${targetTermId} AND branch_type = 'healthcare_center'
        `;
        targetTerm = term || null;
        lifecycleState = 'explicit';
    } else {
        const resolved = await getCurrentTermWithState('healthcare_center');
        targetTerm = resolved.term;
        lifecycleState = resolved.lifecycleState;
    }

    if (!targetTerm) {
        return { targetTerm: null, sourceTerm: null, lifecycleState: lifecycleState || 'no_term' };
    }

    // You prepare a term that is running or about to start — never one that has
    // already ended. Without this, when the new year's terms have not been created
    // yet, getCurrentTermWithState falls through to its "most recent past term"
    // tier and the rollover would target last year's own term, offering to carry
    // that term's beneficiaries into itself.
    const targetHasEnded = new Date(targetTerm.end_date) < new Date(new Date().toDateString());
    if (targetHasEnded) {
        return { targetTerm: null, sourceTerm: null, lifecycleState: 'target_term_ended', endedTerm: targetTerm };
    }

    const [sourceTerm] = await sql`
        SELECT t.* FROM terms t
        WHERE t.branch_type = 'healthcare_center'
          AND t.id <> ${targetTerm.id}
          AND t.end_date < ${targetTerm.start_date}
          AND EXISTS (
            SELECT 1 FROM beneficiaries b
            WHERE b.term_id = t.id AND b.branch_id = ${branchId}
          )
        ORDER BY t.end_date DESC
        LIMIT 1
    `;

    return { targetTerm, sourceTerm: sourceTerm || null, lifecycleState };
};

const emptyCounts = {
    total_source: 0, undecided: 0, continuing: 0, not_continuing: 0,
    decided: 0, target_total: 0, pending_review: 0, carried: 0, new_in_target: 0
};

/**
 * Counters + confirmation state for one branch's rollover.
 */
export const getRolloverStatus = async (branchId, { targetTermId } = {}) => {
    const { targetTerm, sourceTerm, lifecycleState } = await resolveRolloverTerms(branchId, { targetTermId });

    if (!targetTerm) {
        return {
            is_active: false,
            lifecycle_state: lifecycleState,
            source_term: null,
            target_term: null,
            counts: { ...emptyCounts },
            confirmation: null,
            can_confirm: false,
            blocking_reason: lifecycleState === 'target_term_ended'
                ? 'انتهى الفصل الدراسي الحالي ولم يتم إنشاء فصول السنة الجديدة بعد'
                : 'لا يوجد فصل دراسي للسنة الجديدة'
        };
    }

    const [sourceCounts] = sourceTerm
        ? await sql`
            SELECT
                COUNT(*)::int AS total_source,
                COUNT(*) FILTER (WHERE continuity_status IS NULL)::int AS undecided,
                COUNT(*) FILTER (WHERE continuity_status = 'continuing')::int AS continuing,
                COUNT(*) FILTER (WHERE continuity_status = 'not_continuing')::int AS not_continuing
            FROM beneficiaries
            WHERE branch_id = ${branchId} AND term_id = ${sourceTerm.id}
        `
        : [{ total_source: 0, undecided: 0, continuing: 0, not_continuing: 0 }];

    const [targetCounts] = await sql`
        SELECT
            COUNT(*)::int AS target_total,
            COUNT(*) FILTER (WHERE carry_review_status = 'pending')::int AS pending_review,
            COUNT(*) FILTER (WHERE carried_from_beneficiary_id IS NOT NULL)::int AS carried,
            COUNT(*) FILTER (WHERE carried_from_beneficiary_id IS NULL)::int AS new_in_target,
            MAX(updated_at) AS last_change_at
        FROM beneficiaries
        WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id} AND is_archived = false
    `;

    const [confirmation] = await sql`
        SELECT * FROM beneficiary_review_confirmations
        WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id}
    `;

    // Buses carry themselves over. Branches reuse and update last year's fleet
    // rather than re-entering it, and ~91% of beneficiaries have transport, so
    // the bus step fires for almost everyone — making a manual "carry the buses"
    // press a prerequisite for nearly the whole review. A branch that never
    // found the button would review its beneficiaries with an empty bus list,
    // silently skip the seat step, and only discover it in the advisory warning
    // at the very end.
    //
    // This is the one place every surface (dashboard task, beneficiaries page,
    // confirm panel) already goes through, so it is the one place that can
    // guarantee it happened. carryOverBuses is idempotent — UNIQUE(branch_id,
    // bus_number, term_id) is the skip key — and the target_buses = 0 guard
    // means it stops running the moment the branch has any bus of its own in
    // the new term. Failures are swallowed: a bus problem must never take down
    // the status read that the whole review renders from.
    let [busCounts] = await sql`
        SELECT COUNT(*)::int AS target_buses
        FROM bus_transportation
        WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id}
    `;

    if (busCounts.target_buses === 0 && sourceTerm) {
        try {
            const carried = await carryOverBuses({
                branchId, sourceTermId: sourceTerm.id, targetTermId: targetTerm.id, actor: null
            });
            if (carried.copied > 0) {
                log.info('Auto-carried buses into the new term', {
                    branchId, targetTermId: targetTerm.id, copied: carried.copied
                });
                [busCounts] = await sql`
                    SELECT COUNT(*)::int AS target_buses
                    FROM bus_transportation
                    WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id}
                `;
            }
        } catch (error) {
            log.error('Auto bus carry-over failed', { branchId, targetTermId: targetTerm.id, error: error.message });
        }
    }

    // Advisory only — deliberately NOT part of blockingReason. Saving the review
    // form marks a beneficiary "reviewed" independently of the separate bus-seat
    // call, so someone with transport_service can end up reviewed with no seat
    // (the bus step is skipped entirely when the branch has not carried its buses
    // over yet). Nothing else would ever surface that, so the confirm step shows
    // it as a warning. Queried over the whole target term, not just carried-over
    // rows, so beneficiaries added new to this term count too.
    const [transportGap] = await sql`
        SELECT COUNT(*)::int AS n,
               (ARRAY_AGG(b.beneficiary_name ORDER BY b.sequence_number))[1:5] AS names
        FROM beneficiaries b
        WHERE b.branch_id = ${branchId}
          AND b.term_id = ${targetTerm.id}
          AND b.is_archived = false
          AND b.transport_service = true
          AND NOT EXISTS (
            SELECT 1 FROM bus_students bs
            INNER JOIN bus_transportation bt ON bt.id = bs.bus_id
            WHERE bs.term_id = b.term_id
              AND bt.branch_id = b.branch_id
              AND LOWER(TRIM(bs.student_full_name)) = LOWER(TRIM(b.beneficiary_name))
          )
    `;

    const counts = {
        ...sourceCounts,
        ...targetCounts,
        decided: sourceCounts.continuing + sourceCounts.not_continuing,
        target_buses: busCounts.target_buses,
        transport_without_bus: transportGap.n,
        transport_without_bus_names: transportGap.names || []
    };
    delete counts.last_change_at;

    let blockingReason = null;
    if (counts.undecided > 0) {
        blockingReason = `يوجد ${counts.undecided} مستفيد لم يتم اتخاذ قرار بشأنه`;
    } else if (counts.pending_review > 0) {
        blockingReason = `يوجد ${counts.pending_review} مستفيد لم تتم مراجعة بياناته`;
    }

    return {
        is_active: true,
        lifecycle_state: lifecycleState,
        source_term: sourceTerm,
        target_term: targetTerm,
        counts,
        confirmation: confirmation
            ? {
                ...confirmation,
                // Display-only: data changed after the branch confirmed. Never blocks —
                // confirmation is a status flag, not a lock.
                is_stale: Boolean(
                    targetCounts.last_change_at &&
                    new Date(targetCounts.last_change_at) > new Date(confirmation.confirmed_at)
                )
            }
            : null,
        can_confirm: !blockingReason,
        blocking_reason: blockingReason
    };
};

export const getRolloverCandidates = async (branchId, { targetTermId, status } = {}) => {
    const { targetTerm, sourceTerm } = await resolveRolloverTerms(branchId, { targetTermId });
    if (!targetTerm || !sourceTerm) return [];

    const rows = await Beneficiary.findRolloverCandidates(branchId, sourceTerm.id, targetTerm.id);

    if (!status || status === 'all') return rows;
    if (status === 'undecided') return rows.filter(r => !r.continuity_status);
    return rows.filter(r => r.continuity_status === status);
};

/**
 * Copy a branch's buses (and their registration, driver licence, plates and
 * operational details) from the source term into the target term.
 *
 * Document URLs are deliberately NOT copied. DELETE /api/bus-transportation/:id
 * hard-deletes the blob and R2 object behind those URLs with no reference
 * counting, so two rows sharing a URL would mean deleting either bus destroys the
 * other's file. It is also correct on the business side: registration cards and
 * driver licences are renewed annually, so the branch must upload the new year's
 * documents. Verification flags are reset for the same reason.
 *
 * bus_students are not copied either — new-term ridership comes from the
 * continuing beneficiaries who keep transport_service, via POST /:id/assign-bus.
 *
 * Idempotent: UNIQUE(branch_id, bus_number, term_id) is the skip key.
 */
export const carryOverBuses = async ({ branchId, sourceTermId, targetTermId, actor }) => {
    if (!sourceTermId || !targetTermId || sourceTermId === targetTermId) {
        return { copied: 0, skipped: 0 };
    }

    const createdBy = actorUserId(actor);

    return sql.begin(async tx => {
        // Serialise concurrent carries for the same branch+term. Now that this
        // runs automatically from getRolloverStatus, two page loads landing
        // together (the dashboard and the beneficiaries page both read status)
        // would each see zero buses, both build the same skip set, and the
        // slower one would hit UNIQUE(branch_id, bus_number, term_id) and abort
        // its whole transaction. Harmless — it retries on the next read — but
        // guaranteed to happen the morning 20 branches log in at once, and an
        // advisory lock is cheaper than the failed transaction it prevents.
        await tx`SELECT pg_advisory_xact_lock(${sequenceLockKey(branchId, targetTermId)})`;

        const sourceBuses = await tx`
            SELECT id, bus_number FROM bus_transportation
            WHERE branch_id = ${branchId} AND term_id = ${sourceTermId}
            ORDER BY id
        `;
        if (sourceBuses.length === 0) return { copied: 0, skipped: 0 };

        const existing = await tx`
            SELECT bus_number FROM bus_transportation
            WHERE branch_id = ${branchId} AND term_id = ${targetTermId}
        `;
        const existingNumbers = new Set(existing.map(b => b.bus_number));

        let copied = 0;
        let skipped = 0;

        for (const src of sourceBuses) {
            if (existingNumbers.has(src.bus_number)) {
                skipped++;
                continue;
            }

            const [newBus] = await tx`
                INSERT INTO bus_transportation (branch_id, term_id, bus_number, created_by, updated_by)
                VALUES (${branchId}, ${targetTermId}, ${src.bus_number}, ${createdBy}, ${createdBy})
                RETURNING id
            `;

            await tx`
                INSERT INTO bus_registration_data (
                    bus_id, term_id, registration_number, chassis_number,
                    vehicle_model, model_year, vehicle_color, expiry_date_gregorian,
                    is_verified
                )
                SELECT
                    ${newBus.id}, ${targetTermId}, registration_number, chassis_number,
                    vehicle_model, model_year, vehicle_color, expiry_date_gregorian,
                    false
                FROM bus_registration_data WHERE bus_id = ${src.id}
            `;

            await tx`
                INSERT INTO driver_license_data (
                    bus_id, term_id, driver_full_name, driver_id_number, license_number,
                    issue_date_gregorian, expiry_date_gregorian, driver_phone_number,
                    driver_nationality, driver_date_of_birth_gregorian,
                    has_assistant, assistant_full_name, assistant_phone_number,
                    is_verified
                )
                SELECT
                    ${newBus.id}, ${targetTermId}, driver_full_name, driver_id_number, license_number,
                    issue_date_gregorian, expiry_date_gregorian, driver_phone_number,
                    driver_nationality, driver_date_of_birth_gregorian,
                    has_assistant, assistant_full_name, assistant_phone_number,
                    false
                FROM driver_license_data WHERE bus_id = ${src.id}
            `;

            await tx`
                INSERT INTO license_plate_data (bus_id, plate_number, is_primary)
                SELECT ${newBus.id}, plate_number, is_primary
                FROM license_plate_data WHERE bus_id = ${src.id}
            `;

            await tx`
                INSERT INTO bus_details (
                    bus_id, route_name, route_description, number_of_seats, ownership_type,
                    lease_company_name, lease_contact_info, lease_contract_number,
                    lease_start_date_hijri, lease_start_date_gregorian,
                    lease_end_date_hijri, lease_end_date_gregorian,
                    insurance_provider, insurance_policy_number, insurance_expiry_date_gregorian
                )
                SELECT
                    ${newBus.id}, route_name, route_description, number_of_seats, ownership_type,
                    lease_company_name, lease_contact_info, lease_contract_number,
                    lease_start_date_hijri, lease_start_date_gregorian,
                    lease_end_date_hijri, lease_end_date_gregorian,
                    insurance_provider, insurance_policy_number, insurance_expiry_date_gregorian
                FROM bus_details WHERE bus_id = ${src.id}
            `;

            copied++;
        }

        return { copied, skipped };
    });
};

/**
 * Open the rollover for a branch: resolve the terms and carry the buses across.
 * Safe to call repeatedly.
 */
export const startRollover = async ({ branchId, targetTermId, actor }) => {
    const { targetTerm, sourceTerm } = await resolveRolloverTerms(branchId, { targetTermId });
    if (!targetTerm) {
        throw new RolloverError('لا يوجد فصل دراسي للسنة الجديدة. يجب إنشاء السنة الدراسية الجديدة وفصولها أولاً', 400, 'NO_TARGET_TERM');
    }

    let buses = { copied: 0, skipped: 0 };
    if (sourceTerm) {
        buses = await carryOverBuses({
            branchId, sourceTermId: sourceTerm.id, targetTermId: targetTerm.id, actor
        });
    }

    const status = await getRolloverStatus(branchId, { targetTermId: targetTerm.id });
    return { ...status, buses };
};

/**
 * Apply continue / don't-continue decisions to source-term beneficiaries.
 *
 * One transaction, one advisory lock, sequence numbers handed out from an
 * in-transaction counter so they stay contiguous and cannot collide with a
 * concurrent single add. Per-item results rather than throwing, so one awkward
 * row does not abort a bulk decision.
 */
export const applyDecisions = async ({ branchId, targetTermId, decisions, actor }) => {
    const { targetTerm, sourceTerm } = await resolveRolloverTerms(branchId, { targetTermId });
    if (!targetTerm) {
        throw new RolloverError('لا يوجد فصل دراسي للسنة الجديدة. يجب إنشاء السنة الدراسية الجديدة وفصولها أولاً', 400, 'NO_TARGET_TERM');
    }
    if (!sourceTerm) {
        throw new RolloverError('لا توجد بيانات من الفصل السابق', 400, 'NO_SOURCE_TERM');
    }

    const decidedBy = actorUserId(actor);

    return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(${sequenceLockKey(branchId, targetTerm.id)})`;

        const [seq] = await tx`
            SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
            FROM beneficiaries
            WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id}
        `;
        let nextSeq = seq.next_seq;

        const results = [];

        for (const decision of decisions) {
            const beneficiaryId = parseInt(decision.beneficiary_id, 10);
            const verdict = decision.decision;

            if (!beneficiaryId || !['continuing', 'not_continuing'].includes(verdict)) {
                results.push({ beneficiary_id: decision.beneficiary_id, ok: false, error: 'قرار غير صالح' });
                continue;
            }

            const [source] = await tx`
                SELECT id, civil_id, continuity_status FROM beneficiaries
                WHERE id = ${beneficiaryId} AND branch_id = ${branchId} AND term_id = ${sourceTerm.id}
                FOR UPDATE
            `;
            if (!source) {
                results.push({ beneficiary_id: beneficiaryId, ok: false, error: 'المستفيد غير موجود' });
                continue;
            }

            if (verdict === 'not_continuing') {
                const reason = String(decision.reason || '').trim();
                if (reason.length < 3) {
                    results.push({ beneficiary_id: beneficiaryId, ok: false, error: 'يجب تحديد سبب عدم الاستمرار' });
                    continue;
                }

                // Reversing an earlier "continuing" means removing the row we created in
                // the new term — but only while it is untouched and has no bus seat.
                const [target] = await tx`
                    SELECT id, carry_review_status, beneficiary_name FROM beneficiaries
                    WHERE carried_from_beneficiary_id = ${beneficiaryId}
                `;
                if (target) {
                    const [busSeat] = await tx`
                        SELECT bs.id FROM bus_students bs
                        INNER JOIN bus_transportation bt ON bt.id = bs.bus_id
                        WHERE bs.term_id = ${targetTerm.id}
                          AND bt.branch_id = ${branchId}
                          AND LOWER(TRIM(bs.student_full_name)) = LOWER(TRIM(${target.beneficiary_name}))
                    `;
                    if (target.carry_review_status !== 'pending' || busSeat) {
                        results.push({
                            beneficiary_id: beneficiaryId,
                            ok: false,
                            conflict: true,
                            error: 'تم تعديل بيانات المستفيد في الفصل الجديد. يرجى حذفه من قائمة الفصل الجديد أولاً'
                        });
                        continue;
                    }
                    await tx`DELETE FROM beneficiaries WHERE id = ${target.id}`;
                }

                await tx`
                    UPDATE beneficiaries
                    SET continuity_status = 'not_continuing',
                        non_continuation_reason = ${reason},
                        continuity_decided_at = CURRENT_TIMESTAMP,
                        continuity_decided_by = ${decidedBy},
                        continuity_decided_by_branch_id = ${branchId},
                        is_archived = true,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${beneficiaryId}
                `;
                results.push({ beneficiary_id: beneficiaryId, ok: true, decision: 'not_continuing' });
                continue;
            }

            // verdict === 'continuing'
            let [target] = await tx`
                SELECT * FROM beneficiaries WHERE carried_from_beneficiary_id = ${beneficiaryId}
            `;
            let skippedReason = null;

            if (!target) {
                // The branch may already have created this person in the new term by hand
                // or via copy-from-term. Adopt that row instead of inserting a duplicate —
                // (branch_id, term_id, civil_id) is the natural key and is UNIQUE.
                const [existing] = await tx`
                    SELECT * FROM beneficiaries
                    WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id} AND civil_id = ${source.civil_id}
                `;
                if (existing) {
                    await tx`
                        UPDATE beneficiaries
                        SET carried_from_beneficiary_id = ${beneficiaryId}, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ${existing.id}
                    `;
                    target = existing;
                    skippedReason = 'already_present';
                } else {
                    target = await Beneficiary.createFromSource(tx, {
                        sourceId: beneficiaryId,
                        targetTermId: targetTerm.id,
                        sequenceNumber: nextSeq
                    });
                    // createFromSource is ON CONFLICT DO NOTHING, so an unexpected
                    // conflict yields null. Falling through would mark the source
                    // "continuing" with NO row in the new term — the beneficiary
                    // silently vanishes, and pending_review (which only counts
                    // target rows) would not catch it, so the branch could confirm
                    // 100% with someone missing. Fail this row loudly instead.
                    if (!target) {
                        results.push({
                            beneficiary_id: beneficiaryId,
                            ok: false,
                            error: 'تعذر نقل المستفيد إلى الفصل الجديد. يرجى المحاولة مرة أخرى'
                        });
                        continue;
                    }
                    nextSeq++;
                }
            } else {
                skippedReason = 'already_carried';
            }

            await tx`
                UPDATE beneficiaries
                SET continuity_status = 'continuing',
                    non_continuation_reason = NULL,
                    continuity_decided_at = CURRENT_TIMESTAMP,
                    continuity_decided_by = ${decidedBy},
                    continuity_decided_by_branch_id = ${branchId},
                    is_archived = true,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${beneficiaryId}
            `;

            results.push({
                beneficiary_id: beneficiaryId,
                ok: true,
                decision: 'continuing',
                target_id: target?.id || null,
                // Full row so the client can move straight to the review step
                // without another round-trip.
                target: target || null,
                skipped_reason: skippedReason
            });
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
 * Set, change or clear which bus a beneficiary rides in the target term.
 *
 * bus_students has no FK to beneficiaries — the two are linked by normalised
 * name, which is the rule the import and assign endpoints already use. So
 * "changing" a bus means removing the beneficiary's existing seat for that term
 * and creating a new one, which has to be atomic or a failed insert would leave
 * them with no seat at all.
 *
 * Passing busId = null just clears the seat (the beneficiary dropped transport).
 */
export const setBeneficiaryBus = async ({ branchId, beneficiaryId, busId, actor }) => {
    const [beneficiary] = await sql`
        SELECT * FROM beneficiaries WHERE id = ${beneficiaryId} AND branch_id = ${branchId}
    `;
    if (!beneficiary) {
        throw new RolloverError('المستفيد غير موجود', 404, 'BENEFICIARY_NOT_FOUND');
    }

    if (busId) {
        const [bus] = await sql`
            SELECT id, branch_id, term_id FROM bus_transportation WHERE id = ${busId}
        `;
        if (!bus) throw new RolloverError('الحافلة غير موجودة', 404, 'BUS_NOT_FOUND');
        if (bus.branch_id !== beneficiary.branch_id) {
            throw new RolloverError('لا يمكن تعيين مستفيد لحافلة في فرع آخر', 400, 'BUS_WRONG_BRANCH');
        }
        if (bus.term_id !== beneficiary.term_id) {
            throw new RolloverError('الحافلة تتبع فصلاً دراسياً مختلفاً', 400, 'BUS_WRONG_TERM');
        }
    }

    const name = (beneficiary.beneficiary_name || '').trim().toLowerCase();

    return sql.begin(async tx => {
        await tx`
            DELETE FROM bus_students bs
            USING bus_transportation bt
            WHERE bs.bus_id = bt.id
              AND bt.branch_id = ${branchId}
              AND bs.term_id = ${beneficiary.term_id}
              AND LOWER(TRIM(bs.student_full_name)) = ${name}
        `;

        if (!busId) return { assigned: false, bus_id: null };

        const [student] = await tx`
            INSERT INTO bus_students (bus_id, term_id, student_full_name, contact_mobile_number, address, created_by)
            VALUES (${busId}, ${beneficiary.term_id}, ${beneficiary.beneficiary_name},
                    ${beneficiary.contact_number || ''}, '', ${actorUserId(actor)})
            RETURNING *
        `;
        return { assigned: true, bus_id: busId, student };
    });
};

/**
 * Record that a branch finished 100% of its beneficiary updates for the term.
 * Upsert, so re-confirming refreshes the timestamp and bumps the counter instead
 * of failing. Does not lock anything — the branch may keep editing.
 */
export const confirmReview = async ({ branchId, targetTermId, note, actor }) => {
    const status = await getRolloverStatus(branchId, { targetTermId });
    if (!status.is_active) {
        throw new RolloverError('لا يوجد فصل دراسي للسنة الجديدة. يجب إنشاء السنة الدراسية الجديدة وفصولها أولاً', 400, 'NO_TARGET_TERM');
    }
    if (!status.can_confirm) {
        throw new RolloverError(`لا يمكن التأكيد: ${status.blocking_reason}`, 400, 'REVIEW_INCOMPLETE');
    }

    const [branch] = await sql`SELECT branch_name FROM branches WHERE id = ${branchId}`;

    const [confirmation] = await sql`
        INSERT INTO beneficiary_review_confirmations (
            branch_id, term_id, source_term_id,
            confirmed_by_user_id, confirmed_by_branch_id, confirmed_by_label,
            total_continuing, total_not_continuing, total_new, note
        )
        VALUES (
            ${branchId}, ${status.target_term.id}, ${status.source_term?.id || null},
            ${actorUserId(actor)}, ${branchId}, ${actorLabel(actor, branch?.branch_name)},
            ${status.counts.continuing}, ${status.counts.not_continuing}, ${status.counts.new_in_target},
            ${note || null}
        )
        ON CONFLICT (branch_id, term_id) DO UPDATE SET
            confirmed_at = CURRENT_TIMESTAMP,
            confirmation_count = beneficiary_review_confirmations.confirmation_count + 1,
            source_term_id = EXCLUDED.source_term_id,
            confirmed_by_user_id = EXCLUDED.confirmed_by_user_id,
            confirmed_by_branch_id = EXCLUDED.confirmed_by_branch_id,
            confirmed_by_label = EXCLUDED.confirmed_by_label,
            total_continuing = EXCLUDED.total_continuing,
            total_not_continuing = EXCLUDED.total_not_continuing,
            total_new = EXCLUDED.total_new,
            note = EXCLUDED.note,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;

    log.info('Beneficiary review confirmed', { branchId, termId: status.target_term.id });
    return confirmation;
};

export const unconfirmReview = async ({ branchId, targetTermId }) => {
    const { targetTerm } = await resolveRolloverTerms(branchId, { targetTermId });
    if (!targetTerm) {
        throw new RolloverError('لا يوجد فصل دراسي للسنة الجديدة', 400, 'NO_TARGET_TERM');
    }

    const [removed] = await sql`
        DELETE FROM beneficiary_review_confirmations
        WHERE branch_id = ${branchId} AND term_id = ${targetTerm.id}
        RETURNING id
    `;
    if (!removed) {
        throw new RolloverError('لا يوجد تأكيد لإلغائه', 404, 'NO_CONFIRMATION');
    }
    return removed;
};

/**
 * Per-branch rollover progress for the main manager. LEFT JOINs from branches so
 * branches that have done nothing still show up (as unconfirmed).
 */
export const getRolloverOverview = async (targetTermId) => {
    if (!targetTermId) {
        throw new RolloverError('يجب تحديد الفصل الدراسي', 400, 'NO_TERM');
    }

    const [targetTerm] = await sql`
        SELECT * FROM terms WHERE id = ${targetTermId} AND branch_type = 'healthcare_center'
    `;
    if (!targetTerm) {
        throw new RolloverError('الفصل الدراسي غير موجود', 404, 'TERM_NOT_FOUND');
    }

    // The source term is resolved per branch (each may have last entered data in a
    // different term), so aggregate over "every earlier term" and take the latest
    // one that actually holds data for that branch.
    return await sql`
        WITH source_terms AS (
            SELECT b.branch_id, b.term_id,
                   ROW_NUMBER() OVER (PARTITION BY b.branch_id ORDER BY t.end_date DESC) AS rn
            FROM beneficiaries b
            INNER JOIN terms t ON t.id = b.term_id
            WHERE t.branch_type = 'healthcare_center'
              AND t.id <> ${targetTerm.id}
              AND t.end_date < ${targetTerm.start_date}
            GROUP BY b.branch_id, b.term_id, t.end_date
        ),
        latest_source AS (
            SELECT branch_id, term_id FROM source_terms WHERE rn = 1
        ),
        src AS (
            SELECT b.branch_id,
                   COUNT(*)::int AS source_total,
                   COUNT(*) FILTER (WHERE b.continuity_status IS NULL)::int AS undecided,
                   COUNT(*) FILTER (WHERE b.continuity_status = 'continuing')::int AS continuing,
                   COUNT(*) FILTER (WHERE b.continuity_status = 'not_continuing')::int AS not_continuing
            FROM beneficiaries b
            INNER JOIN latest_source ls ON ls.branch_id = b.branch_id AND ls.term_id = b.term_id
            GROUP BY b.branch_id
        ),
        tgt AS (
            SELECT branch_id,
                   COUNT(*)::int AS target_total,
                   COUNT(*) FILTER (WHERE carry_review_status = 'pending')::int AS pending_review,
                   COUNT(*) FILTER (WHERE carried_from_beneficiary_id IS NULL)::int AS new_in_target
            FROM beneficiaries
            WHERE term_id = ${targetTerm.id} AND is_archived = false
            GROUP BY branch_id
        )
        SELECT
            br.id AS branch_id,
            br.branch_name,
            COALESCE(src.source_total, 0) AS source_total,
            COALESCE(src.undecided, 0) AS undecided,
            COALESCE(src.continuing, 0) AS continuing,
            COALESCE(src.not_continuing, 0) AS not_continuing,
            COALESCE(src.continuing, 0) + COALESCE(src.not_continuing, 0) AS decided,
            COALESCE(tgt.target_total, 0) AS target_total,
            COALESCE(tgt.pending_review, 0) AS pending_review,
            COALESCE(tgt.new_in_target, 0) AS new_in_target,
            c.confirmed_at,
            c.confirmed_by_label,
            c.confirmation_count,
            c.note,
            (c.id IS NOT NULL) AS is_confirmed
        FROM branches br
        LEFT JOIN src ON src.branch_id = br.id
        LEFT JOIN tgt ON tgt.branch_id = br.id
        LEFT JOIN beneficiary_review_confirmations c
               ON c.branch_id = br.id AND c.term_id = ${targetTerm.id}
        WHERE br.branch_type = 'healthcare_center' AND br.is_active = true
        ORDER BY br.branch_name
    `;
};

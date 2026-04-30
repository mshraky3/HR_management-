/**
 * Term Lifecycle Service
 * Centralizes deterministic term/year state resolution and year-end transitions.
 */

import sql from '../config/database.js';

const validBranchTypes = ['school', 'healthcare_center'];

const ensureBranchType = (branchType) => {
    if (!validBranchTypes.includes(branchType)) {
        throw new Error('Invalid branch type');
    }
};

export const getCurrentTermWithState = async (branchType) => {
    ensureBranchType(branchType);
    const now = new Date();

    const [current] = await sql`
    SELECT * FROM terms
    WHERE branch_type = ${branchType}
      AND is_active = true
      AND start_date <= ${now}
      AND end_date >= ${now}
    ORDER BY academic_year_start DESC, term_number DESC, start_date DESC
    LIMIT 1
  `;

    if (current) {
        return { term: current, lifecycleState: 'current_term' };
    }

    const [upcoming] = await sql`
    SELECT * FROM terms
    WHERE branch_type = ${branchType}
      AND is_active = true
      AND start_date > ${now}
    ORDER BY start_date ASC
    LIMIT 1
  `;

    if (upcoming) {
        return { term: upcoming, lifecycleState: 'next_term' };
    }

    const [recent] = await sql`
    SELECT * FROM terms
    WHERE branch_type = ${branchType}
      AND is_active = true
      AND end_date < ${now}
    ORDER BY end_date DESC
    LIMIT 1
  `;

    if (recent) {
        return { term: recent, lifecycleState: 'recent_term' };
    }

    return { term: null, lifecycleState: 'no_term' };
};

export const getCurrentAcademicYearWithState = async (branchType) => {
    ensureBranchType(branchType);
    const now = new Date();

    const [flagged] = await sql`
    SELECT ay.*, 
           t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
           t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
    FROM academic_years ay
    LEFT JOIN terms t1 ON ay.term1_id = t1.id
    LEFT JOIN terms t2 ON ay.term2_id = t2.id
    WHERE ay.branch_type = ${branchType}
      AND ay.is_current = true
    LIMIT 1
  `;

    if (flagged) {
        return { year: flagged, lifecycleState: 'current_academic_year' };
    }

    const [byDate] = await sql`
    SELECT ay.*, 
           t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
           t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
    FROM academic_years ay
    LEFT JOIN terms t1 ON ay.term1_id = t1.id
    LEFT JOIN terms t2 ON ay.term2_id = t2.id
    WHERE ay.branch_type = ${branchType}
      AND ay.year_start <= ${now}
      AND ay.year_end >= ${now}
      AND ay.is_completed = false
    ORDER BY ay.year_start DESC
    LIMIT 1
  `;

    if (byDate) {
        return { year: byDate, lifecycleState: 'current_by_date' };
    }

    const [nextYear] = await sql`
    SELECT ay.*, 
           t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
           t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
    FROM academic_years ay
    LEFT JOIN terms t1 ON ay.term1_id = t1.id
    LEFT JOIN terms t2 ON ay.term2_id = t2.id
    WHERE ay.branch_type = ${branchType}
      AND ay.is_completed = false
      AND ay.year_start > ${now}
    ORDER BY ay.year_start ASC
    LIMIT 1
  `;

    if (nextYear) {
        return { year: nextYear, lifecycleState: 'next_academic_year' };
    }

    const [recent] = await sql`
    SELECT ay.*, 
           t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
           t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
    FROM academic_years ay
    LEFT JOIN terms t1 ON ay.term1_id = t1.id
    LEFT JOIN terms t2 ON ay.term2_id = t2.id
    WHERE ay.branch_type = ${branchType}
    ORDER BY ay.year_end DESC
    LIMIT 1
  `;

    if (recent) {
        return { year: recent, lifecycleState: 'completed_year' };
    }

    return { year: null, lifecycleState: 'no_year' };
};

export const endAcademicYearTransactional = async (yearId, branchType) => {
    ensureBranchType(branchType);

    return sql.begin(async (tx) => {
        const [year] = await tx`
      SELECT * FROM academic_years
      WHERE id = ${yearId}
      FOR UPDATE
    `;

        if (!year) {
            throw new Error('Academic year not found');
        }

        if (year.branch_type !== branchType) {
            throw new Error('Branch type mismatch');
        }

        const employeesResult = await tx`
      UPDATE employees
      SET status = 'pending',
          is_active = true,
          status_changed_at = CURRENT_TIMESTAMP,
          status_changed_by = branch_id,
          status_change_reason = 'نهاية السنة الدراسية'
      WHERE branch_id IN (
        SELECT id FROM branches WHERE branch_type = ${branchType}
      )
      AND status = 'active'
      AND is_active = true
    `;

        await tx`
      UPDATE academic_years
      SET is_completed = true,
          is_current = false,
          completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${yearId}
    `;

        await tx`
      UPDATE terms
      SET is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE branch_type = ${branchType}
        AND academic_year_label = ${year.year_label}
        AND is_active = true
    `;

        const [nextYear] = await tx`
      SELECT id, year_label
      FROM academic_years
      WHERE branch_type = ${branchType}
        AND is_completed = false
        AND id != ${yearId}
        AND year_start > ${year.year_end}
      ORDER BY year_start ASC
      LIMIT 1
    `;

        let activatedNextYearId = null;

        if (nextYear) {
            activatedNextYearId = nextYear.id;

            await tx`
        UPDATE academic_years
        SET is_current = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE branch_type = ${branchType}
          AND id != ${activatedNextYearId}
          AND is_current = true
      `;

            await tx`
        UPDATE academic_years
        SET is_current = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${activatedNextYearId}
      `;

            await tx`
        UPDATE terms
        SET is_active = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE branch_type = ${branchType}
          AND academic_year_label = ${nextYear.year_label}
      `;
        }

        return {
            success: true,
            employeesUpdated: Number(employeesResult.count || 0),
            completedYearId: yearId,
            nextYearActivatedId: activatedNextYearId,
        };
    });
};

/**
 * Employee Expiry Service
 * Shared query layer for all employee-related expiry date checks.
 * Used by: employee-expiry routes, daily alerts, dashboard task generation.
 */

import sql from '../config/database.js';
import { log } from './logger.js';

/**
 * Normalize all employee expiry sources into a unified record shape.
 * Returns rows with: employee info, branch info, expiry_type, expiry_date, days_until_expiry, status_bucket.
 *
 * @param {Object} opts
 * @param {number} [opts.branchId] - Filter to a single branch
 * @param {string} [opts.expiryType] - Filter to a specific expiry type
 * @param {string} [opts.statusBucket] - 'expired' | 'within_30_days' | 'within_90_days' | 'ok'
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{data: Array, total: number, summary: Object}>}
 */
export async function getEmployeeExpiries({ branchId, expiryType, statusBucket, limit, offset } = {}) {
  try {
    // Build branch filter fragment
    const branchFilter = branchId ? sql`AND e.branch_id = ${branchId}` : sql``;

    // Unified CTE that normalizes all expiry sources
    const rows = await sql`
      WITH expiry_union AS (
        -- ID / Residency expiry
        SELECT
          e.id AS employee_id,
          e.employee_id_number,
          e.first_name,
          e.second_name,
          e.third_name,
          e.fourth_name,
          e.id_or_residency_number,
          e.branch_id,
          b.branch_name,
          'id_expiry' AS expiry_type,
          'انتهاء الهوية/الإقامة' AS expiry_type_label,
          e.id_expiry_date_gregorian::date AS expiry_date,
          e.id_expiry_date_hijri AS expiry_date_hijri,
          NULL::int AS document_id,
          NULL::text AS document_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.id_expiry_date_gregorian IS NOT NULL
          ${branchFilter}

        UNION ALL

        -- Contract end date
        SELECT
          e.id,
          e.employee_id_number,
          e.first_name,
          e.second_name,
          e.third_name,
          e.fourth_name,
          e.id_or_residency_number,
          e.branch_id,
          b.branch_name,
          'contract_end' AS expiry_type,
          'انتهاء العقد' AS expiry_type_label,
          e.contract_end_date_gregorian::date AS expiry_date,
          e.contract_end_date_hijri AS expiry_date_hijri,
          NULL::int AS document_id,
          NULL::text AS document_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.contract_end_date_gregorian IS NOT NULL
          ${branchFilter}

        UNION ALL

        -- Passport expiry (stored as VARCHAR, cast to date where possible)
        SELECT
          e.id,
          e.employee_id_number,
          e.first_name,
          e.second_name,
          e.third_name,
          e.fourth_name,
          e.id_or_residency_number,
          e.branch_id,
          b.branch_name,
          'passport_expiry' AS expiry_type,
          'انتهاء الجواز' AS expiry_type_label,
          CASE
            WHEN e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN e.passport_expiry_date::text::date
            ELSE NULL
          END AS expiry_date,
          NULL AS expiry_date_hijri,
          NULL::int AS document_id,
          NULL::text AS document_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.passport_expiry_date IS NOT NULL
          AND e.passport_expiry_date::text != ''
          AND e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          ${branchFilter}

        UNION ALL

        -- Employee document expiry dates
        SELECT
          e.id,
          e.employee_id_number,
          e.first_name,
          e.second_name,
          e.third_name,
          e.fourth_name,
          e.id_or_residency_number,
          e.branch_id,
          b.branch_name,
          'document_expiry' AS expiry_type,
          'انتهاء مستند: ' || COALESCE(ed.document_type, 'غير محدد') AS expiry_type_label,
          ed.expiry_date::date AS expiry_date,
          ed.expiry_date_hijri AS expiry_date_hijri,
          ed.id AS document_id,
          ed.document_type AS document_type
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND ed.is_active = true
          AND ed.expiry_date IS NOT NULL
          ${branchFilter}
      ),
      classified AS (
        SELECT *,
          (expiry_date - CURRENT_DATE) AS days_until_expiry,
          CASE
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'within_30_days'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'within_90_days'
            ELSE 'ok'
          END AS status_bucket
        FROM expiry_union
        WHERE expiry_date IS NOT NULL
      )
      SELECT * FROM classified
      WHERE 1=1
        ${expiryType ? sql`AND expiry_type = ${expiryType}` : sql``}
        ${statusBucket ? sql`AND status_bucket = ${statusBucket}` : sql``}
      ORDER BY days_until_expiry ASC, branch_name ASC
      ${limit ? sql`LIMIT ${limit}` : sql``}
      ${offset ? sql`OFFSET ${offset}` : sql``}
    `;

    // Get total count (without limit/offset)
    const [countResult] = await sql`
      WITH expiry_union AS (
        SELECT e.id AS employee_id, e.id_expiry_date_gregorian::date AS expiry_date, 'id_expiry' AS expiry_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.id_expiry_date_gregorian IS NOT NULL
          ${branchFilter}

        UNION ALL

        SELECT e.id, e.contract_end_date_gregorian::date, 'contract_end'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.contract_end_date_gregorian IS NOT NULL
          ${branchFilter}

        UNION ALL

        SELECT e.id, CASE WHEN e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN e.passport_expiry_date::text::date ELSE NULL END, 'passport_expiry'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.passport_expiry_date IS NOT NULL AND e.passport_expiry_date::text != ''
          AND e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          ${branchFilter}

        UNION ALL

        SELECT e.id, ed.expiry_date::date, 'document_expiry'
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND ed.is_active = true AND ed.expiry_date IS NOT NULL
          ${branchFilter}
      ),
      classified AS (
        SELECT *,
          CASE
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'within_30_days'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'within_90_days'
            ELSE 'ok'
          END AS status_bucket
        FROM expiry_union
        WHERE expiry_date IS NOT NULL
      )
      SELECT COUNT(*)::int AS total FROM classified
      WHERE 1=1
        ${expiryType ? sql`AND expiry_type = ${expiryType}` : sql``}
        ${statusBucket ? sql`AND status_bucket = ${statusBucket}` : sql``}
    `;

    return {
      data: rows,
      total: countResult?.total || 0,
    };
  } catch (error) {
    log.error('Failed to query employee expiries', { error: error.message });
    throw error;
  }
}

/**
 * Get summary counts grouped by status_bucket and expiry_type.
 * @param {Object} opts
 * @param {number} [opts.branchId]
 */
export async function getExpirySummary({ branchId } = {}) {
  try {
    const branchFilter = branchId ? sql`AND e.branch_id = ${branchId}` : sql``;

    const rows = await sql`
      WITH expiry_union AS (
        SELECT e.branch_id, e.id_expiry_date_gregorian::date AS expiry_date, 'id_expiry' AS expiry_type, 'انتهاء الهوية/الإقامة' AS expiry_type_label
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.id_expiry_date_gregorian IS NOT NULL ${branchFilter}

        UNION ALL

        SELECT e.branch_id, e.contract_end_date_gregorian::date, 'contract_end', 'انتهاء العقد'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.contract_end_date_gregorian IS NOT NULL ${branchFilter}

        UNION ALL

        SELECT e.branch_id,
          CASE WHEN e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN e.passport_expiry_date::text::date ELSE NULL END,
          'passport_expiry', 'انتهاء الجواز'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.passport_expiry_date IS NOT NULL AND e.passport_expiry_date::text != ''
          AND e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' ${branchFilter}

        UNION ALL

        SELECT e.branch_id, ed.expiry_date::date, 'document_expiry', 'انتهاء مستند'
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND ed.is_active = true AND ed.expiry_date IS NOT NULL ${branchFilter}
      ),
      classified AS (
        SELECT *,
          CASE
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'within_30_days'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'within_90_days'
            ELSE 'ok'
          END AS status_bucket
        FROM expiry_union
        WHERE expiry_date IS NOT NULL
      )
      SELECT
        expiry_type,
        expiry_type_label,
        status_bucket,
        COUNT(*)::int AS count
      FROM classified
      GROUP BY expiry_type, expiry_type_label, status_bucket
      ORDER BY expiry_type, status_bucket
    `;

    // Also get per-branch summary for expired + within_30_days (for notifications)
    const branchRows = await sql`
      WITH expiry_union AS (
        SELECT e.branch_id, e.id_expiry_date_gregorian::date AS expiry_date, 'id_expiry' AS expiry_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.id_expiry_date_gregorian IS NOT NULL ${branchFilter}
        UNION ALL
        SELECT e.branch_id, e.contract_end_date_gregorian::date, 'contract_end'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.contract_end_date_gregorian IS NOT NULL ${branchFilter}
        UNION ALL
        SELECT e.branch_id,
          CASE WHEN e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN e.passport_expiry_date::text::date ELSE NULL END,
          'passport_expiry'
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.passport_expiry_date IS NOT NULL AND e.passport_expiry_date::text != ''
          AND e.passport_expiry_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' ${branchFilter}
        UNION ALL
        SELECT e.branch_id, ed.expiry_date::date, 'document_expiry'
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        INNER JOIN branches b ON e.branch_id = b.id AND b.is_active = true
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND ed.is_active = true AND ed.expiry_date IS NOT NULL ${branchFilter}
      ),
      classified AS (
        SELECT *,
          CASE
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'within_30_days'
            ELSE NULL
          END AS alert_bucket
        FROM expiry_union
        WHERE expiry_date IS NOT NULL
          AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
      )
      SELECT
        branch_id,
        b.branch_name,
        b.email AS branch_email,
        COUNT(*) FILTER (WHERE alert_bucket = 'expired')::int AS expired_count,
        COUNT(*) FILTER (WHERE alert_bucket = 'within_30_days')::int AS expiring_soon_count
      FROM classified
      INNER JOIN branches b ON classified.branch_id = b.id
      GROUP BY branch_id, b.branch_name, b.email
      ORDER BY expired_count DESC, expiring_soon_count DESC
    `;

    // Flatten summary into totals
    const totals = {
      expired: 0,
      within_30_days: 0,
      within_90_days: 0,
      ok: 0,
    };
    const byType = {};

    for (const row of rows) {
      totals[row.status_bucket] = (totals[row.status_bucket] || 0) + row.count;
      if (!byType[row.expiry_type]) {
        byType[row.expiry_type] = { label: row.expiry_type_label, expired: 0, within_30_days: 0, within_90_days: 0, ok: 0 };
      }
      byType[row.expiry_type][row.status_bucket] = row.count;
    }

    return {
      totals,
      byType,
      byBranch: branchRows,
    };
  } catch (error) {
    log.error('Failed to get expiry summary', { error: error.message });
    throw error;
  }
}

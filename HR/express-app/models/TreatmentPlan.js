/**
 * TreatmentPlan Model
 * Handles database operations for treatment/educational plan submissions
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const STATUS_OPTIONS = {
    pending: 'قيد الانتظار',
    reviewed: 'تمت المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض'
};

const maybeFixMojibakeFilename = (filename) => {
    if (!filename || typeof filename !== 'string') return filename;

    // Common pattern when UTF-8 Arabic text was decoded as latin1 (e.g. "Ø§Ù...").
    const looksMojibake = /[ØÙÃÂÐ]/.test(filename) || /[\x80-\x9F]/.test(filename);
    if (!looksMojibake) return filename;

    try {
        const fixed = Buffer.from(filename, 'latin1').toString('utf8').trim();
        if (!fixed || fixed.includes('�')) return filename;
        return fixed;
    } catch {
        return filename;
    }
};

const normalizePlanRecord = (plan) => ({
    ...plan,
    original_filename: maybeFixMojibakeFilename(plan.original_filename),
});

const TreatmentPlan = {
    getStatusOptions() {
        return STATUS_OPTIONS;
    },

    async findAll(filters = {}) {
        try {
            const conditions = [sql`1=1`];

            if (filters.branch_id) {
                conditions.push(sql`tp.branch_id = ${filters.branch_id}`);
            }
            if (filters.job_title) {
                conditions.push(sql`tp.job_title = ${filters.job_title}`);
            }
            if (filters.department) {
                conditions.push(sql`tp.department = ${filters.department}`);
            }
            if (filters.status) {
                conditions.push(sql`tp.status = ${filters.status}`);
            }

            // Build WHERE clause by combining conditions
            let whereClause = conditions[0];
            for (let i = 1; i < conditions.length; i++) {
                whereClause = sql`${whereClause} AND ${conditions[i]}`;
            }

            const plans = await sql`
        SELECT 
          tp.*,
          b.branch_name,
          u.username as reviewer_name
        FROM treatment_plans tp
        LEFT JOIN branches b ON tp.branch_id = b.id
        LEFT JOIN users u ON tp.reviewed_by = u.id
        WHERE ${whereClause}
        ORDER BY tp.created_at DESC
      `;
            return plans.map(normalizePlanRecord);
        } catch (error) {
            log.error('Error finding treatment plans', { error: error.message });
            throw error;
        }
    },

    async findById(id) {
        try {
            const [plan] = await sql`
        SELECT 
          tp.*,
          b.branch_name,
          u.username as reviewer_name
        FROM treatment_plans tp
        LEFT JOIN branches b ON tp.branch_id = b.id
        LEFT JOIN users u ON tp.reviewed_by = u.id
        WHERE tp.id = ${id}
      `;
            return plan ? normalizePlanRecord(plan) : null;
        } catch (error) {
            log.error('Error finding treatment plan by ID', { id, error: error.message });
            throw error;
        }
    },

    async create(data) {
        try {
            const {
                employee_name, branch_id, job_title, department, plan_type,
                file_url, r2_url, original_filename, file_size, notes
            } = data;

            const normalizedFilename = maybeFixMojibakeFilename(original_filename);

            const [plan] = await sql`
        INSERT INTO treatment_plans (
          employee_name, branch_id, job_title, department, plan_type,
          file_url, r2_url, original_filename, file_size, notes
        )
        VALUES (
          ${employee_name}, ${branch_id}, ${job_title}, ${department}, ${plan_type},
                    ${file_url || null}, ${r2_url || null}, ${normalizedFilename || null}, 
          ${file_size || null}, ${notes || null}
        )
        RETURNING *
      `;
            return normalizePlanRecord(plan);
        } catch (error) {
            log.error('Error creating treatment plan', { error: error.message });
            throw error;
        }
    },

    async updateStatus(id, status, reviewedBy, reviewNotes) {
        try {
            const [plan] = await sql`
        UPDATE treatment_plans
        SET 
          status = ${status},
          reviewed_by = ${reviewedBy},
          reviewed_at = NOW(),
          review_notes = ${reviewNotes || null},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
            return plan;
        } catch (error) {
            log.error('Error updating treatment plan status', { id, error: error.message });
            throw error;
        }
    },

    async getStats() {
        try {
            const byStatus = await sql`
        SELECT status, COUNT(*)::int as count
        FROM treatment_plans
        GROUP BY status
      `;

            const byDepartment = await sql`
        SELECT department, COUNT(*)::int as count
        FROM treatment_plans
        GROUP BY department
        ORDER BY count DESC
      `;

            const byBranch = await sql`
        SELECT tp.branch_id, b.branch_name, COUNT(*)::int as count
        FROM treatment_plans tp
        LEFT JOIN branches b ON tp.branch_id = b.id
        GROUP BY tp.branch_id, b.branch_name
        ORDER BY count DESC
      `;

            const [total] = await sql`
        SELECT COUNT(*)::int as total FROM treatment_plans
      `;

            return {
                total: total.total,
                byStatus,
                byDepartment,
                byBranch
            };
        } catch (error) {
            log.error('Error getting treatment plan stats', { error: error.message });
            throw error;
        }
    },

    async delete(id) {
        try {
            const [plan] = await sql`
        DELETE FROM treatment_plans WHERE id = ${id} RETURNING *
      `;
            return plan;
        } catch (error) {
            log.error('Error deleting treatment plan', { id, error: error.message });
            throw error;
        }
    }
};

export default TreatmentPlan;

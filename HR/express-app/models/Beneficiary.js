/**
 * Beneficiary Model
 * Handles all database operations for the beneficiaries table
 * Used by healthcare center branches to register beneficiaries and their services
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const Beneficiary = {
    /**
     * Get the next sequence number for a branch+term combo
     */
    async getNextSequenceNumber(branchId, termId) {
        try {
            const [result] = await sql`
        SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
        FROM beneficiaries
        WHERE branch_id = ${branchId} AND term_id = ${termId}
      `;
            return result.next_seq;
        } catch (error) {
            log.error('Error getting next sequence number:', error);
            throw error;
        }
    },

    /**
     * Find all beneficiaries with optional filters and pagination
     */
    async findAll(filters = {}) {
        try {
            const { branch_id, term_id, is_archived = false, gender, enrollment_period, page, limit } = filters;

            // Build dynamic WHERE clause
            const conditions = [];
            const values = [];
            let paramIndex = 1;

            conditions.push(`b_data.is_archived = $${paramIndex++}`);
            values.push(is_archived);

            if (branch_id) {
                conditions.push(`b_data.branch_id = $${paramIndex++}`);
                values.push(branch_id);
            }
            if (term_id) {
                conditions.push(`b_data.term_id = $${paramIndex++}`);
                values.push(term_id);
            }
            if (gender) {
                conditions.push(`b_data.gender = $${paramIndex++}`);
                values.push(gender);
            }
            if (enrollment_period) {
                conditions.push(`b_data.enrollment_period = $${paramIndex++}`);
                values.push(enrollment_period);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Pagination
            let limitClause = '';
            let offsetClause = '';
            if (page && limit) {
                const pageNum = Math.max(1, parseInt(page) || 1);
                const limitNum = Math.min(Math.max(1, parseInt(limit) || 1), 1000);
                const offset = (pageNum - 1) * limitNum;
                limitClause = `LIMIT $${paramIndex++}`;
                values.push(limitNum);
                offsetClause = `OFFSET $${paramIndex++}`;
                values.push(offset);
            }

            const query = `
        SELECT 
          b_data.*,
          br.branch_name,
          t.term_name,
          t.term_number,
          t.academic_year_label
        FROM beneficiaries b_data
        LEFT JOIN branches br ON b_data.branch_id = br.id
        LEFT JOIN terms t ON b_data.term_id = t.id
        ${whereClause}
        ORDER BY b_data.branch_id, b_data.sequence_number
        ${limitClause} ${offsetClause}
      `;

            const rows = await sql.unsafe(query, values);

            // Get total count for pagination
            const countQuery = `
        SELECT COUNT(*) as total
        FROM beneficiaries b_data
        ${whereClause}
      `;
            const countValues = values.slice(0, conditions.length);
            const [countResult] = await sql.unsafe(countQuery, countValues);

            return {
                data: rows,
                total: parseInt(countResult.total),
                page: page ? parseInt(page) : 1,
                limit: limit ? parseInt(limit) : rows.length
            };
        } catch (error) {
            log.error('Error finding beneficiaries:', error);
            throw error;
        }
    },

    /**
     * Find a single beneficiary by ID
     */
    async findById(id) {
        try {
            const [row] = await sql`
        SELECT 
          b_data.*,
          br.branch_name,
          t.term_name,
          t.term_number,
          t.academic_year_label
        FROM beneficiaries b_data
        LEFT JOIN branches br ON b_data.branch_id = br.id
        LEFT JOIN terms t ON b_data.term_id = t.id
        WHERE b_data.id = ${id}
      `;
            return row || null;
        } catch (error) {
            log.error('Error finding beneficiary by ID:', error);
            throw error;
        }
    },

    /**
     * Create a new beneficiary
     */
    async create(data) {
        try {
            const [row] = await sql.begin(async tx => {
                // Advisory lock keyed on branch_id + term_id to prevent race conditions
                await tx`SELECT pg_advisory_xact_lock(${data.branch_id * 100000 + data.term_id})`;
                const [seqResult] = await tx`
                    SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
                    FROM beneficiaries
                    WHERE branch_id = ${data.branch_id} AND term_id = ${data.term_id}
                `;
                const sequenceNumber = seqResult.next_seq;

                return tx`
                    INSERT INTO beneficiaries (
                      branch_id, term_id, sequence_number, beneficiary_number, enrollment_period,
                      beneficiary_name, civil_id, contact_number, gender, age,
                      speech_therapy, physical_therapy, occupational_therapy,
                      autism_therapy, transport_service, free_student, notes
                    ) VALUES (
                      ${data.branch_id}, ${data.term_id}, ${sequenceNumber}, ${data.beneficiary_number}, ${data.enrollment_period},
                      ${data.beneficiary_name}, ${data.civil_id}, ${data.contact_number}, ${data.gender}, ${data.age},
                      ${data.speech_therapy || false}, ${data.physical_therapy || false}, ${data.occupational_therapy || false},
                      ${data.autism_therapy || false}, ${data.transport_service || false}, ${data.free_student || false}, ${data.notes || null}
                    ) RETURNING *
                `;
            });
            return row;
        } catch (error) {
            log.error('Error creating beneficiary:', error);
            throw error;
        }
    },

    /**
     * Update a beneficiary
     */
    async update(id, data) {
        try {
            const [row] = await sql`
        UPDATE beneficiaries SET
          beneficiary_number = ${data.beneficiary_number},
          enrollment_period = ${data.enrollment_period},
          beneficiary_name = ${data.beneficiary_name},
          civil_id = ${data.civil_id},
          contact_number = ${data.contact_number},
          gender = ${data.gender},
          age = ${data.age},
          speech_therapy = ${data.speech_therapy || false},
          physical_therapy = ${data.physical_therapy || false},
          occupational_therapy = ${data.occupational_therapy || false},
          autism_therapy = ${data.autism_therapy || false},
          transport_service = ${data.transport_service || false},
          free_student = ${data.free_student || false},
          notes = ${data.notes || null},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
            return row || null;
        } catch (error) {
            log.error('Error updating beneficiary:', error);
            throw error;
        }
    },

    /**
     * Delete a beneficiary
     */
    async delete(id) {
        try {
            const [row] = await sql`
        DELETE FROM beneficiaries WHERE id = ${id} RETURNING *
      `;
            return row || null;
        } catch (error) {
            log.error('Error deleting beneficiary:', error);
            throw error;
        }
    },

    /**
     * Count beneficiaries by branch and term
     */
    async countByBranchAndTerm(branchId, termId) {
        try {
            const [result] = await sql`
        SELECT COUNT(*) as count
        FROM beneficiaries
        WHERE branch_id = ${branchId} AND term_id = ${termId} AND is_archived = false
      `;
            return parseInt(result.count);
        } catch (error) {
            log.error('Error counting beneficiaries:', error);
            throw error;
        }
    },

    /**
     * Get comprehensive statistics for a term
     */
    async getStatsByTerm(termId, includeFree = false) {
        try {
            // Overall stats
            const [totals] = await sql`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE free_student = true) as free_student_count,
          COUNT(*) FILTER (WHERE free_student IS NOT TRUE) as paid_student_count,
          COUNT(*) FILTER (WHERE gender = 'ذكر') as male_count,
          COUNT(*) FILTER (WHERE gender = 'أنثى') as female_count,
          COUNT(*) FILTER (WHERE enrollment_period = 'صباحية') as morning_count,
          COUNT(*) FILTER (WHERE enrollment_period = 'مسائية') as evening_count,
          COUNT(*) FILTER (WHERE speech_therapy = true) as speech_therapy_count,
          COUNT(*) FILTER (WHERE physical_therapy = true) as physical_therapy_count,
          COUNT(*) FILTER (WHERE occupational_therapy = true) as occupational_therapy_count,
          COUNT(*) FILTER (WHERE autism_therapy = true) as autism_therapy_count,
          COUNT(*) FILTER (WHERE transport_service = true) as transport_service_count,
          ROUND(AVG(age), 1) as avg_age
        FROM beneficiaries
        WHERE term_id = ${termId} AND is_archived = false
      `;

            // Per-branch breakdown
            const branchStats = await sql`
        SELECT 
          b_data.branch_id,
          br.branch_name,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE b_data.free_student = true) as free_student_count,
          COUNT(*) FILTER (WHERE b_data.free_student IS NOT TRUE) as paid_student_count,
          COUNT(*) FILTER (WHERE b_data.gender = 'ذكر') as male_count,
          COUNT(*) FILTER (WHERE b_data.gender = 'أنثى') as female_count,
          COUNT(*) FILTER (WHERE b_data.enrollment_period = 'صباحية') as morning_count,
          COUNT(*) FILTER (WHERE b_data.enrollment_period = 'مسائية') as evening_count,
          COUNT(*) FILTER (WHERE b_data.speech_therapy = true) as speech_therapy_count,
          COUNT(*) FILTER (WHERE b_data.physical_therapy = true) as physical_therapy_count,
          COUNT(*) FILTER (WHERE b_data.occupational_therapy = true) as occupational_therapy_count,
          COUNT(*) FILTER (WHERE b_data.autism_therapy = true) as autism_therapy_count,
          COUNT(*) FILTER (WHERE b_data.transport_service = true) as transport_service_count
        FROM beneficiaries b_data
        LEFT JOIN branches br ON b_data.branch_id = br.id
        WHERE b_data.term_id = ${termId} AND b_data.is_archived = false
        GROUP BY b_data.branch_id, br.branch_name
        ORDER BY br.branch_name
      `;

            // Age distribution
            const ageDistribution = await sql`
        SELECT 
          CASE
            WHEN age BETWEEN 1 AND 5 THEN '1-5'
            WHEN age BETWEEN 6 AND 10 THEN '6-10'
            WHEN age BETWEEN 11 AND 15 THEN '11-15'
            WHEN age BETWEEN 16 AND 20 THEN '16-20'
            WHEN age BETWEEN 21 AND 30 THEN '21-30'
            WHEN age BETWEEN 31 AND 40 THEN '31-40'
            WHEN age BETWEEN 41 AND 50 THEN '41-50'
          END as age_group,
          COUNT(*) as count
        FROM beneficiaries
        WHERE term_id = ${termId} AND is_archived = false
        GROUP BY age_group
        ORDER BY age_group
      `;

            // Service combination analysis
            const serviceCombinations = await sql`
        SELECT 
          (CASE WHEN speech_therapy THEN 1 ELSE 0 END +
           CASE WHEN physical_therapy THEN 1 ELSE 0 END +
           CASE WHEN occupational_therapy THEN 1 ELSE 0 END +
           CASE WHEN autism_therapy THEN 1 ELSE 0 END +
           CASE WHEN transport_service THEN 1 ELSE 0 END) as service_count,
          COUNT(*) as beneficiary_count
        FROM beneficiaries
        WHERE term_id = ${termId} AND is_archived = false
        GROUP BY service_count
        ORDER BY service_count
      `;

            return {
                totals,
                branchStats,
                ageDistribution,
                serviceCombinations
            };
        } catch (error) {
            log.error('Error getting stats by term:', error);
            throw error;
        }
    },

    /**
     * Get statistics for a specific branch
     */
    async getStatsByBranch(branchId, termId, includeFree = false) {
        try {
            const [stats] = await sql`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE gender = 'ذكر') as male_count,
          COUNT(*) FILTER (WHERE gender = 'أنثى') as female_count,
          COUNT(*) FILTER (WHERE enrollment_period = 'صباحية') as morning_count,
          COUNT(*) FILTER (WHERE enrollment_period = 'مسائية') as evening_count,
          COUNT(*) FILTER (WHERE speech_therapy = true) as speech_therapy_count,
          COUNT(*) FILTER (WHERE physical_therapy = true) as physical_therapy_count,
          COUNT(*) FILTER (WHERE occupational_therapy = true) as occupational_therapy_count,
          COUNT(*) FILTER (WHERE autism_therapy = true) as autism_therapy_count,
          COUNT(*) FILTER (WHERE transport_service = true) as transport_service_count,
          ROUND(AVG(age), 1) as avg_age
        FROM beneficiaries
        WHERE branch_id = ${branchId} AND term_id = ${termId} AND is_archived = false ${includeFree ? sql`` : sql`AND free_student IS NOT TRUE`}
      `;
            return stats;
        } catch (error) {
            log.error('Error getting branch stats:', error);
            throw error;
        }
    },

    /**
     * Archive all beneficiaries for a given term
     */
    async archiveByTerm(termId) {
        try {
            const result = await sql`
        UPDATE beneficiaries 
        SET is_archived = true, updated_at = CURRENT_TIMESTAMP
        WHERE term_id = ${termId} AND is_archived = false
        RETURNING id
      `;
            return result.length;
        } catch (error) {
            log.error('Error archiving beneficiaries:', error);
            throw error;
        }
    },

    /**
     * Get submission status per branch for a term (which branches have entered data)
     */
    async getSubmissionStatus(termId, includeFree = false) {
        try {
            const rows = await sql`
        SELECT 
          br.id as branch_id,
          br.branch_name,
          COALESCE(counts.total, 0) as beneficiary_count,
          CASE WHEN counts.total > 0 THEN true ELSE false END as has_submitted
        FROM branches br
        LEFT JOIN (
          SELECT branch_id, COUNT(*) as total
          FROM beneficiaries
          WHERE term_id = ${termId} AND is_archived = false ${includeFree ? sql`` : sql`AND free_student IS NOT TRUE`}
          GROUP BY branch_id
        ) counts ON br.id = counts.branch_id
        WHERE br.branch_type = 'healthcare_center' AND br.is_active = true
        ORDER BY br.branch_name
      `;
            return rows;
        } catch (error) {
            log.error('Error getting submission status:', error);
            throw error;
        }
    },

    /**
     * Get all available terms that have beneficiary data (for archive filtering)
     */
    async getTermsWithData() {
        try {
            const rows = await sql`
        SELECT DISTINCT
          t.id,
          t.term_name,
          t.term_number,
          t.academic_year_label,
          t.start_date,
          t.end_date,
          COUNT(b_data.id) as beneficiary_count,
          BOOL_OR(b_data.is_archived) as has_archived
        FROM terms t
        INNER JOIN beneficiaries b_data ON t.id = b_data.term_id
        WHERE t.branch_type = 'healthcare_center'
        GROUP BY t.id, t.term_name, t.term_number, t.academic_year_label, t.start_date, t.end_date
        ORDER BY t.academic_year_label DESC, t.term_number DESC
      `;
            return rows;
        } catch (error) {
            log.error('Error getting terms with data:', error);
            throw error;
        }
    },

    /**
     * Copy beneficiaries from one term to another for a specific branch
     * Skips records whose civil_id already exists in the target term+branch
     */
    async copyFromTerm(sourceTermId, targetTermId, branchId) {
        try {
            // Get source beneficiaries
            const sourceRows = await sql`
                SELECT * FROM beneficiaries
                WHERE term_id = ${sourceTermId} AND branch_id = ${branchId}
                ORDER BY sequence_number
            `;

            if (sourceRows.length === 0) {
                return { copied: 0, skipped: 0 };
            }

            // Get existing civil_ids in target to skip duplicates
            const existing = await sql`
                SELECT civil_id FROM beneficiaries
                WHERE term_id = ${targetTermId} AND branch_id = ${branchId}
            `;
            const existingCivilIds = new Set(existing.map(r => r.civil_id));

            const toCopy = sourceRows.filter(r => !existingCivilIds.has(r.civil_id));
            const skipped = sourceRows.length - toCopy.length;

            if (toCopy.length === 0) {
                return { copied: 0, skipped };
            }

            // Insert in transaction with sequence lock
            await sql.begin(async tx => {
                await tx`SELECT pg_advisory_xact_lock(${branchId * 100000 + targetTermId})`;
                const [seqResult] = await tx`
                    SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
                    FROM beneficiaries
                    WHERE branch_id = ${branchId} AND term_id = ${targetTermId}
                `;
                let nextSeq = seqResult.next_seq;

                for (const row of toCopy) {
                    await tx`
                        INSERT INTO beneficiaries (
                            branch_id, term_id, sequence_number, beneficiary_number, enrollment_period,
                            beneficiary_name, civil_id, contact_number, gender, age,
                            speech_therapy, physical_therapy, occupational_therapy,
                            autism_therapy, transport_service, free_student, notes
                        ) VALUES (
                            ${branchId}, ${targetTermId}, ${nextSeq++}, ${row.beneficiary_number}, ${row.enrollment_period},
                            ${row.beneficiary_name}, ${row.civil_id}, ${row.contact_number}, ${row.gender}, ${row.age},
                            ${row.speech_therapy}, ${row.physical_therapy}, ${row.occupational_therapy},
                            ${row.autism_therapy}, ${row.transport_service}, ${row.free_student || false}, ${row.notes || null}
                        )
                    `;
                }
            });

            return { copied: toCopy.length, skipped };
        } catch (error) {
            log.error('Error copying beneficiaries from term:', error);
            throw error;
        }
    }
};

export default Beneficiary;

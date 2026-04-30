/**
 * Term Model
 * Database operations for terms table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Term = {
  /**
   * Find term by ID
   */
  async findById(id) {
    try {
      const [term] = await sql`
        SELECT t.*, u.full_name as created_by_name
        FROM terms t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ${id}
      `;
      return term || null;
    } catch (error) {
      log.error('Error finding term by ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get all terms (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT t.*, u.full_name as created_by_name
        FROM terms t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE 1=1
      `;

      if (filters.branch_type) {
        query = sql`${query} AND t.branch_type = ${filters.branch_type}`;
      }

      if (filters.term_number) {
        query = sql`${query} AND t.term_number = ${filters.term_number}`;
      }

      if (filters.academic_year_label) {
        query = sql`${query} AND t.academic_year_label = ${filters.academic_year_label}`;
      }

      if (filters.is_active !== undefined) {
        query = sql`${query} AND t.is_active = ${filters.is_active}`;
      }

      query = sql`${query} ORDER BY t.branch_type, t.academic_year_start DESC, t.term_number ASC`;

      return await query;
    } catch (error) {
      log.error('Error finding terms:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get current term for a branch type
   * First tries to find a term where today falls within start_date/end_date.
   * If none found (gap between terms), falls back to the next upcoming term.
   */
  async getCurrentTerm(branchType) {
    try {
      const now = new Date();
      
      // 1. Try exact date match
      const [term] = await sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND is_active = true
        AND start_date <= ${now}
        AND end_date >= ${now}
        ORDER BY academic_year_start DESC, term_number DESC, start_date DESC
        LIMIT 1
      `;
      if (term) return term;
      
      // 2. Fallback: next upcoming term (gap between terms resolves to future)
      const [upcoming] = await sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND is_active = true
        AND start_date > ${now}
        ORDER BY start_date ASC
        LIMIT 1
      `;
      if (upcoming) return upcoming;
      
      // 3. Last resort: most recent past term
      const [recent] = await sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND is_active = true
        AND end_date < ${now}
        ORDER BY end_date DESC
        LIMIT 1
      `;
      return recent || null;
    } catch (error) {
      log.error('Error finding current term:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get term for a specific date and branch type
   */
  async getTermForDate(branchType, date) {
    try {
      const [term] = await sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND is_active = true
        AND start_date <= ${date}
        AND end_date >= ${date}
        ORDER BY start_date DESC
        LIMIT 1
      `;
      return term || null;
    } catch (error) {
      log.error('Error finding term for date:', { error: error.message });
      throw error;
    }
  },

  /**
   * Check for overlapping terms
   */
  async checkOverlap(branchType, startDate, endDate, excludeId = null) {
    try {
      let query = sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND is_active = true
        AND (
          (start_date <= ${startDate} AND end_date >= ${startDate}) OR
          (start_date <= ${endDate} AND end_date >= ${endDate}) OR
          (start_date >= ${startDate} AND end_date <= ${endDate})
        )
      `;

      if (excludeId) {
        query = sql`${query} AND id != ${excludeId}`;
      }

      return await query;
    } catch (error) {
      log.error('Error checking term overlap:', { error: error.message });
      throw error;
    }
  },

  /**
   * Check for duplicate terms (same branch_type, academic_year_label, term_number)
   */
  async checkDuplicate(branchType, academicYearLabel, termNumber, excludeId = null) {
    try {
      let query = sql`
        SELECT * FROM terms
        WHERE branch_type = ${branchType}
        AND academic_year_label = ${academicYearLabel}
        AND term_number = ${termNumber}
        AND is_active = true
      `;

      if (excludeId) {
        query = sql`${query} AND id != ${excludeId}`;
      }

      return await query;
    } catch (error) {
      log.error('Error checking term duplicate:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new term
   */
  async create(termData) {
    try {
      const {
        branch_type, term_name, term_number, start_date, end_date,
        academic_year_start, academic_year_end, academic_year_label, created_by
      } = termData;

      // Validate dates
      if (new Date(start_date) > new Date(end_date)) {
        throw new Error('Start date must be before or equal to end date');
      }

      if (new Date(academic_year_start) > new Date(academic_year_end)) {
        throw new Error('Academic year start must be before or equal to academic year end');
      }

      // Check for overlaps
      const overlaps = await this.checkOverlap(branch_type, start_date, end_date);
      if (overlaps.length > 0) {
        throw new Error('Term overlaps with existing term');
      }

      // Check for duplicates (same branch_type, academic_year_label, term_number)
      const duplicates = await this.checkDuplicate(branch_type, academic_year_label, term_number);
      if (duplicates.length > 0) {
        throw new Error(`Term with same branch type, academic year label, and term number already exists. Academic year: ${academic_year_label}, Term number: ${term_number}`);
      }

      const [term] = await sql`
        INSERT INTO terms (
          branch_type, term_name, term_number, start_date, end_date,
          academic_year_start, academic_year_end, academic_year_label, created_by
        )
        VALUES (
          ${branch_type}, ${term_name}, ${term_number}, ${start_date}, ${end_date},
          ${academic_year_start}, ${academic_year_end}, ${academic_year_label}, ${created_by || null}
        )
        RETURNING *
      `;

      return term;
    } catch (error) {
      log.error('Error creating term:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update term
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        'term_name', 'start_date', 'end_date', 'academic_year_start',
        'academic_year_end', 'academic_year_label', 'is_active'
      ];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Get existing term for validation
      const term = await this.findById(id);
      if (!term) {
        throw new Error('Term not found');
      }

      // Check for overlaps if dates are being updated
      if (updates.start_date || updates.end_date) {
        const startDate = updates.start_date || term.start_date;
        const endDate = updates.end_date || term.end_date;

        const overlaps = await this.checkOverlap(term.branch_type, startDate, endDate, id);
        if (overlaps.length > 0) {
          throw new Error('Updated term dates overlap with existing term');
        }
      }

      // Check for duplicates if academic_year_label or term_number are being updated
      const newAcademicYearLabel = updates.academic_year_label || term.academic_year_label;
      const newTermNumber = updates.term_number !== undefined ? updates.term_number : term.term_number;

      if (updates.academic_year_label || updates.term_number !== undefined) {
        const duplicates = await this.checkDuplicate(term.branch_type, newAcademicYearLabel, newTermNumber, id);
        if (duplicates.length > 0) {
          throw new Error(`Term with same branch type, academic year label, and term number already exists. Academic year: ${newAcademicYearLabel}, Term number: ${newTermNumber}`);
        }
      }

      updates.updated_at = new Date();

      // Build SET clause manually
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = updateFields.map(field => updates[field]);
      values.unshift(id);

      const query = `
        UPDATE terms 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;

      values.push(updates.updated_at);

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating term:', { error: error.message });
      throw error;
    }
  },

  /**
   * Deactivate term (soft delete)
   */
  async deactivate(id) {
    try {
      const [term] = await sql`
        UPDATE terms 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, term_name
      `;

      return term;
    } catch (error) {
      log.error('Error deactivating term:', { error: error.message });
      throw error;
    }
  }
};


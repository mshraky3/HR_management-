/**
 * Academic Year Model
 * Database operations for academic_years table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const AcademicYear = {
  /**
   * Find academic year by ID
   */
  async findById(id) {
    try {
      const [year] = await sql`
        SELECT ay.*, 
               t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
               t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
        FROM academic_years ay
        LEFT JOIN terms t1 ON ay.term1_id = t1.id
        LEFT JOIN terms t2 ON ay.term2_id = t2.id
        WHERE ay.id = ${id}
      `;
      return year || null;
    } catch (error) {
      log.error('Error finding academic year by ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get all academic years (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT ay.*, 
               t1.id as term1_id, t1.term_name as term1_name, t1.start_date as term1_start_date, t1.end_date as term1_end_date,
               t2.id as term2_id, t2.term_name as term2_name, t2.start_date as term2_start_date, t2.end_date as term2_end_date
        FROM academic_years ay
        LEFT JOIN terms t1 ON ay.term1_id = t1.id
        LEFT JOIN terms t2 ON ay.term2_id = t2.id
        WHERE 1=1
      `;

      if (filters.branch_type) {
        query = sql`${query} AND ay.branch_type = ${filters.branch_type}`;
      }

      if (filters.is_current !== undefined) {
        query = sql`${query} AND ay.is_current = ${filters.is_current}`;
      }

      if (filters.is_completed !== undefined) {
        query = sql`${query} AND ay.is_completed = ${filters.is_completed}`;
      }

      query = sql`${query} ORDER BY ay.branch_type, ay.year_start DESC`;

      const years = await query;

      // Format the results to include term objects
      return years.map(year => ({
        ...year,
        term1: year.term1_id ? {
          id: year.term1_id,
          term_name: year.term1_name,
          start_date: year.term1_start_date,
          end_date: year.term1_end_date
        } : null,
        term2: year.term2_id ? {
          id: year.term2_id,
          term_name: year.term2_name,
          start_date: year.term2_start_date,
          end_date: year.term2_end_date
        } : null
      }));
    } catch (error) {
      log.error('Error finding academic years:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get current academic year for a branch type
   */
  async getCurrentYear(branchType) {
    try {
      // 1. Try flag-based lookup
      const [flagged] = await sql`
        SELECT ay.*, 
               t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
               t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
        FROM academic_years ay
        LEFT JOIN terms t1 ON ay.term1_id = t1.id
        LEFT JOIN terms t2 ON ay.term2_id = t2.id
        WHERE ay.branch_type = ${branchType}
        AND ay.is_current = true
        ORDER BY ay.year_start DESC
        LIMIT 1
      `;
      if (flagged) return flagged;

      // 2. Fallback: find year where today falls within year_start..year_end
      const now = new Date();
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
      return byDate || null;
    } catch (error) {
      log.error('Error finding current academic year:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get academic year for a specific date and branch type
   */
  async getYearForDate(branchType, date) {
    try {
      const [year] = await sql`
        SELECT ay.*, 
               t1.term_name as term1_name, t1.start_date as term1_start, t1.end_date as term1_end,
               t2.term_name as term2_name, t2.start_date as term2_start, t2.end_date as term2_end
        FROM academic_years ay
        LEFT JOIN terms t1 ON ay.term1_id = t1.id
        LEFT JOIN terms t2 ON ay.term2_id = t2.id
        WHERE ay.branch_type = ${branchType}
        AND ay.year_start <= ${date}
        AND ay.year_end >= ${date}
        ORDER BY ay.year_start DESC
        LIMIT 1
      `;
      return year || null;
    } catch (error) {
      log.error('Error finding academic year for date:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new academic year
   */
  async create(yearData) {
    try {
      const {
        branch_type, year_label, year_start, year_end, term1_id, term2_id
      } = yearData;

      // Validate dates
      if (new Date(year_start) > new Date(year_end)) {
        throw new Error('Year start must be before or equal to year end');
      }

      // Check if year label already exists for this branch type
      const existing = await sql`
        SELECT * FROM academic_years
        WHERE branch_type = ${branch_type} AND year_label = ${year_label}
      `;

      if (existing.length > 0) {
        throw new Error('Academic year label already exists for this branch type');
      }

      // Set other years as not current
      await sql`
        UPDATE academic_years
        SET is_current = false
        WHERE branch_type = ${branch_type} AND is_current = true
      `;

      const [year] = await sql`
        INSERT INTO academic_years (
          branch_type, year_label, year_start, year_end, term1_id, term2_id, is_current
        )
        VALUES (
          ${branch_type}, ${year_label}, ${year_start}, ${year_end}, 
          ${term1_id || null}, ${term2_id || null}, true
        )
        RETURNING *
      `;

      return year;
    } catch (error) {
      log.error('Error creating academic year:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update academic year
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        'year_label', 'year_start', 'year_end', 'term1_id', 'term2_id',
        'is_current', 'is_completed'
      ];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // If setting as current, unset other current years for same branch type
      if (updates.is_current === true) {
        const year = await this.findById(id);
        if (year) {
          await sql`
            UPDATE academic_years
            SET is_current = false
            WHERE branch_type = ${year.branch_type} AND is_current = true AND id != ${id}
          `;
        }
      }

      // If marking as completed, set completed_at
      if (updates.is_completed === true) {
        updates.completed_at = new Date();
      }

      updates.updated_at = new Date();

      // Build SET clause manually
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = updateFields.map(field => updates[field]);
      values.unshift(id);

      const query = `
        UPDATE academic_years 
        SET ${setClause}, updated_at = $${values.length + 1}
        ${updates.completed_at ? `, completed_at = $${values.length + 2}` : ''}
        WHERE id = $1
        RETURNING *
      `;

      values.push(updates.updated_at);
      if (updates.completed_at) {
        values.push(updates.completed_at);
      }

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating academic year:', { error: error.message });
      throw error;
    }
  },

  /**
   * End academic year (mark as completed and change employee statuses)
   */
  async endYear(yearId, branchType) {
    try {
      const year = await this.findById(yearId);
      if (!year) {
        throw new Error('Academic year not found');
      }

      if (year.branch_type !== branchType) {
        throw new Error('Branch type mismatch');
      }

      // Start transaction: Update academic year and employee statuses
      // Change all active employees in this branch type to pending
      // Note: is_active remains true for pending employees (they're not archived yet)
      const result = await sql`
        UPDATE employees
        SET status = 'pending',
            is_active = true, -- Pending employees are still active, just awaiting renewal
            status_changed_at = CURRENT_TIMESTAMP,
            status_changed_by = branch_id,
            status_change_reason = 'نهاية السنة الدراسية'
        WHERE branch_id IN (
          SELECT id FROM branches WHERE branch_type = ${branchType}
        )
        AND status = 'active'
        AND is_active = true
      `;

      // Mark academic year as completed
      await this.update(yearId, {
        is_completed: true,
        is_current: false
      });

      return {
        success: true,
        employeesUpdated: result.count || 0
      };
    } catch (error) {
      log.error('Error ending academic year:', { error: error.message });
      throw error;
    }
  }
};


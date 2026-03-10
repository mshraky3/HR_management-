/**
 * Bus Student Model
 * Database operations for bus_students table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BusStudent = {
  /**
   * Count how many students share a phone number within the same branch and term
   * Used to enforce max 2 students per phone number rule
   * @param {string} phoneNumber - The phone number to check
   * @param {number} branchId - The branch ID to check within
   * @param {number} termId - The term ID to check within
   * @param {number|null} excludeStudentId - Student ID to exclude (for updates)
   * @returns {Promise<number>} - Count of students with this phone number
   */
  async countByPhoneNumber(phoneNumber, branchId, termId, excludeStudentId = null) {
    try {
      let result;
      if (excludeStudentId) {
        result = await sql`
          SELECT COUNT(*)::int as count
          FROM bus_students bs
          INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
          WHERE bs.contact_mobile_number = ${phoneNumber}
            AND bt.branch_id = ${branchId}
            AND bs.term_id = ${termId}
            AND bs.id != ${excludeStudentId}
        `;
      } else {
        result = await sql`
          SELECT COUNT(*)::int as count
          FROM bus_students bs
          INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
          WHERE bs.contact_mobile_number = ${phoneNumber}
            AND bt.branch_id = ${branchId}
            AND bs.term_id = ${termId}
        `;
      }
      return result[0]?.count || 0;
    } catch (error) {
      log.error('Error counting students by phone number', { error: error.message });
      throw error;
    }
  },

  /**
   * Find student by ID
   */
  async findById(id) {
    try {
      const [student] = await sql`
        SELECT * FROM bus_students 
        WHERE id = ${id}
      `;
      return student || null;
    } catch (error) {
      log.error('Error finding bus student by ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find all students by bus ID
   */
  async findByBusId(busId, filters = {}) {
    try {
      let query = sql`
        SELECT * FROM bus_students 
        WHERE bus_id = ${busId}
      `;

      if (filters.term_id) {
        query = sql`${query} AND term_id = ${filters.term_id}`;
      }

      query = sql`${query} ORDER BY created_at ASC`;

      return await query;
    } catch (error) {
      log.error('Error finding bus students by bus ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find students by bus and term
   */
  async findByBusAndTerm(busId, termId) {
    try {
      return await this.findByBusId(busId, { term_id: termId });
    } catch (error) {
      log.error('Error finding bus students by bus and term', { error: error.message });
      throw error;
    }
  },

  /**
   * Create student
   */
  async create(studentData) {
    try {
      const {
        bus_id, term_id, student_full_name, contact_mobile_number, address,
        created_by
      } = studentData;

      if (!term_id) {
        throw new Error('term_id is required');
      }

      const [student] = await sql`
        INSERT INTO bus_students (
          bus_id, term_id, student_full_name, contact_mobile_number, address,
          created_by, updated_by
        )
        VALUES (
          ${bus_id}, ${term_id}, ${student_full_name}, ${contact_mobile_number}, ${address},
          ${created_by || null}, ${created_by || null}
        )
        RETURNING *
      `;

      return student;
    } catch (error) {
      log.error('Error creating bus student', { error: error.message });
      throw error;
    }
  },

  /**
   * Update student
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        'student_full_name', 'contact_mobile_number', 'address',
        'term_id'
      ];

      const updateFields = [];
      const updateValues = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(field);
          updateValues.push(updates[field]);
        }
      }

      if (updates.updated_by !== undefined) {
        updateFields.push('updated_by');
        updateValues.push(updates.updated_by);
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = [...updateValues];
      values.unshift(id);

      const query = `
        UPDATE bus_students 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;

      values.push(new Date());

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating bus student', { error: error.message });
      throw error;
    }
  },

  /**
   * Delete student (hard delete - students are term-specific)
   */
  async delete(id) {
    try {
      const [student] = await sql`
        DELETE FROM bus_students 
        WHERE id = ${id}
        RETURNING id, student_full_name, term_id
      `;

      return student;
    } catch (error) {
      log.error('Error deleting bus student', { error: error.message });
      throw error;
    }
  },

  /**
   * Bulk create students
   */
  async bulkCreate(busId, students, createdBy) {
    try {
      const results = [];

      for (const student of students) {
        try {
          const created = await this.create({
            ...student,
            bus_id: busId,
            created_by: createdBy
          });
          results.push(created);
        } catch (error) {
          // Skip duplicates (unique constraint on bus_id + contact_mobile_number + term_id)
          if (error.message && error.message.includes('unique')) {
            log.warn(`Skipping duplicate student: ${student.contact_mobile_number}`);
            continue;
          }
          throw error;
        }
      }

      return results;
    } catch (error) {
      log.error('Error bulk creating bus students', { error: error.message });
      throw error;
    }
  },

  /**
   * Check if a student (by name and phone) exists in another bus within the same branch/term
   * Used to prevent the same student from being registered in multiple buses
   * @param {string} studentName - The student's full name
   * @param {string} phoneNumber - The contact phone number
   * @param {number} branchId - The branch ID to check within
   * @param {number} termId - The term ID to check within
   * @param {number|null} excludeBusId - Bus ID to exclude (for current bus)
   * @param {number|null} excludeStudentId - Student ID to exclude (for updates)
   * @returns {Promise<object|null>} - The existing student record if found, null otherwise
   */
  async findDuplicateInOtherBus(studentName, phoneNumber, branchId, termId, excludeBusId = null, excludeStudentId = null) {
    try {
      // Normalize name for comparison (trim and lowercase)
      const normalizedName = studentName?.trim().toLowerCase();

      let result;
      if (excludeBusId && excludeStudentId) {
        result = await sql`
          SELECT bs.*, bt.bus_number, lpd.plate_number as primary_plate
          FROM bus_students bs
          INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
          LEFT JOIN (
            SELECT bus_id, plate_number
            FROM license_plate_data
            WHERE is_primary = true
          ) lpd ON bt.id = lpd.bus_id
          WHERE LOWER(TRIM(bs.student_full_name)) = ${normalizedName}
            AND bs.contact_mobile_number = ${phoneNumber}
            AND bt.branch_id = ${branchId}
            AND bs.term_id = ${termId}
            AND bs.bus_id != ${excludeBusId}
            AND bs.id != ${excludeStudentId}
          LIMIT 1
        `;
      } else if (excludeBusId) {
        result = await sql`
          SELECT bs.*, bt.bus_number, lpd.plate_number as primary_plate
          FROM bus_students bs
          INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
          LEFT JOIN (
            SELECT bus_id, plate_number
            FROM license_plate_data
            WHERE is_primary = true
          ) lpd ON bt.id = lpd.bus_id
          WHERE LOWER(TRIM(bs.student_full_name)) = ${normalizedName}
            AND bs.contact_mobile_number = ${phoneNumber}
            AND bt.branch_id = ${branchId}
            AND bs.term_id = ${termId}
            AND bs.bus_id != ${excludeBusId}
          LIMIT 1
        `;
      } else {
        result = await sql`
          SELECT bs.*, bt.bus_number, lpd.plate_number as primary_plate
          FROM bus_students bs
          INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
          LEFT JOIN (
            SELECT bus_id, plate_number
            FROM license_plate_data
            WHERE is_primary = true
          ) lpd ON bt.id = lpd.bus_id
          WHERE LOWER(TRIM(bs.student_full_name)) = ${normalizedName}
            AND bs.contact_mobile_number = ${phoneNumber}
            AND bt.branch_id = ${branchId}
            AND bs.term_id = ${termId}
          LIMIT 1
        `;
      }
      return result[0] || null;
    } catch (error) {
      log.error('Error checking for duplicate student in other bus', { error: error.message });
      throw error;
    }
  },

  async findByBusIds(busIds = [], filters = {}) {
    try {
      if (!Array.isArray(busIds) || busIds.length === 0) {
        return [];
      }

      const normalizedIds = busIds
        .map(id => Number.parseInt(id, 10))
        .filter(id => !Number.isNaN(id));

      if (normalizedIds.length === 0) {
        return [];
      }

      const whereClauses = ['bus_id = ANY($1::int[])'];
      const queryValues = [normalizedIds];
      let paramIndex = 2;

      if (filters.status) {
        whereClauses.push(`status = $${paramIndex}`);
        queryValues.push(filters.status);
        paramIndex += 1;
      }

      if (filters.grade_level) {
        whereClauses.push(`grade_level = $${paramIndex}`);
        queryValues.push(filters.grade_level);
        paramIndex += 1;
      }

      if (filters.term_id) {
        whereClauses.push(`term_id = $${paramIndex}`);
        queryValues.push(filters.term_id);
        paramIndex += 1;
      }

      const query = `
        SELECT *
        FROM bus_students
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY created_at ASC
      `;

      return await sql.unsafe(query, queryValues);
    } catch (error) {
      log.error('Error finding bus students by bus IDs', { error: error.message });
      throw error;
    }
  }
};

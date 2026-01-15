/**
 * Bus Student Model
 * Database operations for bus_students table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BusStudent = {
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
  }
};

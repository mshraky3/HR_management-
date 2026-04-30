/**
 * Document Model
 * Database operations for employee_documents table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Document = {
  /**
   * Find document by ID
   */
  async findById(id) {
    try {
      const [document] = await sql`
        SELECT * FROM employee_documents 
        WHERE id = ${id} AND is_active = true
      `;
      return document || null;
    } catch (error) {
      log.error('Error finding document by ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find all documents for an employee
   */
  async findByEmployeeId(employeeId, filters = {}) {
    try {
      let query = sql`
        SELECT * FROM employee_documents 
        WHERE employee_id = ${employeeId} AND is_active = true
      `;

      if (filters.document_type) {
        query = sql`${query} AND document_type = ${filters.document_type}`;
      }

      if (filters.mime_type) {
        query = sql`${query} AND mime_type = ${filters.mime_type}`;
      }

      if (filters.is_verified !== undefined) {
        query = sql`${query} AND is_verified = ${filters.is_verified}`;
      }

      query = sql`${query} ORDER BY uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding documents by employee ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Search documents by filename
   */
  async searchByFilename(searchTerm, employeeId = null) {
    try {
      let query = sql`
        SELECT * FROM employee_documents 
        WHERE file_name ILIKE ${'%' + searchTerm + '%'} AND is_active = true
      `;

      if (employeeId) {
        query = sql`${query} AND employee_id = ${employeeId}`;
      }

      query = sql`${query} ORDER BY uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error searching documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find expiring documents
   */
  async findExpiring(days = 30) {
    try {
      const result = await sql`
        SELECT * FROM employee_documents 
        WHERE expiry_date IS NOT NULL 
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${days} * INTERVAL '1 day'
        AND is_active = true
        ORDER BY expiry_date ASC
      `;

      return result;
    } catch (error) {
      log.error('Error finding expiring documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find unverified documents
   */
  async findUnverified(employeeId = null) {
    try {
      let query = sql`
        SELECT * FROM employee_documents 
        WHERE is_verified = false AND is_active = true
      `;

      if (employeeId) {
        query = sql`${query} AND employee_id = ${employeeId}`;
      }

      query = sql`${query} ORDER BY uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding unverified documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find all documents for employees in a branch
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      let query = sql`
        SELECT ed.* FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        WHERE e.branch_id = ${branchId} AND ed.is_active = true AND e.is_active = true
      `;

      if (filters.document_type) {
        query = sql`${query} AND ed.document_type = ${filters.document_type}`;
      }

      if (filters.mime_type) {
        query = sql`${query} AND ed.mime_type = ${filters.mime_type}`;
      }

      if (filters.is_verified !== undefined) {
        query = sql`${query} AND ed.is_verified = ${filters.is_verified}`;
      }

      query = sql`${query} ORDER BY ed.uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding documents by branch ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new document record
   */
  async create(documentData) {
    try {
      const {
        employee_id, document_type, file_name, file_path, file_size,
        mime_type, file_extension, thumbnail_path, description, expiry_date, uploaded_by,
        r2_file_path
      } = documentData;

      const [document] = await sql`
        INSERT INTO employee_documents (
          employee_id, document_type, file_name, file_path, file_size,
          mime_type, file_extension, thumbnail_path, description, expiry_date, uploaded_by,
          r2_file_path
        )
        VALUES (
          ${employee_id}, ${document_type}, ${file_name}, ${file_path}, ${file_size || null},
          ${mime_type}, ${file_extension || null}, ${thumbnail_path || null}, 
          ${description || null}, ${expiry_date || null}, ${uploaded_by || null},
          ${r2_file_path || null}
        )
        RETURNING *
      `;

      return document;
    } catch (error) {
      log.error('Error creating document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update document metadata
   */
  async update(id, updates) {
    try {
      const allowedFields = ['description', 'expiry_date', 'is_verified', 'verified_by', 'thumbnail_path', 'file_path', 'r2_file_path'];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updates.updated_at = new Date();

      // Build SET clause manually
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = updateFields.map(field => updates[field]);
      values.unshift(id);

      const query = `
        UPDATE employee_documents 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;

      values.push(updates.updated_at);

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Verify document
   */
  async verify(id, verifiedBy) {
    try {
      const [document] = await sql`
        UPDATE employee_documents 
        SET is_verified = true, verified_at = CURRENT_TIMESTAMP, verified_by = ${verifiedBy || null}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;

      return document || null;
    } catch (error) {
      log.error('Error verifying document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Soft delete document
   */
  async softDelete(id) {
    try {
      const [document] = await sql`
        UPDATE employee_documents 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, file_name, is_active
      `;

      return document || null;
    } catch (error) {
      log.error('Error soft deleting document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find archived documents (is_active = false)
   */
  async findArchived(filters = {}) {
    try {
      let query = sql`
        SELECT ed.*, e.first_name, e.second_name, e.third_name, e.fourth_name, 
               e.employee_id_number, b.branch_name
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE ed.is_active = false
      `;

      if (filters.employee_id) {
        query = sql`${query} AND ed.employee_id = ${filters.employee_id}`;
      }

      if (filters.document_type) {
        query = sql`${query} AND ed.document_type = ${filters.document_type}`;
      }

      if (filters.branch_id) {
        query = sql`${query} AND e.branch_id = ${filters.branch_id}`;
      }

      query = sql`${query} ORDER BY ed.updated_at DESC, ed.uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding archived documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Permanently delete document (hard delete from database)
   * Main manager only
   */
  async permanentDelete(id) {
    try {
      const [document] = await sql`
        DELETE FROM employee_documents 
        WHERE id = ${id}
        RETURNING id, file_name, file_path
      `;

      return document || null;
    } catch (error) {
      log.error('Error permanently deleting document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Archive (deactivate) old documents of the same type for an employee
   * This is used when uploading a new document to archive the old ones
   * @param {number} employeeId - Employee ID
   * @param {string} documentType - Document type
   * @param {number} excludeId - Document ID to exclude from archiving (the new one being uploaded)
   */
  async archiveByEmployeeAndType(employeeId, documentType, excludeId = null) {
    try {
      if (excludeId) {
        const result = await sql`
          UPDATE employee_documents 
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE employee_id = ${employeeId} 
          AND document_type = ${documentType}
          AND is_active = true
          AND id != ${excludeId}
          RETURNING id, file_name, document_type, is_active
        `;
        return result;
      } else {
        const result = await sql`
          UPDATE employee_documents 
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE employee_id = ${employeeId} 
          AND document_type = ${documentType}
          AND is_active = true
          RETURNING id, file_name, document_type, is_active
        `;
        return result;
      }
    } catch (error) {
      log.error('Error archiving documents by employee and type:', { error: error.message });
      throw error;
    }
  }
};


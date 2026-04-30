/**
 * Request Model
 * Database operations for requests table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Request = {
  /**
   * Find request by ID
   */
  async findById(id) {
    try {
      const [request] = await sql`
        SELECT r.*, 
               b.branch_name, b.branch_type,
               u.full_name as main_manager_name,
               e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name as employee_name,
               resp.full_name as responded_by_name,
               r.response_attachment_url, r.response_attachment_name, r.response_attachment_type
        FROM requests r
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN users u ON r.main_manager_id = u.id
        LEFT JOIN employees e ON r.employee_id = e.id
        LEFT JOIN users resp ON r.responded_by = resp.id
        WHERE r.id = ${id}
      `;
      return request || null;
    } catch (error) {
      log.error('Error finding request by ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get all requests (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT r.*, 
               b.branch_name, b.branch_type,
               u.full_name as main_manager_name,
               e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name as employee_name,
               resp.full_name as responded_by_name,
               r.response_attachment_url, r.response_attachment_name, r.response_attachment_type
        FROM requests r
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN users u ON r.main_manager_id = u.id
        LEFT JOIN employees e ON r.employee_id = e.id
        LEFT JOIN users resp ON r.responded_by = resp.id
        WHERE 1=1
      `;

      if (filters.branch_id) {
        query = sql`${query} AND r.branch_id = ${filters.branch_id}`;
      }

      if (filters.main_manager_id) {
        query = sql`${query} AND r.main_manager_id = ${filters.main_manager_id}`;
      }

      if (filters.employee_id) {
        query = sql`${query} AND r.employee_id = ${filters.employee_id}`;
      }

      if (filters.status) {
        query = sql`${query} AND r.status = ${filters.status}`;
      }

      query = sql`${query} ORDER BY r.created_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding requests:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get requests for a specific branch
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      return await this.findAll({ ...filters, branch_id: branchId });
    } catch (error) {
      log.error('Error finding requests by branch ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get requests for a specific main manager
   */
  async findByMainManagerId(mainManagerId, filters = {}) {
    try {
      return await this.findAll({ ...filters, main_manager_id: mainManagerId });
    } catch (error) {
      log.error('Error finding requests by main manager ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new request
   */
  async create(requestData) {
    try {
      const { branch_id, main_manager_id, employee_id, request_name, request_text, attachment_url, attachment_name, attachment_type, r2_attachment_url } = requestData;

      if (!branch_id || !main_manager_id || !request_name || !request_text) {
        throw new Error('branch_id, main_manager_id, request_name, and request_text are required');
      }

      const [request] = await sql`
        INSERT INTO requests (branch_id, main_manager_id, employee_id, request_name, request_text, attachment_url, attachment_name, attachment_type, r2_attachment_url)
        VALUES (${branch_id}, ${main_manager_id}, ${employee_id || null}, ${request_name}, ${request_text}, ${attachment_url || null}, ${attachment_name || null}, ${attachment_type || null}, ${r2_attachment_url || null})
        RETURNING *
      `;

      return await this.findById(request.id);
    } catch (error) {
      log.error('Error creating request:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update request
   */
  async update(id, updates) {
    try {
      const allowedFields = ['status', 'response_text', 'responded_by', 'response_attachment_url', 'response_attachment_name', 'response_attachment_type', 'r2_response_attachment_url'];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // If status is being updated and not pending, set responded_at
      let respondedAt = null;
      if (updates.status && updates.status !== 'pending') {
        respondedAt = new Date();
      }

      // Build update object
      const updateData = {};
      updateFields.forEach(field => {
        updateData[field] = updates[field];
      });

      if (respondedAt) {
        updateData.responded_at = respondedAt;
      }
      updateData.updated_at = new Date();

      // Use sql template literal for safer updates
      const setParts = [];
      const values = [];
      let paramIndex = 1;

      Object.keys(updateData).forEach(key => {
        setParts.push(`${key} = $${paramIndex}`);
        values.push(updateData[key]);
        paramIndex++;
      });

      values.push(id);

      const query = `
        UPDATE requests 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await sql.unsafe(query, values);
      return result[0] ? await this.findById(id) : null;
    } catch (error) {
      log.error('Error updating request:', { error: error.message });
      throw error;
    }
  },

  /**
   * Delete request
   */
  async delete(id) {
    try {
      const [request] = await sql`
        DELETE FROM requests 
        WHERE id = ${id}
        RETURNING id, request_name
      `;

      return request;
    } catch (error) {
      log.error('Error deleting request:', { error: error.message });
      throw error;
    }
  }
};

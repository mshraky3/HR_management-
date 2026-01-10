/**
 * Branch Model
 * Database operations for branches table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Branch = {
  /**
   * Find branch by ID
   */
  async findById(id) {
    try {
      const [branch] = await sql`
        SELECT * FROM branches 
        WHERE id = ${id} AND is_active = true
      `;
      return branch || null;
    } catch (error) {
      log.error('Error finding branch by ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find branch by username
   */
  async findByUsername(username) {
    try {
      const [branch] = await sql`
        SELECT * FROM branches 
        WHERE username = ${username} AND is_active = true
      `;
      return branch || null;
    } catch (error) {
      log.error('Error finding branch by username', { error: error.message });
      throw error;
    }
  },

  /**
   * Get all branches (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`SELECT * FROM branches WHERE 1=1`;
      
      if (filters.branch_type) {
        query = sql`${query} AND branch_type = ${filters.branch_type}`;
      }
      
      if (filters.is_active !== undefined) {
        // Ensure boolean conversion for is_active filter
        const isActiveBool = filters.is_active === true || filters.is_active === 'true' || filters.is_active === 1;
        query = sql`${query} AND is_active = ${isActiveBool}`;
      }
      
      if (filters.id) {
        query = sql`${query} AND id = ${filters.id}`;
      }
      
      query = sql`${query} ORDER BY created_at DESC`;
      
      return await query;
    } catch (error) {
      log.error('Error finding branches', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new branch
   */
  async create(branchData) {
    try {
      const { branch_name, branch_location, branch_type, username, password, branch_documents_password, phone_number, email, number_of_employees } = branchData;
      
      // Set default password if not provided
      const documentsPassword = branch_documents_password || 'test';
      
      const [branch] = await sql`
        INSERT INTO branches (branch_name, branch_location, branch_type, username, password, branch_documents_password, phone_number, email, number_of_employees)
        VALUES (${branch_name}, ${branch_location}, ${branch_type}, ${username}, ${password}, ${documentsPassword}, ${phone_number || null}, ${email || null}, ${number_of_employees || null})
        RETURNING *
      `;
      
      return branch;
    } catch (error) {
      log.error('Error creating branch', { error: error.message });
      throw error;
    }
  },

  /**
   * Update branch
   */
  async update(id, updates) {
    try {
      const allowedFields = ['branch_name', 'branch_location', 'username', 'password', 'branch_documents_password', 'is_active', 'phone_number', 'email', 'number_of_employees'];
      
      // Filter allowed fields and handle special cases
      const updateFields = [];
      const updateValues = [];
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          // Skip empty password - means keep current password
          if (field === 'password' && (updates[field] === '' || updates[field] === null)) {
            continue;
          }
          
          // Handle number_of_employees: parse as integer or set to null
          if (field === 'number_of_employees') {
            const value = updates[field];
            if (value === '' || value === null || value === undefined) {
              updateFields.push(field);
              updateValues.push(null);
            } else {
              const parsed = parseInt(value, 10);
              updateFields.push(field);
              updateValues.push(isNaN(parsed) ? null : parsed);
            }
          } else {
            // For other fields, include them in the update
            updateFields.push(field);
            updateValues.push(updates[field] === '' ? null : updates[field]);
          }
        }
      }
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      // Build SET clause manually
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');
      
      const values = [...updateValues];
      values.unshift(id);
      
      const query = `
        UPDATE branches 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;
      
      values.push(new Date());
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating branch', { error: error.message });
      throw error;
    }
  },

  /**
   * Soft delete branch
   */
  async softDelete(id) {
    try {
      const [branch] = await sql`
        UPDATE branches 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, branch_name, is_active
      `;
      
      return branch;
    } catch (error) {
      log.error('Error soft deleting branch', { error: error.message });
      throw error;
    }
  }
};


/**
 * Branch Model
 * Database operations for branches table
 */

import sql from '../config/database.js';

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
      console.error('Error finding branch by ID:', error);
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
      console.error('Error finding branch by username:', error);
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
        query = sql`${query} AND is_active = ${filters.is_active}`;
      }
      
      if (filters.id) {
        query = sql`${query} AND id = ${filters.id}`;
      }
      
      query = sql`${query} ORDER BY created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding branches:', error);
      throw error;
    }
  },

  /**
   * Create new branch
   */
  async create(branchData) {
    try {
      const { branch_name, branch_location, branch_type, username, password } = branchData;
      
      const [branch] = await sql`
        INSERT INTO branches (branch_name, branch_location, branch_type, username, password)
        VALUES (${branch_name}, ${branch_location}, ${branch_type}, ${username}, ${password})
        RETURNING *
      `;
      
      return branch;
    } catch (error) {
      console.error('Error creating branch:', error);
      throw error;
    }
  },

  /**
   * Update branch
   */
  async update(id, updates) {
    try {
      const allowedFields = ['branch_name', 'branch_location', 'username', 'password', 'is_active'];
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
        UPDATE branches 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;
      
      values.push(updates.updated_at);
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating branch:', error);
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
      console.error('Error soft deleting branch:', error);
      throw error;
    }
  }
};


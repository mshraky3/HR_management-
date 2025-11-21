/**
 * User Model
 * Database operations for users table
 */

import sql from '../config/database.js';

export const User = {
  /**
   * Find user by username
   */
  async findByUsername(username) {
    try {
      const [user] = await sql`
        SELECT * FROM users 
        WHERE username = ${username} AND is_active = true
      `;
      return user || null;
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    try {
      const [user] = await sql`
        SELECT id, username, role, branch_id, full_name, email, is_active, created_at, updated_at
        FROM users 
        WHERE id = ${id} AND is_active = true
      `;
      return user || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  },

  /**
   * Create new user
   */
  async create(userData) {
    try {
      const { username, password, role, branch_id, full_name, email, created_by } = userData;
      
      const [user] = await sql`
        INSERT INTO users (username, password, role, branch_id, full_name, email, created_by)
        VALUES (${username}, ${password}, ${role}, ${branch_id || null}, ${full_name}, ${email || null}, ${created_by || null})
        RETURNING id, username, role, branch_id, full_name, email, is_active, created_at
      `;
      
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  /**
   * Get all users (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT id, username, role, branch_id, full_name, email, is_active, created_at, updated_at 
        FROM users 
        WHERE 1=1
      `;
      
      if (filters.role) {
        query = sql`${query} AND role = ${filters.role}`;
      }
      
      if (filters.branch_id) {
        query = sql`${query} AND branch_id = ${filters.branch_id}`;
      }
      
      if (filters.is_active !== undefined) {
        query = sql`${query} AND is_active = ${filters.is_active}`;
      }
      
      query = sql`${query} ORDER BY created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding users:', error);
      throw error;
    }
  },

  /**
   * Update user
   */
  async update(id, updates) {
    try {
      const allowedFields = ['username', 'password', 'full_name', 'email', 'is_active', 'branch_id'];
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
        UPDATE users 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING id, username, role, branch_id, full_name, email, is_active, updated_at
      `;
      
      values.push(updates.updated_at);
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Soft delete user (set is_active = false)
   */
  async softDelete(id) {
    try {
      const [user] = await sql`
        UPDATE users 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, username, is_active
      `;
      
      return user;
    } catch (error) {
      console.error('Error soft deleting user:', error);
      throw error;
    }
  }
};


/**
 * User Model
 * Database operations for users table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

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
      log.error('Error finding user by username', { error: error.message });
      throw error;
    }
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    try {
      const [user] = await sql`
        SELECT u.id, u.username, u.role, u.branch_id, u.full_name, u.email, u.phone_number, u.is_active, u.created_at, u.updated_at,
               b.branch_type
        FROM users u
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.id = ${id} AND u.is_active = true
      `;
      return user || null;
    } catch (error) {
      log.error('Error finding user by ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new user
   */
  async create(userData) {
    try {
      const { username, password, role, branch_id, full_name, email, phone_number, created_by } = userData;

      const [user] = await sql`
        INSERT INTO users (username, password, role, branch_id, full_name, email, phone_number, created_by)
        VALUES (${username}, ${password}, ${role}, ${branch_id || null}, ${full_name}, ${email || null}, ${phone_number || null}, ${created_by || null})
        RETURNING id, username, role, branch_id, full_name, email, phone_number, is_active, created_at
      `;

      return user;
    } catch (error) {
      log.error('Error creating user', { error: error.message });
      throw error;
    }
  },

  /**
   * Get all users (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT id, username, password, role, branch_id, full_name, email, phone_number, is_active, created_at, updated_at 
        FROM users 
        WHERE 1=1
      `;

      if (filters.role) {
        if (Array.isArray(filters.role)) {
          query = sql`${query} AND role = ANY(${filters.role}::text[])`;
        } else {
          query = sql`${query} AND role = ${filters.role}`;
        }
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
      log.error('Error finding users', { error: error.message });
      throw error;
    }
  },

  /**
   * Update user
   */
  async update(id, updates) {
    try {
      const allowedFields = ['username', 'password', 'full_name', 'email', 'phone_number', 'is_active', 'branch_id'];
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
        RETURNING id, username, role, branch_id, full_name, email, phone_number, is_active, updated_at
      `;

      values.push(updates.updated_at);

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating user', { error: error.message });
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
      log.error('Error soft deleting user', { error: error.message });
      throw error;
    }
  }
};

export const UserBranchAssignment = {
  async assign(user_id, branch_id, assigned_by) {
    try {
      const [row] = await sql`
        INSERT INTO user_branch_assignments (user_id, branch_id, assigned_by)
        VALUES (${user_id}, ${branch_id}, ${assigned_by || null})
        ON CONFLICT (user_id, branch_id) DO NOTHING
        RETURNING id, user_id, branch_id
      `;
      return row;
    } catch (error) {
      log.error('Error assigning branch', { error: error.message });
      throw error;
    }
  },
  async unassign(user_id, branch_id) {
    try {
      await sql`
        DELETE FROM user_branch_assignments WHERE user_id = ${user_id} AND branch_id = ${branch_id}
      `;
      return true;
    } catch (error) {
      log.error('Error unassigning branch', { error: error.message });
      throw error;
    }
  },
  async getAssignedBranches(user_id) {
    try {
      const rows = await sql`
        SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user_id}
      `;
      return rows.map(r => r.branch_id);
    } catch (error) {
      log.error('Error fetching assigned branches', { error: error.message });
      throw error;
    }
  }
};


/**
 * Notification Model
 * Database operations for notifications table
 */

import sql from '../config/database.js';

export const Notification = {
  /**
   * Find notification by ID
   */
  async findById(id) {
    try {
      const [notification] = await sql`
        SELECT n.*, u.full_name as created_by_name
        FROM notifications n
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.id = ${id} AND n.is_active = true
      `;
      return notification || null;
    } catch (error) {
      console.error('Error finding notification by ID:', error);
      throw error;
    }
  },

  /**
   * Get all notifications (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT n.*, u.full_name as created_by_name
        FROM notifications n
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.is_active = true
      `;
      
      if (filters.created_by) {
        query = sql`${query} AND n.created_by = ${filters.created_by}`;
      }
      
      if (filters.importance_level) {
        query = sql`${query} AND n.importance_level = ${filters.importance_level}`;
      }
      
      query = sql`${query} ORDER BY n.created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding notifications:', error);
      throw error;
    }
  },

  /**
   * Get notifications for a specific branch
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      let query = sql`
        SELECT DISTINCT n.*, u.full_name as created_by_name,
               nr.response_status, nr.response_message, nr.responded_at
        FROM notifications n
        INNER JOIN notification_branches nb ON n.id = nb.notification_id
        LEFT JOIN users u ON n.created_by = u.id
        LEFT JOIN notification_responses nr ON n.id = nr.notification_id AND nr.branch_id = ${branchId}
        WHERE nb.branch_id = ${branchId} AND n.is_active = true
      `;
      
      if (filters.importance_level) {
        query = sql`${query} AND n.importance_level = ${filters.importance_level}`;
      }
      
      if (filters.response_status) {
        if (filters.response_status === 'no_response') {
          query = sql`${query} AND nr.response_status IS NULL`;
        } else {
          query = sql`${query} AND nr.response_status = ${filters.response_status}`;
        }
      }
      
      query = sql`${query} ORDER BY n.importance_level DESC, n.created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding notifications by branch ID:', error);
      throw error;
    }
  },

  /**
   * Create new notification
   */
  async create(notificationData) {
    try {
      const { message, importance_level, created_by, branch_ids } = notificationData;
      
      if (!message || !importance_level || !created_by) {
        throw new Error('message, importance_level, and created_by are required');
      }
      
      if (!branch_ids || !Array.isArray(branch_ids) || branch_ids.length === 0) {
        throw new Error('At least one branch_id is required');
      }
      
      // Start transaction
      const [notification] = await sql`
        INSERT INTO notifications (message, importance_level, created_by)
        VALUES (${message}, ${importance_level}, ${created_by})
        RETURNING *
      `;
      
      // Insert branch associations
      for (const branchId of branch_ids) {
        await sql`
          INSERT INTO notification_branches (notification_id, branch_id)
          VALUES (${notification.id}, ${branchId})
          ON CONFLICT (notification_id, branch_id) DO NOTHING
        `;
      }
      
      // Fetch with created_by name
      return await this.findById(notification.id);
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  },

  /**
   * Update notification
   */
  async update(id, updates) {
    try {
      const allowedFields = ['message', 'importance_level'];
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
        UPDATE notifications 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1 AND is_active = true
        RETURNING *
      `;
      
      values.push(updates.updated_at);
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating notification:', error);
      throw error;
    }
  },

  /**
   * Soft delete notification
   */
  async softDelete(id) {
    try {
      const [notification] = await sql`
        UPDATE notifications 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, message
      `;
      
      return notification;
    } catch (error) {
      console.error('Error soft deleting notification:', error);
      throw error;
    }
  },

  /**
   * Get notification with branches and responses
   */
  async findByIdWithDetails(id) {
    try {
      const notification = await this.findById(id);
      if (!notification) return null;
      
      // Get branches
      const branches = await sql`
        SELECT b.id, b.branch_name, b.branch_type, nb.created_at as assigned_at
        FROM notification_branches nb
        INNER JOIN branches b ON nb.branch_id = b.id
        WHERE nb.notification_id = ${id}
        ORDER BY b.branch_name
      `;
      
      // Get responses
      const responses = await sql`
        SELECT nr.*, b.branch_name, b.branch_type
        FROM notification_responses nr
        INNER JOIN branches b ON nr.branch_id = b.id
        WHERE nr.notification_id = ${id}
        ORDER BY nr.responded_at DESC
      `;
      
      return {
        ...notification,
        branches: branches || [],
        responses: responses || []
      };
    } catch (error) {
      console.error('Error finding notification with details:', error);
      throw error;
    }
  }
};


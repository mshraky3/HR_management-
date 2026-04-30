/**
 * Notification Model
 * Database operations for notifications table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Notification = {
  /**
   * Find notification by ID
   * @param {number} id - Notification ID
   * @param {boolean} includeInactive - If true, return notification even if inactive
   * NOTE: Expired notification cleanup is now done lazily on write operations to reduce query count
   */
  async findById(id, includeInactive = false) {
    try {
      // NOTE: Removed UPDATE query for expired check - now handled in findAll and write operations
      // This saves 1 query per notification read

      let query = sql`
        SELECT n.*, u.full_name as created_by_name
        FROM notifications n
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.id = ${id}
      `;

      if (!includeInactive) {
        // Filter expired notifications in SELECT instead of UPDATE
        query = sql`${query} AND n.is_active = true AND (n.expires_at IS NULL OR n.expires_at >= CURRENT_TIMESTAMP)`;
      }

      const [notification] = await query;
      return notification || null;
    } catch (error) {
      log.error('Error finding notification by ID:', { error: error.message });
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
        WHERE 1=1
      `;

      // Filter by active status unless include_inactive is true
      if (!filters.include_inactive) {
        query = sql`${query} AND n.is_active = true AND (n.expires_at IS NULL OR n.expires_at >= CURRENT_TIMESTAMP)`;
      }

      if (filters.created_by) {
        query = sql`${query} AND n.created_by = ${filters.created_by}`;
      }

      if (filters.importance_level) {
        query = sql`${query} AND n.importance_level = ${filters.importance_level}`;
      }

      query = sql`${query} ORDER BY n.created_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding notifications:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get notifications for a specific branch
   */
  async findByBranchId(branchId, filters = {}, userId = null) {
    try {
      // Query notifications for this branch
      let query = sql`
        SELECT DISTINCT n.*, u.full_name as created_by_name,
               nr.response_status, nr.response_message, nr.responded_at,
               ${branchId} = ANY(n.seen_by_branches) as branch_seen
        FROM notifications n
        INNER JOIN notification_branches nb ON n.id = nb.notification_id
        LEFT JOIN users u ON n.created_by = u.id
        LEFT JOIN notification_responses nr ON n.id = nr.notification_id AND nr.branch_id = ${branchId}
        WHERE nb.branch_id = ${branchId} 
          AND n.is_active = true
          AND (n.expires_at IS NULL OR n.expires_at >= CURRENT_TIMESTAMP)
      `;

      // Filter out one-time notifications that this branch has already seen
      query = sql`${query} AND (
        n.one_time = false 
        OR NOT (${branchId} = ANY(n.seen_by_branches))
      )`;

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

      const notifications = await query;

      // Note: One-time notifications are NOT auto-marked here
      // They should be marked as viewed by the frontend when the user actually sees them
      // This ensures each user sees them once, and only when they actually view the notification

      return notifications;
    } catch (error) {
      log.error('Error finding notifications by branch ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new notification
   */
  async create(notificationData) {
    try {
      const { message, importance_level, created_by, branch_ids, attachment_url, attachment_name, attachment_type, expires_at, one_time, r2_attachment_url } = notificationData;

      if (!message || !importance_level || !created_by) {
        throw new Error('message, importance_level, and created_by are required');
      }

      if (!branch_ids || !Array.isArray(branch_ids) || branch_ids.length === 0) {
        throw new Error('At least one branch_id is required');
      }

      // Start transaction
      const [notification] = await sql`
        INSERT INTO notifications (message, importance_level, created_by, attachment_url, attachment_name, attachment_type, expires_at, one_time, r2_attachment_url)
        VALUES (${message}, ${importance_level}, ${created_by}, ${attachment_url || null}, ${attachment_name || null}, ${attachment_type || null}, ${expires_at || null}, ${one_time || false}, ${r2_attachment_url || null})
        RETURNING *
      `;

      // Batch insert branch associations using unnest() instead of loop
      // This reduces N queries to 1 query regardless of number of branches
      await sql`
        INSERT INTO notification_branches (notification_id, branch_id)
        SELECT ${notification.id}, unnest(${branch_ids}::int[])
        ON CONFLICT (notification_id, branch_id) DO NOTHING
      `;

      // Fetch with created_by name
      return await this.findById(notification.id);
    } catch (error) {
      log.error('Error creating notification:', { error: error.message });
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
      log.error('Error updating notification:', { error: error.message });
      throw error;
    }
  },

  /**
   * Hard delete notification (permanently remove from database)
   */
  async delete(id) {
    try {
      // First get the notification to return it
      const [notification] = await sql`
        SELECT id, message FROM notifications WHERE id = ${id}
      `;

      if (!notification) {
        return null;
      }

      // Delete related records first (CASCADE should handle this, but being explicit)
      await sql`DELETE FROM notification_views WHERE notification_id = ${id}`;
      await sql`DELETE FROM notification_responses WHERE notification_id = ${id}`;
      await sql`DELETE FROM notification_branches WHERE notification_id = ${id}`;

      // Delete the notification itself
      await sql`DELETE FROM notifications WHERE id = ${id}`;

      return notification;
    } catch (error) {
      log.error('Error deleting notification:', { error: error.message });
      throw error;
    }
  },

  /**
   * Activate notification (set is_active = true)
   */
  async activate(id) {
    try {
      const [notification] = await sql`
        UPDATE notifications 
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;

      return notification || null;
    } catch (error) {
      log.error('Error activating notification:', { error: error.message });
      throw error;
    }
  },

  /**
   * Deactivate notification (set is_active = false)
   */
  async deactivate(id) {
    try {
      const [notification] = await sql`
        UPDATE notifications 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;

      return notification || null;
    } catch (error) {
      log.error('Error deactivating notification:', { error: error.message });
      throw error;
    }
  },

  /**
   * Toggle notification active status
   */
  async toggleActive(id) {
    try {
      // First get current status
      const [current] = await sql`
        SELECT is_active FROM notifications WHERE id = ${id}
      `;

      if (!current) {
        return null;
      }

      const newStatus = !current.is_active;

      const [notification] = await sql`
        UPDATE notifications 
        SET is_active = ${newStatus}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;

      return notification || null;
    } catch (error) {
      log.error('Error toggling notification active status:', { error: error.message });
      throw error;
    }
  },

  /**
   * Mark notification as seen by a branch (for one-time notifications)
   */
  async markBranchAsSeen(notificationId, branchId) {
    try {
      // Add branch ID to the seen_by_branches array if not already present
      const [notification] = await sql`
        UPDATE notifications
        SET seen_by_branches = CASE
          WHEN ${branchId} = ANY(COALESCE(seen_by_branches, ARRAY[]::INTEGER[])) THEN seen_by_branches
          ELSE array_append(COALESCE(seen_by_branches, ARRAY[]::INTEGER[]), ${branchId})
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ${notificationId}
        RETURNING id, seen_by_branches
      `;

      return notification || null;
    } catch (error) {
      log.error('Error marking notification as seen by branch:', { error: error.message });
      throw error;
    }
  },

  /**
   * Mark notification as viewed by a user (for one-time notifications)
   * @deprecated - Use markBranchAsSeen instead
   */
  async markAsViewed(notificationId, userId) {
    try {
      // First verify the user exists
      const [user] = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;

      if (!user) {
        log.warn(`User ${userId} does not exist, skipping mark as viewed`);
        return null;
      }

      const [view] = await sql`
        INSERT INTO notification_views (notification_id, user_id)
        VALUES (${notificationId}, ${userId})
        ON CONFLICT (notification_id, user_id) DO NOTHING
        RETURNING *
      `;
      return view || null;
    } catch (error) {
      log.error('Error marking notification as viewed:', { error: error.message });
      throw error;
    }
  },

  /**
   * Check if a notification has been viewed by a user
   */
  async hasBeenViewed(notificationId, userId) {
    try {
      const [view] = await sql`
        SELECT * FROM notification_views 
        WHERE notification_id = ${notificationId} AND user_id = ${userId}
      `;
      return !!view;
    } catch (error) {
      log.error('Error checking if notification has been viewed:', { error: error.message });
      throw error;
    }
  },

  /**
   * Get notification with branches and responses
   */
  async findByIdWithDetails(id, includeInactive = true) {
    try {
      const notification = await this.findById(id, includeInactive);
      if (!notification) return null;

      // Get branches with seen status
      const branches = await sql`
        SELECT b.id, b.branch_name, b.branch_type, nb.created_at as assigned_at,
               CASE WHEN b.id = ANY(COALESCE(n.seen_by_branches, ARRAY[]::INTEGER[])) THEN true ELSE false END as seen
        FROM notification_branches nb
        INNER JOIN branches b ON nb.branch_id = b.id
        INNER JOIN notifications n ON nb.notification_id = n.id
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
      log.error('Error finding notification with details:', { error: error.message });
      throw error;
    }
  }
};


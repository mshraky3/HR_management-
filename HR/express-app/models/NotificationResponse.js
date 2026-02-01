/**
 * Notification Response Model
 * Database operations for notification_responses table
 */

import sql from '../config/database.js';

export const NotificationResponse = {
  /**
   * Find response by notification ID and branch ID
   */
  async findByNotificationAndBranch(notificationId, branchId) {
    try {
      const [response] = await sql`
        SELECT nr.*, b.branch_name
        FROM notification_responses nr
        INNER JOIN branches b ON nr.branch_id = b.id
        WHERE nr.notification_id = ${notificationId} AND nr.branch_id = ${branchId}
      `;
      return response || null;
    } catch (error) {
      console.error('Error finding notification response:', error);
      throw error;
    }
  },

  /**
   * Get all responses for a notification
   */
  async findByNotificationId(notificationId) {
    try {
      const responses = await sql`
        SELECT nr.*, b.branch_name, b.branch_type
        FROM notification_responses nr
        INNER JOIN branches b ON nr.branch_id = b.id
        WHERE nr.notification_id = ${notificationId}
        ORDER BY nr.responded_at DESC
      `;
      return responses || [];
    } catch (error) {
      console.error('Error finding notification responses:', error);
      throw error;
    }
  },

  /**
   * Get all responses for a branch
   */
  async findByBranchId(branchId) {
    try {
      const responses = await sql`
        SELECT nr.*, n.message, n.importance_level, n.created_at as notification_created_at
        FROM notification_responses nr
        INNER JOIN notifications n ON nr.notification_id = n.id
        WHERE nr.branch_id = ${branchId}
        ORDER BY nr.responded_at DESC
      `;
      return responses || [];
    } catch (error) {
      console.error('Error finding branch responses:', error);
      throw error;
    }
  },

  /**
   * Mark a response as seen by the manager (sets manager_seen_at)
   */
  async markSeenById(id) {
    try {
      const [updated] = await sql`
        UPDATE notification_responses
        SET manager_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      return updated || null;
    } catch (error) {
      console.error('Error marking response as seen:', error);
      throw error;
    }
  },

  /**
   * Mark all responses for a notification as seen by the manager
   */
  async markAllByNotification(notificationId) {
    try {
      await sql`
        UPDATE notification_responses
        SET manager_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE notification_id = ${notificationId}
      `;
      return true;
    } catch (error) {
      console.error('Error marking all responses as seen:', error);
      throw error;
    }
  },


  /**
   * Create or update response
   */
  async createOrUpdate(notificationId, branchId, responseData) {
    try {
      const { response_status, response_message } = responseData;
      
      if (!response_status || !['done', 'working_on_it', 'seen'].includes(response_status)) {
        throw new Error('Valid response_status is required (done, working_on_it, or seen)');
      }
      
      // Use INSERT ... ON CONFLICT to handle create or update
      const [response] = await sql`
        INSERT INTO notification_responses (notification_id, branch_id, response_status, response_message)
        VALUES (${notificationId}, ${branchId}, ${response_status}, ${response_message || null})
        ON CONFLICT (notification_id, branch_id)
        DO UPDATE SET
          response_status = EXCLUDED.response_status,
          response_message = EXCLUDED.response_message,
          updated_at = CURRENT_TIMESTAMP,
          responded_at = CASE 
            WHEN notification_responses.response_status != EXCLUDED.response_status 
            THEN CURRENT_TIMESTAMP 
            ELSE notification_responses.responded_at 
          END
        RETURNING *
      `;
      
      return response;
    } catch (error) {
      console.error('Error creating/updating notification response:', error);
      throw error;
    }
  },

  /**
   * Get response statistics for a notification
   */
  async getStatistics(notificationId) {
    try {
      // Get response statistics
      const stats = await sql`
        SELECT 
          COUNT(*) as total_branches,
          COUNT(nr.id) as responded_count,
          COUNT(CASE WHEN nr.response_status = 'done' THEN 1 END) as done_count,
          COUNT(CASE WHEN nr.response_status = 'working_on_it' THEN 1 END) as working_on_it_count,
          COUNT(CASE WHEN nr.response_status = 'seen' THEN 1 END) as seen_count,
          COUNT(*) - COUNT(nr.id) as no_response_count
        FROM notification_branches nb
        LEFT JOIN notification_responses nr ON nb.notification_id = nr.notification_id 
          AND nb.branch_id = nr.branch_id
        WHERE nb.notification_id = ${notificationId}
      `;
      
      // Get count of branches that have seen the notification (for one-time notifications)
      const [seenCount] = await sql`
        SELECT array_length(COALESCE(seen_by_branches, ARRAY[]::INTEGER[]), 1) as seen_branches_count
        FROM notifications
        WHERE id = ${notificationId}
      `;
      
      return {
        ...(stats[0] || {
          total_branches: 0,
          responded_count: 0,
          done_count: 0,
          working_on_it_count: 0,
        seen_count: 0,
        no_response_count: 0
      }),
      seen_branches_count: seenCount?.seen_branches_count || 0
    };
    } catch (error) {
      console.error('Error getting response statistics:', error);
      throw error;
    }
  }
};


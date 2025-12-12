/**
 * Alert Model
 * Database operations for alerts table (Smart Alerts System)
 */

import sql from '../config/database.js';

export const Alert = {
  /**
   * Find alert by ID
   */
  async findById(id) {
    try {
      const [alert] = await sql`
        SELECT a.*, 
               b.branch_name, b.branch_type,
               e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name as employee_name,
               e.employee_id_number,
               u.full_name as resolved_by_name
        FROM alerts a
        LEFT JOIN branches b ON a.branch_id = b.id
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN users u ON a.resolved_by = u.id
        WHERE a.id = ${id}
      `;
      return alert || null;
    } catch (error) {
      console.error('Error finding alert by ID:', error);
      throw error;
    }
  },

  /**
   * Get all alerts (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT a.*, 
               b.branch_name, b.branch_type,
               e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name as employee_name,
               e.employee_id_number,
               u.full_name as resolved_by_name
        FROM alerts a
        LEFT JOIN branches b ON a.branch_id = b.id
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN users u ON a.resolved_by = u.id
        WHERE 1=1
      `;
      
      if (filters.branch_id) {
        query = sql`${query} AND a.branch_id = ${filters.branch_id}`;
      }
      
      if (filters.employee_id) {
        query = sql`${query} AND a.employee_id = ${filters.employee_id}`;
      }
      
      if (filters.alert_type) {
        query = sql`${query} AND a.alert_type = ${filters.alert_type}`;
      }
      
      if (filters.priority) {
        query = sql`${query} AND a.priority = ${filters.priority}`;
      }
      
      if (filters.is_read !== undefined) {
        query = sql`${query} AND a.is_read = ${filters.is_read}`;
      }
      
      if (filters.is_resolved !== undefined) {
        query = sql`${query} AND a.is_resolved = ${filters.is_resolved}`;
      }
      
      // Exclude expired alerts unless explicitly requested
      if (filters.include_expired !== true) {
        query = sql`${query} AND (a.expires_at IS NULL OR a.expires_at > NOW())`;
      }
      
      query = sql`${query} ORDER BY 
        CASE a.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        a.created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding alerts:', error);
      throw error;
    }
  },

  /**
   * Get alerts for a specific branch
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      return await this.findAll({ ...filters, branch_id: branchId });
    } catch (error) {
      console.error('Error finding alerts by branch ID:', error);
      throw error;
    }
  },

  /**
   * Get alerts for a specific employee
   */
  async findByEmployeeId(employeeId, filters = {}) {
    try {
      return await this.findAll({ ...filters, employee_id: employeeId });
    } catch (error) {
      console.error('Error finding alerts by employee ID:', error);
      throw error;
    }
  },

  /**
   * Get unread alerts count
   */
  async getUnreadCount(filters = {}) {
    try {
      const baseFilters = { ...filters, is_read: false, is_resolved: false };
      const alerts = await this.findAll(baseFilters);
      return alerts.length;
    } catch (error) {
      console.error('Error getting unread alerts count:', error);
      throw error;
    }
  },

  /**
   * Create new alert
   */
  async create(alertData) {
    try {
      const {
        alert_type,
        priority = 'medium',
        title,
        message,
        branch_id,
        employee_id,
        related_entity_type,
        related_entity_id,
        alert_data,
        expires_at
      } = alertData;

      const [alert] = await sql`
        INSERT INTO alerts (
          alert_type, priority, title, message, branch_id, employee_id,
          related_entity_type, related_entity_id, alert_data, expires_at
        )
        VALUES (
          ${alert_type}, ${priority}, ${title}, ${message}, 
          ${branch_id || null}, ${employee_id || null},
          ${related_entity_type || null}, ${related_entity_id || null},
          ${alert_data ? JSON.stringify(alert_data) : null}, ${expires_at || null}
        )
        RETURNING *
      `;
      
      return alert;
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  },

  /**
   * Update alert
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        'title', 'message', 'priority', 'is_read', 'is_resolved',
        'resolved_by', 'expires_at', 'alert_data'
      ];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Handle resolved_at automatically
      if (updates.is_resolved === true && !updates.resolved_at) {
        updates.resolved_at = new Date();
      } else if (updates.is_resolved === false) {
        updates.resolved_at = null;
        updates.resolved_by = null;
      }

      // Build update query
      const setParts = [];
      const values = [];
      let paramIndex = 1;

      updateFields.forEach(field => {
        if (field === 'alert_data' && updates[field]) {
          setParts.push(`alert_data = $${paramIndex++}`);
          values.push(JSON.stringify(updates[field]));
        } else if (field !== 'resolved_at') {
          setParts.push(`${field} = $${paramIndex++}`);
          values.push(updates[field]);
        }
      });

      if (updates.resolved_at !== undefined) {
        setParts.push(`resolved_at = $${paramIndex++}`);
        values.push(updates.resolved_at);
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.unshift(id);

      const query = `
        UPDATE alerts 
        SET ${setParts.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating alert:', error);
      throw error;
    }
  },

  /**
   * Mark alert as read
   */
  async markAsRead(id) {
    try {
      return await this.update(id, { is_read: true });
    } catch (error) {
      console.error('Error marking alert as read:', error);
      throw error;
    }
  },

  /**
   * Mark alert as resolved
   */
  async markAsResolved(id, resolvedBy = null) {
    try {
      return await this.update(id, { 
        is_resolved: true, 
        resolved_by: resolvedBy,
        resolved_at: new Date()
      });
    } catch (error) {
      console.error('Error marking alert as resolved:', error);
      throw error;
    }
  },

  /**
   * Mark multiple alerts as read
   */
  async markMultipleAsRead(alertIds) {
    try {
      if (!Array.isArray(alertIds) || alertIds.length === 0) {
        return [];
      }

      const result = await sql`
        UPDATE alerts 
        SET is_read = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY(${alertIds})
        RETURNING *
      `;

      return result;
    } catch (error) {
      console.error('Error marking multiple alerts as read:', error);
      throw error;
    }
  },

  /**
   * Delete alert
   */
  async delete(id) {
    try {
      const [alert] = await sql`
        DELETE FROM alerts 
        WHERE id = ${id}
        RETURNING *
      `;
      return alert || null;
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  },

  /**
   * Delete expired alerts
   */
  async deleteExpired() {
    try {
      const result = await sql`
        DELETE FROM alerts 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id
      `;
      return result.length;
    } catch (error) {
      console.error('Error deleting expired alerts:', error);
      throw error;
    }
  },

  /**
   * Find or create alert (prevents duplicates)
   */
  async findOrCreate(alertData) {
    try {
      // Try to find existing similar alert
      const existing = await sql`
        SELECT * FROM alerts
        WHERE alert_type = ${alertData.alert_type}
          AND branch_id ${alertData.branch_id ? sql`= ${alertData.branch_id}` : sql`IS NULL`}
          AND employee_id ${alertData.employee_id ? sql`= ${alertData.employee_id}` : sql`IS NULL`}
          AND is_resolved = false
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (existing && existing.length > 0) {
        // Update existing alert
        return await this.update(existing[0].id, {
          title: alertData.title,
          message: alertData.message,
          priority: alertData.priority || existing[0].priority,
          is_read: false // Reset read status when updated
        });
      }

      // Create new alert
      return await this.create(alertData);
    } catch (error) {
      console.error('Error in findOrCreate alert:', error);
      throw error;
    }
  }
};


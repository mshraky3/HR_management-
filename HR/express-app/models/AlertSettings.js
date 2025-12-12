/**
 * Alert Settings Model
 * Database operations for alert_settings table (User notification preferences)
 */

import sql from '../config/database.js';

export const AlertSettings = {
  /**
   * Find alert settings by user ID
   */
  async findByUserId(userId) {
    try {
      const [settings] = await sql`
        SELECT * FROM alert_settings 
        WHERE user_id = ${userId}
      `;
      return settings || null;
    } catch (error) {
      console.error('Error finding alert settings by user ID:', error);
      throw error;
    }
  },

  /**
   * Get or create default settings for user
   */
  async getOrCreateDefault(userId) {
    try {
      let settings = await this.findByUserId(userId);
      
      if (!settings) {
        // Create default settings
        settings = await this.create({
          user_id: userId,
          id_expiry_enabled: true,
          id_expiry_days_before: 30,
          missing_document_enabled: true,
          incomplete_data_enabled: true,
          email_notifications_enabled: false,
          sms_notifications_enabled: false
        });
      }
      
      return settings;
    } catch (error) {
      console.error('Error getting or creating alert settings:', error);
      throw error;
    }
  },

  /**
   * Create alert settings
   */
  async create(settingsData) {
    try {
      const {
        user_id,
        id_expiry_enabled = true,
        id_expiry_days_before = 30,
        missing_document_enabled = true,
        incomplete_data_enabled = true,
        email_notifications_enabled = false,
        sms_notifications_enabled = false
      } = settingsData;

      const [settings] = await sql`
        INSERT INTO alert_settings (
          user_id, id_expiry_enabled, id_expiry_days_before,
          missing_document_enabled, incomplete_data_enabled,
          email_notifications_enabled, sms_notifications_enabled
        )
        VALUES (
          ${user_id}, ${id_expiry_enabled}, ${id_expiry_days_before},
          ${missing_document_enabled}, ${incomplete_data_enabled},
          ${email_notifications_enabled}, ${sms_notifications_enabled}
        )
        RETURNING *
      `;
      
      return settings;
    } catch (error) {
      console.error('Error creating alert settings:', error);
      throw error;
    }
  },

  /**
   * Update alert settings
   */
  async update(userId, updates) {
    try {
      const allowedFields = [
        'id_expiry_enabled', 'id_expiry_days_before',
        'missing_document_enabled', 'incomplete_data_enabled',
        'email_notifications_enabled', 'sms_notifications_enabled'
      ];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = updateFields.map(field => updates[field]);
      values.unshift(userId);

      const query = `
        UPDATE alert_settings 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *
      `;

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating alert settings:', error);
      throw error;
    }
  }
};


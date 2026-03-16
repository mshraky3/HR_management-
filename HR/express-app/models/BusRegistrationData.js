/**
 * Bus Registration Data Model
 * Database operations for bus_registration_data table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BusRegistrationData = {
  /**
   * Find registration data by bus ID
   */
  async findByBusId(busId) {
    try {
      const [registration] = await sql`
        SELECT * FROM bus_registration_data 
        WHERE bus_id = ${busId}
      `;
      return registration || null;
    } catch (error) {
      log.error('Error finding bus registration by bus ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Create or update registration data
   */
  async upsert(busId, registrationData) {
    try {
      // Check if registration exists
      const existing = await this.findByBusId(busId);

      if (existing) {
        // Update existing
        const [updated] = await sql`
          UPDATE bus_registration_data
          SET 
            registration_number = ${registrationData.registration_number},
            chassis_number = ${registrationData.chassis_number},
            vehicle_model = ${registrationData.vehicle_model},
            model_year = ${registrationData.model_year || null},
            vehicle_color = ${registrationData.vehicle_color || null},
            expiry_date_gregorian = ${registrationData.expiry_date_gregorian || null},
            registration_document_url = ${registrationData.registration_document_url || null},
            registration_document_name = ${registrationData.registration_document_name || null},
            registration_document_mime_type = ${registrationData.registration_document_mime_type || null},
            r2_registration_document_url = ${registrationData.r2_registration_document_url || null},
            is_verified = ${registrationData.is_verified || false},
            verified_at = ${registrationData.is_verified ? new Date() : null},
            verified_by = ${registrationData.verified_by || null},
            updated_at = CURRENT_TIMESTAMP
          WHERE bus_id = ${busId}
          RETURNING *
        `;
        return updated;
      } else {
        // Create new
        const [created] = await sql`
          INSERT INTO bus_registration_data (
            bus_id, registration_number, chassis_number,
            vehicle_model, model_year, vehicle_color,
            expiry_date_gregorian,
            registration_document_url, registration_document_name,
            registration_document_mime_type, r2_registration_document_url,
            is_verified, verified_at, verified_by
          )
          VALUES (
            ${busId}, ${registrationData.registration_number},
            ${registrationData.chassis_number},
            ${registrationData.vehicle_model},
            ${registrationData.model_year || null},
            ${registrationData.vehicle_color || null},
            ${registrationData.expiry_date_gregorian || null},
            ${registrationData.registration_document_url || null},
            ${registrationData.registration_document_name || null},
            ${registrationData.registration_document_mime_type || null},
            ${registrationData.r2_registration_document_url || null},
            ${registrationData.is_verified || false},
            ${registrationData.is_verified ? new Date() : null},
            ${registrationData.verified_by || null}
          )
          RETURNING *
        `;
        return created;
      }
    } catch (error) {
      log.error('Error upserting bus registration data', { error: error.message });
      throw error;
    }
  },

  /**
   * Verify registration
   */
  async verify(busId, verifiedBy) {
    try {
      const [updated] = await sql`
        UPDATE bus_registration_data
        SET 
          is_verified = true,
          verified_at = CURRENT_TIMESTAMP,
          verified_by = ${verifiedBy}
        WHERE bus_id = ${busId}
        RETURNING *
      `;
      return updated || null;
    } catch (error) {
      log.error('Error verifying bus registration', { error: error.message });
      throw error;
    }
  }
};

/**
 * Driver License Data Model
 * Database operations for driver_license_data table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const DriverLicenseData = {
  /**
   * Find driver license data by bus ID
   */
  async findByBusId(busId) {
    try {
      const [license] = await sql`
        SELECT * FROM driver_license_data 
        WHERE bus_id = ${busId}
      `;
      return license || null;
    } catch (error) {
      log.error('Error finding driver license by bus ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Create or update driver license data
   */
  async upsert(busId, licenseData) {
    try {
      // Check if license exists
      const existing = await this.findByBusId(busId);

      if (existing) {
        // Update existing
        const [updated] = await sql`
          UPDATE driver_license_data
          SET 
            driver_full_name = ${licenseData.driver_full_name},
            driver_id_number = ${licenseData.driver_id_number},
            license_number = ${licenseData.license_number},
            issue_date_gregorian = ${licenseData.issue_date_gregorian || null},
            expiry_date_gregorian = ${licenseData.expiry_date_gregorian || null},
            driver_phone_number = ${licenseData.driver_phone_number || null},
            driver_nationality = ${licenseData.driver_nationality || null},
            driver_date_of_birth_gregorian = ${licenseData.driver_date_of_birth_gregorian || null},
            has_assistant = ${licenseData.has_assistant || false},
            assistant_full_name = ${licenseData.assistant_full_name || null},
            assistant_phone_number = ${licenseData.assistant_phone_number || null},
            license_document_url = ${licenseData.license_document_url || null},
            license_document_name = ${licenseData.license_document_name || null},
            license_document_mime_type = ${licenseData.license_document_mime_type || null},
            r2_license_document_url = ${licenseData.r2_license_document_url || null},
            is_verified = ${licenseData.is_verified || false},
            verified_at = ${licenseData.is_verified ? new Date() : null},
            verified_by = ${licenseData.verified_by || null},
            updated_at = CURRENT_TIMESTAMP
          WHERE bus_id = ${busId}
          RETURNING *
        `;
        return updated;
      } else {
        // Create new
        const [created] = await sql`
          INSERT INTO driver_license_data (
            bus_id, driver_full_name, driver_id_number, license_number,
            issue_date_gregorian,
            expiry_date_gregorian,
            driver_phone_number,
            driver_nationality,
            driver_date_of_birth_gregorian, has_assistant, assistant_full_name, assistant_phone_number, license_document_url,
            license_document_name, license_document_mime_type,
            r2_license_document_url,
            is_verified, verified_at, verified_by
          )
          VALUES (
            ${busId}, ${licenseData.driver_full_name},
            ${licenseData.driver_id_number},
            ${licenseData.license_number},
            ${licenseData.issue_date_gregorian || null},
            ${licenseData.expiry_date_gregorian || null},
            ${licenseData.driver_phone_number || null},
            ${licenseData.driver_nationality || null},
            ${licenseData.driver_date_of_birth_gregorian || null},
            ${licenseData.has_assistant || false},
            ${licenseData.assistant_full_name || null},
            ${licenseData.assistant_phone_number || null},
            ${licenseData.license_document_url || null},
            ${licenseData.license_document_name || null},
            ${licenseData.license_document_mime_type || null},
            ${licenseData.r2_license_document_url || null},
            ${licenseData.is_verified || false},
            ${licenseData.is_verified ? new Date() : null},
            ${licenseData.verified_by || null}
          )
          RETURNING *
        `;
        return created;
      }
    } catch (error) {
      log.error('Error upserting driver license data', { error: error.message });
      throw error;
    }
  },

  /**
   * Verify driver license
   */
  async verify(busId, verifiedBy) {
    try {
      const [updated] = await sql`
        UPDATE driver_license_data
        SET 
          is_verified = true,
          verified_at = CURRENT_TIMESTAMP,
          verified_by = ${verifiedBy}
        WHERE bus_id = ${busId}
        RETURNING *
      `;
      return updated || null;
    } catch (error) {
      log.error('Error verifying driver license', { error: error.message });
      throw error;
    }
  }
};

/**
 * Bus Details Model
 * Database operations for bus_details table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BusDetails = {
  /**
   * Find bus details by bus ID
   */
  async findByBusId(busId) {
    try {
      const [details] = await sql`
        SELECT * FROM bus_details 
        WHERE bus_id = ${busId}
      `;
      return details || null;
    } catch (error) {
      log.error('Error finding bus details by bus ID', { error: error.message });
      throw error;
    }
  },

  async findByBusIds(busIds = []) {
    try {
      if (!Array.isArray(busIds) || busIds.length === 0) {
        return [];
      }

      const normalizedIds = busIds.map(id => Number.parseInt(id, 10)).filter(id => !Number.isNaN(id));
      if (normalizedIds.length === 0) {
        return [];
      }

      const query = `
        SELECT *
        FROM bus_details
        WHERE bus_id = ANY($1::int[])
      `;

      return await sql.unsafe(query, [normalizedIds]);
    } catch (error) {
      log.error('Error finding bus details by bus IDs', { error: error.message });
      throw error;
    }
  },

  /**
   * Create or update bus details
   */
  async upsert(busId, detailsData) {
    try {
      // Check if details exist
      const existing = await this.findByBusId(busId);

      if (existing) {
        // Update existing
        const [updated] = await sql`
          UPDATE bus_details
          SET 
            route_name = ${detailsData.route_name || null},
            route_description = ${detailsData.route_description || null},
            number_of_seats = ${detailsData.number_of_seats},
            ownership_type = ${detailsData.ownership_type},
            lease_company_name = ${detailsData.lease_company_name || null},
            lease_contact_info = ${detailsData.lease_contact_info || null},
            lease_contract_number = ${detailsData.lease_contract_number || null},
            lease_start_date_hijri = ${detailsData.lease_start_date_hijri || null},
            lease_start_date_gregorian = ${detailsData.lease_start_date_gregorian || null},
            lease_end_date_hijri = ${detailsData.lease_end_date_hijri || null},
            lease_end_date_gregorian = ${detailsData.lease_end_date_gregorian || null},
            insurance_provider = ${detailsData.insurance_provider || null},
            insurance_policy_number = ${detailsData.insurance_policy_number || null},
            insurance_expiry_date_gregorian = ${detailsData.insurance_expiry_date_gregorian || null},
            updated_at = CURRENT_TIMESTAMP
          WHERE bus_id = ${busId}
          RETURNING *
        `;
        return updated;
      } else {
        // Create new
        const [created] = await sql`
          INSERT INTO bus_details (
            bus_id, route_name, route_description, number_of_seats,
            ownership_type, lease_company_name, lease_contact_info,
            lease_contract_number, lease_start_date_hijri, lease_start_date_gregorian,
            lease_end_date_hijri, lease_end_date_gregorian,
            insurance_provider, insurance_policy_number,
            insurance_expiry_date_gregorian
          )
          VALUES (
            ${busId}, ${detailsData.route_name || null},
            ${detailsData.route_description || null},
            ${detailsData.number_of_seats},
            ${detailsData.ownership_type},
            ${detailsData.lease_company_name || null},
            ${detailsData.lease_contact_info || null},
            ${detailsData.lease_contract_number || null},
            ${detailsData.lease_start_date_hijri || null},
            ${detailsData.lease_start_date_gregorian || null},
            ${detailsData.lease_end_date_hijri || null},
            ${detailsData.lease_end_date_gregorian || null},
            ${detailsData.insurance_provider || null},
            ${detailsData.insurance_policy_number || null},
            ${detailsData.insurance_expiry_date_gregorian || null}
          )
          RETURNING *
        `;
        return created;
      }
    } catch (error) {
      log.error('Error upserting bus details', { error: error.message });
      throw error;
    }
  }
};

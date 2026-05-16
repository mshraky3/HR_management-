/**
 * License Plate Data Model
 * Database operations for license_plate_data table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const LicensePlateData = {
  /**
   * Find all license plates by bus ID
   */
  async findByBusId(busId) {
    try {
      const plates = await sql`
        SELECT * FROM license_plate_data 
        WHERE bus_id = ${busId}
        ORDER BY is_primary DESC, created_at ASC
      `;
      return plates || [];
    } catch (error) {
      log.error('Error finding license plates by bus ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Create license plate
   */
  async create(plateData) {
    try {
      const { bus_id, plate_number, is_primary } = plateData;

      // If this is set as primary, unset other primary plates for this bus
      if (is_primary) {
        await sql`
          UPDATE license_plate_data
          SET is_primary = false
          WHERE bus_id = ${bus_id} AND is_primary = true
        `;
      }

      const [plate] = await sql`
        INSERT INTO license_plate_data (bus_id, plate_number, is_primary)
        VALUES (${bus_id}, ${plate_number}, ${is_primary || false})
        RETURNING *
      `;

      return plate;
    } catch (error) {
      log.error('Error creating license plate', { error: error.message });
      throw error;
    }
  },

  /**
   * Update license plate
   */
  async update(id, updates) {
    try {
      const allowedFields = ['plate_number', 'is_primary'];
      const updateFields = [];
      const updateValues = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(field);
          updateValues.push(updates[field]);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // If setting as primary, unset other primary plates for the same bus
      if (updates.is_primary === true) {
        const [currentPlate] = await sql`
          SELECT bus_id FROM license_plate_data WHERE id = ${id}
        `;
        if (currentPlate) {
          await sql`
            UPDATE license_plate_data
            SET is_primary = false
            WHERE bus_id = ${currentPlate.bus_id} AND id != ${id} AND is_primary = true
          `;
        }
      }

      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');

      const values = [...updateValues];
      values.unshift(id);

      const query = `
        UPDATE license_plate_data 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;

      values.push(new Date());

      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating license plate', { error: error.message });
      throw error;
    }
  },

  /**
   * Delete license plate
   */
  async delete(id) {
    try {
      const [deleted] = await sql`
        DELETE FROM license_plate_data
        WHERE id = ${id}
        RETURNING *
      `;
      return deleted || null;
    } catch (error) {
      log.error('Error deleting license plate', { error: error.message });
      throw error;
    }
  },

  /**
   * Set primary plate for a bus
   */
  async setPrimary(busId, plateId) {
    try {
      // Verify the plate exists and belongs to this bus before making any changes
      const [plate] = await sql`
        SELECT id FROM license_plate_data
        WHERE id = ${plateId} AND bus_id = ${busId}
      `;

      if (!plate) {
        return null;
      }

      // Unset all primary plates for this bus
      await sql`
        UPDATE license_plate_data
        SET is_primary = false
        WHERE bus_id = ${busId}
      `;

      // Set the specified plate as primary
      const [updated] = await sql`
        UPDATE license_plate_data
        SET is_primary = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${plateId} AND bus_id = ${busId}
        RETURNING *
      `;

      return updated || null;
    } catch (error) {
      log.error('Error setting primary license plate', { error: error.message });
      throw error;
    }
  }
};

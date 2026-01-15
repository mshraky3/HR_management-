/**
 * Bus Transportation Model
 * Database operations for bus_transportation table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BusTransportation = {
  /**
   * Find bus by ID with all related data
   */
  async findById(id) {
    try {
      const [bus] = await sql`
        SELECT 
          bt.*,
          b.branch_name,
          b.branch_type,
          t.term_name,
          t.academic_year_label,
          t.term_number,
          t.start_date as term_start_date,
          t.end_date as term_end_date
        FROM bus_transportation bt
        INNER JOIN branches b ON bt.branch_id = b.id
        INNER JOIN terms t ON bt.term_id = t.id
        WHERE bt.id = ${id}
      `;
      
      if (!bus) {
        return null;
      }

      // Get related data
      const [registration] = await sql`
        SELECT * FROM bus_registration_data WHERE bus_id = ${id}
      `;
      
      const [driverLicense] = await sql`
        SELECT * FROM driver_license_data WHERE bus_id = ${id}
      `;
      
      const licensePlates = await sql`
        SELECT * FROM license_plate_data WHERE bus_id = ${id} ORDER BY is_primary DESC, created_at ASC
      `;
      
      const [details] = await sql`
        SELECT * FROM bus_details WHERE bus_id = ${id}
      `;
      
      const students = await sql`
        SELECT * FROM bus_students WHERE bus_id = ${id} ORDER BY created_at ASC
      `;

      return {
        ...bus,
        registration: registration || null,
        driver_license: driverLicense || null,
        license_plates: licensePlates || [],
        details: details || null,
        students: students || []
      };
    } catch (error) {
      log.error('Error finding bus by ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find all buses with optional filters
   * Main manager: sees all buses
   * Branch manager: only their branch's buses
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT 
          bt.*,
          b.branch_name,
          b.branch_type,
          t.term_name,
          t.academic_year_label,
          t.term_number,
          brd.registration_number,
          brd.expiry_date_gregorian as registration_expiry,
          brd.registration_document_url,
          dld.driver_full_name,
          dld.license_number,
          dld.expiry_date_gregorian as license_expiry,
          dld.license_document_url,
          bd.route_name,
          bd.number_of_seats,
          bd.ownership_type,
          bd.insurance_provider,
          bd.insurance_policy_number,
          bd.insurance_expiry_date_gregorian,
          bd.lease_company_name,
          bd.lease_contact_info,
          bd.lease_contract_number,
          bd.lease_start_date_gregorian,
          bd.lease_end_date_gregorian,
          (SELECT plate_number FROM license_plate_data lpd WHERE lpd.bus_id = bt.id AND lpd.is_primary = true LIMIT 1) as primary_plate,
          (SELECT COUNT(*) FROM bus_students bs WHERE bs.bus_id = bt.id) as student_count,
          bt.lease_contract_document_url
        FROM bus_transportation bt
        INNER JOIN branches b ON bt.branch_id = b.id
        INNER JOIN terms t ON bt.term_id = t.id
        LEFT JOIN bus_registration_data brd ON bt.id = brd.bus_id
        LEFT JOIN driver_license_data dld ON bt.id = dld.bus_id
        LEFT JOIN bus_details bd ON bt.id = bd.bus_id
        WHERE 1=1
      `;

      if (filters.branch_id) {
        query = sql`${query} AND bt.branch_id = ${filters.branch_id}`;
      }

      if (filters.term_id) {
        query = sql`${query} AND bt.term_id = ${filters.term_id}`;
      }

      if (filters.branch_type) {
        query = sql`${query} AND b.branch_type = ${filters.branch_type}`;
      }

      if (filters.bus_number) {
        query = sql`${query} AND bt.bus_number ILIKE ${'%' + filters.bus_number + '%'}`;
      }

      if (filters.route_name) {
        query = sql`${query} AND bd.route_name ILIKE ${'%' + filters.route_name + '%'}`;
      }

      if (filters.driver_name) {
        query = sql`${query} AND dld.driver_full_name ILIKE ${'%' + filters.driver_name + '%'}`;
      }

      if (filters.plate_number) {
        query = sql`${query} AND EXISTS (
          SELECT 1 FROM license_plate_data lpd 
          WHERE lpd.bus_id = bt.id AND lpd.plate_number ILIKE ${'%' + filters.plate_number + '%'}
        )`;
      }

      query = sql`${query} ORDER BY bt.created_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding buses', { error: error.message });
      throw error;
    }
  },

  /**
   * Find buses by branch ID
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      return await this.findAll({ ...filters, branch_id: branchId });
    } catch (error) {
      log.error('Error finding buses by branch ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find buses by term ID
   */
  async findByTermId(termId, filters = {}) {
    try {
      return await this.findAll({ ...filters, term_id: termId });
    } catch (error) {
      log.error('Error finding buses by term ID', { error: error.message });
      throw error;
    }
  },

  /**
   * Find buses by branch and term
   */
  async findByBranchAndTerm(branchId, termId, filters = {}) {
    try {
      return await this.findAll({ ...filters, branch_id: branchId, term_id: termId });
    } catch (error) {
      log.error('Error finding buses by branch and term', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new bus
   */
  async create(busData) {
    try {
      const { branch_id, term_id, bus_number, created_by } = busData;
      
      if (!term_id) {
        throw new Error('term_id is required');
      }
      
      const [bus] = await sql`
        INSERT INTO bus_transportation (branch_id, term_id, bus_number, created_by, updated_by)
        VALUES (${branch_id}, ${term_id}, ${bus_number}, ${created_by || null}, ${created_by || null})
        RETURNING *
      `;
      
      return bus;
    } catch (error) {
      log.error('Error creating bus', { error: error.message });
      throw error;
    }
  },

  /**
   * Update bus
   */
  async update(id, updates) {
    try {
      const allowedFields = [
        'bus_number',
        'term_id',
        'lease_contract_document_url',
        'lease_contract_document_name',
        'lease_contract_document_mime_type'
      ];
      const updateFields = [];
      const updateValues = [];
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(field);
          updateValues.push(updates[field]);
        }
      }
      
      if (updates.updated_by !== undefined) {
        updateFields.push('updated_by');
        updateValues.push(updates.updated_by);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');
      
      const values = [...updateValues];
      values.unshift(id);
      
      const query = `
        UPDATE bus_transportation 
        SET ${setClause}, updated_at = $${values.length + 1}
        WHERE id = $1
        RETURNING *
      `;
      
      values.push(new Date());
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      log.error('Error updating bus', { error: error.message });
      throw error;
    }
  },

  /**
   * Delete bus (hard delete - buses are term-specific, so deletion removes the term registration)
   */
  async delete(id) {
    try {
      const [bus] = await sql`
        DELETE FROM bus_transportation 
        WHERE id = ${id}
        RETURNING id, bus_number, term_id
      `;
      
      return bus;
    } catch (error) {
      log.error('Error deleting bus', { error: error.message });
      throw error;
    }
  }
};

/**
 * Employee Model
 * Database operations for employees table
 */

import sql from '../config/database.js';

export const Employee = {
  /**
   * Find employee by ID
   */
  async findById(id) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE id = ${id} AND is_active = true
      `;
      return employee || null;
    } catch (error) {
      console.error('Error finding employee by ID:', error);
      throw error;
    }
  },

  /**
   * Find employee by employee_id_number
   */
  async findByEmployeeId(employeeIdNumber) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE employee_id_number = ${employeeIdNumber} AND is_active = true
      `;
      return employee || null;
    } catch (error) {
      console.error('Error finding employee by employee ID:', error);
      throw error;
    }
  },

  /**
   * Find employee by ID/residency number
   */
  async findByIdOrResidencyNumber(idOrResidencyNumber) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE id_or_residency_number = ${idOrResidencyNumber} AND is_active = true
      `;
      return employee || null;
    } catch (error) {
      console.error('Error finding employee by ID/residency number:', error);
      throw error;
    }
  },

  /**
   * Get all employees (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`SELECT * FROM employees WHERE 1=1`;
      
      if (filters.branch_id) {
        query = sql`${query} AND branch_id = ${filters.branch_id}`;
      }
      
      if (filters.occupation) {
        query = sql`${query} AND occupation = ${filters.occupation}`;
      }
      
      if (filters.is_active !== undefined) {
        query = sql`${query} AND is_active = ${filters.is_active}`;
      }
      
      query = sql`${query} ORDER BY created_at DESC`;
      
      return await query;
    } catch (error) {
      console.error('Error finding employees:', error);
      throw error;
    }
  },

  /**
   * Create new employee
   */
  async create(employeeData) {
    try {
      const {
        employee_id_number, branch_id, first_name, second_name, third_name, fourth_name,
        occupation, nationality, date_of_birth_hijri, date_of_birth_gregorian,
        id_or_residency_number, id_type, gender, id_expiry_date_hijri, id_expiry_date_gregorian,
        religion, marital_status, educational_qualification, specialization,
        bank_iban, bank_name, email, phone_number, contract_type, salary, created_by
      } = employeeData;
      
      const [employee] = await sql`
        INSERT INTO employees (
          employee_id_number, branch_id, first_name, second_name, third_name, fourth_name,
          occupation, nationality, date_of_birth_hijri, date_of_birth_gregorian,
          id_or_residency_number, id_type, gender, id_expiry_date_hijri, id_expiry_date_gregorian,
          religion, marital_status, educational_qualification, specialization,
          bank_iban, bank_name, email, phone_number, contract_type, salary, created_by
        )
        VALUES (
          ${employee_id_number}, ${branch_id}, ${first_name}, ${second_name}, ${third_name}, ${fourth_name},
          ${occupation}, ${nationality}, ${date_of_birth_hijri || null}, ${date_of_birth_gregorian},
          ${id_or_residency_number}, ${id_type}, ${gender}, ${id_expiry_date_hijri || null}, ${id_expiry_date_gregorian || null},
          ${religion || null}, ${marital_status || null}, ${educational_qualification || null}, ${specialization || null},
          ${bank_iban || null}, ${bank_name || null}, ${email || null}, ${phone_number || null},
          ${contract_type || null}, ${salary || null}, ${created_by || null}
        )
        RETURNING *
      `;
      
      return employee;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  },

  /**
   * Update employee
   */
  async update(id, updates, updatedBy) {
    try {
      const allowedFields = [
        'first_name', 'second_name', 'third_name', 'fourth_name',
        'occupation', 'nationality', 'date_of_birth_hijri', 'date_of_birth_gregorian',
        'id_type', 'gender', 'id_expiry_date_hijri', 'id_expiry_date_gregorian',
        'religion', 'marital_status', 'educational_qualification', 'specialization',
        'bank_iban', 'bank_name', 'email', 'phone_number', 'contract_type', 'salary'
      ];
      
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      updates.updated_at = new Date();
      updates.updated_by = updatedBy;
      
      // Build SET clause manually
      const setClause = updateFields.map((field, index) => {
        return `${field} = $${index + 2}`;
      }).join(', ');
      
      const values = updateFields.map(field => updates[field]);
      values.unshift(id);
      
      const query = `
        UPDATE employees 
        SET ${setClause}, updated_at = $${values.length + 1}, updated_by = $${values.length + 2}
        WHERE id = $1
        RETURNING *
      `;
      
      values.push(updates.updated_at, updates.updated_by);
      
      const result = await sql.unsafe(query, values);
      return result[0] || null;
    } catch (error) {
      console.error('Error updating employee:', error);
      throw error;
    }
  },

  /**
   * Soft delete employee
   */
  async softDelete(id) {
    try {
      const [employee] = await sql`
        UPDATE employees 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, employee_id_number, is_active
      `;
      
      return employee;
    } catch (error) {
      console.error('Error soft deleting employee:', error);
      throw error;
    }
  }
};


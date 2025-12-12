/**
 * Employee Model
 * Database operations for employees table
 */

import sql from '../config/database.js';

export const Employee = {
  /**
   * Find employee by ID
   * Note: Removed is_active filter to allow viewing archived employees
   * Access control should be handled at the route level if needed
   */
  async findById(id) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE id = ${id}
      `;
      return employee || null;
    } catch (error) {
      console.error('Error finding employee by ID:', error);
      throw error;
    }
  },

  /**
   * Find employee by employee_id_number
   * Note: Removed is_active filter to allow finding archived employees if needed
   * For active employees only, use findAll with status filter
   */
  async findByEmployeeId(employeeIdNumber) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE employee_id_number = ${employeeIdNumber}
      `;
      return employee || null;
    } catch (error) {
      console.error('Error finding employee by employee ID:', error);
      throw error;
    }
  },

  /**
   * Find employee by ID/residency number
   * Note: Removed is_active filter to allow finding archived employees if needed
   * For active employees only, use findAll with status filter
   */
  async findByIdOrResidencyNumber(idOrResidencyNumber) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE id_or_residency_number = ${idOrResidencyNumber}
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
      const conditions = [];
      const params = [];
      let paramIndex = 1;
      
      // Base condition
      conditions.push('1=1');
      
      if (filters.branch_id) {
        if (Array.isArray(filters.branch_id) && filters.branch_id.length > 0) {
          // Multiple branch IDs
          const placeholders = filters.branch_id.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`branch_id IN (${placeholders})`);
          params.push(...filters.branch_id);
        } else if (!Array.isArray(filters.branch_id)) {
          // Single branch ID
          conditions.push(`branch_id = $${paramIndex++}`);
          params.push(filters.branch_id);
        }
      }
      
      if (filters.occupation) {
        conditions.push(`occupation = $${paramIndex++}`);
        params.push(filters.occupation);
      }
      
      // Handle status filter (takes precedence over is_active for employee filtering)
      if (filters.status) {
        // If status is explicitly set, use it (allows filtering by specific status)
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      } else {
        // By default, exclude archived employees (only show active or pending)
        // This ensures archived employees only appear in the archive page
        conditions.push(`(status IS NULL OR status IN ('active', 'pending'))`);
      }
      
      // Note: is_active filter is kept for backward compatibility but status takes precedence
      // For employees, status should be used instead of is_active
      if (filters.is_active !== undefined && !filters.status) {
        // Only apply is_active filter if status is not explicitly set
        // This maintains backward compatibility while prioritizing status
        conditions.push(`is_active = $${paramIndex++}`);
        params.push(filters.is_active);
      }
      
      if (filters.data_completion_status) {
        conditions.push(`data_completion_status = $${paramIndex++}`);
        params.push(filters.data_completion_status);
      }
      
      // Search by name (partial match on any name field)
      if (filters.search_name) {
        const namePattern = `%${filters.search_name}%`;
        conditions.push(`(
          first_name ILIKE $${paramIndex} OR 
          second_name ILIKE $${paramIndex} OR 
          third_name ILIKE $${paramIndex} OR 
          fourth_name ILIKE $${paramIndex}
        )`);
        params.push(namePattern);
        paramIndex++;
      }
      
      // Search by ID or residency number (exact or partial match)
      if (filters.search_id) {
        conditions.push(`id_or_residency_number ILIKE $${paramIndex++}`);
        params.push(`%${filters.search_id}%`);
      }
      
      // Search by phone number (partial match)
      if (filters.search_phone) {
        conditions.push(`phone_number ILIKE $${paramIndex++}`);
        params.push(`%${filters.search_phone}%`);
      }
      
      const whereClause = conditions.join(' AND ');
      
      // Performance Optimization: Use LIMIT for large result sets
      // This prevents loading too much data at once
      const limit = filters.limit ? parseInt(filters.limit, 10) : null;
      const offset = filters.offset ? parseInt(filters.offset, 10) : null;
      
      let queryString = `SELECT * FROM employees WHERE ${whereClause} ORDER BY created_at DESC`;
      
      // Add LIMIT and OFFSET if provided (for pagination support)
      if (limit && limit > 0 && limit <= 10000) {
        queryString += ` LIMIT ${limit}`;
        if (offset && offset > 0) {
          queryString += ` OFFSET ${offset}`;
        }
      }
      
      return await sql.unsafe(queryString, params);
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
        bank_iban, bank_name, email, phone_number, national_address, contract_type, 
        years_of_experience_in_same_institution, years_of_experience_in_company, salary,
        base_salary, housing_allowance, transportation_allowance, 
        end_of_service_allowance, annual_leave_allowance, other_allowances,
        deductions, graduation_year, university_gpa,
        passport_number, passport_issue_date, passport_expiry_date, passport_issue_place, residency_issue_date,
        job_title, data_completion_status, status, created_by, updated_by
      } = employeeData;
      
      // If updated_by is not provided, use created_by (for new records)
      const finalUpdatedBy = updated_by || created_by;
      
      if (!created_by || !finalUpdatedBy) {
        throw new Error('created_by and updated_by are required');
      }
      
      // Ensure status is set to 'active' for new employees (unless explicitly provided)
      const employeeStatus = status || 'active';
      
      const [employee] = await sql`
        INSERT INTO employees (
          employee_id_number, branch_id, first_name, second_name, third_name, fourth_name,
          occupation, nationality, date_of_birth_hijri, date_of_birth_gregorian,
          id_or_residency_number, id_type, gender, id_expiry_date_hijri, id_expiry_date_gregorian,
          religion, marital_status, educational_qualification, specialization,
          bank_iban, bank_name, email, phone_number, national_address, contract_type, years_of_experience_in_same_institution, years_of_experience_in_company, salary,
          base_salary, housing_allowance, transportation_allowance,
          end_of_service_allowance, annual_leave_allowance, other_allowances,
          deductions, graduation_year, university_gpa,
          passport_number, passport_issue_date, passport_expiry_date, passport_issue_place, residency_issue_date,
          job_title, data_completion_status, status, created_by, updated_by
        )
        VALUES (
          ${employee_id_number || null}, ${branch_id}, ${first_name}, ${second_name}, ${third_name}, ${fourth_name},
          ${occupation || null}, ${nationality}, ${date_of_birth_hijri || null}, ${date_of_birth_gregorian || null},
          ${id_or_residency_number}, ${id_type || null}, ${gender || null}, ${id_expiry_date_hijri || null}, ${id_expiry_date_gregorian || null},
          ${religion || null}, ${marital_status || null}, ${educational_qualification || null}, ${specialization || null},
          ${bank_iban || null}, ${bank_name || null}, ${email || null}, ${phone_number || null},
          ${national_address || null}, ${contract_type || null}, ${years_of_experience_in_same_institution !== undefined && years_of_experience_in_same_institution !== null ? years_of_experience_in_same_institution : 0}, ${years_of_experience_in_company !== undefined && years_of_experience_in_company !== null ? years_of_experience_in_company : 0}, ${salary !== undefined && salary !== null ? salary : 0},
          ${base_salary !== undefined && base_salary !== null ? base_salary : 0}, 
          ${housing_allowance !== undefined && housing_allowance !== null ? housing_allowance : 0}, 
          ${transportation_allowance !== undefined && transportation_allowance !== null ? transportation_allowance : 0},
          ${end_of_service_allowance !== undefined && end_of_service_allowance !== null ? end_of_service_allowance : 0}, 
          ${annual_leave_allowance !== undefined && annual_leave_allowance !== null ? annual_leave_allowance : 0}, 
          ${other_allowances !== undefined && other_allowances !== null ? other_allowances : 0},
          ${deductions !== undefined && deductions !== null ? deductions : 0}, 
          ${graduation_year || null}, ${university_gpa || null},
          ${passport_number || null}, ${passport_issue_date || null}, ${passport_expiry_date || null}, ${passport_issue_place || null}, ${residency_issue_date || null},
          ${job_title || null}, ${data_completion_status || 'incomplete'}, ${employeeStatus}, ${created_by}, ${finalUpdatedBy}
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
        'bank_iban', 'bank_name', 'email', 'phone_number', 'national_address', 'contract_type', 'years_of_experience_in_same_institution', 'years_of_experience_in_company', 'salary',
        'base_salary', 'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances',
        'deductions', 'graduation_year', 'university_gpa',
        'passport_number', 'passport_issue_date', 'passport_expiry_date', 'passport_issue_place', 'residency_issue_date',
        'job_title', 'data_completion_status'
      ];
      
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      updates.updated_at = new Date();
      updates.updated_by = updatedBy;
      
      // Ensure salary fields are 0 instead of null
      const salaryFields = ['salary', 'base_salary', 'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances', 'deductions'];
      
      salaryFields.forEach(field => {
        if (updates.hasOwnProperty(field) && (updates[field] === null || updates[field] === undefined)) {
          updates[field] = 0;
        }
      });
      
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
   * Soft delete employee (deprecated - use updateStatus instead)
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
  },

  /**
   * Update employee status
   * Also updates is_active to keep it in sync with status
   */
  async updateStatus(id, status, statusChangedBy, reason = null) {
    try {
      const validStatuses = ['active', 'pending', 'terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
      }
      
      // Keep is_active in sync with status
      // Active and pending employees should have is_active = true
      // Archived employees (terminated, resigned, etc.) should have is_active = false
      const isActive = (status === 'active' || status === 'pending');
      
      const [employee] = await sql`
        UPDATE employees 
        SET status = ${status},
            is_active = ${isActive},
            status_changed_at = CURRENT_TIMESTAMP,
            status_changed_by = ${statusChangedBy},
            status_change_reason = ${reason || null},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      
      return employee;
    } catch (error) {
      console.error('Error updating employee status:', error);
      throw error;
    }
  },

  /**
   * Get employees by status
   */
  async findByStatus(status, filters = {}) {
    try {
      const conditions = [];
      const params = [];
      let paramIndex = 1;
      
      conditions.push('status = $' + paramIndex++);
      params.push(status);
      
      if (filters.branch_id) {
        if (Array.isArray(filters.branch_id) && filters.branch_id.length > 0) {
          const placeholders = filters.branch_id.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`branch_id IN (${placeholders})`);
          params.push(...filters.branch_id);
        } else if (!Array.isArray(filters.branch_id)) {
          conditions.push(`branch_id = $${paramIndex++}`);
          params.push(filters.branch_id);
        }
      }
      
      if (filters.academic_year) {
        conditions.push(`academic_year = $${paramIndex++}`);
        params.push(filters.academic_year);
      }
      
      const whereClause = conditions.join(' AND ');
      const queryString = `SELECT * FROM employees WHERE ${whereClause} ORDER BY created_at DESC`;
      
      return await sql.unsafe(queryString, params);
    } catch (error) {
      console.error('Error finding employees by status:', error);
      throw error;
    }
  },

  /**
   * Get archived employees (non-active statuses)
   * Returns employees with branch information using JOIN (fixes N+1 query problem)
   * Supports pagination, server-side search, and filtering
   * @param {Object} filters - Filter options
   * @param {number} filters.limit - Number of records to return (for pagination)
   * @param {number} filters.offset - Number of records to skip (for pagination)
   * @param {string|Array} filters.branch_id - Branch ID(s) to filter by
   * @param {string} filters.status - Status to filter by
   * @param {string} filters.academic_year - Academic year to filter by
   * @param {string} filters.registration_date_from - Start date for registration
   * @param {string} filters.registration_date_to - End date for registration
   * @param {string} filters.status_change_date_from - Start date for status change
   * @param {string} filters.status_change_date_to - End date for status change
   * @param {string} filters.search_name - Search term for employee name (server-side ILIKE)
   * @param {string} filters.search_id - Search term for ID/residency number (server-side ILIKE)
   * @returns {Promise<{data: Array, total: number}>} - Employees with branch info and total count
   */
  async findArchived(filters = {}) {
    try {
      // Check if status column exists
      const statusColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'status'
      `;
      
      if (!statusColumnExists || statusColumnExists.length === 0) {
        console.log('Status column does not exist. Please run migration script: node express-app/scripts/migrate-add-employee-status-and-terms.js');
        return { data: [], total: 0 }; // Return empty result if column doesn't exist
      }
      
      const conditions = [];
      const params = [];
      let paramIndex = 1;
      
      // Exclude active and pending (pending are not archived yet)
      conditions.push("e.status NOT IN ('active', 'pending')");
      
      if (filters.branch_id) {
        if (Array.isArray(filters.branch_id) && filters.branch_id.length > 0) {
          const placeholders = filters.branch_id.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`e.branch_id IN (${placeholders})`);
          params.push(...filters.branch_id);
        } else if (!Array.isArray(filters.branch_id)) {
          conditions.push(`e.branch_id = $${paramIndex++}`);
          params.push(filters.branch_id);
        }
      }
      
      if (filters.status) {
        conditions.push(`e.status = $${paramIndex++}`);
        params.push(filters.status);
      }
      
      if (filters.academic_year) {
        conditions.push(`e.academic_year = $${paramIndex++}`);
        params.push(filters.academic_year);
      }
      
      // Date range filters
      if (filters.registration_date_from) {
        conditions.push(`e.created_at >= $${paramIndex++}`);
        params.push(filters.registration_date_from);
      }
      
      if (filters.registration_date_to) {
        conditions.push(`e.created_at <= $${paramIndex++}`);
        params.push(filters.registration_date_to);
      }
      
      if (filters.status_change_date_from) {
        conditions.push(`e.status_changed_at >= $${paramIndex++}`);
        params.push(filters.status_change_date_from);
      }
      
      if (filters.status_change_date_to) {
        conditions.push(`e.status_changed_at <= $${paramIndex++}`);
        params.push(filters.status_change_date_to);
      }
      
      // Server-side search by name (using ILIKE for partial match)
      if (filters.search_name) {
        const namePattern = `%${filters.search_name}%`;
        conditions.push(`(
          e.first_name ILIKE $${paramIndex} OR 
          e.second_name ILIKE $${paramIndex} OR 
          e.third_name ILIKE $${paramIndex} OR 
          e.fourth_name ILIKE $${paramIndex}
        )`);
        params.push(namePattern);
        paramIndex++;
      }
      
      // Server-side search by ID or residency number
      if (filters.search_id) {
        conditions.push(`(
          e.id_or_residency_number ILIKE $${paramIndex} OR 
          e.employee_id_number ILIKE $${paramIndex}
        )`);
        params.push(`%${filters.search_id}%`);
        paramIndex++;
      }
      
      const whereClause = conditions.join(' AND ');
      
      // Get total count first (for pagination)
      const countQuery = `
        SELECT COUNT(*) as total
        FROM employees e
        WHERE ${whereClause}
      `;
      const countResult = await sql.unsafe(countQuery, params);
      const total = parseInt(countResult[0]?.total || 0, 10);
      
      // Build main query with JOIN to get branch information (fixes N+1 query problem)
      let queryString = `
        SELECT 
          e.*,
          b.branch_name,
          b.branch_type
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE ${whereClause}
        ORDER BY e.status_changed_at DESC, e.created_at DESC
      `;
      
      // Add pagination if provided
      const limit = filters.limit ? parseInt(filters.limit, 10) : null;
      const offset = filters.offset ? parseInt(filters.offset, 10) : null;
      
      if (limit && limit > 0 && limit <= 10000) {
        queryString += ` LIMIT $${paramIndex++}`;
        params.push(limit);
        if (offset && offset >= 0) {
          queryString += ` OFFSET $${paramIndex++}`;
          params.push(offset);
        }
      }
      
      const employees = await sql.unsafe(queryString, params);
      
      // Map results to include branch_name and branch_type (already in result from JOIN)
      const employeesWithBranches = employees.map(employee => ({
        ...employee,
        branch_name: employee.branch_name || 'غير معروف',
        branch_type: employee.branch_type || 'unknown'
      }));
      
      return {
        data: employeesWithBranches,
        total: total
      };
    } catch (error) {
      console.error('Error finding archived employees:', error);
      throw error;
    }
  },

  /**
   * Renew employee (pending -> active)
   * Also updates is_active to true
   */
  async renewEmployee(id, academicYear, termId, updatedBy) {
    try {
      const [employee] = await sql`
        UPDATE employees 
        SET status = 'active',
            is_active = true,
            academic_year = ${academicYear},
            current_term_id = ${termId},
            status_changed_at = CURRENT_TIMESTAMP,
            status_changed_by = ${updatedBy},
            status_change_reason = 'تجديد العقد',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND status = 'pending'
        RETURNING *
      `;
      
      return employee;
    } catch (error) {
      console.error('Error renewing employee:', error);
      throw error;
    }
  }
};


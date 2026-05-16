/**
 * Employee Model
 * Database operations for employees table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const Employee = {
  /**
   * Find employee by ID
   * Note: Removed is_active filter to allow viewing archived employees
   * Access control should be handled at the route level if needed
   * Includes all associated branches in the response
   */
  async findById(id) {
    try {
      const [employee] = await sql`
        SELECT * FROM employees 
        WHERE id = ${id}
      `;

      if (!employee) {
        return null;
      }

      // Get all branches associated with this employee
      try {
        const branches = await sql`
          SELECT 
            eb.branch_id,
            eb.is_primary,
            eb.added_at,
            b.branch_name,
            b.branch_type
          FROM employee_branches eb
          INNER JOIN branches b ON eb.branch_id = b.id
          WHERE eb.employee_id = ${id}
          ORDER BY eb.is_primary DESC, eb.added_at ASC
        `;

        return {
          ...employee,
          branches: branches.map(b => ({
            branch_id: b.branch_id,
            branch_name: b.branch_name,
            branch_type: b.branch_type,
            is_primary: b.is_primary,
            added_at: b.added_at
          }))
        };
      } catch (branchError) {
        // If employee_branches table doesn't exist yet (migration not run), return employee without branches
        if (branchError.message && branchError.message.includes('does not exist')) {
          return employee;
        }
        throw branchError;
      }
    } catch (error) {
      log.error('Error finding employee by ID', { error: error.message });
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
      log.error('Error finding employee by employee ID', { error: error.message });
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
      log.error('Error finding employee by ID/residency number', { error: error.message });
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

      const shouldJoinBranches = !!filters.branch_id;
      if (filters.branch_id) {
        if (Array.isArray(filters.branch_id) && filters.branch_id.length > 0) {
          const placeholders = filters.branch_id.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`(e.branch_id IN (${placeholders}) OR eb.branch_id IN (${placeholders}))`);
          params.push(...filters.branch_id);
        } else if (!Array.isArray(filters.branch_id)) {
          conditions.push(`(e.branch_id = $${paramIndex} OR eb.branch_id = $${paramIndex})`);
          params.push(filters.branch_id);
          paramIndex++;
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
        if (Array.isArray(filters.data_completion_status) && filters.data_completion_status.length > 0) {
          const placeholders = filters.data_completion_status.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`data_completion_status IN (${placeholders})`);
          params.push(...filters.data_completion_status);
        } else if (!Array.isArray(filters.data_completion_status)) {
          conditions.push(`data_completion_status = $${paramIndex++}`);
          params.push(filters.data_completion_status);
        }
      }

      // Array filters for payrolls
      if (filters.nationality && Array.isArray(filters.nationality) && filters.nationality.length > 0) {
        const placeholders = filters.nationality.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`nationality IN (${placeholders})`);
        params.push(...filters.nationality);
      }

      if (filters.job_title && Array.isArray(filters.job_title) && filters.job_title.length > 0) {
        const placeholders = filters.job_title.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`job_title IN (${placeholders})`);
        params.push(...filters.job_title);
      }

      if (filters.gender && Array.isArray(filters.gender) && filters.gender.length > 0) {
        const placeholders = filters.gender.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`gender IN (${placeholders})`);
        params.push(...filters.gender);
      }

      if (filters.marital_status && Array.isArray(filters.marital_status) && filters.marital_status.length > 0) {
        const placeholders = filters.marital_status.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`marital_status IN (${placeholders})`);
        params.push(...filters.marital_status);
      }

      if (filters.educational_qualification && Array.isArray(filters.educational_qualification) && filters.educational_qualification.length > 0) {
        const placeholders = filters.educational_qualification.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`educational_qualification IN (${placeholders})`);
        params.push(...filters.educational_qualification);
      }

      if (filters.contract_type && Array.isArray(filters.contract_type) && filters.contract_type.length > 0) {
        const placeholders = filters.contract_type.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`contract_type IN (${placeholders})`);
        params.push(...filters.contract_type);
      }

      // Search by name (partial match on full name or any individual name field)
      if (filters.search_name && filters.search_name.trim()) {
        const namePattern = `%${filters.search_name.trim()}%`;
        conditions.push(`(
          TRIM(COALESCE(first_name, '') || ' ' || COALESCE(second_name, '') || ' ' || COALESCE(third_name, '') || ' ' || COALESCE(fourth_name, '')) ILIKE $${paramIndex} OR
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

      // Order by full name alphabetically (construct full name from name fields)
      // Note: full_name is not a column, it's computed from first_name, second_name, third_name, fourth_name
      let queryString = `
        SELECT DISTINCT e.*,
          TRIM(COALESCE(first_name, '') || ' ' || COALESCE(second_name, '') || ' ' || COALESCE(third_name, '') || ' ' || COALESCE(fourth_name, '')) AS full_name
        FROM employees e
        ${shouldJoinBranches ? 'LEFT JOIN employee_branches eb ON eb.employee_id = e.id' : ''}
        WHERE ${whereClause}
        ORDER BY full_name ASC`;

      // Add LIMIT and OFFSET if provided (for pagination support)
      if (limit && limit > 0 && limit <= 10000) {
        queryString += ` LIMIT ${limit}`;
        if (offset && offset > 0) {
          queryString += ` OFFSET ${offset}`;
        }
      }

      // If pagination is requested, also return total count
      if (filters.withCount === true || filters.withCount === 'true') {
        const countQuery = `
          SELECT COUNT(DISTINCT e.id) as total FROM employees e
          ${shouldJoinBranches ? 'LEFT JOIN employee_branches eb ON eb.employee_id = e.id' : ''}
          WHERE ${whereClause}`;
        const [employees, countResult] = await Promise.all([
          sql.unsafe(queryString, params),
          sql.unsafe(countQuery, params)
        ]);

        return {
          data: employees,
          total: parseInt(countResult[0]?.total || 0, 10),
          limit: limit || employees.length,
          offset: offset || 0
        };
      }

      return await sql.unsafe(queryString, params);
    } catch (error) {
      log.error('Error finding employees', { error: error.message });
      throw error;
    }
  },

  /**
   * Get employees with pagination and total count
   * Optimized for large datasets
   * @param {Object} filters - Filter options
   * @param {number} page - Page number (1-indexed)
   * @param {number} pageSize - Items per page
   * @returns {Promise<{data: Array, total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async findAllPaginated(filters = {}, page = 1, pageSize = 50) {
    try {
      const conditions = [];
      const params = [];
      let paramIndex = 1;

      conditions.push('1=1');

      const shouldJoinBranches = !!filters.branch_id;
      if (filters.branch_id) {
        if (Array.isArray(filters.branch_id) && filters.branch_id.length > 0) {
          const placeholders = filters.branch_id.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`(e.branch_id IN (${placeholders}) OR eb.branch_id IN (${placeholders}))`);
          params.push(...filters.branch_id);
        } else if (!Array.isArray(filters.branch_id)) {
          conditions.push(`(e.branch_id = $${paramIndex} OR eb.branch_id = $${paramIndex})`);
          params.push(filters.branch_id);
          paramIndex++;
        }
      }

      if (filters.occupation) {
        conditions.push(`occupation = $${paramIndex++}`);
        params.push(filters.occupation);
      }

      if (filters.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      } else {
        conditions.push(`(status IS NULL OR status IN ('active', 'pending'))`);
      }

      if (filters.data_completion_status) {
        conditions.push(`data_completion_status = $${paramIndex++}`);
        params.push(filters.data_completion_status);
      }

      if (filters.search_name && filters.search_name.trim()) {
        const namePattern = `%${filters.search_name.trim()}%`;
        conditions.push(`(
          TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.second_name, '') || ' ' || COALESCE(e.third_name, '') || ' ' || COALESCE(e.fourth_name, '')) ILIKE $${paramIndex} OR
          e.first_name ILIKE $${paramIndex} OR 
          e.second_name ILIKE $${paramIndex} OR 
          e.third_name ILIKE $${paramIndex} OR 
          e.fourth_name ILIKE $${paramIndex}
        )`);
        params.push(namePattern);
        paramIndex++;
      }

      if (filters.search_id) {
        conditions.push(`id_or_residency_number ILIKE $${paramIndex++}`);
        params.push(`%${filters.search_id}%`);
      }

      if (filters.search_phone) {
        conditions.push(`phone_number ILIKE $${paramIndex++}`);
        params.push(`%${filters.search_phone}%`);
      }

      // Exclude employees whose branch has been deactivated
      conditions.push(`(b.is_active = true OR b.is_active IS NULL)`);

      const whereClause = conditions.join(' AND ');

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Execute count and data queries in parallel
      const countQuery = `
        SELECT COUNT(DISTINCT e.id) as total FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        ${shouldJoinBranches ? 'LEFT JOIN employee_branches eb ON eb.employee_id = e.id' : ''}
        WHERE ${whereClause}
      `;
      const dataQuery = `
        SELECT DISTINCT e.id, e.employee_id_number, e.branch_id, e.first_name, e.second_name, e.third_name, e.fourth_name,
               e.occupation, e.nationality, e.id_or_residency_number, e.phone_number, e.email,
               e.data_completion_status, e.status, e.created_at,
               TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.second_name, '') || ' ' || COALESCE(e.third_name, '') || ' ' || COALESCE(e.fourth_name, '')) AS full_name
        FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        ${shouldJoinBranches ? 'LEFT JOIN employee_branches eb ON eb.employee_id = e.id' : ''}
        WHERE ${whereClause} 
        ORDER BY full_name ASC 
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      const dataParams = [...params, pageSize, offset];

      const [countResult, employees] = await Promise.all([
        sql.unsafe(countQuery, params),
        sql.unsafe(dataQuery, dataParams)
      ]);

      const total = parseInt(countResult[0]?.total || 0, 10);
      const totalPages = Math.ceil(total / pageSize);

      return {
        data: employees,
        total,
        page,
        pageSize,
        totalPages
      };
    } catch (error) {
      log.error('Error finding paginated employees', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new employee
   */
  async create(employeeData, db = sql) {
    try {
      const {
        employee_id_number, branch_id, first_name, second_name, third_name, fourth_name,
        occupation, nationality, date_of_birth_hijri, date_of_birth_gregorian,
        id_or_residency_number, id_type, gender, id_expiry_date_hijri, id_expiry_date_gregorian,
        religion, marital_status, educational_qualification, specialization,
        bank_iban, bank_name, email, phone_number, national_address, contract_type,
        contract_start_date_hijri, contract_start_date_gregorian, contract_end_date_hijri, contract_end_date_gregorian,
        years_of_experience_in_same_institution, years_of_experience_in_company,
        base_salary, housing_allowance, transportation_allowance,
        end_of_service_allowance, annual_leave_allowance, other_allowances,
        graduation_year, university_gpa,
        passport_number, passport_issue_date, passport_expiry_date, passport_issue_place, residency_issue_date,
        job_title, data_completion_status, status, created_by, updated_by
      } = employeeData;


      // If updated_by is not provided, use created_by (for new records)
      // Both may be null for branch managers (no row in users table — FK is nullable)
      const finalUpdatedBy = updated_by ?? created_by ?? null;

      // Ensure status is set to 'active' for new employees (unless explicitly provided)
      const employeeStatus = status || 'active';

      const [employee] = await db`
        INSERT INTO employees (
          employee_id_number, branch_id, first_name, second_name, third_name, fourth_name,
          occupation, nationality, date_of_birth_hijri, date_of_birth_gregorian,
          id_or_residency_number, id_type, gender, id_expiry_date_hijri, id_expiry_date_gregorian,
          religion, marital_status, educational_qualification, specialization,
          bank_iban, bank_name, email, phone_number, national_address, contract_type, 
          contract_start_date_hijri, contract_start_date_gregorian, contract_end_date_hijri, contract_end_date_gregorian,
          years_of_experience_in_same_institution, years_of_experience_in_company,
          base_salary, housing_allowance, transportation_allowance,
          end_of_service_allowance, annual_leave_allowance, other_allowances,
          graduation_year, university_gpa,
          passport_number, passport_issue_date, passport_expiry_date, passport_issue_place, residency_issue_date,
          job_title, data_completion_status, status, created_by, updated_by
        )
        VALUES (
          ${employee_id_number || null}, ${branch_id}, ${first_name}, ${second_name}, ${third_name}, ${fourth_name},
          ${occupation || null}, ${nationality}, ${date_of_birth_hijri || null}, ${date_of_birth_gregorian || null},
          ${id_or_residency_number}, ${id_type || null}, ${gender || null}, ${id_expiry_date_hijri || null}, ${id_expiry_date_gregorian || null},
          ${religion || null}, ${marital_status || null}, ${educational_qualification || null}, ${specialization || null},
          ${bank_iban || null}, ${bank_name || null}, ${email || null}, ${phone_number || null},
          ${national_address || null}, ${contract_type || null}, 
          ${contract_start_date_hijri || null}, ${contract_start_date_gregorian || null}, 
          ${contract_end_date_hijri || null}, ${contract_end_date_gregorian || null},
          ${years_of_experience_in_same_institution !== undefined && years_of_experience_in_same_institution !== null ? years_of_experience_in_same_institution : 0}, ${years_of_experience_in_company !== undefined && years_of_experience_in_company !== null ? years_of_experience_in_company : 0},
          ${base_salary !== undefined && base_salary !== null ? base_salary : 0}, 
          ${housing_allowance !== undefined && housing_allowance !== null ? housing_allowance : 0}, 
          ${transportation_allowance !== undefined && transportation_allowance !== null ? transportation_allowance : 0},
          ${end_of_service_allowance !== undefined && end_of_service_allowance !== null ? end_of_service_allowance : 0}, 
          ${annual_leave_allowance !== undefined && annual_leave_allowance !== null ? annual_leave_allowance : 0}, 
          ${other_allowances !== undefined && other_allowances !== null ? other_allowances : 0},
          ${graduation_year || null}, ${university_gpa || null},
          ${passport_number || null}, ${passport_issue_date || null}, ${passport_expiry_date || null}, ${passport_issue_place || null}, ${residency_issue_date || null},
          ${job_title || null}, ${data_completion_status || 'incomplete'}, ${employeeStatus}, ${created_by}, ${finalUpdatedBy}
        )
        RETURNING *
      `;

      return employee;
    } catch (error) {
      log.error('Error creating employee', { error: error.message, code: error.code, detail: error.detail });
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
        'bank_iban', 'bank_name', 'email', 'phone_number', 'national_address', 'contract_type',
        'contract_start_date_hijri', 'contract_start_date_gregorian', 'contract_end_date_hijri', 'contract_end_date_gregorian',
        'years_of_experience_in_same_institution', 'years_of_experience_in_company',
        'base_salary', 'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances',
        'graduation_year', 'university_gpa',
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
      const salaryFields = ['base_salary', 'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances'];

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
      log.error('Error updating employee', { error: error.message, code: error.code, detail: error.detail });
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
      log.error('Error soft deleting employee', { error: error.message });
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
      log.error('Error updating employee status', { error: error.message });
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
      log.error('Error finding employees by status', { error: error.message });
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
        log.warn('Status column does not exist. Please run migration script: node express-app/scripts/migrate-add-employee-status-and-terms.js');
        return { data: [], total: 0 }; // Return empty result if column doesn't exist
      }

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      // Show archived employees OR employees in deactivated branches
      conditions.push("(e.status NOT IN ('active', 'pending') OR b.is_active = false)");

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
      // Server-side search by name (using ILIKE for partial match on full name or individual fields)
      if (filters.search_name && filters.search_name.trim()) {
        const namePattern = `%${filters.search_name.trim()}%`;
        conditions.push(`(
          TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.second_name, '') || ' ' || COALESCE(e.third_name, '') || ' ' || COALESCE(e.fourth_name, '')) ILIKE $${paramIndex} OR
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
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE ${whereClause}
      `;
      const countResult = await sql.unsafe(countQuery, params);
      const total = parseInt(countResult[0]?.total || 0, 10);

      // Build main query with JOIN to get branch information (fixes N+1 query problem)
      let queryString = `
        SELECT 
          e.*,
          b.branch_name,
          b.branch_type,
          b.is_active AS branch_is_active
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
      log.error('Error finding archived employees', { error: error.message });
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
      log.error('Error renewing employee', { error: error.message });
      throw error;
    }
  },

  /**
   * Check for duplicate employees by ID/residency number and date of birth
   * Used to detect if an employee already exists in another branch
   * @param {string} idOrResidencyNumber - ID or residency number
   * @param {string} dateOfBirthHijri - Date of birth in Hijri format
   * @param {Date} dateOfBirthGregorian - Date of birth in Gregorian format
   * @param {number} excludeEmployeeId - Employee ID to exclude from search (optional)
   * @returns {Promise<Array>} - Array of matching employees
   */
  async findDuplicates(idOrResidencyNumber, dateOfBirthHijri = null, dateOfBirthGregorian = null, excludeEmployeeId = null) {
    try {
      const conditions = [];
      const params = [];
      let paramIndex = 1;

      // Match by ID/residency number (required)
      conditions.push(`id_or_residency_number = $${paramIndex++}`);
      params.push(idOrResidencyNumber);

      // Match by date of birth (if provided)
      if (dateOfBirthHijri) {
        conditions.push(`date_of_birth_hijri = $${paramIndex++}`);
        params.push(dateOfBirthHijri);
      } else if (dateOfBirthGregorian) {
        conditions.push(`date_of_birth_gregorian = $${paramIndex++}`);
        params.push(dateOfBirthGregorian);
      }

      // Exclude specific employee ID if provided
      if (excludeEmployeeId) {
        conditions.push(`id != $${paramIndex++}`);
        params.push(excludeEmployeeId);
      }

      const whereClause = conditions.join(' AND ');
      const queryString = `
        SELECT 
          e.*,
          b.branch_name,
          b.branch_type
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id
        WHERE ${whereClause}
        ORDER BY e.created_at DESC
      `;

      const employees = await sql.unsafe(queryString, params);

      // Get all branches for each employee
      const employeesWithBranches = await Promise.all(
        employees.map(async (emp) => {
          const branches = await sql`
            SELECT 
              eb.branch_id,
              eb.is_primary,
              eb.added_at,
              b.branch_name,
              b.branch_type
            FROM employee_branches eb
            INNER JOIN branches b ON eb.branch_id = b.id
            WHERE eb.employee_id = ${emp.id}
            ORDER BY eb.is_primary DESC, eb.added_at ASC
          `;

          return {
            ...emp,
            branches: branches.map(b => ({
              branch_id: b.branch_id,
              branch_name: b.branch_name,
              branch_type: b.branch_type,
              is_primary: b.is_primary,
              added_at: b.added_at
            }))
          };
        })
      );

      return employeesWithBranches;
    } catch (error) {
      log.error('Error finding duplicate employees', { error: error.message });
      throw error;
    }
  },

  /**
   * Link employee to an additional branch
   * @param {number} employeeId - Employee ID
   * @param {number} branchId - Branch ID to link
   * @param {number} addedBy - User ID who added the link (references users.id)
   * @returns {Promise<Object>} - The created employee_branches record
   */
  async linkToBranch(employeeId, branchId, addedBy = null, db = sql) {
    try {
      // Check if link already exists
      const [existing] = await db`
        SELECT * FROM employee_branches
        WHERE employee_id = ${employeeId} AND branch_id = ${branchId}
      `;

      if (existing) {
        return existing; // Already linked, return existing record
      }

      // Check if this will be the first branch (make it primary)
      const [firstBranch] = await db`
        SELECT COUNT(*) as count FROM employee_branches
        WHERE employee_id = ${employeeId}
      `;

      const isPrimary = parseInt(firstBranch.count) === 0;

      // Create the link
      const [link] = await db`
        INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_by)
        VALUES (${employeeId}, ${branchId}, ${isPrimary}, ${addedBy})
        RETURNING *
      `;

      return link;
    } catch (error) {
      // Handle unique constraint violation (employee already linked to branch)
      if (error.code === '23505') {
        log.warn('Employee already linked to branch (unique constraint)', { employeeId, branchId });
        const [existing] = await db`
          SELECT * FROM employee_branches
          WHERE employee_id = ${employeeId} AND branch_id = ${branchId}
        `;
        return existing;
      }
      // Handle foreign key violation on added_by - retry without it
      if (error.code === '23503' && error.constraint?.includes('added_by')) {
        log.warn('FK violation on added_by, retrying with null', { employeeId, branchId, addedBy });
        const [firstBranch] = await db`
          SELECT COUNT(*) as count FROM employee_branches
          WHERE employee_id = ${employeeId}
        `;
        const isPrimary = parseInt(firstBranch.count) === 0;
        const [link] = await db`
          INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_by)
          VALUES (${employeeId}, ${branchId}, ${isPrimary}, ${null})
          RETURNING *
        `;
        return link;
      }
      log.error('Error linking employee to branch', { error: error.message, employeeId, branchId, addedBy });
      throw error;
    }
  },

  /**
   * Transfer employee to a different primary branch
   * Updates employees.branch_id and syncs employee_branches is_primary flags
   */
  async transferToBranch(employeeId, newBranchId, transferredBy) {
    try {
      // Get old branch_id
      const [emp] = await sql`SELECT branch_id FROM employees WHERE id = ${employeeId}`;
      if (!emp) throw new Error('Employee not found');
      const oldBranchId = emp.branch_id;

      // Update the main branch_id
      await sql`
        UPDATE employees
        SET branch_id = ${newBranchId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${employeeId}
      `;

      // Remove old primary flag
      await sql`
        UPDATE employee_branches SET is_primary = false
        WHERE employee_id = ${employeeId} AND is_primary = true
      `;

      // Upsert the new branch link and set as primary
      await sql`
        INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_by)
        VALUES (${employeeId}, ${newBranchId}, true, ${transferredBy})
        ON CONFLICT (employee_id, branch_id) DO UPDATE SET is_primary = true
      `;

      log.info('Employee transferred', { employeeId, oldBranchId, newBranchId, transferredBy });
      return await this.findById(employeeId);
    } catch (error) {
      log.error('Error transferring employee', { error: error.message, employeeId, newBranchId });
      throw error;
    }
  },

  /**
   * Unlink employee from a secondary branch
   * Cannot unlink the primary branch — must transfer first
   */
  async unlinkFromBranch(employeeId, branchId) {
    try {
      // Check if this is the primary branch
      const [link] = await sql`
        SELECT is_primary FROM employee_branches
        WHERE employee_id = ${employeeId} AND branch_id = ${branchId}
      `;
      if (!link) {
        throw new Error('الموظف غير مرتبط بهذا الفرع');
      }
      if (link.is_primary) {
        throw new Error('لا يمكن إلغاء ربط الفرع الأساسي. يجب نقل الموظف أولاً');
      }

      await sql`
        DELETE FROM employee_branches
        WHERE employee_id = ${employeeId} AND branch_id = ${branchId}
      `;

      log.info('Employee unlinked from branch', { employeeId, branchId });
      return true;
    } catch (error) {
      log.error('Error unlinking employee from branch', { error: error.message, employeeId, branchId });
      throw error;
    }
  },

  /**
   * Get all branches linked to an employee with branch details
   */
  async getLinkedBranches(employeeId) {
    try {
      const branches = await sql`
        SELECT eb.*, b.branch_name, b.branch_type, b.is_active
        FROM employee_branches eb
        JOIN branches b ON eb.branch_id = b.id
        WHERE eb.employee_id = ${employeeId}
        ORDER BY eb.is_primary DESC, eb.added_at ASC
      `;
      return branches;
    } catch (error) {
      log.error('Error getting linked branches', { error: error.message, employeeId });
      throw error;
    }
  },

  /**
   * Get all branch IDs for an employee
   * @param {number} employeeId - Employee ID
   * @returns {Promise<Array<number>>} - Array of branch IDs
   */
  async getBranchIds(employeeId) {
    try {
      const branches = await sql`
        SELECT branch_id FROM employee_branches
        WHERE employee_id = ${employeeId}
        ORDER BY is_primary DESC, added_at ASC
      `;
      return branches.map(b => b.branch_id);
    } catch (error) {
      log.error('Error getting employee branch IDs', { error: error.message });
      throw error;
    }
  },

  async isLinkedToBranch(employeeId, branchId) {
    try {
      const [row] = await sql`
        SELECT 1 FROM employee_branches
        WHERE employee_id = ${employeeId} AND branch_id = ${branchId}
        LIMIT 1
      `;
      return !!row;
    } catch (error) {
      log.error('Error checking employee branch link', { error: error.message });
      return false;
    }
  },

  async findDuplicateClusters() {
    try {
      const clusters = [];
      const seen = new Set();

      // Only include active employees from active branches
      const idDupes = await sql`
        SELECT array_agg(e.id) AS ids
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE e.id_or_residency_number IS NOT NULL
          AND (e.status IS NULL OR e.status IN ('active', 'pending'))
          AND (b.is_active = true OR b.is_active IS NULL)
        GROUP BY e.id_or_residency_number
        HAVING COUNT(*) > 1
      `;

      const nameDobDupes = await sql`
        SELECT array_agg(e.id) AS ids
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE e.date_of_birth_gregorian IS NOT NULL
          AND (e.status IS NULL OR e.status IN ('active', 'pending'))
          AND (b.is_active = true OR b.is_active IS NULL)
        GROUP BY LOWER(TRIM(e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name)), e.date_of_birth_gregorian
        HAVING COUNT(*) > 1
      `;

      // Full name only (even if DOB missing)
      const nameOnlyDupes = await sql`
        SELECT array_agg(e.id) AS ids
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE (e.status IS NULL OR e.status IN ('active', 'pending'))
          AND (b.is_active = true OR b.is_active IS NULL)
        GROUP BY LOWER(TRIM(e.first_name || ' ' || e.second_name || ' ' || e.third_name || ' ' || e.fourth_name))
        HAVING COUNT(*) > 1
      `;

      const addCluster = (idsArr) => {
        const ids = idsArr.filter(Boolean);
        const newIds = ids.filter(id => !seen.has(id));
        if (newIds.length > 1) {
          newIds.forEach(id => seen.add(id));
          clusters.push(newIds);
        }
      };

      idDupes.forEach(row => addCluster(row.ids));
      nameDobDupes.forEach(row => addCluster(row.ids));
      nameOnlyDupes.forEach(row => addCluster(row.ids));

      if (clusters.length === 0) return [];

      const result = [];
      for (const cluster of clusters) {
        const employees = await sql`
          SELECT * FROM employees WHERE id = ANY(${cluster})
        `;
        result.push({ ids: cluster, employees });
      }
      return result;
    } catch (error) {
      log.error('Error finding duplicate clusters', { error: error.message });
      throw error;
    }
  },

  async mergeEmployees(canonicalId, duplicateIds = []) {
    const dupIds = (duplicateIds || []).map(id => parseInt(id)).filter(id => id && id !== canonicalId);
    if (dupIds.length === 0) {
      throw new Error('لا يوجد معرفات مكررة للدمج');
    }

    const updatedCanonical = await sql.begin(async (trx) => {
      // Get canonical employee data
      const [canonical] = await trx`SELECT * FROM employees WHERE id = ${canonicalId}`;
      if (!canonical) {
        throw new Error('الموظف الأساسي غير موجود');
      }

      // Get all duplicate employees
      const duplicates = await trx`
        SELECT * FROM employees WHERE id = ANY(${dupIds})
      `;

      // Merge employee data fields intelligently
      // For each field, if canonical is null/empty and duplicate has a value, use duplicate's value
      const fieldsToMerge = [
        'date_of_birth_hijri', 'date_of_birth_gregorian',
        'id_expiry_date_hijri', 'id_expiry_date_gregorian',
        'religion', 'marital_status',
        'educational_qualification', 'specialization',
        'bank_iban', 'bank_name',
        'email', 'phone_number', 'national_address',
        'contract_type',
        'contract_start_date_hijri', 'contract_start_date_gregorian',
        'contract_end_date_hijri', 'contract_end_date_gregorian',
        'years_of_experience_in_same_institution', 'years_of_experience_in_company',
        'base_salary',
        'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance',
        'other_allowances',
        'academic_year', 'registration_term_id', 'current_term_id'
      ];

      const mergedData = { ...canonical };

      // Merge data from all duplicates
      for (const duplicate of duplicates) {
        for (const field of fieldsToMerge) {
          // If canonical field is null/empty and duplicate has a value, use duplicate's value
          if ((mergedData[field] === null || mergedData[field] === '' || mergedData[field] === undefined) &&
            duplicate[field] !== null && duplicate[field] !== '' && duplicate[field] !== undefined) {
            mergedData[field] = duplicate[field];
          }
        }
      }

      // Update canonical employee with merged data
      const updateFields = {};
      for (const field of fieldsToMerge) {
        if (mergedData[field] !== canonical[field] &&
          mergedData[field] !== null &&
          mergedData[field] !== undefined &&
          mergedData[field] !== '') {
          updateFields[field] = mergedData[field];
        }
      }

      if (Object.keys(updateFields).length > 0) {
        // Build dynamic UPDATE query using sql.unsafe for flexibility
        const setClause = Object.keys(updateFields).map((field, index) => {
          return `${field} = $${index + 2}`;
        }).join(', ');

        const values = Object.keys(updateFields).map(field => updateFields[field]);
        values.unshift(canonicalId);

        const query = `
          UPDATE employees 
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `;

        await trx.unsafe(query, values);
      }

      // Move branch links
      const branchLinks = await trx`
        SELECT DISTINCT branch_id FROM employee_branches WHERE employee_id = ANY(${dupIds})
      `;
      for (const row of branchLinks) {
        await trx`
          INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_at, added_by)
          VALUES (${canonicalId}, ${row.branch_id}, FALSE, CURRENT_TIMESTAMP, NULL)
          ON CONFLICT (employee_id, branch_id) DO NOTHING
        `;
      }

      // Handle employee_documents - merge intelligently to avoid duplicates
      // Get all documents from duplicates
      const duplicateDocs = await trx`
        SELECT * FROM employee_documents
        WHERE employee_id = ANY(${dupIds}) AND is_active = true
        ORDER BY uploaded_at DESC
      `;

      // Get existing documents for canonical employee by (type + file_name)
      const canonicalDocs = await trx`
        SELECT document_type, file_name, id, uploaded_at, is_active
        FROM employee_documents
        WHERE employee_id = ${canonicalId}
      `;

      const canonicalDocMap = new Map();
      canonicalDocs.forEach(doc => {
        const key = `${doc.document_type || ''}:${doc.file_name || ''}`;
        if (!canonicalDocMap.has(key) || (doc.is_active && !canonicalDocMap.get(key).is_active)) {
          canonicalDocMap.set(key, doc);
        }
      });

      // Process duplicate documents
      for (const doc of duplicateDocs) {
        const key = `${doc.document_type || ''}:${doc.file_name || ''}`;
        const existingDoc = canonicalDocMap.get(key);

        if (!existingDoc) {
          // No document of this type exists for canonical, move it
          await trx`
            UPDATE employee_documents
            SET employee_id = ${canonicalId}
            WHERE id = ${doc.id}
          `;
        } else {
          // Document already exists - keep the most recent active one
          const existingDate = new Date(existingDoc.uploaded_at);
          const duplicateDate = new Date(doc.uploaded_at);

          if (duplicateDate > existingDate && doc.is_active) {
            // Duplicate is newer and active - deactivate old one and move new one
            await trx`
              UPDATE employee_documents
              SET is_active = false
              WHERE id = ${existingDoc.id}
            `;
            await trx`
              UPDATE employee_documents
              SET employee_id = ${canonicalId}
              WHERE id = ${doc.id}
            `;
          } else {
            // Keep existing, delete duplicate document
            await trx`
              DELETE FROM employee_documents
              WHERE id = ${doc.id}
            `;
          }
        }
      }

      // Final pass: remove any remaining exact duplicates by (type + file_name), keep highest id
      await trx`
        DELETE FROM employee_documents d
        USING employee_documents d2
        WHERE d.employee_id = ${canonicalId}
          AND d2.employee_id = ${canonicalId}
          AND d.id < d2.id
          AND d.document_type = d2.document_type
          AND COALESCE(d.file_name, '') = COALESCE(d2.file_name, '')
      `;

      // Move absences
      await trx`
        UPDATE employee_absences
        SET employee_id = ${canonicalId}
        WHERE employee_id = ANY(${dupIds})
      `;

      // Delete duplicates
      await trx`
        DELETE FROM employees WHERE id = ANY(${dupIds})
      `;

      // Recalculate data completion status for merged employee
      try {
        const { updateCompletionStatus } = await import('../utils/employeeDataCompletion.js');
        await updateCompletionStatus(canonicalId, trx);
      } catch (error) {
        log.warn('Could not update completion status after merge', { error: error.message });
      }

      const [updated] = await trx`SELECT * FROM employees WHERE id = ${canonicalId}`;
      return updated;
    });

    // Recalculate data completion status for merged employee (outside transaction)
    try {
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      await updateEmployeeCompletionStatus(canonicalId);
    } catch (error) {
      log.warn('Could not update completion status after merge', { error: error.message });
    }

    return updatedCanonical;
  }
};


/**
 * Database Initialization Script
 * Creates all tables for the HRM system in the correct order
 */

import { createTable, executeQuery, sql } from '../db-helpers.js';

/**
 * Create all database tables
 */
export async function initializeDatabase() {
  console.log('Starting database initialization...');

  try {
    // 1. Create branches table (no dependencies - must be first)
    await createTable('branches', `
      id SERIAL PRIMARY KEY,
      branch_name VARCHAR(255) NOT NULL,
      branch_location VARCHAR(500) NOT NULL,
      branch_type VARCHAR(50) NOT NULL CHECK (branch_type IN ('school', 'healthcare_center')),
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      branch_documents_password VARCHAR(255) DEFAULT 'test',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    // Create indexes for branches
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branches_type ON branches(branch_type)',
      'Created index on branches.branch_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branches_username ON branches(username)',
      'Created index on branches.username'
    );

    // 2. Create users table (depends on branches)
    await createTable('users', `
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('main_manager', 'branch_manager')),
      branch_id INTEGER,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create indexes for users
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'Created index on users.username'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)',
      'Created index on users.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'Created index on users.role'
    );

    // 3. Create schools table
    await createTable('schools', `
      id SERIAL PRIMARY KEY,
      branch_id INTEGER UNIQUE NOT NULL,
      school_code VARCHAR(50) UNIQUE,
      education_level VARCHAR(100),
      additional_info TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    `);

    // 4. Create healthcare_centers table
    await createTable('healthcare_centers', `
      id SERIAL PRIMARY KEY,
      branch_id INTEGER UNIQUE NOT NULL,
      center_code VARCHAR(50) UNIQUE,
      center_type VARCHAR(100),
      license_number VARCHAR(100),
      additional_info TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    `);

    // 5. Create employees table
    await createTable('employees', `
      id SERIAL PRIMARY KEY,
      employee_id_number VARCHAR(100) UNIQUE NOT NULL,
      branch_id INTEGER NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      second_name VARCHAR(100) NOT NULL,
      third_name VARCHAR(100) NOT NULL,
      fourth_name VARCHAR(100) NOT NULL,
      occupation VARCHAR(100) NOT NULL,
      nationality VARCHAR(100) NOT NULL,
      date_of_birth_hijri VARCHAR(50),
      date_of_birth_gregorian DATE,
      id_or_residency_number VARCHAR(100) UNIQUE NOT NULL,
      id_type VARCHAR(50) NOT NULL CHECK (id_type IN ('citizen', 'resident')),
      gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female')),
      id_expiry_date_hijri VARCHAR(50),
      id_expiry_date_gregorian DATE,
      religion VARCHAR(100),
      marital_status VARCHAR(50),
      educational_qualification VARCHAR(200),
      specialization VARCHAR(200),
      bank_iban VARCHAR(50),
      bank_name VARCHAR(200),
      email VARCHAR(255),
      phone_number VARCHAR(50),
      national_address VARCHAR(8),
      contract_type VARCHAR(100),
      contract_start_date_hijri VARCHAR(50),
      contract_start_date_gregorian DATE,
      contract_end_date_hijri VARCHAR(50),
      contract_end_date_gregorian DATE,
      years_of_experience_in_same_institution INTEGER DEFAULT 0,
      years_of_experience_in_company INTEGER DEFAULT 0,
      salary DECIMAL(10,2),
      base_salary DECIMAL(10,2),
      housing_allowance DECIMAL(10,2),
      transportation_allowance DECIMAL(10,2),
      end_of_service_allowance DECIMAL(10,2),
      annual_leave_allowance DECIMAL(10,2),
      other_allowances DECIMAL(10,2),
      deductions DECIMAL(10,2),
      data_completion_status VARCHAR(20) DEFAULT 'incomplete' CHECK (data_completion_status IN ('incomplete', 'complete')),
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'terminated', 'resigned', 'contract_ended', 'non_renewal', 'other')),
      status_changed_at TIMESTAMP,
      status_changed_by INTEGER,
      status_change_reason TEXT,
      academic_year VARCHAR(20),
      registration_term_id INTEGER,
      current_term_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER NOT NULL,
      updated_by INTEGER NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES branches(id) ON DELETE RESTRICT,
      FOREIGN KEY (updated_by) REFERENCES branches(id) ON DELETE RESTRICT,
      FOREIGN KEY (status_changed_by) REFERENCES branches(id) ON DELETE SET NULL,
      FOREIGN KEY (registration_term_id) REFERENCES terms(id) ON DELETE SET NULL,
      FOREIGN KEY (current_term_id) REFERENCES terms(id) ON DELETE SET NULL
    `);

    // Create indexes for employees
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id)',
      'Created index on employees.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id_number)',
      'Created index on employees.employee_id_number'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_id_residency ON employees(id_or_residency_number)',
      'Created index on employees.id_or_residency_number'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_occupation ON employees(occupation)',
      'Created index on employees.occupation'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_data_completion_status ON employees(data_completion_status)',
      'Created index on employees.data_completion_status'
    );

    // 5b. Employee branches (many-to-many between employees and branches)
    await createTable('employee_branches', `
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      is_primary BOOLEAN DEFAULT FALSE,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      added_by INTEGER,
      UNIQUE (employee_id, branch_id)
    `);
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employee_branches_employee ON employee_branches(employee_id)',
      'Index employee_branches.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employee_branches_branch ON employee_branches(branch_id)',
      'Index employee_branches.branch_id'
    );

    // 6. Create employee_documents table
    await createTable('employee_documents', `
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      document_type VARCHAR(100) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size INTEGER,
      mime_type VARCHAR(100) NOT NULL,
      file_extension VARCHAR(10),
      thumbnail_path VARCHAR(500),
      description TEXT,
      expiry_date DATE,
      is_verified BOOLEAN DEFAULT false,
      verified_at TIMESTAMP,
      verified_by INTEGER,
      version INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INTEGER NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create indexes for employee_documents
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON employee_documents(employee_id)',
      'Created index on employee_documents.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_type ON employee_documents(document_type)',
      'Created index on employee_documents.document_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_employee_type ON employee_documents(employee_id, document_type)',
      'Created composite index on employee_documents(employee_id, document_type)'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON employee_documents(mime_type)',
      'Created index on employee_documents.mime_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON employee_documents(uploaded_at)',
      'Created index on employee_documents.uploaded_at'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON employee_documents(expiry_date)',
      'Created index on employee_documents.expiry_date'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_is_verified ON employee_documents(is_verified)',
      'Created index on employee_documents.is_verified'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_documents_file_name ON employee_documents(file_name)',
      'Created index on employee_documents.file_name'
    );

    // 7. Create branch_documents table
    await createTable('branch_documents', `
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL,
      document_type VARCHAR(100) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size INTEGER,
      mime_type VARCHAR(100) NOT NULL,
      file_extension VARCHAR(10),
      thumbnail_path VARCHAR(500),
      description TEXT,
      expiry_date DATE,
      is_verified BOOLEAN DEFAULT false,
      verified_at TIMESTAMP,
      verified_by INTEGER,
      version INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INTEGER NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create indexes for branch_documents
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_branch_id ON branch_documents(branch_id)',
      'Created index on branch_documents.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_type ON branch_documents(document_type)',
      'Created index on branch_documents.document_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_branch_type ON branch_documents(branch_id, document_type)',
      'Created composite index on branch_documents(branch_id, document_type)'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_mime_type ON branch_documents(mime_type)',
      'Created index on branch_documents.mime_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_uploaded_at ON branch_documents(uploaded_at)',
      'Created index on branch_documents.uploaded_at'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_expiry_date ON branch_documents(expiry_date)',
      'Created index on branch_documents.expiry_date'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_is_verified ON branch_documents(is_verified)',
      'Created index on branch_documents.is_verified'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_branch_documents_file_name ON branch_documents(file_name)',
      'Created index on branch_documents.file_name'
    );

    // Add issue_date and Hijri date columns to branch_documents if they don't exist
    try {
      // Check if issue_date column exists, if not add it
      const issueDateExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'branch_documents' AND column_name = 'issue_date'
      `;
      if (!issueDateExists || issueDateExists.length === 0) {
        await executeQuery(
          'ALTER TABLE branch_documents ADD COLUMN issue_date DATE',
          'Added issue_date column to branch_documents'
        );
      }
      
      // Add Hijri columns
      await executeQuery(
        'ALTER TABLE branch_documents ADD COLUMN IF NOT EXISTS issue_date_hijri VARCHAR(50)',
        'Added issue_date_hijri column to branch_documents'
      );
      await executeQuery(
        'ALTER TABLE branch_documents ADD COLUMN IF NOT EXISTS expiry_date_hijri VARCHAR(50)',
        'Added expiry_date_hijri column to branch_documents'
      );
    } catch (error) {
      // Silent error handling - columns may already exist
    }


    // 8. Create employee_professional_classifications table
    await createTable('employee_professional_classifications', `
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      profession VARCHAR(100) NOT NULL,
      classification_level VARCHAR(100) NOT NULL,
      classification_number VARCHAR(100),
      issued_date DATE,
      expiry_date DATE,
      document_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL
    `);

    // Create indexes for classifications
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_classifications_employee_id ON employee_professional_classifications(employee_id)',
      'Created index on employee_professional_classifications.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_classifications_profession ON employee_professional_classifications(profession)',
      'Created index on employee_professional_classifications.profession'
    );

    // 8. Create employee_course_certificates table
    await createTable('employee_course_certificates', `
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      course_type VARCHAR(100) NOT NULL CHECK (course_type IN ('speech_therapy_70h', 'physical_therapy_40h')),
      course_name VARCHAR(200) NOT NULL,
      completion_date DATE NOT NULL,
      hours_completed INTEGER NOT NULL,
      certificate_number VARCHAR(100),
      document_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL
    `);

    // Create indexes for certificates
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_certificates_employee_id ON employee_course_certificates(employee_id)',
      'Created index on employee_course_certificates.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_certificates_course_type ON employee_course_certificates(course_type)',
      'Created index on employee_course_certificates.course_type'
    );

    // 9. Create notifications table
    await createTable('notifications', `
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      importance_level INTEGER NOT NULL CHECK (importance_level IN (1, 2, 3, 4, 5)),
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMP,
      one_time BOOLEAN DEFAULT false,
      seen_by_branches INTEGER[] DEFAULT ARRAY[]::INTEGER[],
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    `);

    // Create indexes for notifications
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by)',
      'Created index on notifications.created_by'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notifications_importance ON notifications(importance_level)',
      'Created index on notifications.importance_level'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)',
      'Created index on notifications.created_at'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notifications_is_active ON notifications(is_active)',
      'Created index on notifications.is_active'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at)',
      'Created index on notifications.expires_at'
    );

    // 10. Create notification_branches table (many-to-many relationship)
    await createTable('notification_branches', `
      id SERIAL PRIMARY KEY,
      notification_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      UNIQUE(notification_id, branch_id)
    `);

    // Create indexes for notification_branches
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_branches_notification_id ON notification_branches(notification_id)',
      'Created index on notification_branches.notification_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_branches_branch_id ON notification_branches(branch_id)',
      'Created index on notification_branches.branch_id'
    );

    // 11. Create notification_responses table
    await createTable('notification_responses', `
      id SERIAL PRIMARY KEY,
      notification_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      response_status VARCHAR(50) NOT NULL CHECK (response_status IN ('done', 'working_on_it', 'seen')),
      response_message TEXT,
      responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      UNIQUE(notification_id, branch_id)
    `);

    // Create indexes for notification_responses
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_responses_notification_id ON notification_responses(notification_id)',
      'Created index on notification_responses.notification_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_responses_branch_id ON notification_responses(branch_id)',
      'Created index on notification_responses.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_responses_status ON notification_responses(response_status)',
      'Created index on notification_responses.response_status'
    );

    // 12. Create notification_views table (for one-time notifications)
    await createTable('notification_views', `
      id SERIAL PRIMARY KEY,
      notification_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(notification_id, user_id)
    `);

    // Create indexes for notification_views
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_views_notification_id ON notification_views(notification_id)',
      'Created index on notification_views.notification_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_notification_views_user_id ON notification_views(user_id)',
      'Created index on notification_views.user_id'
    );

    // 13. Create terms table
    await createTable('terms', `
      id SERIAL PRIMARY KEY,
      branch_type VARCHAR(50) NOT NULL CHECK (branch_type IN ('school', 'healthcare_center')),
      term_name VARCHAR(100) NOT NULL,
      term_number INTEGER NOT NULL CHECK (term_number IN (1, 2)),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      academic_year_start DATE NOT NULL,
      academic_year_end DATE NOT NULL,
      academic_year_label VARCHAR(20) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      CHECK (start_date <= end_date),
      CHECK (academic_year_start <= academic_year_end)
    `);

    // Create indexes for terms
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_terms_branch_type ON terms(branch_type)',
      'Created index on terms.branch_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_terms_academic_year ON terms(academic_year_start, academic_year_end)',
      'Created index on terms academic year dates'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_terms_dates ON terms(start_date, end_date)',
      'Created index on terms dates'
    );

    // 13. Create academic_years table
    await createTable('academic_years', `
      id SERIAL PRIMARY KEY,
      branch_type VARCHAR(50) NOT NULL CHECK (branch_type IN ('school', 'healthcare_center')),
      year_label VARCHAR(20) NOT NULL,
      year_start DATE NOT NULL,
      year_end DATE NOT NULL,
      term1_id INTEGER,
      term2_id INTEGER,
      is_current BOOLEAN DEFAULT false,
      is_completed BOOLEAN DEFAULT false,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (term1_id) REFERENCES terms(id) ON DELETE SET NULL,
      FOREIGN KEY (term2_id) REFERENCES terms(id) ON DELETE SET NULL,
      UNIQUE(branch_type, year_label),
      CHECK (year_start <= year_end)
    `);

    // Create indexes for academic_years
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_academic_years_branch_type ON academic_years(branch_type)',
      'Created index on academic_years.branch_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_academic_years_dates ON academic_years(year_start, year_end)',
      'Created index on academic_years dates'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_academic_years_current ON academic_years(is_current, branch_type)',
      'Created index on academic_years is_current'
    );

    // 14. Create requests table
    await createTable('requests', `
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL,
      main_manager_id INTEGER NOT NULL,
      employee_id INTEGER,
      request_name VARCHAR(255) NOT NULL,
      request_text TEXT NOT NULL,
      attachment_url VARCHAR(500),
      attachment_name VARCHAR(255),
      attachment_type VARCHAR(100),
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed')),
      response_text TEXT,
      responded_at TIMESTAMP,
      responded_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      FOREIGN KEY (main_manager_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create indexes for requests
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_requests_branch_id ON requests(branch_id)',
      'Created index on requests.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_requests_main_manager_id ON requests(main_manager_id)',
      'Created index on requests.main_manager_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_requests_employee_id ON requests(employee_id)',
      'Created index on requests.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)',
      'Created index on requests.status'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at)',
      'Created index on requests.created_at'
    );


    // ========== PERFORMANCE OPTIMIZATION: Additional Indexes for Employees ==========
    // These indexes significantly improve query performance for common operations
    
    // Index for status (used in filtering employees by status)
    try {
      const statusColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'status'
      `;
      if (statusColumnExists && statusColumnExists.length > 0) {
        await executeQuery(
          'CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)',
          'Created index on employees.status'
        );
      }
    } catch (error) {
      // Silent error handling
    }
    
    // Index for is_active (used frequently in queries)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active)',
        'Created index on employees.is_active'
      );
    } catch (error) {
      // Silent error handling
    }
    
    // Index for phone_number (used in search operations)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_phone_number ON employees(phone_number)',
        'Created index on employees.phone_number'
      );
    } catch (error) {
      // Silent error handling
    }
    
    // Index for created_at (used in ORDER BY clauses)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_created_at ON employees(created_at DESC)',
        'Created index on employees.created_at'
      );
    } catch (error) {
      // Silent error handling
    }
    
    // Index for updated_at (used in update tracking)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON employees(updated_at DESC)',
        'Created index on employees.updated_at'
      );
    } catch (error) {
      // Silent error handling
    }
    
    // Composite index: branch_id + status (very common query pattern)
    try {
      const statusColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'status'
      `;
      if (statusColumnExists && statusColumnExists.length > 0) {
        await executeQuery(
          'CREATE INDEX IF NOT EXISTS idx_employees_branch_status ON employees(branch_id, status)',
          'Created composite index on employees(branch_id, status)'
        );
      }
    } catch (error) {
      // Silent error handling
    }
    
    // Composite index: branch_id + data_completion_status (used in dashboard)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_branch_completion ON employees(branch_id, data_completion_status)',
        'Created composite index on employees(branch_id, data_completion_status)'
      );
    } catch (error) {
      // Silent error handling
    }
    
    // Composite index: status + data_completion_status (used in filtering)
    try {
      const statusColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'status'
      `;
      if (statusColumnExists && statusColumnExists.length > 0) {
        await executeQuery(
          'CREATE INDEX IF NOT EXISTS idx_employees_status_completion ON employees(status, data_completion_status)',
          'Created composite index on employees(status, data_completion_status)'
        );
      }
    } catch (error) {
      // Silent error handling
    }
    
    // Index for academic_year (if column exists)
    try {
      const academicYearColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'academic_year'
      `;
      if (academicYearColumnExists && academicYearColumnExists.length > 0) {
        await executeQuery(
          'CREATE INDEX IF NOT EXISTS idx_employees_academic_year ON employees(academic_year)',
          'Created index on employees.academic_year'
        );
      }
    } catch (error) {
      // Silent error handling
    }

    // Add foreign key constraints for employees term references (after terms table is created)
    // Only add if columns exist
    try {
      const regTermColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'registration_term_id'
      `;
      if (regTermColumnExists && regTermColumnExists.length > 0) {
        // Check if constraint already exists
        const constraintExists = await sql`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'employees' AND constraint_name = 'fk_employees_registration_term'
        `;
        if (!constraintExists || constraintExists.length === 0) {
          await executeQuery(
            'ALTER TABLE employees ADD CONSTRAINT fk_employees_registration_term FOREIGN KEY (registration_term_id) REFERENCES terms(id) ON DELETE SET NULL',
            'Added foreign key for employees.registration_term_id'
          );
        }
      }
    } catch (error) {
      // Silent error handling
    }
    
    try {
      const currentTermColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'current_term_id'
      `;
      if (currentTermColumnExists && currentTermColumnExists.length > 0) {
        // Check if constraint already exists
        const constraintExists = await sql`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'employees' AND constraint_name = 'fk_employees_current_term'
        `;
        if (!constraintExists || constraintExists.length === 0) {
          await executeQuery(
            'ALTER TABLE employees ADD CONSTRAINT fk_employees_current_term FOREIGN KEY (current_term_id) REFERENCES terms(id) ON DELETE SET NULL',
            'Added foreign key for employees.current_term_id'
          );
        }
      }
    } catch (error) {
      // Silent error handling
    }

    // Add Hijri date columns for all date fields that don't have them
    // employee_documents.expiry_date_hijri
    try {
      await executeQuery(
        'ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS expiry_date_hijri VARCHAR(50)',
        'Added expiry_date_hijri column to employee_documents'
      );
    } catch (error) {
      // Silent error handling - column may already exist
    }

    // Note: passport_issue_date, passport_expiry_date, residency_issue_date, graduation_year
    // are currently stored as VARCHAR fields (not DATE), so we don't need Hijri columns for them
    // as they're likely stored as strings already. If they need dual format support in the future,
    // we can add _hijri columns for them as well.

    // notifications.expires_at
    try {
      await executeQuery(
        'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP',
        'Added expires_at column to notifications'
      );
    } catch (error) {
      console.error('Error adding expires_at column to notifications:', error.message);
    }

    // notifications.one_time
    try {
      await executeQuery(
        'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS one_time BOOLEAN DEFAULT false',
        'Added one_time column to notifications'
      );
    } catch (error) {
      console.error('Error adding one_time column to notifications:', error.message);
    }

    // Add seen_by_branches column to existing notifications table if it doesn't exist
    try {
      await executeQuery(
        `DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'notifications' AND column_name = 'seen_by_branches'
          ) THEN
            ALTER TABLE notifications ADD COLUMN seen_by_branches INTEGER[] DEFAULT ARRAY[]::INTEGER[];
          END IF;
        END $$;`,
        'Added seen_by_branches column to notifications table'
      );
    } catch (error) {
      console.error('Error adding seen_by_branches column to notifications:', error.message);
    }

    // Update importance_level constraint to allow level 5
    try {
      await executeQuery(
        `DO $$ 
        BEGIN 
          IF EXISTS (
            SELECT 1 FROM information_schema.constraint_column_usage 
            WHERE table_name = 'notifications' 
            AND constraint_name = 'notifications_importance_level_check'
          ) THEN
            ALTER TABLE notifications DROP CONSTRAINT notifications_importance_level_check;
          END IF;
        END $$;
        ALTER TABLE notifications ADD CONSTRAINT notifications_importance_level_check 
        CHECK (importance_level IN (1, 2, 3, 4, 5))`,
        'Updated importance_level constraint to allow level 5'
      );
    } catch (error) {
      console.error('Error updating importance_level constraint:', error.message);
    }

    // notification_views table (for one-time notifications)
    try {
      await executeQuery(
        `CREATE TABLE IF NOT EXISTS notification_views (
          id SERIAL PRIMARY KEY,
          notification_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(notification_id, user_id)
        )`,
        'Created notification_views table'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_notification_views_notification_id ON notification_views(notification_id)',
        'Created index on notification_views.notification_id'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_notification_views_user_id ON notification_views(user_id)',
        'Created index on notification_views.user_id'
      );
    } catch (error) {
      console.error('Error creating notification_views table:', error.message);
    }

    // Payroll absence feature tables
    try {
      await createTable('absence_cycles', `
        id SERIAL PRIMARY KEY,
        month_start DATE UNIQUE NOT NULL,
        month_end DATE NOT NULL,
        auto_open_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

      await createTable('branch_absence_windows', `
        id SERIAL PRIMARY KEY,
        cycle_id INTEGER NOT NULL REFERENCES absence_cycles(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        status VARCHAR(30) NOT NULL DEFAULT 'countdown' CHECK (status IN ('countdown','entry_open','view_only','closed')),
        entry_open_at TIMESTAMP NOT NULL,
        view_until TIMESTAMP,
        submission_count INTEGER NOT NULL DEFAULT 0,
        last_submission_at TIMESTAMP,
        manual_opened BOOLEAN DEFAULT FALSE,
        manual_opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        manual_opened_at TIMESTAMP,
        manual_expires_at TIMESTAMP,
        manual_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cycle_id, branch_id)
      `);

      await createTable('branch_absence_submissions', `
        id SERIAL PRIMARY KEY,
        cycle_id INTEGER NOT NULL REFERENCES absence_cycles(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        submission_number INTEGER NOT NULL DEFAULT 1,
        submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        total_absences INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        manual_reopen BOOLEAN DEFAULT FALSE,
        is_superseded BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

      await createTable('employee_absences', `
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES branch_absence_submissions(id) ON DELETE CASCADE,
        cycle_id INTEGER NOT NULL REFERENCES absence_cycles(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        absences INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

      // Helpful indexes
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_branch_absence_windows_cycle_branch ON branch_absence_windows(cycle_id, branch_id)',
        'Created index on branch_absence_windows for cycle/branch lookups'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_branch_absence_windows_status ON branch_absence_windows(status)',
        'Created index on branch_absence_windows status'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_branch_absence_submissions_cycle_branch ON branch_absence_submissions(cycle_id, branch_id)',
        'Created index on branch_absence_submissions for cycle/branch lookups'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employee_absences_cycle_branch ON employee_absences(cycle_id, branch_id)',
        'Created index on employee_absences for cycle/branch lookups'
      );
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employee_absences_employee ON employee_absences(employee_id)',
        'Created index on employee_absences employee_id'
      );
    } catch (error) {
      console.error('Error creating payroll absence tables:', error.message);
    }

    // Excused/unexcused absences columns
    try {
      await executeQuery(
        `ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS excused_absences INTEGER NOT NULL DEFAULT 0`,
        'Add excused_absences to employee_absences'
      );
      await executeQuery(
        `ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS unexcused_absences INTEGER NOT NULL DEFAULT 0`,
        'Add unexcused_absences to employee_absences'
      );
    } catch (error) {
      console.error('Error adding excused/unexcused absences columns:', error.message);
    }

    return { success: true, message: 'Database initialization completed successfully' };

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Run initialization if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}


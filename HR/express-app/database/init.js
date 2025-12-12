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
    console.log('Creating branches table...');
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
    console.log('Creating users table...');
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
    console.log('Creating schools table...');
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
    console.log('Creating healthcare_centers table...');
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
    console.log('Creating employees table...');
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

    // 6. Create employee_documents table
    console.log('Creating employee_documents table...');
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
    console.log('Creating branch_documents table...');
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

    // 7. Create employee_professional_classifications table
    console.log('Creating employee_professional_classifications table...');
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
    console.log('Creating employee_course_certificates table...');
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
    console.log('Creating notifications table...');
    await createTable('notifications', `
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      importance_level INTEGER NOT NULL CHECK (importance_level IN (1, 2, 3)),
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
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

    // 10. Create notification_branches table (many-to-many relationship)
    console.log('Creating notification_branches table...');
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
    console.log('Creating notification_responses table...');
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

    // 12. Create terms table
    console.log('Creating terms table...');
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
    console.log('Creating academic_years table...');
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
    console.log('Creating requests table...');
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

    // 15. Create alerts table (Smart Alerts System)
    console.log('Creating alerts table...');
    await createTable('alerts', `
      id SERIAL PRIMARY KEY,
      alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('id_expiry', 'missing_document', 'incomplete_data', 'custom')),
      priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      branch_id INTEGER,
      employee_id INTEGER,
      related_entity_type VARCHAR(50),
      related_entity_id INTEGER,
      alert_data JSONB,
      is_read BOOLEAN DEFAULT false,
      is_resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMP,
      resolved_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create indexes for alerts
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type)',
      'Created index on alerts.alert_type'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_branch_id ON alerts(branch_id)',
      'Created index on alerts.branch_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_employee_id ON alerts(employee_id)',
      'Created index on alerts.employee_id'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read)',
      'Created index on alerts.is_read'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_is_resolved ON alerts(is_resolved)',
      'Created index on alerts.is_resolved'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority)',
      'Created index on alerts.priority'
    );
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC)',
      'Created index on alerts.created_at'
    );

    // 16. Create alert_settings table (User notification preferences)
    console.log('Creating alert_settings table...');
    await createTable('alert_settings', `
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      id_expiry_enabled BOOLEAN DEFAULT true,
      id_expiry_days_before INTEGER DEFAULT 30,
      missing_document_enabled BOOLEAN DEFAULT true,
      incomplete_data_enabled BOOLEAN DEFAULT true,
      email_notifications_enabled BOOLEAN DEFAULT false,
      sms_notifications_enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);

    // Create index for alert_settings
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_alert_settings_user_id ON alert_settings(user_id)',
      'Created index on alert_settings.user_id'
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
      } else {
        console.log('Skipping employees.status index - column does not exist. Please run migration script first.');
      }
    } catch (error) {
      console.log('Could not create index on employees.status:', error.message);
      console.log('Note: If employees table exists without status column, run: node express-app/scripts/migrate-add-employee-status-and-terms.js');
    }
    
    // Index for is_active (used frequently in queries)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active)',
        'Created index on employees.is_active'
      );
    } catch (error) {
      console.log('Could not create index on employees.is_active:', error.message);
    }
    
    // Index for phone_number (used in search operations)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_phone_number ON employees(phone_number)',
        'Created index on employees.phone_number'
      );
    } catch (error) {
      console.log('Could not create index on employees.phone_number:', error.message);
    }
    
    // Index for created_at (used in ORDER BY clauses)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_created_at ON employees(created_at DESC)',
        'Created index on employees.created_at'
      );
    } catch (error) {
      console.log('Could not create index on employees.created_at:', error.message);
    }
    
    // Index for updated_at (used in update tracking)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON employees(updated_at DESC)',
        'Created index on employees.updated_at'
      );
    } catch (error) {
      console.log('Could not create index on employees.updated_at:', error.message);
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
      console.log('Could not create composite index on employees(branch_id, status):', error.message);
    }
    
    // Composite index: branch_id + data_completion_status (used in dashboard)
    try {
      await executeQuery(
        'CREATE INDEX IF NOT EXISTS idx_employees_branch_completion ON employees(branch_id, data_completion_status)',
        'Created composite index on employees(branch_id, data_completion_status)'
      );
    } catch (error) {
      console.log('Could not create composite index on employees(branch_id, data_completion_status):', error.message);
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
      console.log('Could not create composite index on employees(status, data_completion_status):', error.message);
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
      } else {
        console.log('Skipping employees.academic_year index - column does not exist. Please run migration script first.');
      }
    } catch (error) {
      console.log('Could not create index on employees.academic_year:', error.message);
      console.log('Note: If employees table exists without academic_year column, run: node express-app/scripts/migrate-add-employee-status-and-terms.js');
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
      console.log('Could not add foreign key for registration_term_id:', error.message);
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
      console.log('Could not add foreign key for current_term_id:', error.message);
    }

    console.log('Database initialization completed successfully!');
    return { success: true, message: 'All tables created successfully' };

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Run initialization if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
    .then(() => {
      console.log('Database setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}


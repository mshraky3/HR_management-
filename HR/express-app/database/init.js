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
      date_of_birth_hijri DATE,
      date_of_birth_gregorian DATE NOT NULL,
      id_or_residency_number VARCHAR(100) UNIQUE NOT NULL,
      id_type VARCHAR(50) NOT NULL CHECK (id_type IN ('citizen', 'resident')),
      gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female')),
      id_expiry_date_hijri DATE,
      id_expiry_date_gregorian DATE,
      religion VARCHAR(100),
      marital_status VARCHAR(50),
      educational_qualification VARCHAR(200),
      specialization VARCHAR(200),
      bank_iban VARCHAR(50),
      bank_name VARCHAR(200),
      email VARCHAR(255),
      phone_number VARCHAR(50),
      contract_type VARCHAR(100),
      salary DECIMAL(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
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
      uploaded_by INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
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


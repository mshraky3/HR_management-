/**
 * Cleanup Script: Delete All Employees and Their Files
 * This script will:
 * 1. Delete all employee documents (from Blob Storage and local files)
 * 2. Delete all employee-related records (classifications, certificates)
 * 3. Delete all employee records
 * 
 * WARNING: This is a destructive operation and cannot be undone!
 */

import sql from '../config/database.js';
import { deleteFromBlob } from '../utils/blobStorage.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanupAllEmployees() {
  console.log('⚠️  WARNING: This will delete ALL employees and their files!');
  console.log('Starting cleanup process...\n');

  try {
    // Step 1: Get all employees
    console.log('Step 1: Fetching all employees...');
    const employees = await sql`
      SELECT id, employee_id_number, first_name, second_name 
      FROM employees 
      WHERE is_active = true
    `;
    console.log(`Found ${employees.length} active employees\n`);

    if (employees.length === 0) {
      console.log('✅ No employees to delete. Database is already clean.');
      return;
    }

    // Step 2: Delete all documents and files
    console.log('Step 2: Deleting employee documents and files...');
    const allDocuments = await sql`
      SELECT id, employee_id, file_path, file_name 
      FROM employee_documents 
      WHERE is_active = true
    `;
    console.log(`Found ${allDocuments.length} documents to delete`);

    let deletedBlobFiles = 0;
    let deletedLocalFiles = 0;
    let failedDeletes = 0;

    for (const doc of allDocuments) {
      try {
        // Delete from Blob Storage if it's a URL
        if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
          await deleteFromBlob(doc.file_path);
          deletedBlobFiles++;
        } 
        // Delete local file if it exists
        else if (doc.file_path) {
          let filePath;
          if (path.isAbsolute(doc.file_path)) {
            filePath = doc.file_path;
          } else {
            // Try different path formats
            const relativePath = doc.file_path.replace(/^express-app\//, '');
            filePath = path.join(__dirname, '..', relativePath);
            
            if (!fs.existsSync(filePath)) {
              // Try alternative path
              filePath = path.join(__dirname, '..', 'storage', relativePath.replace(/^storage\//, ''));
            }
          }
          
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              deletedLocalFiles++;
            } catch (err) {
              console.warn(`Failed to delete local file: ${filePath}`, err.message);
              failedDeletes++;
            }
          }
        }
      } catch (error) {
        console.warn(`Error deleting file for document ${doc.id}:`, error.message);
        failedDeletes++;
      }
    }

    console.log(`  ✅ Deleted ${deletedBlobFiles} files from Blob Storage`);
    console.log(`  ✅ Deleted ${deletedLocalFiles} local files`);
    if (failedDeletes > 0) {
      console.log(`  ⚠️  Failed to delete ${failedDeletes} files`);
    }

    // Step 3: Delete document records from database
    console.log('\nStep 3: Deleting document records from database...');
    const deletedDocs = await sql`
      DELETE FROM employee_documents
    `;
    console.log(`  ✅ Deleted ${deletedDocs.count || 0} document records`);

    // Step 4: Delete employee professional classifications
    console.log('\nStep 4: Deleting employee professional classifications...');
    const deletedClassifications = await sql`
      DELETE FROM employee_professional_classifications
    `;
    console.log(`  ✅ Deleted ${deletedClassifications.count || 0} classification records`);

    // Step 5: Delete employee course certificates
    console.log('\nStep 5: Deleting employee course certificates...');
    const deletedCertificates = await sql`
      DELETE FROM employee_course_certificates
    `;
    console.log(`  ✅ Deleted ${deletedCertificates.count || 0} certificate records`);

    // Step 6: Delete employee records
    console.log('\nStep 6: Deleting employee records...');
    const deletedEmployees = await sql`
      DELETE FROM employees
    `;
    console.log(`  ✅ Deleted ${deletedEmployees.count || 0} employee records`);

    // Step 7: Clean up empty directories (optional)
    console.log('\nStep 7: Cleaning up empty directories...');
    try {
      const documentsDir = path.join(__dirname, '..', 'storage', 'uploads', 'documents');
      if (fs.existsSync(documentsDir)) {
        // Remove employee directories
        const employeeDirs = fs.readdirSync(documentsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory() && !isNaN(parseInt(dirent.name)))
          .map(dirent => path.join(documentsDir, dirent.name));
        
        for (const dir of employeeDirs) {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (err) {
            console.warn(`Failed to remove directory: ${dir}`, err.message);
          }
        }
        console.log(`  ✅ Cleaned up ${employeeDirs.length} employee directories`);
      }
    } catch (error) {
      console.warn('  ⚠️  Error cleaning up directories:', error.message);
    }

    console.log('\n✅ Cleanup completed successfully!');
    console.log(`\nSummary:`);
    console.log(`  - Employees deleted: ${employees.length}`);
    console.log(`  - Documents deleted: ${allDocuments.length}`);
    console.log(`  - Blob files deleted: ${deletedBlobFiles}`);
    console.log(`  - Local files deleted: ${deletedLocalFiles}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Run cleanup if script is executed directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('cleanup-all-employees.js');

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  cleanupAllEmployees()
    .then(() => {
      console.log('\n✅ Cleanup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup script failed:', error);
      process.exit(1);
    });
}

export default cleanupAllEmployees;


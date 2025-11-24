/**
 * Cleanup Script: Delete All Branches and Employees
 * This script will:
 * 1. Delete all employee documents (from Blob Storage and local files)
 * 2. Delete all branch documents (from Blob Storage and local files)
 * 3. Delete all employee-related records (classifications, certificates)
 * 4. Delete all employee records
 * 5. Delete all branch documents records
 * 6. Delete all branches (schools and healthcare_centers will be deleted automatically via CASCADE)
 * 7. Update users to remove branch_id references
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

async function cleanupAllData() {
  console.log('⚠️  WARNING: This will delete ALL branches, employees, and their files!');
  console.log('⚠️  This operation cannot be undone!\n');
  console.log('Starting cleanup process...\n');

  try {
    // Step 1: Get counts before deletion
    console.log('Step 1: Counting records...');
    const [employeeCount] = await sql`SELECT COUNT(*) as count FROM employees`;
    const [branchCount] = await sql`SELECT COUNT(*) as count FROM branches`;
    const [employeeDocCount] = await sql`SELECT COUNT(*) as count FROM employee_documents`;
    const [branchDocCount] = await sql`SELECT COUNT(*) as count FROM branch_documents`;
    
    console.log(`  Found ${employeeCount.count} employees`);
    console.log(`  Found ${branchCount.count} branches`);
    console.log(`  Found ${employeeDocCount.count} employee documents`);
    console.log(`  Found ${branchDocCount.count} branch documents\n`);

    if (employeeCount.count === 0 && branchCount.count === 0) {
      console.log('✅ No data to delete. Database is already clean.');
      return;
    }

    // Step 2: Delete employee documents and files
    console.log('Step 2: Deleting employee documents and files...');
    const employeeDocuments = await sql`
      SELECT id, employee_id, file_path, file_name 
      FROM employee_documents
    `;
    console.log(`  Processing ${employeeDocuments.length} employee documents...`);

    let deletedEmployeeBlobFiles = 0;
    let deletedEmployeeLocalFiles = 0;
    let failedEmployeeDeletes = 0;

    for (const doc of employeeDocuments) {
      try {
        // Delete from Blob Storage if it's a URL
        if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
          try {
            await deleteFromBlob(doc.file_path);
            deletedEmployeeBlobFiles++;
          } catch (err) {
            console.warn(`    Failed to delete blob file: ${doc.file_path}`, err.message);
            failedEmployeeDeletes++;
          }
        } 
        // Delete local file if it exists
        else if (doc.file_path) {
          let filePath;
          if (path.isAbsolute(doc.file_path)) {
            filePath = doc.file_path;
          } else {
            const relativePath = doc.file_path.replace(/^express-app\//, '');
            filePath = path.join(__dirname, '..', relativePath);
            
            if (!fs.existsSync(filePath)) {
              filePath = path.join(__dirname, '..', 'storage', relativePath.replace(/^storage\//, ''));
            }
          }
          
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              deletedEmployeeLocalFiles++;
            } catch (err) {
              console.warn(`    Failed to delete local file: ${filePath}`, err.message);
              failedEmployeeDeletes++;
            }
          }
        }
      } catch (error) {
        console.warn(`    Error deleting file for document ${doc.id}:`, error.message);
        failedEmployeeDeletes++;
      }
    }

    console.log(`  ✅ Deleted ${deletedEmployeeBlobFiles} employee files from Blob Storage`);
    console.log(`  ✅ Deleted ${deletedEmployeeLocalFiles} employee local files`);
    if (failedEmployeeDeletes > 0) {
      console.log(`  ⚠️  Failed to delete ${failedEmployeeDeletes} employee files`);
    }

    // Step 3: Delete branch documents and files
    console.log('\nStep 3: Deleting branch documents and files...');
    const branchDocuments = await sql`
      SELECT id, branch_id, file_path, file_name 
      FROM branch_documents
    `;
    console.log(`  Processing ${branchDocuments.length} branch documents...`);

    let deletedBranchBlobFiles = 0;
    let deletedBranchLocalFiles = 0;
    let failedBranchDeletes = 0;

    for (const doc of branchDocuments) {
      try {
        // Delete from Blob Storage if it's a URL
        if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
          try {
            await deleteFromBlob(doc.file_path);
            deletedBranchBlobFiles++;
          } catch (err) {
            console.warn(`    Failed to delete blob file: ${doc.file_path}`, err.message);
            failedBranchDeletes++;
          }
        } 
        // Delete local file if it exists
        else if (doc.file_path) {
          let filePath;
          if (path.isAbsolute(doc.file_path)) {
            filePath = doc.file_path;
          } else {
            const relativePath = doc.file_path.replace(/^express-app\//, '');
            filePath = path.join(__dirname, '..', relativePath);
            
            if (!fs.existsSync(filePath)) {
              filePath = path.join(__dirname, '..', 'storage', relativePath.replace(/^storage\//, ''));
            }
          }
          
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              deletedBranchLocalFiles++;
            } catch (err) {
              console.warn(`    Failed to delete local file: ${filePath}`, err.message);
              failedBranchDeletes++;
            }
          }
        }
      } catch (error) {
        console.warn(`    Error deleting file for document ${doc.id}:`, error.message);
        failedBranchDeletes++;
      }
    }

    console.log(`  ✅ Deleted ${deletedBranchBlobFiles} branch files from Blob Storage`);
    console.log(`  ✅ Deleted ${deletedBranchLocalFiles} branch local files`);
    if (failedBranchDeletes > 0) {
      console.log(`  ⚠️  Failed to delete ${failedBranchDeletes} branch files`);
    }

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

    // Step 6: Delete employee documents records
    console.log('\nStep 6: Deleting employee document records...');
    const deletedEmployeeDocs = await sql`
      DELETE FROM employee_documents
    `;
    console.log(`  ✅ Deleted ${deletedEmployeeDocs.count || 0} employee document records`);

    // Step 7: Delete employee records
    console.log('\nStep 7: Deleting employee records...');
    // First, we need to handle the foreign key constraint on created_by and updated_by
    // These reference branches, so we'll set them to NULL first or delete employees
    // Since employees has RESTRICT constraint, we need to delete them before branches
    const deletedEmployees = await sql`
      DELETE FROM employees
    `;
    console.log(`  ✅ Deleted ${deletedEmployees.count || 0} employee records`);

    // Step 8: Delete branch documents records
    console.log('\nStep 8: Deleting branch document records...');
    const deletedBranchDocs = await sql`
      DELETE FROM branch_documents
    `;
    console.log(`  ✅ Deleted ${deletedBranchDocs.count || 0} branch document records`);

    // Step 9: Update users to remove branch_id references (set to NULL)
    console.log('\nStep 9: Updating users to remove branch references...');
    const updatedUsers = await sql`
      UPDATE users SET branch_id = NULL WHERE branch_id IS NOT NULL
    `;
    console.log(`  ✅ Updated ${updatedUsers.count || 0} user records`);

    // Step 10: Delete schools (will be deleted automatically via CASCADE when branches are deleted)
    // But we'll delete them explicitly to be safe
    console.log('\nStep 10: Deleting schools...');
    const deletedSchools = await sql`
      DELETE FROM schools
    `;
    console.log(`  ✅ Deleted ${deletedSchools.count || 0} school records`);

    // Step 11: Delete healthcare centers (will be deleted automatically via CASCADE when branches are deleted)
    console.log('\nStep 11: Deleting healthcare centers...');
    const deletedHealthcareCenters = await sql`
      DELETE FROM healthcare_centers
    `;
    console.log(`  ✅ Deleted ${deletedHealthcareCenters.count || 0} healthcare center records`);

    // Step 12: Delete branches
    console.log('\nStep 12: Deleting branches...');
    const deletedBranches = await sql`
      DELETE FROM branches
    `;
    console.log(`  ✅ Deleted ${deletedBranches.count || 0} branch records`);

    // Step 13: Clean up empty directories
    console.log('\nStep 13: Cleaning up empty directories...');
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
            console.warn(`    Failed to remove directory: ${dir}`, err.message);
          }
        }
        console.log(`  ✅ Cleaned up ${employeeDirs.length} employee directories`);
      }

      // Clean up branch documents directories
      const branchDocsDir = path.join(__dirname, '..', 'storage', 'uploads', 'branch-documents');
      if (fs.existsSync(branchDocsDir)) {
        const branchDirs = fs.readdirSync(branchDocsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory() && !isNaN(parseInt(dirent.name)))
          .map(dirent => path.join(branchDocsDir, dirent.name));
        
        for (const dir of branchDirs) {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (err) {
            console.warn(`    Failed to remove directory: ${dir}`, err.message);
          }
        }
        console.log(`  ✅ Cleaned up ${branchDirs.length} branch directories`);
      }
    } catch (error) {
      console.warn('  ⚠️  Error cleaning up directories:', error.message);
    }

    // Final summary
    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - Branches deleted: ${branchCount.count}`);
    console.log(`  - Employees deleted: ${employeeCount.count}`);
    console.log(`  - Employee documents deleted: ${employeeDocCount.count}`);
    console.log(`  - Branch documents deleted: ${branchDocCount.count}`);
    console.log(`  - Employee blob files deleted: ${deletedEmployeeBlobFiles}`);
    console.log(`  - Employee local files deleted: ${deletedEmployeeLocalFiles}`);
    console.log(`  - Branch blob files deleted: ${deletedBranchBlobFiles}`);
    console.log(`  - Branch local files deleted: ${deletedBranchLocalFiles}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run cleanup if script is executed directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('cleanup-all-data.js');

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  cleanupAllData()
    .then(() => {
      console.log('\n✅ Cleanup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup script failed:', error);
      process.exit(1);
    });
}

export default cleanupAllData;


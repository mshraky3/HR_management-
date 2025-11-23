/**
 * Migration Script: Add speech_therapy_70_hours_course document type support
 * This is a document type, not a database column change
 * The document type will be handled in the employee_documents table
 * 
 * Note: This migration is informational - the document type will work
 * automatically once the frontend is updated to use it.
 */

import { sql } from '../db-helpers.js';

async function migrateAddSpeechTherapy70HoursCourse() {
  console.log('Starting speech therapy 70 hours course document type migration...');

  try {
    // Check if employee_documents table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'employee_documents'
      )
    `;

    if (!tableExists[0].exists) {
      console.log('⚠️  employee_documents table does not exist. Please create it first.');
      return;
    }

    // The document type 'speech_therapy_70_hours_course' will be automatically
    // supported once the frontend is updated. No database schema changes needed.
    
    console.log('✅ Speech therapy 70 hours course document type is ready to use.');
    console.log('   Document type: speech_therapy_70_hours_course');
    console.log('   Required for job title: النطق و التخاطب');
    
    // Note: This is a document type, not a database schema change
    // The document type will be stored in employee_documents table automatically

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

// Run migration if script is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && process.argv[1].endsWith(__filename);

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  migrateAddSpeechTherapy70HoursCourse()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddSpeechTherapy70HoursCourse;


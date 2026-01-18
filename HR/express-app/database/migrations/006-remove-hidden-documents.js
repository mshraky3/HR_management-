/**
 * Migration 006: Remove Hidden and Specified Document Types
 * 
 * This migration marks 11 document types as inactive in branch_documents table:
 * - staff_cadre, dropped_students, free_seats, acceptance_notifications, other
 * - certification_commitment_form, financial_platform_declaration, financial_claim_form
 * - decision_commitment, disclosure_commitment, decision_obligation
 * 
 * This preserves data but hides documents from queries.
 * 
 * Usage: node database/migrations/006-remove-hidden-documents.js
 */

import sql from '../../config/database.js';

const DOCUMENTS_TO_REMOVE = [
  'staff_cadre',
  'dropped_students',
  'free_seats',
  'acceptance_notifications',
  'other',
  'certification_commitment_form',
  'financial_platform_declaration',
  'financial_claim_form',
  'decision_commitment',
  'disclosure_commitment',
  'decision_obligation'
];

export async function up() {
  try {
    console.log('=== Starting Document Types Removal Migration ===');
    
    // Step 1: Count affected records
    const countResult = await sql`
      SELECT COUNT(*) as count 
      FROM branch_documents 
      WHERE document_type = ANY(${DOCUMENTS_TO_REMOVE})
      AND is_active = true
    `;
    const affectedCount = parseInt(countResult[0]?.count || 0, 10);
    
    if (affectedCount === 0) {
      console.log('✓ No active documents found with these types. Nothing to update.');
      return { success: true, message: 'No documents to update', affectedCount: 0 };
    }
    
    console.log(`Found ${affectedCount} active document(s) to mark as inactive.`);
    
    // Step 2: Mark documents as inactive
    console.log('Marking documents as inactive...');
    const updateResult = await sql`
      UPDATE branch_documents 
      SET is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE document_type = ANY(${DOCUMENTS_TO_REMOVE})
      AND is_active = true
    `;
    
    console.log(`✓ Successfully marked ${affectedCount} document(s) as inactive.`);
    console.log('=== Document Types Removal Migration Completed Successfully ===');
    
    return { 
      success: true, 
      message: `Marked ${affectedCount} document(s) as inactive`,
      affectedCount 
    };
  } catch (error) {
    console.error('=== Document Types Removal Migration Failed ===', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}

export async function down() {
  console.warn('Rollback not supported for document types removal.');
  console.warn('To restore documents, you would need to manually set is_active = true.');
  return { success: false, message: 'Rollback not supported' };
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  up()
    .then(result => {
      console.log('Migration completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await sql.end();
    });
}

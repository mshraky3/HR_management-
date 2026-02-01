-- Migration: Remove Hidden and Specified Document Types
-- Date: 2024
-- Description: Mark as inactive or delete 11 document types from branch_documents table
-- This includes hidden documents and specified documents to be removed from the system

-- Step 1: Backup affected records (uncomment to create backup table)
-- CREATE TABLE branch_documents_backup_removed_types AS 
-- SELECT * FROM branch_documents 
-- WHERE document_type IN (
--   'staff_cadre', 
--   'dropped_students', 
--   'free_seats', 
--   'acceptance_notifications', 
--   'other', 
--   'certification_commitment_form',
--   'financial_platform_declaration', 
--   'financial_claim_form',
--   'decision_commitment', 
--   'disclosure_commitment', 
--   'decision_obligation'
-- );

-- Step 2: Mark documents as inactive (safer approach - preserves data)
UPDATE branch_documents 
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE document_type IN (
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
)
AND is_active = true;

-- Step 3: (Optional) Permanent deletion - ONLY RUN AFTER VERIFICATION
-- Uncomment below if you want to permanently delete these records
-- WARNING: This cannot be undone without backup!
-- DELETE FROM branch_documents 
-- WHERE document_type IN (
--   'staff_cadre', 
--   'dropped_students', 
--   'free_seats', 
--   'acceptance_notifications', 
--   'other', 
--   'certification_commitment_form',
--   'financial_platform_declaration', 
--   'financial_claim_form',
--   'decision_commitment', 
--   'disclosure_commitment', 
--   'decision_obligation'
-- );

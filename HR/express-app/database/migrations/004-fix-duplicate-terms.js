/**
 * Migration: Fix Duplicate Terms
 * Identifies and fixes duplicate terms with same (branch_type, academic_year_label, term_number)
 * Marks older duplicates as inactive, keeping the most recent one active
 */

import sql from '../config/database.js';
import { log } from '../../utils/logger.js';

export async function fixDuplicateTerms() {
  try {
    log.info('Starting migration: Fix duplicate terms');
    
    // Find duplicate terms
    const duplicates = await sql`
      SELECT 
        branch_type,
        academic_year_label,
        term_number,
        COUNT(*) as count,
        ARRAY_AGG(id ORDER BY created_at DESC) as term_ids,
        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
      FROM terms
      WHERE is_active = true
      GROUP BY branch_type, academic_year_label, term_number
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length === 0) {
      log.info('No duplicate terms found. Migration complete.');
      return {
        success: true,
        message: 'No duplicate terms found',
        duplicatesFixed: 0
      };
    }
    
    log.warn(`Found ${duplicates.length} duplicate term groups`);
    
    let totalFixed = 0;
    const fixedTerms = [];
    
    // Process each duplicate group
    for (const dup of duplicates) {
      const termIds = dup.term_ids;
      const createdDates = dup.created_dates;
      
      // Keep the first one (most recent by created_at DESC), deactivate the rest
      const keepId = termIds[0];
      const deactivateIds = termIds.slice(1);
      
      log.warn(`Duplicate group: ${dup.branch_type} - ${dup.academic_year_label} - Term ${dup.term_number}`);
      log.warn(`  Keeping term ID: ${keepId} (created: ${createdDates[0]})`);
      log.warn(`  Deactivating term IDs: ${deactivateIds.join(', ')}`);
      
      // Deactivate duplicate terms
      for (const id of deactivateIds) {
        await sql`
          UPDATE terms
          SET is_active = false,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
        `;
        
        fixedTerms.push({
          id,
          branch_type: dup.branch_type,
          academic_year_label: dup.academic_year_label,
          term_number: dup.term_number,
          action: 'deactivated',
          kept_id: keepId
        });
        
        totalFixed++;
      }
    }
    
    log.info(`Migration complete. Fixed ${totalFixed} duplicate terms.`);
    
    return {
      success: true,
      message: `Fixed ${totalFixed} duplicate terms`,
      duplicatesFixed: totalFixed,
      details: fixedTerms
    };
  } catch (error) {
    log.error('Error fixing duplicate terms:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixDuplicateTerms()
    .then(result => {
      console.log('Migration result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

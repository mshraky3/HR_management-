/**
 * Migration: Audit Terms and Academic Years
 * Identifies inconsistencies between terms and academic_years tables
 * Reports issues but doesn't automatically fix them (manual review required)
 */

import sql from '../config/database.js';
import { log } from '../../utils/logger.js';

export async function auditTermsAndAcademicYears() {
  try {
    log.info('Starting audit: Terms and Academic Years consistency check');
    
    const issues = {
      orphanedTerms: [],
      missingAcademicYearTerms: [],
      labelMismatches: [],
      duplicateAcademicYearLabels: [],
      missingTermReferences: []
    };
    
    // 1. Find terms without corresponding academic_years entry
    const orphanedTerms = await sql`
      SELECT t.*
      FROM terms t
      WHERE t.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM academic_years ay
        WHERE (ay.term1_id = t.id OR ay.term2_id = t.id)
      )
    `;
    
    issues.orphanedTerms = orphanedTerms;
    
    // 2. Find academic_years with missing term references
    const missingTermRefs = await sql`
      SELECT ay.*
      FROM academic_years ay
      WHERE (ay.term1_id IS NULL OR ay.term2_id IS NULL)
      OR NOT EXISTS (SELECT 1 FROM terms WHERE id = ay.term1_id)
      OR NOT EXISTS (SELECT 1 FROM terms WHERE id = ay.term2_id)
    `;
    
    issues.missingTermReferences = missingTermRefs;
    
    // 3. Find terms with academic_year_label mismatch with parent academic_years.year_label
    const labelMismatches = await sql`
      SELECT 
        t.id as term_id,
        t.academic_year_label as term_label,
        ay.id as academic_year_id,
        ay.year_label as academic_year_label,
        t.branch_type
      FROM terms t
      INNER JOIN academic_years ay ON (ay.term1_id = t.id OR ay.term2_id = t.id)
      WHERE t.academic_year_label != ay.year_label
    `;
    
    issues.labelMismatches = labelMismatches;
    
    // 4. Find duplicate academic_year_label within same branch_type
    const duplicateLabels = await sql`
      SELECT 
        branch_type,
        academic_year_label,
        COUNT(*) as count,
        ARRAY_AGG(id) as term_ids
      FROM terms
      WHERE is_active = true
      GROUP BY branch_type, academic_year_label
      HAVING COUNT(*) > 2
      ORDER BY branch_type, academic_year_label
    `;
    
    issues.duplicateAcademicYearLabels = duplicateLabels;
    
    // 5. Find academic_years without both terms active
    const missingActiveTerms = await sql`
      SELECT 
        ay.*,
        t1.is_active as term1_active,
        t2.is_active as term2_active
      FROM academic_years ay
      LEFT JOIN terms t1 ON ay.term1_id = t1.id
      LEFT JOIN terms t2 ON ay.term2_id = t2.id
      WHERE t1.is_active = false OR t2.is_active = false OR t1.id IS NULL OR t2.id IS NULL
    `;
    
    issues.missingAcademicYearTerms = missingActiveTerms;
    
    // Log results
    if (issues.orphanedTerms.length > 0) {
      log.warn(`Found ${issues.orphanedTerms.length} orphaned terms (not linked to any academic_year)`);
      issues.orphanedTerms.forEach(term => {
        log.warn(`  - Term ID ${term.id}: ${term.term_name} (${term.academic_year_label}) - ${term.branch_type}`);
      });
    }
    
    if (issues.missingTermReferences.length > 0) {
      log.warn(`Found ${issues.missingTermReferences.length} academic_years with missing term references`);
      issues.missingTermReferences.forEach(ay => {
        log.warn(`  - Academic Year ID ${ay.id}: ${ay.year_label} - ${ay.branch_type}`);
        if (!ay.term1_id) log.warn(`    Missing term1_id`);
        if (!ay.term2_id) log.warn(`    Missing term2_id`);
      });
    }
    
    if (issues.labelMismatches.length > 0) {
      log.warn(`Found ${issues.labelMismatches.length} terms with label mismatches`);
      issues.labelMismatches.forEach(m => {
        log.warn(`  - Term ID ${m.term_id}: term label="${m.term_label}" vs academic_year label="${m.academic_year_label}"`);
      });
    }
    
    if (issues.duplicateAcademicYearLabels.length > 0) {
      log.warn(`Found ${issues.duplicateAcademicYearLabels.length} duplicate academic_year_label groups (more than 2 terms per year)`);
      issues.duplicateAcademicYearLabels.forEach(dup => {
        log.warn(`  - ${dup.branch_type}: ${dup.academic_year_label} has ${dup.count} terms (IDs: ${dup.term_ids.join(', ')})`);
      });
    }
    
    if (issues.missingAcademicYearTerms.length > 0) {
      log.warn(`Found ${issues.missingAcademicYearTerms.length} academic_years with inactive or missing terms`);
      issues.missingAcademicYearTerms.forEach(ay => {
        log.warn(`  - Academic Year ID ${ay.id}: ${ay.year_label} - term1_active: ${ay.term1_active}, term2_active: ${ay.term2_active}`);
      });
    }
    
    const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);
    
    if (totalIssues === 0) {
      log.info('✓ Audit complete. No inconsistencies found.');
    } else {
      log.warn(`⚠ Audit complete. Found ${totalIssues} issues requiring attention.`);
    }
    
    return {
      success: true,
      message: `Audit complete. Found ${totalIssues} issues.`,
      issues,
      summary: {
        orphanedTerms: issues.orphanedTerms.length,
        missingTermReferences: issues.missingTermReferences.length,
        labelMismatches: issues.labelMismatches.length,
        duplicateAcademicYearLabels: issues.duplicateAcademicYearLabels.length,
        missingAcademicYearTerms: issues.missingAcademicYearTerms.length,
        total: totalIssues
      }
    };
  } catch (error) {
    log.error('Error auditing terms and academic years:', error);
    throw error;
  }
}

// Run audit if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  auditTermsAndAcademicYears()
    .then(result => {
      console.log('\n=== Audit Summary ===');
      console.log(JSON.stringify(result.summary, null, 2));
      if (result.summary.total > 0) {
        console.log('\n=== Detailed Issues ===');
        console.log(JSON.stringify(result.issues, null, 2));
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Audit failed:', error);
      process.exit(1);
    });
}

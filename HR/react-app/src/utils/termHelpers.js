/**
 * Term Helper Utilities
 * Functions for formatting and displaying terms consistently across the app
 */

import { getBranchTypeLabel } from './employeeHelpers.js';

/**
 * Format term for display in dropdowns and UI
 * Term names now include the year (e.g., "الفصل الأول - 2025/2026")
 * so we use term_name directly instead of appending academic_year_label.
 * @param {Object} term - Term object
 * @param {Object} options - Formatting options
 * @param {boolean} options.showBranchType - Show branch type label (default: true for main managers)
 * @param {boolean} options.shortFormat - Use short format showing only year label (default: false)
 * @returns {string} - Formatted term string
 */
export const formatTermDisplay = (term, options = {}) => {
  if (!term) return '';
  
  const { showBranchType = false, shortFormat = false } = options;
  
  let display = '';
  
  if (shortFormat) {
    display = term.academic_year_label || '';
  } else {
    // term_name already includes year info (e.g., "الفصل الأول - 2025/2026")
    display = term.term_name || term.academic_year_label || '';
  }
  
  if (showBranchType && term.branch_type) {
    const branchTypeLabel = getBranchTypeLabel(term.branch_type);
    display += ` (${branchTypeLabel})`;
  }
  
  return display;
};

/**
 * Group terms by branch type
 * @param {Array} terms - Array of term objects
 * @returns {Object} - Object with keys 'school' and 'healthcare_center'
 */
export const groupTermsByBranchType = (terms) => {
  const grouped = {
    school: [],
    healthcare_center: []
  };
  
  (terms || []).forEach(term => {
    if (term.branch_type && grouped[term.branch_type]) {
      grouped[term.branch_type].push(term);
    }
  });
  
  return grouped;
};

/**
 * Filter terms by branch type
 * @param {Array} terms - Array of term objects
 * @param {string} branchType - Branch type to filter by ('school' or 'healthcare_center')
 * @returns {Array} - Filtered terms
 */
export const filterTermsByBranchType = (terms, branchType) => {
  if (!branchType) return terms || [];
  return (terms || []).filter(term => term.branch_type === branchType);
};

/**
 * Remove duplicate terms based on (branch_type, academic_year_label, term_number)
 * @param {Array} terms - Array of term objects
 * @returns {Array} - Deduplicated terms (keeps first occurrence)
 */
export const deduplicateTerms = (terms) => {
  const seen = new Set();
  const unique = [];
  
  (terms || []).forEach(term => {
    const key = `${term.branch_type}_${term.academic_year_label}_${term.term_number}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(term);
    }
  });
  
  return unique;
};

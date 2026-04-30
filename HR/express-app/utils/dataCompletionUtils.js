/**
 * Data Completion Calculation Utilities (Backend)
 * Unified functions for calculating data completion in backend routes
 * 
 * This module provides consistent calculation logic for:
 * - Employee data completion percentage
 * - Branch documents completion percentage
 * - Overall progress (weighted average)
 * 
 * All calculations use branch.number_of_employees when available for more accurate percentages
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

/**
 * Get required branch documents for a branch type
 * This mirrors the frontend logic
 * 
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {Array<string>} - Array of required document types
 */
export const getRequiredBranchDocuments = (branchType) => {
  const BRANCH_TYPE_RULES = {
    school: {
      requiredDocuments: [
        'license',
        'registration',
        'civil_defense_certificate',
        'municipality_certificate',
        'insurance_statement',
        'rental_contract'
      ]
    },
    healthcare_center: {
      requiredDocuments: [
        'license',
        'registration',
        'civil_defense_certificate',
        'municipality_certificate',
        'insurance_statement',
        'rental_contract',
        'operational_plan',
        'owner_civil_id_copy',
        'student_cadre_file'
      ]
    }
  };

  const branchRules = BRANCH_TYPE_RULES[branchType];
  if (!branchRules) return [];

  return [...new Set(branchRules.requiredDocuments || [])];
};

/**
 * Calculate employee completion percentage from SQL query results
 * Uses branch.number_of_employees if available, otherwise uses actual employee count
 * 
 * @param {Object} employeeStats - SQL query result with total_employees, complete_employees, incomplete_employees
 * @param {Object} branch - Branch object with number_of_employees property
 * @returns {Object} - { percentage, completeCount, incompleteCount, totalCount, expectedCount }
 */
export const calculateEmployeeCompletion = (employeeStats, branch) => {
  const stats = employeeStats || {
    total_employees: 0,
    complete_employees: 0,
    incomplete_employees: 0
  };

  const totalEmployees = parseInt(stats.total_employees || 0, 10);
  const completeEmployees = parseInt(stats.complete_employees || 0, 10);
  const incompleteEmployees = parseInt(stats.incomplete_employees || 0, 10);

  // Use branch.number_of_employees if set, otherwise use actual employees count
  // Ensure expected count is at least actual totalEmployees to avoid >100% when number_of_employees is stale
  let expectedEmployeeCount = branch?.number_of_employees && branch.number_of_employees > 0
    ? parseInt(branch.number_of_employees, 10)
    : totalEmployees;

  expectedEmployeeCount = Math.max(expectedEmployeeCount, totalEmployees);

  let employeesCompletion = expectedEmployeeCount > 0
    ? Math.round((completeEmployees / expectedEmployeeCount) * 100)
    : 0;

  employeesCompletion = Math.min(100, Math.max(0, employeesCompletion));

  return {
    percentage: employeesCompletion,
    completeCount: completeEmployees,
    incompleteCount: incompleteEmployees,
    totalCount: totalEmployees,
    expectedCount: expectedEmployeeCount
  };
};

/**
 * Calculate branch documents completion percentage from SQL query results
 * 
 * @param {Array} documents - Array of branch document objects from database
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {Object} - { percentage, uploadedCount, requiredCount }
 */
export const calculateDocumentsCompletion = (documents, branchType) => {
  if (!documents || !Array.isArray(documents)) {
    return {
      percentage: 0,
      uploadedCount: 0,
      requiredCount: 0
    };
  }

  const requiredDocs = getRequiredBranchDocuments(branchType);

  const uploadedDocs = documents.filter(doc =>
    requiredDocs.includes(doc.document_type) && doc.is_active
  );

  const uniqueUploadedTypes = new Set(uploadedDocs.map(d => d.document_type));
  const uploadedCount = uniqueUploadedTypes.size;

  let branchDocumentsCompletion = requiredDocs.length > 0
    ? Math.round((uploadedCount / requiredDocs.length) * 100)
    : 0;

  branchDocumentsCompletion = Math.min(100, Math.max(0, branchDocumentsCompletion));

  return {
    percentage: branchDocumentsCompletion,
    uploadedCount: uploadedCount,
    requiredCount: requiredDocs.length
  };
};

/**
 * Calculate overall progress (weighted average)
 * Employees: 50%, Documents: 50%
 * 
 * @param {number} employeesCompletion - Employee completion percentage (0-100)
 * @param {number} documentsCompletion - Documents completion percentage (0-100)
 * @returns {number} - Overall progress percentage (0-100)
 */
export const calculateOverallProgress = (employeesCompletion, documentsCompletion) => {
  return Math.round(
    (employeesCompletion * 0.5) + (documentsCompletion * 0.5)
  );
};

/**
 * Calculate all data completion metrics from SQL query results
 * Main function that returns comprehensive completion data
 * 
 * @param {Object} employeeStats - SQL query result with employee statistics
 * @param {Array} documents - Array of branch document objects from database
 * @param {Object} branch - Branch object with branch_type and number_of_employees
 * @returns {Object} - Complete data completion metrics
 */
export const calculateDataCompletion = (employeeStats, documents, branch) => {
  if (!branch) {
    return {
      employeesCompletion: 0,
      branchDocumentsCompletion: 0,
      overallProgress: 0,
      completeEmployees: 0,
      incompleteEmployees: 0,
      totalEmployees: 0,
      expectedEmployeeCount: 0,
      uploadedDocuments: 0,
      requiredDocuments: 0
    };
  }

  const employeeMetrics = calculateEmployeeCompletion(employeeStats, branch);
  const documentMetrics = calculateDocumentsCompletion(documents, branch.branch_type);
  const overallProgress = calculateOverallProgress(
    employeeMetrics.percentage,
    documentMetrics.percentage
  );

  return {
    employeesCompletion: employeeMetrics.percentage,
    branchDocumentsCompletion: documentMetrics.percentage,
    overallProgress: overallProgress,
    completeEmployees: employeeMetrics.completeCount,
    incompleteEmployees: employeeMetrics.incompleteCount,
    totalEmployees: employeeMetrics.totalCount,
    expectedEmployeeCount: employeeMetrics.expectedCount,
    uploadedDocuments: documentMetrics.uploadedCount,
    requiredDocuments: documentMetrics.requiredCount
  };
};

/**
 * Get branch documents from database for a branch
 * Helper function to fetch documents for completion calculation
 * 
 * @param {number} branchId - Branch ID
 * @returns {Promise<Array>} - Array of branch document objects
 */
export const getBranchDocuments = async (branchId) => {
  try {
    const documents = await sql`
      SELECT document_type, is_active
      FROM branch_documents
      WHERE branch_id = ${branchId}
      AND is_active = true
    `;
    return documents || [];
  } catch (error) {
    log.error('Error fetching branch documents:', { error: error.message });
    return [];
  }
};

export default {
  getRequiredBranchDocuments,
  calculateEmployeeCompletion,
  calculateDocumentsCompletion,
  calculateOverallProgress,
  calculateDataCompletion,
  getBranchDocuments
};

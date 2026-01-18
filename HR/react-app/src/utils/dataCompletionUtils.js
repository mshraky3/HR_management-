/**
 * Data Completion Calculation Utilities
 * Unified functions for calculating data completion across all pages
 * 
 * This module provides consistent calculation logic for:
 * - Employee data completion percentage
 * - Branch documents completion percentage
 * - Overall progress (weighted average)
 * 
 * All calculations use branch.number_of_employees when available for more accurate percentages
 */

import { DATA_COMPLETION_STATUS } from './employeeConstants';
import { getRequiredBranchDocuments } from './employeeHelpers';

/**
 * Calculate employee completion percentage
 * Uses branch.number_of_employees if available, otherwise uses actual employee count
 * 
 * @param {Array} employees - Array of employee objects
 * @param {Object} branch - Branch object with number_of_employees property
 * @returns {Object} - { percentage, completeCount, incompleteCount, totalCount, expectedCount }
 */
export const calculateEmployeeCompletion = (employees, branch) => {
  if (!employees || !Array.isArray(employees)) {
    return {
      percentage: 0,
      completeCount: 0,
      incompleteCount: 0,
      totalCount: 0,
      expectedCount: 0
    };
  }

  // Use branch.number_of_employees if set, otherwise use actual employees count
  // This provides more accurate percentage when branch has expected number of employees
  let expectedEmployeeCount = branch?.number_of_employees && branch.number_of_employees > 0
    ? branch.number_of_employees
    : employees.length;

  const completeEmployees = employees.filter(
    emp => emp.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE
  ).length;

  const incompleteEmployees = employees.filter(
    emp => emp.data_completion_status === DATA_COMPLETION_STATUS.INCOMPLETE || !emp.data_completion_status
  ).length;

  // Ensure expected count is not less than actual employees (prevents >100% when branch.number_of_employees is stale)
  expectedEmployeeCount = Math.max(expectedEmployeeCount, employees.length);

  let employeesCompletion = expectedEmployeeCount > 0
    ? Math.round((completeEmployees / expectedEmployeeCount) * 100)
    : 0;

  // Clamp between 0 and 100
  employeesCompletion = Math.min(100, Math.max(0, employeesCompletion));

  return {
    percentage: employeesCompletion,
    completeCount: completeEmployees,
    incompleteCount: incompleteEmployees,
    totalCount: employees.length,
    expectedCount: expectedEmployeeCount
  };
};

/**
 * Calculate branch documents completion percentage
 * 
 * @param {Array} documents - Array of branch document objects
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

  // Count unique uploaded document TYPES (one required type counts once)
  const uniqueUploadedTypes = new Set(uploadedDocs.map(d => d.document_type));
  const uploadedCount = uniqueUploadedTypes.size;

  let branchDocumentsCompletion = requiredDocs.length > 0
    ? Math.round((uploadedCount / requiredDocs.length) * 100)
    : 0;

  // Clamp to 0-100
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
  const e = Number(employeesCompletion) || 0;
  const d = Number(documentsCompletion) || 0;
  const val = Math.round((e * 0.5) + (d * 0.5));
  return Math.min(100, Math.max(0, val));
};

/**
 * Calculate all data completion metrics
 * Main function that returns comprehensive completion data
 * 
 * @param {Array} employees - Array of employee objects
 * @param {Array} documents - Array of branch document objects
 * @param {Object} branch - Branch object with branch_type and number_of_employees
 * @returns {Object} - Complete data completion metrics
 */
export const calculateDataCompletion = (employees, documents, branch) => {
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

  const employeeMetrics = calculateEmployeeCompletion(employees, branch);
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

export default {
  calculateEmployeeCompletion,
  calculateDocumentsCompletion,
  calculateOverallProgress,
  calculateDataCompletion
};

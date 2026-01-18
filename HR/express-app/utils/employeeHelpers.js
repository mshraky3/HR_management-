/**
 * Employee Helper Functions (Backend)
 * Centralized utility functions for employee-related validations and checks
 * This file ensures consistency between frontend and backend
 * 
 * NOTE: This now uses the rule-based system (employeeRules.js) for all business logic
 */

import {
  isSaudiNationality,
  getNationalityRequirements,
  getBranchTypeRules,
  jobTitleMatchesRule,
  getRequiredDocumentsForJobTitle,
  validateDocumentType as validateDocumentTypeFromRules
} from './employeeRules.js';

// ============================================================================
// NATIONALITY HELPERS (using rule system)
// ============================================================================

/**
 * Check if employee is Saudi Arabian
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if Saudi, false otherwise
 */
export const isSaudi = (nationality) => {
  return isSaudiNationality(nationality);
};

/**
 * Check if employee is non-Saudi (resident)
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if non-Saudi, false otherwise
 */
export const isNonSaudi = (nationality) => {
  return !isSaudiNationality(nationality);
};

/**
 * Get ID type based on nationality
 * @param {string} nationality - Employee nationality
 * @returns {'citizen'|'resident'} - ID type
 */
export const getIdTypeFromNationality = (nationality) => {
  const reqs = getNationalityRequirements(nationality);
  return reqs.idType;
};

// ============================================================================
// BRANCH TYPE HELPERS
// ============================================================================

/**
 * Check if branch is a school
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {boolean} - True if school, false otherwise
 */
export const isSchool = (branchType) => {
  return branchType === 'school';
};

/**
 * Check if branch is a healthcare center
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {boolean} - True if healthcare center, false otherwise
 */
export const isHealthcareCenter = (branchType) => {
  return branchType === 'healthcare_center';
};

// ============================================================================
// JOB TITLE HELPERS (using rule system)
// ============================================================================

/**
 * Check if job title requires classification
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type (optional, defaults to healthcare_center)
 * @returns {boolean} - True if classification is required
 */
export const requiresClassification = (jobTitle, branchType = 'healthcare_center') => {
  return jobTitleMatchesRule(jobTitle, 'classification', branchType);
};

/**
 * Check if job title requires experience certificate (universal - checks both types)
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {boolean} - True if experience certificate is required
 */
export const requiresExperienceCertificate = (jobTitle, branchType) => {
  if (!jobTitle || !branchType) return false;
  return jobTitleMatchesRule(jobTitle, 'experienceCertificate', branchType);
};

/**
 * Check if job title requires 70-hour speech therapy course
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type (optional)
 * @returns {boolean} - True if 70-hour course is required
 */
export const requiresSpeechTherapy70Hours = (jobTitle, branchType = 'healthcare_center') => {
  return jobTitleMatchesRule(jobTitle, 'speechTherapy70Hours', branchType);
};

/**
 * Check if job title requires 40-hour therapy course
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type (optional)
 * @returns {boolean} - True if 40-hour course is required
 */
export const requiresTherapy40Hours = (jobTitle, branchType = 'healthcare_center') => {
  return jobTitleMatchesRule(jobTitle, 'therapy40Hours', branchType);
};

// ============================================================================
// DOCUMENT REQUIREMENTS HELPERS
// ============================================================================

/**
 * Check if passport document is required
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if passport is required
 */
export const requiresPassport = (nationality) => {
  return isNonSaudi(nationality);
};

/**
 * Check if professional license is required
 * @param {string} branchType - Branch type
 * @returns {boolean} - True if professional license is required
 */
export const requiresProfessionalLicense = (branchType) => {
  return isSchool(branchType);
};

/**
 * Check if classification document is required
 * @param {string} jobTitle - Job title
 * @returns {boolean} - True if classification document is required
 */
export const requiresClassificationDocument = (jobTitle) => {
  return requiresClassification(jobTitle);
};

/**
 * Check if experience certificate document is required
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type
 * @returns {boolean} - True if experience certificate is required
 */
export const requiresExperienceCertificateDocument = (jobTitle, branchType) => {
  return requiresExperienceCertificate(jobTitle, branchType);
};

/**
 * Check if 70-hour speech therapy course document is required
 * @param {string} jobTitle - Job title
 * @returns {boolean} - True if 70-hour course document is required
 */
export const requiresSpeechTherapy70HoursDocument = (jobTitle) => {
  return requiresSpeechTherapy70Hours(jobTitle);
};

/**
 * Check if 40-hour therapy course document is required
 * @param {string} jobTitle - Job title
 * @returns {boolean} - True if 40-hour course document is required
 */
export const requiresTherapy40HoursDocument = (jobTitle) => {
  return requiresTherapy40Hours(jobTitle);
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate document type is allowed for employee
 * @param {string} documentType - Document type to check
 * @param {Object} employee - Employee object with nationality, job_title, branch_type
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
export const validateDocumentType = (documentType, employee) => {
  return validateDocumentTypeFromRules(documentType, employee);
};

// ============================================================================
// EXPORT ALL HELPERS
// ============================================================================

export default {
  // Nationality
  isSaudi,
  isNonSaudi,
  getIdTypeFromNationality,
  
  // Branch Type
  isSchool,
  isHealthcareCenter,
  
  // Job Title
  requiresClassification,
  requiresExperienceCertificate,
  requiresSpeechTherapy70Hours,
  requiresTherapy40Hours,
  
  // Documents
  requiresPassport,
  requiresProfessionalLicense,
  requiresClassificationDocument,
  requiresExperienceCertificateDocument,
  requiresSpeechTherapy70HoursDocument,
  requiresTherapy40HoursDocument,
  
  // Validation
  validateDocumentType
};


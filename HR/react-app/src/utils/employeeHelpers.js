/**
 * Employee Helper Functions
 * Centralized utility functions for employee-related validations and checks
 * This file ensures consistency and prevents errors across the application
 * 
 * NOTE: This file now uses the rule-based system (employeeRules.js) for all business logic
 */

import {
  isSaudiNationality,
  getNationalityRequirements,
  getBranchTypeRules,
  jobTitleMatchesRule,
  getRequiredDocumentsForJobTitle,
  getAllRequiredDocuments,
  getAvailableDocumentTypes,
  getRequiredBranchDocuments as getRequiredBranchDocumentsFromRules,
  validateDocumentType as validateDocumentTypeFromRules,
  MONTHLY_BRANCH_DOCUMENTS,
  JOB_TITLE_RULES
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

/**
 * Get calendar type for date of birth based on nationality
 * @param {string} nationality - Employee nationality
 * @returns {'hijri'|'gregorian'} - Calendar type
 */
export const getDateOfBirthCalendarType = (nationality) => {
  const reqs = getNationalityRequirements(nationality);
  return reqs.dateOfBirthCalendar;
};

/**
 * Get calendar type for ID expiry date based on nationality
 * @param {string} nationality - Employee nationality
 * @returns {'hijri'|'gregorian'|null} - Calendar type (null for Saudis as ID doesn't expire)
 */
export const getIdExpiryCalendarType = (nationality) => {
  const reqs = getNationalityRequirements(nationality);
  return reqs.idExpiryCalendar;
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

/**
 * Get branch type label in Arabic
 * @param {string} branchType - Branch type
 * @returns {string} - Arabic label
 */
export const getBranchTypeLabel = (branchType) => {
  const labels = {
    'school': 'مدرسة',
    'healthcare_center': 'مركز رعاية نهارية'
  };
  return labels[branchType] || branchType;
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
 * Check if job title requires experience certificate (for schools)
 * @param {string} jobTitle - Job title
 * @returns {boolean} - True if experience certificate is required
 */
export const requiresExperienceCertificateSchool = (jobTitle) => {
  return jobTitleMatchesRule(jobTitle, 'experienceCertificate', 'school');
};

/**
 * Check if job title requires experience certificate (for healthcare centers)
 * @param {string} jobTitle - Job title
 * @returns {boolean} - True if experience certificate is required
 */
export const requiresExperienceCertificateHealthcare = (jobTitle) => {
  return jobTitleMatchesRule(jobTitle, 'experienceCertificate', 'healthcare_center');
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

/**
 * Check if job title is a manager/supervisor role
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type
 * @returns {boolean} - True if manager/supervisor
 */
export const isManagerOrSupervisor = (jobTitle, branchType) => {
  return requiresExperienceCertificate(jobTitle, branchType);
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

/**
 * Get all required documents for an employee
 * @param {Object} employee - Employee object with nationality, job_title, branch_type
 * @returns {Array<string>} - Array of required document types
 */
export const getRequiredDocuments = (employee) => {
  return getAllRequiredDocuments(employee);
};

// ============================================================================
// FIELD REQUIREMENTS HELPERS
// ============================================================================

/**
 * Check if passport number field is required
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if passport number is required
 */
export const requiresPassportNumber = (nationality) => {
  return isNonSaudi(nationality);
};

/**
 * Check if ID expiry date is required
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if ID expiry date is required
 */
export const requiresIdExpiryDate = (nationality) => {
  return isNonSaudi(nationality);
};

/**
 * Check if date of birth hijri is required
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if hijri date is required
 */
export const requiresDateOfBirthHijri = (nationality) => {
  return isSaudi(nationality);
};

/**
 * Check if date of birth gregorian is required
 * @param {string} nationality - Employee nationality
 * @returns {boolean} - True if gregorian date is required
 */
export const requiresDateOfBirthGregorian = (nationality) => {
  return isNonSaudi(nationality);
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate document type is allowed for employee
 * @param {string} documentType - Document type to check
 * @param {Object} employee - Employee object
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
export const validateDocumentType = (documentType, employee) => {
  return validateDocumentTypeFromRules(documentType, employee);
};

// ============================================================================
// BRANCH DOCUMENT REQUIREMENTS HELPERS
// ============================================================================

/**
 * Get required branch documents based on branch type
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {Array<string>} - Array of required document types
 */
export const getRequiredBranchDocuments = (branchType) => {
  return getRequiredBranchDocumentsFromRules(branchType);
};

/**
 * Get monthly required branch documents (must be uploaded at end of each month)
 * @returns {Array<string>} - Array of monthly document types
 */
export const getMonthlyRequiredBranchDocuments = () => {
  return MONTHLY_BRANCH_DOCUMENTS;
};

/**
 * Check if a document type is monthly (must be uploaded monthly)
 * @param {string} documentType - Document type
 * @returns {boolean} - True if monthly document
 */
export const isMonthlyBranchDocument = (documentType) => {
  return getMonthlyRequiredBranchDocuments().includes(documentType);
};

// ============================================================================
// EXPORT ALL HELPERS
// ============================================================================

export default {
  // Nationality
  isSaudi,
  isNonSaudi,
  getIdTypeFromNationality,
  getDateOfBirthCalendarType,
  getIdExpiryCalendarType,
  
  // Branch Type
  isSchool,
  isHealthcareCenter,
  getBranchTypeLabel,
  
  // Job Title
  requiresClassification,
  requiresExperienceCertificateSchool,
  requiresExperienceCertificateHealthcare,
  requiresExperienceCertificate,
  requiresSpeechTherapy70Hours,
  requiresTherapy40Hours,
  isManagerOrSupervisor,
  
  // Documents
  requiresPassport,
  requiresProfessionalLicense,
  requiresClassificationDocument,
  requiresExperienceCertificateDocument,
  requiresSpeechTherapy70HoursDocument,
  requiresTherapy40HoursDocument,
  getRequiredDocuments,
  
  // Fields
  requiresPassportNumber,
  requiresIdExpiryDate,
  requiresDateOfBirthHijri,
  requiresDateOfBirthGregorian,
  
  // Validation
  validateDocumentType,
  
  // Branch Documents
  getRequiredBranchDocuments,
  getMonthlyRequiredBranchDocuments,
  isMonthlyBranchDocument
};


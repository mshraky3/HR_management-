/**
 * Validation Utility Functions
 * Reusable validation functions
 */

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (basic validation)
 */
export const isValidPhone = (phone) => {
  if (!phone) return false;
  // Allow digits, spaces, dashes, parentheses, and plus sign
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 8;
};

/**
 * Validate date string (YYYY-MM-DD format)
 */
export const isValidDate = (dateString) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Validate IBAN format (basic validation)
 */
export const isValidIBAN = (iban) => {
  if (!iban) return false;
  // Basic IBAN validation - should start with 2 letters, then 2 digits, then alphanumeric
  const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;
  return ibanRegex.test(iban.replace(/\s/g, '').toUpperCase());
};

/**
 * Validate that employee has 4 names
 */
export const validateFourNames = (first, second, third, fourth) => {
  return !!(first && second && third && fourth);
};

/**
 * Sanitize string input
 */
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

/**
 * Validate document type
 */
export const isValidDocumentType = (type) => {
  const validTypes = [
    'id_or_residency',
    'direct_letter',
    'bank_iban',
    'primary_qualification',
    'employment_contract',
    'additional_courses',
    'passport',
    'passport_copy', // Alternative name for passport
    'professional_license',
    'experience_certificate',
    'classification',
    'speech_therapy_course',
    'speech_therapy_70_hours_course', // Alternative name
    'physical_therapy_course',
    'therapy_40_hours_course', // Alternative name
    'medical_disclosure_form',
    'medical_insurance'
  ];
  return validTypes.includes(type);
};

/**
 * Validate MIME type for documents
 */
export const isValidMimeType = (mimeType) => {
  const validTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif'
  ];
  return validTypes.includes(mimeType);
};

/**
 * Validate file size (max 1MB)
 */
export const isValidFileSize = (sizeInBytes, maxMB = 1) => {
  const maxBytes = maxMB * 1024 * 1024;
  return sizeInBytes <= maxBytes;
};


/**
 * Unified Date Validator
 * Validates dates with consistent rules across the entire application
 * Supports both Hijri and Gregorian dates
 */

import { 
  gregorianToHijri, 
  hijriToGregorian, 
  formatHijriToString, 
  parseHijriString 
} from './dateConverter.js';

/**
 * Calculate age from date of birth
 */
function calculateAge(gregorianDate) {
  if (!gregorianDate) return null;
  
  let birthDate;
  if (typeof gregorianDate === 'string') {
    birthDate = new Date(gregorianDate);
  } else {
    birthDate = new Date(gregorianDate);
  }
  
  if (isNaN(birthDate.getTime())) return null;
  
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Validate and convert date
 * @param {string} input - Date string (Hijri: dd/mm/yyyy or Gregorian: yyyy-mm-dd)
 * @param {string} calendarType - 'hijri' | 'gregorian'
 * @param {string} dateType - 'birth_date' | 'general'
 * @returns {Object} { valid, errors, warnings, hijri, gregorian, age? }
 */
export function validateDate(input, calendarType, dateType = 'general') {
  const errors = [];
  const warnings = [];
  let hijri = null;
  let gregorian = null;
  let age = null;

  if (!input || typeof input !== 'string' || input.trim() === '') {
    return {
      valid: false,
      errors: ['Date is required'],
      warnings: [],
      hijri: null,
      gregorian: null,
      age: null
    };
  }

  try {
    if (calendarType === 'hijri') {
      // Parse Hijri date (dd/mm/yyyy)
      const hijriParts = parseHijriString(input);
      
      if (!hijriParts || isNaN(hijriParts.day) || isNaN(hijriParts.month) || isNaN(hijriParts.year)) {
        return {
          valid: false,
          errors: ['Invalid Hijri date format. Expected format: dd/mm/yyyy'],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null
        };
      }

      // Validate Hijri date values
      if (hijriParts.day < 1 || hijriParts.day > 30) {
        errors.push('Hijri day must be between 1 and 30');
      }
      if (hijriParts.month < 1 || hijriParts.month > 12) {
        errors.push('Hijri month must be between 1 and 12');
      }
      if (hijriParts.year < 1 || hijriParts.year > 1500) {
        errors.push('Hijri year must be between 1 and 1500');
      }

      // Check for 3-digit year (invalid)
      if (hijriParts.year < 1000) {
        errors.push('Year must be 4 digits. 3-digit years (like 812) are not valid.');
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings, hijri: null, gregorian: null, age: null };
      }

      // Convert to Gregorian
      hijri = formatHijriToString(hijriParts);
      gregorian = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);

      if (!gregorian) {
        return {
          valid: false,
          errors: ['Failed to convert Hijri date to Gregorian'],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null
        };
      }

    } else if (calendarType === 'gregorian') {
      // Parse Gregorian date (yyyy-mm-dd)
      const date = new Date(input);
      
      if (isNaN(date.getTime())) {
        return {
          valid: false,
          errors: ['Invalid Gregorian date format. Expected format: yyyy-mm-dd'],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null
        };
      }

      // Check for 3-digit year
      const year = date.getFullYear();
      if (year < 1000) {
        errors.push('Year must be 4 digits. 3-digit years (like 812) are not valid.');
      }

      gregorian = input.split('T')[0]; // Ensure YYYY-MM-DD format

      // Convert to Hijri
      const hijriDate = gregorianToHijri(gregorian);
      if (hijriDate) {
        hijri = formatHijriToString(hijriDate);
      } else {
        errors.push('Failed to convert Gregorian date to Hijri');
      }

    } else {
      return {
        valid: false,
        errors: [`Invalid calendar type: ${calendarType}. Must be 'hijri' or 'gregorian'`],
        warnings: [],
        hijri: null,
        gregorian: null,
        age: null
      };
    }

    // Validate the resulting Gregorian date
    if (!gregorian) {
      return {
        valid: false,
        errors: ['Could not determine Gregorian date'],
        warnings: [],
        hijri,
        gregorian: null,
        age: null
      };
    }

    const gregDate = new Date(gregorian);
    if (isNaN(gregDate.getTime())) {
      return {
        valid: false,
        errors: ['Invalid Gregorian date'],
        warnings: [],
        hijri,
        gregorian,
        age: null
      };
    }

    const gregYear = gregDate.getFullYear();
    const today = new Date();
    const oneYearFromNow = new Date(today);
    oneYearFromNow.setFullYear(today.getFullYear() + 1);

    // General date validation
    if (gregYear < 1000) {
      errors.push('Year must be 4 digits (minimum 1000). 3-digit years are not valid.');
    }

    if (gregYear > 2500) {
      errors.push('Year is too far in the future (maximum 2500)');
    }

    if (gregDate > oneYearFromNow) {
      errors.push('Date is too far in the future (more than 1 year ahead)');
    }

    // Calculate age for birth dates
    if (dateType === 'birth_date') {
      age = calculateAge(gregorian);
      
      if (age === null) {
        errors.push('Could not calculate age from date');
      } else if (age < 20) {
        errors.push(`Employee age (${age} years) must be at least 20 years`);
      } else if (age > 100) {
        errors.push(`Employee age (${age} years) must not exceed 100 years`);
      }
    }

    // If any errors, return invalid
    if (errors.length > 0) {
      return { valid: false, errors, warnings, hijri, gregorian, age };
    }

    return { valid: true, errors: [], warnings, hijri, gregorian, age };

  } catch (error) {
    return {
      valid: false,
      errors: [`Date validation error: ${error.message}`],
      warnings: [],
      hijri: null,
      gregorian: null,
      age: null
    };
  }
}

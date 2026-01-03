/**
 * Unified Date Normalizer
 * Normalizes dates for all date types (not just birth dates)
 * Ensures both Hijri and Gregorian dates are present and correctly converted
 */

import { 
  gregorianToHijri, 
  hijriToGregorian, 
  formatHijriToString, 
  parseHijriString 
} from './dateConverter.js';
import { validateDate } from './unifiedDateValidator.js';

/**
 * Normalize any date field - ensures both dates are present and correct
 * @param {string} hijriDate - Hijri date string (dd/mm/yyyy)
 * @param {string} gregorianDate - Gregorian date string (yyyy-mm-dd)
 * @param {string} dateType - 'birth_date' | 'general'
 * @returns {Object} { valid, hijri, gregorian, errors, warnings, age? }
 */
export async function normalizeDate(hijriDate, gregorianDate, dateType = 'general') {
  const hasHijri = hijriDate && typeof hijriDate === 'string' && hijriDate.trim() !== '';
  const hasGregorian = gregorianDate && (typeof gregorianDate === 'string' || gregorianDate instanceof Date);

  // If neither is provided
  if (!hasHijri && !hasGregorian) {
    return {
      valid: false,
      hijri: null,
      gregorian: null,
      errors: ['At least one date (Hijri or Gregorian) must be provided'],
      warnings: [],
      age: null
    };
  }

  let normalizedHijri = hasHijri ? hijriDate.trim() : null;
  let normalizedGregorian = null;

  // Convert gregorianDate to string format if it's a Date object
  if (hasGregorian) {
    if (typeof gregorianDate === 'string') {
      normalizedGregorian = gregorianDate.split('T')[0]; // Remove time portion if present
    } else if (gregorianDate instanceof Date) {
      normalizedGregorian = gregorianDate.toISOString().split('T')[0];
    }
  }

  // If only Hijri is provided, convert to Gregorian
  if (hasHijri && !hasGregorian) {
    const validation = validateDate(normalizedHijri, 'hijri', dateType);
    if (!validation.valid) {
      return validation;
    }
    return {
      valid: true,
      hijri: validation.hijri,
      gregorian: validation.gregorian,
      errors: [],
      warnings: validation.warnings,
      age: validation.age
    };
  }

  // If only Gregorian is provided, convert to Hijri
  if (hasGregorian && !hasHijri) {
    const validation = validateDate(normalizedGregorian, 'gregorian', dateType);
    if (!validation.valid) {
      return validation;
    }
    return {
      valid: true,
      hijri: validation.hijri,
      gregorian: validation.gregorian,
      errors: [],
      warnings: validation.warnings,
      age: validation.age
    };
  }

  // Both dates provided - validate both and ensure consistency
  // Try Hijri first (as it's often the source of truth)
  const hijriValidation = validateDate(normalizedHijri, 'hijri', dateType);
  
  if (hijriValidation.valid) {
    // Hijri is valid, use it as source of truth
    return {
      valid: true,
      hijri: hijriValidation.hijri,
      gregorian: hijriValidation.gregorian, // Use converted Gregorian for consistency
      errors: [],
      warnings: hijriValidation.warnings,
      age: hijriValidation.age
    };
  }

  // Hijri validation failed, try Gregorian
  const gregorianValidation = validateDate(normalizedGregorian, 'gregorian', dateType);
  
  if (gregorianValidation.valid) {
    // Gregorian is valid, use it as source of truth
    return {
      valid: true,
      hijri: gregorianValidation.hijri, // Use converted Hijri for consistency
      gregorian: gregorianValidation.gregorian,
      errors: [],
      warnings: gregorianValidation.warnings,
      age: gregorianValidation.age
    };
  }

  // Both validations failed
  return {
    valid: false,
    hijri: normalizedHijri,
    gregorian: normalizedGregorian,
    errors: [
      ...hijriValidation.errors.map(e => `Hijri: ${e}`),
      ...gregorianValidation.errors.map(e => `Gregorian: ${e}`)
    ],
    warnings: [...hijriValidation.warnings, ...gregorianValidation.warnings],
    age: null
  };
}

/**
 * Normalize employee date of birth (wrapper for backward compatibility)
 * @param {string} hijriDate - Hijri date string (dd/mm/yyyy)
 * @param {string} gregorianDate - Gregorian date string (yyyy-mm-dd)
 * @returns {Object} { valid, hijri, gregorian, errors, warnings, age }
 */
export async function normalizeDateOfBirth(hijriDate, gregorianDate) {
  return normalizeDate(hijriDate, gregorianDate, 'birth_date');
}

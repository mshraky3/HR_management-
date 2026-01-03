/**
 * Employee Date Normalizer (Backward Compatibility Wrapper)
 * This file maintains backward compatibility while using the new unified normalizer
 * @deprecated Use normalizeDateOfBirth from unifiedDateNormalizer.js directly
 */

import { normalizeDateOfBirth as unifiedNormalizeDateOfBirth } from './unifiedDateNormalizer.js';

/**
 * Normalize employee date of birth - ensures both dates are present and correct
 * @param {Object} dates - { date_of_birth_hijri, date_of_birth_gregorian }
 * @returns {Object} - { date_of_birth_hijri, date_of_birth_gregorian } - both dates normalized
 * @deprecated Use normalizeDateOfBirth from unifiedDateNormalizer.js
 */
export async function normalizeDateOfBirth(dates) {
  const { date_of_birth_hijri, date_of_birth_gregorian } = dates || {};
  
  // Use unified normalizer
  const result = await unifiedNormalizeDateOfBirth(date_of_birth_hijri, date_of_birth_gregorian);
  
  // Return in the expected format for backward compatibility
  if (!result.valid) {
    // If validation failed, still return the dates but log warning
    console.warn('Date normalization validation failed:', result.errors);
    return {
      date_of_birth_hijri: result.hijri,
      date_of_birth_gregorian: result.gregorian
    };
  }
  
  return {
    date_of_birth_hijri: result.hijri,
    date_of_birth_gregorian: result.gregorian
  };
}

/**
 * Date Validation Middleware
 * Validates all date fields on create/update requests
 * Uses unified date validator for consistency
 */

import { validateDate } from '../utils/unifiedDateValidator.js';

/**
 * Validate date fields in request body
 * @param {Object} dateFields - Map of field names to date types
 * Example: { 'date_of_birth_hijri': { calendarType: 'hijri', dateType: 'birth_date' } }
 */
export const validateDateFields = (dateFields) => {
  return async (req, res, next) => {
    try {
      const errors = [];
      
      for (const [fieldName, config] of Object.entries(dateFields)) {
        const { calendarType, dateType = 'general', required = false } = config;
        const hijriField = fieldName;
        const gregorianField = fieldName.replace('_hijri', '_gregorian');
        
        const hijriValue = req.body[hijriField];
        const gregorianValue = req.body[gregorianField];
        
        // Check if at least one is provided (if required)
        if (required && !hijriValue && !gregorianValue) {
          errors.push(`${fieldName} is required (provide either Hijri or Gregorian date)`);
          continue;
        }
        
        // If neither is provided and not required, skip validation
        if (!hijriValue && !gregorianValue) {
          continue;
        }
        
        // Determine which value to validate based on what's provided
        let valueToValidate = null;
        let calendarTypeToUse = null;
        
        // Prefer Hijri if both are provided, but accept either
        if (hijriValue && hijriValue.trim() !== '') {
          valueToValidate = hijriValue.trim();
          calendarTypeToUse = 'hijri';
        } else if (gregorianValue && gregorianValue.trim() !== '') {
          // Handle Date objects
          if (gregorianValue instanceof Date) {
            valueToValidate = gregorianValue.toISOString().split('T')[0];
          } else {
            valueToValidate = gregorianValue.trim().split('T')[0]; // Remove time if present
          }
          calendarTypeToUse = 'gregorian';
        }
        
        if (valueToValidate && calendarTypeToUse) {
          const result = validateDate(valueToValidate, calendarTypeToUse, dateType);
          
          if (!result.valid) {
            errors.push(...result.errors.map(err => `${fieldName}: ${err}`));
          } else {
            // Update request body with validated and normalized dates
            req.body[hijriField] = result.hijri;
            req.body[gregorianField] = result.gregorian;
          }
        }
      }
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Date validation failed',
          errors: errors
        });
      }
      
      next();
    } catch (error) {
      console.error('Error in date validation middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Date validation error',
        error: error.message
      });
    }
  };
};

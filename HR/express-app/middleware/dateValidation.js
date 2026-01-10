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
      console.log('[DATE VALIDATION] Starting date field validation');
      console.log('[DATE VALIDATION] Fields to validate:', Object.keys(dateFields));
      const errors = [];
      
      for (const [fieldName, config] of Object.entries(dateFields)) {
        const { calendarType, dateType = 'general', required = false } = config;
        const hijriField = fieldName;
        const gregorianField = fieldName.replace('_hijri', '_gregorian');
        
        const hijriValue = req.body[hijriField];
        const gregorianValue = req.body[gregorianField];
        
        console.log(`[DATE VALIDATION] Validating ${fieldName}:`, {
          hijri: hijriValue ? hijriValue.substring(0, 20) + '...' : null,
          gregorian: gregorianValue ? gregorianValue.substring(0, 20) + '...' : null,
          required
        });
        
        // Check if at least one is provided (if required)
        if (required && !hijriValue && !gregorianValue) {
          console.log(`[DATE VALIDATION] ERROR: ${fieldName} is required but not provided`);
          errors.push(`${fieldName} is required (provide either Hijri or Gregorian date)`);
          continue;
        }
        
        // If neither is provided and not required, skip validation
        if (!hijriValue && !gregorianValue) {
          console.log(`[DATE VALIDATION] Skipping ${fieldName} (not required, not provided)`);
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
          console.log(`[DATE VALIDATION] Validating ${fieldName} as ${calendarTypeToUse}:`, valueToValidate);
          const result = validateDate(valueToValidate, calendarTypeToUse, dateType);
          
          if (!result.valid) {
            console.log(`[DATE VALIDATION] ERROR: ${fieldName} validation failed:`, result.errors);
            errors.push(...result.errors.map(err => `${fieldName}: ${err}`));
          } else {
            console.log(`[DATE VALIDATION] ${fieldName} validated successfully`);
            // Update request body with validated and normalized dates
            req.body[hijriField] = result.hijri;
            req.body[gregorianField] = result.gregorian;
          }
        }
      }
      
      if (errors.length > 0) {
        console.log('[DATE VALIDATION] Validation failed with errors:', errors);
        return res.status(400).json({
          success: false,
          message: 'Date validation failed',
          errors: errors
        });
      }
      
      console.log('[DATE VALIDATION] All date fields validated successfully');
      next();
    } catch (error) {
      console.error('[DATE VALIDATION] ERROR in date validation middleware:', error.message);
      console.error('[DATE VALIDATION] Error stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Date validation error',
        error: error.message
      });
    }
  };
};

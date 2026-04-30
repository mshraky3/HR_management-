/**
 * Date Validation Middleware
 * Validates all date fields on create/update requests
 * Uses unified date validator for consistency
 */

import { validateDate } from '../utils/unifiedDateValidator.js';
import { log } from '../utils/logger.js';

/**
 * Validate date fields in request body
 * @param {Object} dateFields - Map of field names to date types
 * Example: { 'date_of_birth_hijri': { calendarType: 'hijri', dateType: 'birth_date' } }
 */
export const validateDateFields = (dateFields) => {
  return async (req, res, next) => {
    try {
      log.debug('[DATE VALIDATION] Starting date field validation');
      log.debug('[DATE VALIDATION] Fields to validate:', Object.keys(dateFields));
      const errors = [];

      for (const [fieldName, config] of Object.entries(dateFields)) {
        const { calendarType, dateType = 'general', required = false } = config;
        const hijriField = fieldName;
        // Try both _gregorian suffix and base field name (e.g., issue_date_gregorian or issue_date)
        const gregorianFieldWithSuffix = fieldName.replace('_hijri', '_gregorian');
        const gregorianFieldBase = fieldName.replace('_hijri', '');

        const hijriValue = req.body[hijriField];
        // Check both possible gregorian field names (prefer _gregorian suffix, fallback to base name)
        const gregorianValue = req.body[gregorianFieldWithSuffix] || req.body[gregorianFieldBase];

        log.debug(`[DATE VALIDATION] Validating ${fieldName}:`, {
          hijri: hijriValue ? String(hijriValue).substring(0, 20) + '...' : null,
          gregorian: gregorianValue ? String(gregorianValue).substring(0, 20) + '...' : null,
          required
        });

        // Check if at least one is provided (if required)
        if (required && !hijriValue && !gregorianValue) {
          log.debug(`[DATE VALIDATION] ERROR: ${fieldName} is required but not provided`);
          errors.push(`${fieldName} is required (provide either Hijri or Gregorian date)`);
          continue;
        }

        // If neither is provided and not required, skip validation
        if (!hijriValue && !gregorianValue) {
          log.debug(`[DATE VALIDATION] Skipping ${fieldName} (not required, not provided)`);
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
          log.debug(`[DATE VALIDATION] Validating ${fieldName} as ${calendarTypeToUse}:`, valueToValidate);
          const result = validateDate(valueToValidate, calendarTypeToUse, dateType);

          if (!result.valid) {
            log.debug(`[DATE VALIDATION] ERROR: ${fieldName} validation failed:`, result.errors);
            errors.push(...result.errors.map(err => `${fieldName}: ${err}`));
          } else {
            log.debug(`[DATE VALIDATION] ${fieldName} validated successfully`);
            // Update request body with validated and normalized dates
            req.body[hijriField] = result.hijri;
            // Update the gregorian field that was actually provided (or both if both exist)
            // Always update the base field name (e.g., issue_date) as that's what the frontend sends
            req.body[gregorianFieldBase] = result.gregorian;
            // Also update the suffixed version if it exists
            if (req.body[gregorianFieldWithSuffix] !== undefined) {
              req.body[gregorianFieldWithSuffix] = result.gregorian;
            }
          }
        }
      }

      if (errors.length > 0) {
        log.debug('[DATE VALIDATION] Validation failed with errors:', errors);
        return res.status(400).json({
          success: false,
          message: ' تأكد من صحة اليوم او سنة او الشهر',
          errors: errors
        });
      }

      log.debug('[DATE VALIDATION] All date fields validated successfully');
      next();
    } catch (error) {
      log.error('[DATE VALIDATION] ERROR in date validation middleware:', error.message);
      log.error('[DATE VALIDATION] Error stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Date validation error',
        error: error.message
      });
    }
  };
};

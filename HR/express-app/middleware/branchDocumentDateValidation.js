/**
 * Branch Document Date Validation Middleware
 * Validates dates specifically for branch documents:
 * - Hijri dates must be >= 1300
 * - Gregorian dates must be >= 1900
 * - Expiry dates must be in the future (not expired)
 */

import { parseHijriString, hijriToGregorian } from '../utils/dateConverter.js';
import { log } from '../utils/logger.js';

/**
 * Validate branch document dates
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const validateBranchDocumentDates = async (req, res, next) => {
  try {
    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to compare dates only

    // Validate issue_date (Gregorian) - after date normalization from validateDateFields
    if (req.body.issue_date) {
      const issueDateStr = req.body.issue_date.includes('T')
        ? req.body.issue_date.split('T')[0]
        : req.body.issue_date;
      const issueDate = new Date(`${issueDateStr}T00:00:00`);
      if (!isNaN(issueDate.getTime())) {
        const year = issueDate.getFullYear();
        if (year < 1900) {
          errors.push(`تاريخ الإصدار الميلادي (${year}) يجب أن يكون 1900 أو أكبر`);
        }
      }
    }

    // Validate issue_date_hijri
    if (req.body.issue_date_hijri) {
      const hijriParts = parseHijriString(req.body.issue_date_hijri);
      if (hijriParts) {
        if (hijriParts.year < 1300) {
          errors.push(`تاريخ الإصدار الهجري (${hijriParts.year}) يجب أن يكون 1300 أو أكبر`);
        }
      }
    }

    // Validate expiry_date (Gregorian) - must be in the future
    if (req.body.expiry_date) {
      const expiryDateStr = req.body.expiry_date.includes('T')
        ? req.body.expiry_date.split('T')[0]
        : req.body.expiry_date;
      const expiryDate = new Date(`${expiryDateStr}T00:00:00`);
      if (!isNaN(expiryDate.getTime())) {
        const year = expiryDate.getFullYear();

        if (year < 1900) {
          errors.push(`تاريخ الانتهاء الميلادي (${year}) يجب أن يكون 1900 أو أكبر`);
        }

        // Must be strictly after today
        if (expiryDate <= today) {
          errors.push('تاريخ الانتهاء الميلادي يجب أن يكون بعد تاريخ اليوم (غير منتهي الصلاحية)');
        }
      }
    }

    // Validate expiry_date_hijri - must be in the future
    if (req.body.expiry_date_hijri) {
      const hijriParts = parseHijriString(req.body.expiry_date_hijri);
      if (hijriParts) {
        if (hijriParts.year < 1300) {
          errors.push(`تاريخ الانتهاء الهجري (${hijriParts.year}) يجب أن يكون 1300 أو أكبر`);
        }

        // Convert Hijri to Gregorian to check if it's in the future
        const gregorianExpiry = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);
        if (gregorianExpiry) {
          const expiryDate = new Date(`${gregorianExpiry}T00:00:00`);

          if (expiryDate <= today) {
            errors.push('تاريخ الانتهاء الهجري يجب أن يكون بعد تاريخ اليوم (غير منتهي الصلاحية)');
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'خطأ في التحقق من التواريخ',
        errors: errors
      });
    }

    next();
  } catch (error) {
    log.error('[BRANCH DOC DATE VALIDATION] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطأ في التحقق من التواريخ',
      error: error.message
    });
  }
};

/**
 * Utility Routes
 * Centralized endpoints for common utilities like date conversion
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateDate } from '../utils/unifiedDateValidator.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/utils/convert-date
 * Convert date between Hijri and Gregorian calendars with validation
 * Request: { date: string, calendar_type: 'hijri' | 'gregorian', date_type?: 'birth_date' | 'expiry_date' | 'general' }
 * Response: { success, data: { hijri, gregorian, valid, errors, warnings, age? } }
 */
router.post('/convert-date', async (req, res) => {
  try {
    const { date, calendar_type, date_type = 'general' } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
        data: {
          valid: false,
          errors: ['Date is required'],
          warnings: [],
          hijri: null,
          gregorian: null
        }
      });
    }

    if (!calendar_type || !['hijri', 'gregorian'].includes(calendar_type)) {
      return res.status(400).json({
        success: false,
        message: 'calendar_type must be "hijri" or "gregorian"',
        data: {
          valid: false,
          errors: ['calendar_type must be "hijri" or "gregorian"'],
          warnings: [],
          hijri: null,
          gregorian: null
        }
      });
    }

    if (date_type && !['birth_date', 'expiry_date', 'general'].includes(date_type)) {
      return res.status(400).json({
        success: false,
        message: 'date_type must be "birth_date", "expiry_date" or "general"',
        data: {
          valid: false,
          errors: ['date_type must be "birth_date", "expiry_date" or "general"'],
          warnings: [],
          hijri: null,
          gregorian: null
        }
      });
    }

    // Validate and convert
    const result = validateDate(date, calendar_type, date_type);

    if (!result.valid) {
      const firstError = Array.isArray(result.errors) ? result.errors[0] : null;
      return res.status(400).json({
        success: false,
        // Prefer a specific, user-friendly message (e.g. expired date)
        message: firstError || 'تأكد من صحة اليوم أو السنة أو الشهر',
        data: result
      });
    }

    return res.json({
      success: true,
      message: 'Date converted successfully',
      data: result
    });

  } catch (error) {
    log.error('Error in date conversion:', error);
    return handleRouteError(error, req, res, 'Failed to convert date');
  }
});

export default router;

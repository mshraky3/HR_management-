/**
 * Academic Years Routes
 * Manage academic years and year-end process
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import sql from '../config/database.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';
import {
  getCurrentAcademicYearWithState,
  endAcademicYearTransactional
} from '../services/termLifecycleService.js';

const router = express.Router();

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

/**
 * GET /api/academic-years
 * Get all academic years (with optional filters)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      branch_type: req.query.branch_type,
      is_current: req.query.is_current !== undefined ? req.query.is_current === 'true' : undefined,
      is_completed: req.query.is_completed !== undefined ? req.query.is_completed === 'true' : undefined
    };

    const years = await AcademicYear.findAll(filters);

    res.json({
      success: true,
      data: years
    });
  } catch (error) {
    log.error('Error fetching academic years:', error);
    handleRouteError(error, req, res, 'فشل جلب السنوات الدراسية');
  }
});

/**
 * GET /api/academic-years/:id
 * Get academic year by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (req.params.id === 'current') {
      return next('route');
    }

    const year = await AcademicYear.findById(parseInt(req.params.id));

    if (!year) {
      return res.status(404).json({
        success: false,
        message: 'السنة الدراسية غير موجودة'
      });
    }

    res.json({
      success: true,
      data: year
    });
  } catch (error) {
    log.error('Error fetching academic year:', error);
    handleRouteError(error, req, res, 'فشل جلب السنة الدراسية');
  }
});

/**
 * GET /api/academic-years/current/:branchType
 * Get current academic year for a branch type
 */
router.get('/current/:branchType', async (req, res) => {
  try {
    const { branchType } = req.params;

    if (!['school', 'healthcare_center'].includes(branchType)) {
      return res.status(400).json({
        success: false,
        message: 'نوع الفرع غير صحيح'
      });
    }

    const { year, lifecycleState } = await getCurrentAcademicYearWithState(branchType);

    res.json({
      success: true,
      data: year,
      lifecycle_state: lifecycleState
    });
  } catch (error) {
    log.error('Error fetching current academic year:', error);
    handleRouteError(error, req, res, 'فشل جلب السنة الدراسية الحالية');
  }
});

/**
 * POST /api/academic-years
 * Create new academic year
 */
router.post('/', async (req, res) => {
  try {
    const {
      branch_type, year_label, year_start, year_end, term1_id, term2_id
    } = req.body;

    // Validation
    if (!branch_type || !['school', 'healthcare_center'].includes(branch_type)) {
      return res.status(400).json({
        success: false,
        message: 'نوع الفرع يجب أن يكون school أو healthcare_center'
      });
    }

    if (!year_label || !year_label.trim()) {
      return res.status(400).json({
        success: false,
        message: 'تسمية السنة الدراسية مطلوبة'
      });
    }

    if (!year_start || !year_end) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ البداية والنهاية للسنة الدراسية مطلوبان'
      });
    }

    // Validate terms exist if provided
    if (term1_id) {
      const term1 = await Term.findById(term1_id);
      if (!term1 || term1.branch_type !== branch_type) {
        return res.status(400).json({
          success: false,
          message: 'الفصل الدراسي الأول غير صحيح'
        });
      }
    }

    if (term2_id) {
      const term2 = await Term.findById(term2_id);
      if (!term2 || term2.branch_type !== branch_type) {
        return res.status(400).json({
          success: false,
          message: 'الفصل الدراسي الثاني غير صحيح'
        });
      }
    }

    const year = await AcademicYear.create({
      branch_type,
      year_label: year_label.trim(),
      year_start,
      year_end,
      term1_id: term1_id || null,
      term2_id: term2_id || null
    });

    // Email active branches of matching branch_type
    try {
      const branches = await sql`SELECT id, branch_name, email FROM branches WHERE branch_type = ${branch_type} AND is_active = true AND email IS NOT NULL`;
      for (const b of branches) {
        await sendNotificationEmail({
          to: b.email,
          subject: `سنة دراسية جديدة: ${year_label.trim()}`,
          message: `تم إنشاء سنة دراسية جديدة "${year_label.trim()}".`,
          notificationType: 'branch_notification',
          appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/academic-years`,
          data: {}
        });
      }
    } catch (emailError) {
      log.error('Failed to send academic year creation emails:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'تم إنشاء السنة الدراسية بنجاح',
      data: year
    });
  } catch (error) {
    log.error('Error creating academic year:', error);
    handleRouteError(error, req, res, 'حدث خطأ في الخادم');
  }
});

/**
 * PUT /api/academic-years/:id
 * Update academic year
 */
router.put('/:id', async (req, res) => {
  try {
    const yearId = parseInt(req.params.id);
    const updates = {};

    if (req.body.year_label !== undefined) updates.year_label = req.body.year_label.trim();
    if (req.body.year_start !== undefined) updates.year_start = req.body.year_start;
    if (req.body.year_end !== undefined) updates.year_end = req.body.year_end;
    if (req.body.term1_id !== undefined) updates.term1_id = req.body.term1_id;
    if (req.body.term2_id !== undefined) updates.term2_id = req.body.term2_id;
    if (req.body.is_current !== undefined) updates.is_current = req.body.is_current === true;
    if (req.body.is_completed !== undefined) updates.is_completed = req.body.is_completed === true;

    const year = await AcademicYear.update(yearId, updates);

    if (!year) {
      return res.status(404).json({
        success: false,
        message: 'السنة الدراسية غير موجودة'
      });
    }

    res.json({
      success: true,
      message: 'تم تحديث السنة الدراسية بنجاح',
      data: year
    });
  } catch (error) {
    log.error('Error updating academic year:', error);
    handleRouteError(error, req, res, 'فشل تحديث السنة الدراسية');
  }
});

/**
 * POST /api/academic-years/:id/end-year
 * End academic year (change all active employees to pending)
 */
router.post('/:id/end-year', async (req, res) => {
  try {
    const yearId = parseInt(req.params.id);
    const { branch_type } = req.body;

    if (isNaN(yearId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف السنة الدراسية غير صحيح'
      });
    }

    if (!branch_type || !['school', 'healthcare_center'].includes(branch_type)) {
      return res.status(400).json({
        success: false,
        message: 'نوع الفرع مطلوب'
      });
    }

    // Verify year exists before calling endYear
    const year = await AcademicYear.findById(yearId);
    if (!year) {
      return res.status(404).json({
        success: false,
        message: 'السنة الدراسية غير موجودة'
      });
    }

    const result = await endAcademicYearTransactional(yearId, branch_type);

    res.json({
      success: true,
      message: `تم إنهاء السنة الدراسية بنجاح. تم تحديث حالة ${result.employeesUpdated} موظف إلى "قيد الانتظار"`,
      data: result
    });
  } catch (error) {
    log.error('Error ending academic year:', error);
    handleRouteError(error, req, res, 'فشل إنهاء السنة الدراسية');
  }
});

/**
 * POST /api/academic-years/:id/complete
 * Complete academic year (alias for end-year)
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const yearId = parseInt(req.params.id);
    const year = await AcademicYear.findById(yearId);

    if (!year) {
      return res.status(404).json({
        success: false,
        message: 'السنة الدراسية غير موجودة'
      });
    }

    const result = await endAcademicYearTransactional(yearId, year.branch_type);

    res.json({
      success: true,
      message: `تم إتمام السنة الدراسية بنجاح. تم تحديث حالة ${result.employeesUpdated} موظف إلى "قيد الانتظار"`,
      data: result
    });
  } catch (error) {
    log.error('Error completing academic year:', error);
    handleRouteError(error, req, res, 'فشل إتمام السنة الدراسية');
  }
});

export default router;


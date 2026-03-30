/**
 * Academic Years Routes
 * Manage academic years and year-end process
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';

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
    console.error('Error fetching academic years:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب السنوات الدراسية',
      error: error.message
    });
  }
});

/**
 * GET /api/academic-years/:id
 * Get academic year by ID
 */
router.get('/:id', async (req, res) => {
  try {
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
    console.error('Error fetching academic year:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب السنة الدراسية',
      error: error.message
    });
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

    const year = await AcademicYear.getCurrentYear(branchType);

    res.json({
      success: true,
      data: year
    });
  } catch (error) {
    console.error('Error fetching current academic year:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب السنة الدراسية الحالية',
      error: error.message
    });
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

    res.status(201).json({
      success: true,
      message: 'تم إنشاء السنة الدراسية بنجاح',
      data: year
    });
  } catch (error) {
    console.error('Error creating academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message.includes('already exists')
        ? 'تسمية السنة الدراسية موجودة مسبقاً'
        : 'فشل إنشاء السنة الدراسية',
      error: error.message
    });
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
    console.error('Error updating academic year:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث السنة الدراسية',
      error: error.message
    });
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

    const result = await AcademicYear.endYear(yearId, branch_type);

    res.json({
      success: true,
      message: `تم إنهاء السنة الدراسية بنجاح. تم تحديث حالة ${result.employeesUpdated} موظف إلى "قيد الانتظار"`,
      data: result
    });
  } catch (error) {
    console.error('Error ending academic year:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنهاء السنة الدراسية',
      error: error.message
    });
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

    const result = await AcademicYear.endYear(yearId, year.branch_type);

    res.json({
      success: true,
      message: `تم إتمام السنة الدراسية بنجاح. تم تحديث حالة ${result.employeesUpdated} موظف إلى "قيد الانتظار"`,
      data: result
    });
  } catch (error) {
    console.error('Error completing academic year:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إتمام السنة الدراسية',
      error: error.message
    });
  }
});

export default router;


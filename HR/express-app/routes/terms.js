/**
 * Terms Routes
 * Manage academic terms for schools and daycare centers
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { Term } from '../models/Term.js';
import { AcademicYear } from '../models/AcademicYear.js';
import sql from '../config/database.js';

const router = express.Router();

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

/**
 * GET /api/terms
 * Get all terms (with optional filters)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      branch_type: req.query.branch_type,
      term_number: req.query.term_number ? parseInt(req.query.term_number) : undefined,
      academic_year_label: req.query.academic_year_label,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined
    };
    
    const terms = await Term.findAll(filters);
    
    res.json({
      success: true,
      data: terms
    });
  } catch (error) {
    console.error('Error fetching terms:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الفصول الدراسية',
      error: error.message
    });
  }
});

/**
 * GET /api/terms/:id
 * Get term by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const term = await Term.findById(parseInt(req.params.id));
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'الفصل الدراسي غير موجود'
      });
    }
    
    res.json({
      success: true,
      data: term
    });
  } catch (error) {
    console.error('Error fetching term:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الفصل الدراسي',
      error: error.message
    });
  }
});

/**
 * POST /api/terms
 * Create new term
 */
router.post('/', async (req, res) => {
  try {
    const {
      branch_type, term_name, term_number, start_date, end_date,
      academic_year_start, academic_year_end, academic_year_label
    } = req.body;
    
    // Validation
    if (!branch_type || !['school', 'healthcare_center'].includes(branch_type)) {
      return res.status(400).json({
        success: false,
        message: 'نوع الفرع يجب أن يكون school أو healthcare_center'
      });
    }
    
    if (!term_name || !term_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'اسم الفصل الدراسي مطلوب'
      });
    }
    
    if (!term_number || ![1, 2].includes(parseInt(term_number))) {
      return res.status(400).json({
        success: false,
        message: 'رقم الفصل يجب أن يكون 1 أو 2'
      });
    }
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ البداية والنهاية مطلوبان'
      });
    }
    
    if (!academic_year_start || !academic_year_end || !academic_year_label) {
      return res.status(400).json({
        success: false,
        message: 'تواريخ السنة الدراسية والتسمية مطلوبة'
      });
    }
    
    const term = await Term.create({
      branch_type,
      term_name: term_name.trim(),
      term_number: parseInt(term_number),
      start_date,
      end_date,
      academic_year_start,
      academic_year_end,
      academic_year_label: academic_year_label.trim(),
      created_by: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'تم إنشاء الفصل الدراسي بنجاح',
      data: term
    });
  } catch (error) {
    console.error('Error creating term:', error);
    res.status(500).json({
      success: false,
      message: error.message.includes('overlap') 
        ? 'الفصل الدراسي يتداخل مع فصل موجود'
        : 'فشل إنشاء الفصل الدراسي',
      error: error.message
    });
  }
});

/**
 * PUT /api/terms/:id
 * Update term
 */
router.put('/:id', async (req, res) => {
  try {
    const termId = parseInt(req.params.id);
    const updates = {};
    
    if (req.body.term_name !== undefined) updates.term_name = req.body.term_name.trim();
    if (req.body.start_date !== undefined) updates.start_date = req.body.start_date;
    if (req.body.end_date !== undefined) updates.end_date = req.body.end_date;
    if (req.body.academic_year_start !== undefined) updates.academic_year_start = req.body.academic_year_start;
    if (req.body.academic_year_end !== undefined) updates.academic_year_end = req.body.academic_year_end;
    if (req.body.academic_year_label !== undefined) updates.academic_year_label = req.body.academic_year_label.trim();
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active === true;
    
    const term = await Term.update(termId, updates);
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'الفصل الدراسي غير موجود'
      });
    }
    
    res.json({
      success: true,
      message: 'تم تحديث الفصل الدراسي بنجاح',
      data: term
    });
  } catch (error) {
    console.error('Error updating term:', error);
    res.status(500).json({
      success: false,
      message: error.message.includes('overlap')
        ? 'التواريخ المحدثة تتداخل مع فصل موجود'
        : 'فشل تحديث الفصل الدراسي',
      error: error.message
    });
  }
});

/**
 * DELETE /api/terms/:id
 * Deactivate term
 */
router.delete('/:id', async (req, res) => {
  try {
    const term = await Term.deactivate(parseInt(req.params.id));
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'الفصل الدراسي غير موجود'
      });
    }
    
    res.json({
      success: true,
      message: 'تم إلغاء تفعيل الفصل الدراسي بنجاح',
      data: term
    });
  } catch (error) {
    console.error('Error deactivating term:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إلغاء تفعيل الفصل الدراسي',
      error: error.message
    });
  }
});

/**
 * POST /api/terms/create-academic-year
 * Create both terms and academic year together
 */
router.post('/create-academic-year', async (req, res) => {
  try {
    const {
      branch_type,
      year_label,
      term1_name,
      term1_start_date,
      term1_end_date,
      term2_name,
      term2_start_date,
      term2_end_date
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
    
    if (!term1_name || !term1_start_date || !term1_end_date) {
      return res.status(400).json({
        success: false,
        message: 'بيانات الفصل الأول مطلوبة'
      });
    }
    
    if (!term2_name || !term2_start_date || !term2_end_date) {
      return res.status(400).json({
        success: false,
        message: 'بيانات الفصل الثاني مطلوبة'
      });
    }
    
    // Validate dates
    if (new Date(term1_start_date) > new Date(term1_end_date)) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ بداية الفصل الأول يجب أن يكون قبل تاريخ النهاية'
      });
    }
    
    if (new Date(term2_start_date) > new Date(term2_end_date)) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ بداية الفصل الثاني يجب أن يكون قبل تاريخ النهاية'
      });
    }
    
    // Academic year dates: start = term1 start, end = term2 end
    const academic_year_start = term1_start_date;
    const academic_year_end = term2_end_date;
    
    if (new Date(academic_year_start) > new Date(academic_year_end)) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ بداية السنة يجب أن يكون قبل تاريخ النهاية'
      });
    }
    
    // Check for overlapping terms
    const term1Overlaps = await Term.checkOverlap(branch_type, term1_start_date, term1_end_date);
    if (term1Overlaps.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'الفصل الأول يتداخل مع فصل موجود'
      });
    }
    
    const term2Overlaps = await Term.checkOverlap(branch_type, term2_start_date, term2_end_date);
    if (term2Overlaps.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'الفصل الثاني يتداخل مع فصل موجود'
      });
    }
    
    // Check if academic year label already exists
    const existingYears = await AcademicYear.findAll({ branch_type });
    if (existingYears.some(y => y.year_label === year_label.trim())) {
      return res.status(400).json({
        success: false,
        message: 'تسمية السنة الدراسية موجودة مسبقاً'
      });
    }
    
    // Create both terms and academic year in a transaction
    const result = await sql.begin(async sql => {
      // Create first term
      const [term1] = await sql`
        INSERT INTO terms (
          branch_type, term_name, term_number, start_date, end_date,
          academic_year_start, academic_year_end, academic_year_label, created_by
        )
        VALUES (
          ${branch_type}, ${term1_name.trim()}, 1, ${term1_start_date}, ${term1_end_date},
          ${academic_year_start}, ${academic_year_end}, ${year_label.trim()}, ${req.user.id}
        )
        RETURNING *
      `;
      
      // Create second term
      const [term2] = await sql`
        INSERT INTO terms (
          branch_type, term_name, term_number, start_date, end_date,
          academic_year_start, academic_year_end, academic_year_label, created_by
        )
        VALUES (
          ${branch_type}, ${term2_name.trim()}, 2, ${term2_start_date}, ${term2_end_date},
          ${academic_year_start}, ${academic_year_end}, ${year_label.trim()}, ${req.user.id}
        )
        RETURNING *
      `;
      
      // Create academic year
      const [academicYear] = await sql`
        INSERT INTO academic_years (
          branch_type, year_label, year_start, year_end, term1_id, term2_id
        )
        VALUES (
          ${branch_type}, ${year_label.trim()}, ${academic_year_start}, ${academic_year_end},
          ${term1.id}, ${term2.id}
        )
        RETURNING *
      `;
      
      return {
        term1,
        term2,
        academicYear
      };
    });
    
    res.status(201).json({
      success: true,
      message: 'تم إنشاء الفصلين الدراسيين والسنة الدراسية بنجاح',
      data: result
    });
  } catch (error) {
    console.error('Error creating academic year with terms:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء الفصلين الدراسيين والسنة الدراسية',
      error: error.message
    });
  }
});

/**
 * GET /api/terms/current/:branchType
 * Get current term for a branch type
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
    
    const term = await Term.getCurrentTerm(branchType);
    
    res.json({
      success: true,
      data: term
    });
  } catch (error) {
    console.error('Error fetching current term:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الفصل الحالي',
      error: error.message
    });
  }
});

export default router;


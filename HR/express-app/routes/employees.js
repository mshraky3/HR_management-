/**
 * Employee Routes
 * CRUD operations for employees
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess, requireMainManager, requireManager } from '../middleware/authorization.js';
import { validateRequired, validateEmployeeName, validateEmail } from '../middleware/validation.js';
import { validateDateFields } from '../middleware/dateValidation.js';
import { Document } from '../models/Document.js';
import { sql } from '../db-helpers.js';
import { log } from '../utils/logger.js';
import { clearByPrefix } from '../utils/simpleCache.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

const employeeHasBranchAccess = (employee, branchId) => {
  if (!employee || !branchId) return false;
  if (employee.branch_id && employee.branch_id.toString() === branchId.toString()) return true;
  if (Array.isArray(employee.branches)) {
    return employee.branches.some(b => b.branch_id && b.branch_id.toString() === branchId.toString());
  }
  return false;
};

// All routes require authentication
router.use(authenticate);

// List duplicate clusters (main manager only)
router.get('/duplicates', requireMainManager, async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const clusters = await Employee.findDuplicateClusters();
    return res.json({ success: true, data: clusters });
  } catch (error) {
    log.error('Error listing duplicate employees', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل جلب الموظفين المكررين',
      error: error.message
    });
  }
});

// Merge duplicate employees into canonical (main manager only)
router.post('/merge-duplicates', requireMainManager, async (req, res) => {
  try {
    const { canonical_id: canonicalId, duplicate_ids: duplicateIds } = req.body;
    if (!canonicalId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد معرف الموظف الأساسي وقائمة المعرفات المكررة'
      });
    }
    const { Employee } = await import('../models/Employee.js');
    const merged = await Employee.mergeEmployees(parseInt(canonicalId), duplicateIds);
    return res.json({ success: true, data: merged, message: 'تم دمج السجلات المكررة' });
  } catch (error) {
    log.error('Error merging duplicate employees', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل دمج الموظفين المكررين',
      error: error.message
    });
  }
});

// List employees that have multiple documents of the same type (main manager only)
router.get('/duplicate-documents', requireMainManager, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const docTypesAllowedMultiple = [
      'training_certificate',
      'experience_certificate',
      'additional_courses',
      'other'
    ];

    const rows = await sql`
      SELECT employee_id, document_type, COUNT(*) as doc_count,
             array_agg(json_build_object(
               'id', id,
               'file_name', file_name,
               'uploaded_at', uploaded_at,
               'is_active', is_active
             )) AS documents
      FROM employee_documents
      WHERE is_active = true
      GROUP BY employee_id, document_type
      HAVING COUNT(*) > 1
      ORDER BY employee_id
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    // Filter out allowed-multiple types
    const data = rows.filter(row => !docTypesAllowedMultiple.includes(row.document_type));

    return res.json({ success: true, data });
  } catch (error) {
    log.error('Error listing duplicate documents', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل جلب المستندات المكررة',
      error: error.message
    });
  }
});

// Merge duplicate documents for an employee (keep newest by uploaded_at)
router.post('/merge-duplicate-documents', requireMainManager, async (req, res) => {
  try {
    const { employee_id: employeeId, document_type: documentType, keep_id: keepId } = req.body;
    if (!employeeId || !documentType || !keepId) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد الموظف، نوع المستند، ومعرف المستند المراد الاحتفاظ به'
      });
    }

    // Allowed multiple types are skipped from merge
    const docTypesAllowedMultiple = [
      'training_certificate',
      'experience_certificate',
      'additional_courses',
      'other'
    ];
    if (docTypesAllowedMultiple.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'هذا النوع يسمح بتعدد المستندات ولن يتم دمجه'
      });
    }

    await sql.begin(async (trx) => {
      // Deactivate or delete other docs of same type for this employee
      await trx`
        DELETE FROM employee_documents
        WHERE employee_id = ${employeeId}
          AND document_type = ${documentType}
          AND id != ${keepId}
      `;
      // Ensure kept doc is active
      await trx`
        UPDATE employee_documents
        SET is_active = true
        WHERE id = ${keepId}
      `;
    });

    return res.json({ success: true, message: 'تم دمج المستندات المكررة لهذا النوع' });
  } catch (error) {
    log.error('Error merging duplicate documents', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل دمج المستندات المكررة',
      error: error.message
    });
  }
});

// List employees with medical insurance docs while contract_type = 'ورقي'
router.get('/paper-contract-insurance', requireMainManager, async (req, res) => {
  try {
    const docType = req.query.doc_type || 'تأمين طبي';
    const rows = await sql`
      SELECT e.id AS employee_id,
             e.first_name, e.second_name, e.third_name, e.fourth_name,
             e.contract_type,
             array_agg(json_build_object('id', d.id, 'file_name', d.file_name, 'uploaded_at', d.uploaded_at)) AS documents
      FROM employees e
      INNER JOIN employee_documents d ON d.employee_id = e.id
      WHERE e.contract_type = 'ورقي'
        AND d.document_type = ${docType}
        AND d.is_active = true
      GROUP BY e.id
      ORDER BY e.id
    `;
    return res.json({ success: true, data: rows });
  } catch (error) {
    log.error('Error listing paper contract insurance docs', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل جلب المستندات غير المطلوبة',
      error: error.message
    });
  }
});

// Delete medical insurance docs for paper contract employees (bulk)
router.post('/paper-contract-insurance/delete', requireMainManager, async (req, res) => {
  try {
    const { employee_ids: employeeIds = [], doc_type: docType = 'تأمين طبي' } = req.body;
    const ids = Array.isArray(employeeIds) ? employeeIds.map(id => parseInt(id)).filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد الموظفين'
      });
    }

    await sql.begin(async (trx) => {
      await trx`
        DELETE FROM employee_documents
        WHERE employee_id = ANY(${ids})
          AND document_type = ${docType}
      `;
    });

    return res.json({ success: true, message: 'تم حذف مستندات التأمين الطبي للموظفين المحددين' });
  } catch (error) {
    log.error('Error deleting paper contract insurance docs', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل حذف المستندات',
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// Missing required data (contract dates + qualification doc)
// ---------------------------------------------------------------------------
const QUAL_DOC_LEVELS = ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'];

router.get('/missing-required-data', requireManager, async (req, res) => {
  try {
    const branchFilter = req.user.role === 'branch_manager' ? req.user.branch_id : (req.query.branch_id ? parseInt(req.query.branch_id) : null);
    const rows = await sql`
      WITH qual_docs AS (
        SELECT employee_id, COUNT(*) FILTER (WHERE document_type = 'primary_qualification' AND is_active = true) AS qual_count
        FROM employee_documents
        GROUP BY employee_id
      )
      SELECT
        e.id,
        e.branch_id,
        b.branch_name,
        e.first_name, e.second_name, e.third_name, e.fourth_name,
        e.employee_id_number,
        e.educational_qualification,
        e.contract_start_date_hijri,
        e.contract_start_date_gregorian,
        e.contract_end_date_hijri,
        e.contract_end_date_gregorian,
        (e.contract_start_date_gregorian IS NULL) AS missing_start,
        (e.contract_end_date_gregorian IS NULL) AS missing_end,
        (
          e.educational_qualification IN ${sql(QUAL_DOC_LEVELS)}
          AND COALESCE(q.qual_count, 0) = 0
        ) AS missing_qualification_doc
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN qual_docs q ON q.employee_id = e.id
      WHERE e.is_active = true
        AND (e.status IS NULL OR e.status IN ('active','pending'))
        ${branchFilter ? sql`AND e.branch_id = ${branchFilter}` : sql``}
        AND (
          e.contract_start_date_gregorian IS NULL
          OR e.contract_end_date_gregorian IS NULL
          OR (
            e.educational_qualification IN ${sql(QUAL_DOC_LEVELS)}
            AND COALESCE(q.qual_count, 0) = 0
          )
        )
      ORDER BY e.branch_id, e.id
    `;

    return res.json({ success: true, data: rows, has_missing: rows.length > 0 });
  } catch (error) {
    log.error('Error fetching missing required data', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل جلب البيانات الناقصة',
      error: error.message
    });
  }
});

// Configure multer for qualification upload within this endpoint
// In serverless (e.g., Vercel) the filesystem is read-only except /tmp
const tempStorage = multer({ dest: '/tmp/uploads' });

router.post('/missing-required-data', requireManager, tempStorage.any(), async (req, res) => {
  try {
    // Multer may attach files; ensure req.files exists
    const files = req.files || {};

    const entriesRaw = req.body.entries;
    let entries = [];
    if (typeof entriesRaw === 'string') {
      try {
        entries = JSON.parse(entriesRaw);
      } catch (e) {
        entries = [];
      }
    } else if (Array.isArray(entriesRaw)) {
      entries = entriesRaw;
    }
    if (entries.length === 0) {
      return res.status(400).json({ success: false, message: 'لا توجد بيانات للحفظ' });
    }

    await sql.begin(async (trx) => {
      for (const entry of entries) {
        const employeeId = parseInt(entry.employee_id);
        if (!employeeId) continue;

        const [employee] = await trx`SELECT * FROM employees WHERE id = ${employeeId}`;
        if (!employee) continue;

        // Access control for branch managers
        if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
          continue;
        }

        const updates = {};
        if (entry.contract_start_date_gregorian) updates.contract_start_date_gregorian = entry.contract_start_date_gregorian;
        if (entry.contract_start_date_hijri) updates.contract_start_date_hijri = entry.contract_start_date_hijri;
        if (entry.contract_end_date_gregorian) updates.contract_end_date_gregorian = entry.contract_end_date_gregorian;
        if (entry.contract_end_date_hijri) updates.contract_end_date_hijri = entry.contract_end_date_hijri;

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          await trx`
            UPDATE employees
            SET ${sql(updates)}
            WHERE id = ${employeeId}
          `;
        }

        // Handle uploaded qualification file from multipart (if any)
        // Files are named file_<index> with accompanying file_employee_<index>
        if (files) {
          for (const [fieldName, fileArr] of Object.entries(files)) {
            if (!fieldName.startsWith('file_')) continue;
            const idx = fieldName.replace('file_', '');
            const targetEmployeeId = parseInt(req.body[`file_employee_${idx}`]);
            if (targetEmployeeId !== employeeId) continue;
            const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
            if (!file) continue;
            const filePath = file.path;
            const fileName = file.originalname;
            const mimeType = file.mimetype;
            const fileSize = file.size;
            const extension = (file.originalname.split('.').pop() || '').toLowerCase();

            await trx`
              INSERT INTO employee_documents (
                employee_id, document_type, file_name, file_path, file_size,
                mime_type, file_extension, is_active, uploaded_at
              )
              VALUES (
                ${employeeId}, 'primary_qualification', ${fileName}, ${filePath}, ${fileSize},
                ${mimeType}, ${extension}, true, CURRENT_TIMESTAMP
              )
            `;
          }
        }
      }
    });

    return res.json({ success: true, message: 'تم حفظ البيانات الناقصة' });
  } catch (error) {
    log.error('Error saving missing required data', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'فشل حفظ البيانات',
      error: error.message
    });
  }
});

// Get employees with server-side pagination (optimized for large datasets)
router.get('/paginated', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));

    // Handle branch_id
    let branchId = null;
    if (req.user.role === 'branch_manager') {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      if (Array.isArray(req.query.branch_id)) {
        branchId = req.query.branch_id.map(id => parseInt(id)).filter(id => !isNaN(id));
      } else if (typeof req.query.branch_id === 'string' && req.query.branch_id.includes(',')) {
        branchId = req.query.branch_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      } else {
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }

    const filters = {
      branch_id: branchId,
      occupation: req.query.occupation,
      data_completion_status: req.query.data_completion_status,
      status: req.query.status,
      search_name: req.query.search_name,
      search_id: req.query.search_id,
      search_phone: req.query.search_phone,
    };

    const result = await Employee.findAllPaginated(filters, page, pageSize);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    log.error('Error fetching paginated employees', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل جلب الموظفين',
      error: error.message
    });
  }
});

// Get all employees (filtered by branch for branch managers)
router.get('/', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');

    // Handle branch_id - support single value or array
    let branchId = null;
    if (req.user.role === 'branch_manager') {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      // Check if it's an array (comma-separated values)
      if (Array.isArray(req.query.branch_id)) {
        branchId = req.query.branch_id.map(id => parseInt(id)).filter(id => !isNaN(id));
      } else if (typeof req.query.branch_id === 'string' && req.query.branch_id.includes(',')) {
        // Comma-separated string
        branchId = req.query.branch_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      } else {
        // Single value
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }

    // Helper to parse array filters from query params
    const parseArrayFilter = (value) => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',').map(v => v.trim()).filter(v => v);
      }
      return [value];
    };

    const filters = {
      branch_id: branchId,
      occupation: req.query.occupation,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      data_completion_status: parseArrayFilter(req.query.data_completion_status),
      status: req.query.status,
      // Array filters for payrolls
      nationality: parseArrayFilter(req.query.nationality),
      job_title: parseArrayFilter(req.query.job_title),
      gender: parseArrayFilter(req.query.gender),
      marital_status: parseArrayFilter(req.query.marital_status),
      educational_qualification: parseArrayFilter(req.query.educational_qualification),
      contract_type: parseArrayFilter(req.query.contract_type),
      // Search filters (only for main manager)
      search_name: req.query.search_name,
      search_id: req.query.search_id,
      search_phone: req.query.search_phone,
      // Pagination support (optional, for future use)
      limit: req.query.limit,
      offset: req.query.offset
    };

    const employees = await Employee.findAll(filters);

    // NOTE: On-read completion recalculation is disabled for performance.
    // Use admin endpoint POST /api/admin/recalculate-branch (main manager) to schedule background recalculation,
    // or POST /api/employees/:id/update-completion-status for single employee updates.
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل جلب الموظفين',
      error: error.message
    });
  }
});

// Update employee completion status - MUST be before /:id route
router.post('/:id/update-completion-status', async (req, res) => {
  try {
    const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
    const updatedEmployee = await updateEmployeeCompletionStatus(parseInt(req.params.id));
    res.json({ success: true, data: updatedEmployee });
  } catch (error) {
    log.error('Error updating completion status', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تحديث حالة الإكمال',
      error: error.message
    });
  }
});

// Get employee documents - MUST be before /:id route
router.get('/:id/documents', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check branch access (multi-branch aware)
    if (req.user.role === 'branch_manager' && !employeeHasBranchAccess(employee, req.user.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    const filters = {
      document_type: req.query.document_type,
      mime_type: req.query.mime_type,
      is_verified: req.query.is_verified !== undefined ? req.query.is_verified === 'true' : undefined
    };

    const documents = await Document.findByEmployeeId(parseInt(req.params.id), filters);
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل جلب مستندات الموظف',
      error: error.message
    });
  }
});

// Get employee missing data - MUST be before /:id route
router.get('/:id/missing-data', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { checkEmployeeDataCompletion } = await import('../utils/employeeDataCompletion.js');

    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    // Get documents, classifications, and certificates
    const sql = (await import('../config/database.js')).default;
    const [documents, classifications, certificates] = await Promise.all([
      sql`SELECT document_type FROM employee_documents WHERE employee_id = ${employee.id} AND is_active = true`,
      sql`SELECT profession FROM employee_professional_classifications WHERE employee_id = ${employee.id}`,
      sql`SELECT course_type FROM employee_course_certificates WHERE employee_id = ${employee.id}`
    ]);

    // Check completion
    const completion = await checkEmployeeDataCompletion(employee, {
      documents,
      classifications,
      certificates
    });

    res.json({
      success: true,
      data: {
        isComplete: completion.isComplete,
        missingFields: completion.missingFields
      }
    });
  } catch (error) {
    log.error('Error fetching missing data', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل جلب البيانات المفقودة',
      error: error.message
    });
  }
});

// Get employee by ID - MUST be after specific routes like /:id/missing-data
router.get('/:id', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check branch access (check if employee is linked to user's branch)
    if (req.user.role === 'branch_manager') {
      let branchIds = [];
      try {
        branchIds = await Employee.getBranchIds(employee.id);
        // Fallback to primary branch_id if getBranchIds fails or returns empty
        if (branchIds.length === 0 && employee.branch_id) {
          branchIds = [employee.branch_id];
        }
      } catch (error) {
        // If employee_branches table doesn't exist, use branch_id
        if (employee.branch_id) {
          branchIds = [employee.branch_id];
        }
      }
      
      if (!branchIds.includes(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }
    }

    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل جلب الموظف',
      error: error.message
    });
  }
});

// Check for duplicate employees (before creating)
router.post('/check-duplicate', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { id_or_residency_number, date_of_birth_hijri, date_of_birth_gregorian } = req.body;

    if (!id_or_residency_number) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهوية أو الإقامة مطلوب'
      });
    }

    const duplicates = await Employee.findDuplicates(
      id_or_residency_number,
      date_of_birth_hijri,
      date_of_birth_gregorian
    );

    res.json({
      success: true,
      hasDuplicates: duplicates.length > 0,
      duplicates: duplicates
    });
  } catch (error) {
    log.error('Error checking for duplicates', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل التحقق من التكرار',
      error: error.message
    });
  }
});

// Create employee
router.post('/',
  validateRequired([
    'first_name', 'second_name', 'third_name', 'fourth_name',
    'id_or_residency_number', 'job_title', 'phone_number', 'email',
    'gender', 'bank_iban', 'bank_name', 'national_address'
  ]),
  validateEmployeeName,
  validateEmail,
  validateDateFields({
    'date_of_birth_hijri': { calendarType: 'hijri', dateType: 'birth_date', required: true },
    'id_expiry_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false }
  }),
  async (req, res) => {
    console.log('========================================');
    console.log('[EMPLOYEE CREATE] Starting employee creation');
    console.log('[EMPLOYEE CREATE] User:', { id: req.user.id, role: req.user.role, branch_id: req.user.branch_id });
    console.log('[EMPLOYEE CREATE] Request body keys:', Object.keys(req.body));
    console.log('[EMPLOYEE CREATE] Employee ID/Residency:', req.body.id_or_residency_number);
    console.log('[EMPLOYEE CREATE] Name:', `${req.body.first_name} ${req.body.second_name} ${req.body.third_name} ${req.body.fourth_name}`);
    console.log('[EMPLOYEE CREATE] Branch ID from body:', req.body.branch_id);
    
    try {
      const { Employee } = await import('../models/Employee.js');
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      const { isSaudi } = await import('../utils/employeeHelpers.js');

      console.log('[EMPLOYEE CREATE] Imports loaded successfully');

      // Date validation is handled by validateDateFields middleware
      console.log('[EMPLOYEE CREATE] Date validation passed');

      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (req.user.role === 'branch_manager') {
        console.log('[EMPLOYEE CREATE] Branch manager detected - checking branch access');
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          console.log('[EMPLOYEE CREATE] ERROR: Branch manager trying to add employee to different branch');
          return res.status(403).json({
            success: false,
            message: 'You can only add employees to your own branch'
          });
        }
        // Force branch_id to their branch
        req.body.branch_id = req.user.branch_id;
        console.log('[EMPLOYEE CREATE] Branch ID forced to:', req.body.branch_id);
      }

      // Date normalization is handled by validateDateFields middleware
      console.log('[EMPLOYEE CREATE] Starting field length validation');

      // Validate field lengths before insertion
      const fieldLengths = {
        'first_name': 100,
        'second_name': 100,
        'third_name': 100,
        'fourth_name': 100,
        'occupation': 100,
        'nationality': 100,
        'religion': 100,
        'marital_status': 50,
        'educational_qualification': 200,
        'specialization': 200,
        'bank_name': 200,
        'email': 255,
        'phone_number': 50,
        'contract_type': 100,
        'id_or_residency_number': 100,
        'employee_id_number': 100
      };

      for (const [field, maxLength] of Object.entries(fieldLengths)) {
        if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].length > maxLength) {
          console.log('[EMPLOYEE CREATE] ERROR: Field length validation failed:', field, 'length:', req.body[field].length, 'max:', maxLength);
          return res.status(400).json({
            success: false,
            message: `الحقل "${field}" يتجاوز الحد الأقصى لعدد الأحرف (${maxLength} حرف)`
          });
        }
      }
      console.log('[EMPLOYEE CREATE] Field length validation passed');

      // Set created_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id
      let createdByBranchId = req.body.branch_id;
      console.log('[EMPLOYEE CREATE] Initial createdByBranchId:', createdByBranchId);

      // If branch manager, force to their branch_id
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        createdByBranchId = req.user.branch_id;
        console.log('[EMPLOYEE CREATE] Updated createdByBranchId for branch manager:', createdByBranchId);
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!createdByBranchId) {
        console.log('[EMPLOYEE CREATE] ERROR: createdByBranchId is null or undefined');
        return res.status(400).json({
          success: false,
          message: 'لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.'
        });
      }
      console.log('[EMPLOYEE CREATE] Final createdByBranchId:', createdByBranchId);

      // Check if this is linking to an existing employee (via existing_employee_id)
      if (req.body.existing_employee_id && req.body.link_to_branch) {
        console.log('[EMPLOYEE CREATE] Linking to existing employee:', req.body.existing_employee_id);
        const existingEmployeeId = parseInt(req.body.existing_employee_id);
        const linkBranchId = req.body.link_to_branch === 'true' ? createdByBranchId : null;

        if (linkBranchId) {
          try {
            console.log('[EMPLOYEE CREATE] Attempting to link employee to branch');
            await Employee.linkToBranch(existingEmployeeId, linkBranchId, req.user.id);
            const updatedEmployee = await Employee.findById(existingEmployeeId);
            clearByPrefix(`dashboard:summary:${linkBranchId}`);
            clearByPrefix('branch-statistics');
            console.log('[EMPLOYEE CREATE] Successfully linked existing employee to branch');
            return res.status(200).json({ 
              success: true, 
              data: updatedEmployee,
              message: 'تم ربط الموظف بالفرع الجديد بنجاح'
            });
          } catch (linkError) {
            console.log('[EMPLOYEE CREATE] WARNING: Could not link employee to branch:', linkError.message);
            log.warn('Could not link employee to branch (table may not exist)', { error: linkError.message });
          }
        }
      }

      console.log('[EMPLOYEE CREATE] Creating new employee in database...');
      console.log('[EMPLOYEE CREATE] Employee data being sent to model:', {
        employee_id_number: req.body.employee_id_number,
        branch_id: req.body.branch_id,
        first_name: req.body.first_name,
        id_or_residency_number: req.body.id_or_residency_number,
        created_by: createdByBranchId,
        updated_by: createdByBranchId,
        contract_start_date_hijri: req.body.contract_start_date_hijri,
        contract_end_date_hijri: req.body.contract_end_date_hijri
      });
      
      const employee = await Employee.create({
        ...req.body,
        created_by: createdByBranchId,
        updated_by: createdByBranchId, // For new records, updated_by = created_by
        data_completion_status: 'incomplete' // Default to incomplete
      });
      
      console.log('[EMPLOYEE CREATE] Employee created successfully with ID:', employee.id);

      // Link employee to branch in employee_branches table
      try {
        console.log('[EMPLOYEE CREATE] Linking employee to branch in employee_branches table');
        await Employee.linkToBranch(employee.id, createdByBranchId, req.user.id);
        console.log('[EMPLOYEE CREATE] Successfully linked employee to branch');
      } catch (linkError) {
        console.log('[EMPLOYEE CREATE] WARNING: Could not link employee to branch (table may not exist yet):', linkError.message);
        log.warn('Could not link employee to branch (table may not exist yet)', { error: linkError.message });
      }

      // Check and update completion status
      try {
        console.log('[EMPLOYEE CREATE] Updating employee completion status');
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        console.log('[EMPLOYEE CREATE] Employee completion status updated');
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        console.log('[EMPLOYEE CREATE] SUCCESS: Employee created and processed successfully');
        console.log('========================================');
        res.status(201).json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.log('[EMPLOYEE CREATE] WARNING: Error checking completion status:', completionError.message);
        log.warn('Error checking completion status', { error: completionError.message });
        // Invalidate caches for safety
        clearByPrefix(`dashboard:summary:${createdByBranchId}`);
        clearByPrefix('branch-statistics');
        // Still return success, but with original employee data
        console.log('[EMPLOYEE CREATE] SUCCESS: Employee created (completion status check failed)');
        console.log('========================================');
        res.status(201).json({ success: true, data: employee });
      }
    } catch (error) {
      console.log('[EMPLOYEE CREATE] ERROR:', error.message);
      console.log('[EMPLOYEE CREATE] Error stack:', error.stack);
      console.log('========================================');
      log.error('Error creating employee', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: 'فشل إنشاء الموظف',
        error: error.message
      });
    }
  }
);

// Update employee
router.put('/:id',
  validateEmployeeName,
  validateDateFields({
    'date_of_birth_hijri': { calendarType: 'hijri', dateType: 'birth_date', required: true },
    'id_expiry_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false },
    'contract_start_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false },
    'contract_end_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false }
  }),
  async (req, res) => {
    console.log('========================================');
    console.log('[EMPLOYEE UPDATE] Starting employee update');
    console.log('[EMPLOYEE UPDATE] Employee ID:', req.params.id);
    console.log('[EMPLOYEE UPDATE] User:', { id: req.user.id, role: req.user.role, branch_id: req.user.branch_id });
    console.log('[EMPLOYEE UPDATE] Update fields:', Object.keys(req.body));
    
    try {
      const { Employee } = await import('../models/Employee.js');

      // Check if employee exists and user has access
      console.log('[EMPLOYEE UPDATE] Checking if employee exists...');
      const existingEmployee = await Employee.findById(parseInt(req.params.id));
      if (!existingEmployee) {
        console.log('[EMPLOYEE UPDATE] ERROR: Employee not found');
        return res.status(404).json({
          success: false,
          message: 'الموظف غير موجود'
        });
      }
      console.log('[EMPLOYEE UPDATE] Employee found:', existingEmployee.id, existingEmployee.branch_id);

      if (req.user.role === 'branch_manager' && !employeeHasBranchAccess(existingEmployee, req.user.branch_id)) {
        console.log('[EMPLOYEE UPDATE] ERROR: Branch manager trying to update employee from different branch');
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }

      // For branch managers, prevent changing branch_id (force it to their branch)
      if (req.user.role === 'branch_manager') {
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          return res.status(403).json({
            success: false,
            message: 'لا يمكنك تغيير فرع الموظف'
          });
        }
        req.body.branch_id = req.user.branch_id;
      }

      // Set updated_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id (from existing employee or request)
      let updatedByBranchId = req.body.branch_id || existingEmployee.branch_id;

      // If branch manager, force to their branch_id
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        updatedByBranchId = req.user.branch_id;
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!updatedByBranchId) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.'
        });
      }

      // Date normalization is handled by validateDateFields middleware
      console.log('[EMPLOYEE UPDATE] Updated by branch ID:', updatedByBranchId);
      console.log('[EMPLOYEE UPDATE] Calling Employee.update()...');

      const employee = await Employee.update(
        parseInt(req.params.id),
        req.body,
        updatedByBranchId
      );

      console.log('[EMPLOYEE UPDATE] Employee updated successfully:', employee.id);

      // Check and update completion status after update
      try {
        console.log('[EMPLOYEE UPDATE] Updating completion status...');
        const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        console.log('[EMPLOYEE UPDATE] Completion status updated');
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        console.log('[EMPLOYEE UPDATE] SUCCESS: Employee updated successfully');
        console.log('========================================');
        res.json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.log('[EMPLOYEE UPDATE] WARNING: Error checking completion status:', completionError.message);
        log.warn('Error checking completion status', { error: completionError.message });
        // Invalidate caches for safety
        clearByPrefix(`dashboard:summary:${req.body.branch_id || existingEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        // Still return success, but with original employee data
        console.log('[EMPLOYEE UPDATE] SUCCESS: Employee updated (completion status check failed)');
        console.log('========================================');
        res.json({ success: true, data: employee });
      }
    } catch (error) {
      console.log('[EMPLOYEE UPDATE] ERROR:', error.message);
      console.log('[EMPLOYEE UPDATE] Error stack:', error.stack);
      console.log('========================================');
      res.status(500).json({
        success: false,
        message: 'فشل تحديث الموظف',
        error: error.message
      });
    }
  }
);

// Delete employee (soft delete - archives employee)
router.delete('/:id', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');

    const employeeId = parseInt(req.params.id);

    // Only main manager can delete employees
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can delete employees'
      });
    }

    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Archive employee by setting status to 'other' with deactivation reason
    // Use employee's branch_id as statusChangedBy
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      'other',
      employee.branch_id,
      'تم إلغاء التفعيل'
    );

    // Invalidate dashboard & branch statistics caches for this branch
    clearByPrefix(`dashboard:summary:${employee.branch_id}`);
    clearByPrefix('branch-statistics');

    res.json({
      success: true,
      message: 'تم إلغاء تفعيل الموظف بنجاح',
      data: updatedEmployee
    });
  } catch (error) {
    log.error('Error deleting employee', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل إلغاء تفعيل الموظف',
      error: error.message
    });
  }
});

// Update employee status (instead of delete - employees are archived, not deleted)
router.put('/:id/status', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { Branch } = await import('../models/Branch.js');

    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    // Validation
    const validStatuses = ['active', 'pending', 'terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'حالة غير صحيحة'
      });
    }

    // Check if employee exists and user has access
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check access: branch managers can only update their branch employees
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتغيير حالة هذا الموظف'
      });
    }

    // Determine who changed the status
    let statusChangedBy = employee.branch_id; // Default to employee's branch
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      statusChangedBy = req.user.branch_id;
    }

    // Update status
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      statusChangedBy,
      reason || null
    );

    res.json({
      success: true,
      message: 'تم تحديث حالة الموظف بنجاح',
      data: updatedEmployee
    });
  } catch (error) {
    log.error('Error updating employee status', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تحديث حالة الموظف',
      error: error.message
    });
  }
});

// Renew employee (pending -> active) - Branch Manager only
router.post('/:id/renew', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { Document } = await import('../models/Document.js');
    const { Branch } = await import('../models/Branch.js');
    const { Term } = await import('../models/Term.js');
    const { AcademicYear } = await import('../models/AcademicYear.js');

    const employeeId = parseInt(req.params.id);

    // Check if user is branch manager
    if (req.user.role !== 'branch_manager' || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'فقط مديرو الفروع يمكنهم تجديد عقود الموظفين'
      });
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check access
    if (employee.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتجديد عقد هذا الموظف'
      });
    }

    // Check if employee is pending
    if (employee.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'هذا الموظف ليس في حالة انتظار التجديد'
      });
    }

    // Get branch to determine branch type
    const branch = await Branch.findById(employee.branch_id);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'الفرع غير موجود'
      });
    }

    // Get current academic year and term
    const currentYear = await AcademicYear.getCurrentYear(branch.branch_type);
    if (!currentYear) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد سنة دراسية حالية لهذا النوع من الفروع'
      });
    }

    const currentTerm = await Term.getCurrentTerm(branch.branch_type);
    if (!currentTerm) {
      return res.status(400).json({
        success: false,
        message: 'لا يوجد فصل دراسي حالياً'
      });
    }

    // Get employee documents
    const documents = await Document.findByEmployeeId(employeeId);
    const documentTypes = documents.map(d => d.document_type);

    // Validate required documents for renewal
    const requiredDocs = ['employment_contract', 'employment_letter'];
    if (employee.gender === 'female') {
      requiredDocs.push('medical_examination');
    }

    const missingDocs = requiredDocs.filter(docType =>
      !documentTypes.includes(docType) &&
      !documentTypes.includes(docType.replace('_', '_')) // Handle variations
    );

    // Check if documents are recent (uploaded/updated in last 90 days)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentDocs = documents.filter(doc => {
      if (!requiredDocs.includes(doc.document_type)) return false;
      const uploadDate = new Date(doc.uploaded_at);
      return uploadDate >= ninetyDaysAgo;
    });

    if (missingDocs.length > 0 || recentDocs.length < requiredDocs.length) {
      return res.status(400).json({
        success: false,
        message: `يجب تحديث المستندات التالية: ${requiredDocs.join(', ')}`,
        missing_documents: missingDocs,
        required_documents: requiredDocs
      });
    }

    // Renew employee
    const renewedEmployee = await Employee.renewEmployee(
      employeeId,
      currentYear.year_label,
      currentTerm.id,
      req.user.branch_id
    );

    if (!renewedEmployee) {
      return res.status(400).json({
        success: false,
        message: 'فشل تجديد العقد. تأكد من أن حالة الموظف هي "قيد الانتظار"'
      });
    }

    res.json({
      success: true,
      message: 'تم تجديد عقد الموظف بنجاح',
      data: renewedEmployee
    });
  } catch (error) {
    log.error('Error renewing employee', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تجديد العقد',
      error: error.message
    });
  }
});

// Non-renewal (pending -> archived status) - Branch Manager only
router.post('/:id/non-renewal', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');

    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    // Check if user is branch manager
    if (req.user.role !== 'branch_manager' || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'فقط مديرو الفروع يمكنهم تحديد عدم التجديد'
      });
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check access
    if (employee.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتحديد عدم التجديد لهذا الموظف'
      });
    }

    // Check if employee is pending
    if (employee.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'هذا الموظف ليس في حالة انتظار التجديد'
      });
    }

    // Validate status (must be an archived status, not active or pending)
    const archivedStatuses = ['terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
    if (!status || !archivedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار حالة أرشيفية (مثل: إنهاء العقد، الاستقالة، إلخ)'
      });
    }

    // Update status to archived status
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      req.user.branch_id,
      reason || 'عدم تجديد العقد'
    );

    res.json({
      success: true,
      message: 'تم نقل الموظف إلى الأرشيف بنجاح',
      data: updatedEmployee
    });
  } catch (error) {
    log.error('Error processing non-renewal', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تحديد عدم التجديد',
      error: error.message
    });
  }
});

export default router;


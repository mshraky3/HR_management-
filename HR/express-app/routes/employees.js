/**
 * Employee Routes
 * CRUD operations for employees
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess } from '../middleware/authorization.js';
import { validateRequired, validateEmployeeName, validateEmail } from '../middleware/validation.js';
import { validateDateFields } from '../middleware/dateValidation.js';
import { Document } from '../models/Document.js';
import { log } from '../utils/logger.js';
import { clearByPrefix } from '../utils/simpleCache.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

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

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
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
    try {
      const { Employee } = await import('../models/Employee.js');
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      const { isSaudi } = await import('../utils/employeeHelpers.js');

      // Date validation is handled by validateDateFields middleware

      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (req.user.role === 'branch_manager') {
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          return res.status(403).json({
            success: false,
            message: 'You can only add employees to your own branch'
          });
        }
        // Force branch_id to their branch
        req.body.branch_id = req.user.branch_id;
      }

      // Date normalization is handled by validateDateFields middleware

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
          return res.status(400).json({
            success: false,
            message: `الحقل "${field}" يتجاوز الحد الأقصى لعدد الأحرف (${maxLength} حرف)`
          });
        }
      }

      // Set created_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id
      let createdByBranchId = req.body.branch_id;

      // If branch manager, force to their branch_id
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        createdByBranchId = req.user.branch_id;
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!createdByBranchId) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.'
        });
      }

      // Check if this is linking to an existing employee (via existing_employee_id)
      if (req.body.existing_employee_id && req.body.link_to_branch) {
        const existingEmployeeId = parseInt(req.body.existing_employee_id);
        const linkBranchId = req.body.link_to_branch === 'true' ? createdByBranchId : null;

        if (linkBranchId) {
          try {
            await Employee.linkToBranch(existingEmployeeId, linkBranchId, createdByBranchId);
            const updatedEmployee = await Employee.findById(existingEmployeeId);
            clearByPrefix(`dashboard:summary:${linkBranchId}`);
            clearByPrefix('branch-statistics');
            return res.status(200).json({ 
              success: true, 
              data: updatedEmployee,
              message: 'تم ربط الموظف بالفرع الجديد بنجاح'
            });
          } catch (linkError) {
            log.warn('Could not link employee to branch (table may not exist)', { error: linkError.message });
          }
        }
      }

      const employee = await Employee.create({
        ...req.body,
        created_by: createdByBranchId,
        updated_by: createdByBranchId, // For new records, updated_by = created_by
        data_completion_status: 'incomplete' // Default to incomplete
      });

      // Link employee to branch in employee_branches table
      try {
        await Employee.linkToBranch(employee.id, createdByBranchId, createdByBranchId);
      } catch (linkError) {
        log.warn('Could not link employee to branch (table may not exist yet)', { error: linkError.message });
      }

      // Check and update completion status
      try {
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        res.status(201).json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        log.warn('Error checking completion status', { error: completionError.message });
        // Invalidate caches for safety
        clearByPrefix(`dashboard:summary:${createdByBranchId}`);
        clearByPrefix('branch-statistics');
        // Still return success, but with original employee data
        res.status(201).json({ success: true, data: employee });
      }
    } catch (error) {
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
    'id_expiry_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false }
  }),
  async (req, res) => {
    try {
      const { Employee } = await import('../models/Employee.js');

      // Check if employee exists and user has access
      const existingEmployee = await Employee.findById(parseInt(req.params.id));
      if (!existingEmployee) {
        return res.status(404).json({
          success: false,
          message: 'الموظف غير موجود'
        });
      }

      if (req.user.role === 'branch_manager' && req.user.branch_id !== existingEmployee.branch_id) {
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
        // Force branch_id to their branch (prevent manipulation)
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

      const employee = await Employee.update(
        parseInt(req.params.id),
        req.body,
        updatedByBranchId
      );

      // Check and update completion status after update
      try {
        const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        res.json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        log.warn('Error checking completion status', { error: completionError.message });
        // Invalidate caches for safety
        clearByPrefix(`dashboard:summary:${req.body.branch_id || existingEmployee.branch_id}`);
        clearByPrefix('branch-statistics');
        // Still return success, but with original employee data
        res.json({ success: true, data: employee });
      }
    } catch (error) {
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


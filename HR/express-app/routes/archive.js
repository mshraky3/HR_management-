/**
 * Archive Routes
 * View archived employees (non-active statuses)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { Employee } from '../models/Employee.js';
import { Branch } from '../models/Branch.js';
import sql from '../config/database.js';
import { formatDate } from '../utils/dateConverter.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';
import {
  ArchivePolicyError,
  assertArchivedEmployeeDocumentEligibleForPurge,
  assertArchivedEmployeeEligibleForPurge,
  applyArchiveEmployeeStatusTransition
} from '../services/archiveLifecycleService.js';

const router = express.Router();

// Status labels mapping
const statusLabels = {
  active: 'نشط',
  pending: 'قيد الانتظار',
  terminated_article_80: 'إنهاء المادة 80',
  terminated_article_77: 'إنهاء المادة 77',
  resigned: 'استقالة',
  contract_ended: 'انتهاء العقد',
  non_renewal: 'عدم التجديد',
  other: 'محذوف'
};

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

/**
 * GET /api/archive
 * Get archived employees with filters, pagination, and server-side search
 * Query params: 
 *   - branch_id: Branch ID(s) to filter by (single value or comma-separated)
 *   - status: Status to filter by
 *   - academic_year: Academic year to filter by
 *   - registration_date_from: Start date for registration (YYYY-MM-DD)
 *   - registration_date_to: End date for registration (YYYY-MM-DD)
 *   - status_change_date_from: Start date for status change (YYYY-MM-DD)
 *   - status_change_date_to: End date for status change (YYYY-MM-DD)
 *   - search_name: Search term for employee name (server-side ILIKE)
 *   - search_id: Search term for ID/residency number (server-side ILIKE)
 *   - limit: Number of records per page (default: no limit, max: 10000)
 *   - offset: Number of records to skip (for pagination)
 *   - page: Page number (alternative to offset, calculates offset = (page - 1) * limit)
 */
router.get('/', async (req, res) => {
  try {
    const branchId = getScopedBranchFilter(req, { allowMultiple: true });

    // Date validation: ensure from <= to
    if (req.query.registration_date_from && req.query.registration_date_to) {
      const from = new Date(req.query.registration_date_from);
      const to = new Date(req.query.registration_date_to);
      if (from > to) {
        return res.status(400).json({
          success: false,
          message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية'
        });
      }
    }

    if (req.query.status_change_date_from && req.query.status_change_date_to) {
      const from = new Date(req.query.status_change_date_from);
      const to = new Date(req.query.status_change_date_to);
      if (from > to) {
        return res.status(400).json({
          success: false,
          message: 'تاريخ بداية تغيير الحالة يجب أن يكون قبل تاريخ نهاية تغيير الحالة'
        });
      }
    }

    const filters = {
      branch_id: branchId,
      status: req.query.status,
      academic_year: req.query.academic_year,
      registration_date_from: req.query.registration_date_from,
      registration_date_to: req.query.registration_date_to,
      status_change_date_from: req.query.status_change_date_from,
      status_change_date_to: req.query.status_change_date_to,
      search_name: req.query.search_name,
      search_id: req.query.search_id
    };

    // Handle pagination
    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit) && limit > 0 && limit <= 10000) {
        filters.limit = limit;

        // Calculate offset from page number or use provided offset
        if (req.query.page) {
          const page = parseInt(req.query.page, 10);
          if (!isNaN(page) && page > 0) {
            filters.offset = (page - 1) * limit;
          }
        } else if (req.query.offset) {
          const offset = parseInt(req.query.offset, 10);
          if (!isNaN(offset) && offset >= 0) {
            filters.offset = offset;
          }
        }
      }
    }

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined ||
        (Array.isArray(filters[key]) && filters[key].length === 0)) {
        delete filters[key];
      }
    });

    // Get archived employees with branch info (JOIN is now in findArchived)
    const result = await Employee.findArchived(filters);

    res.json({
      success: true,
      data: result.data,
      count: result.data.length,
      total: result.total,
      page: req.query.page ? parseInt(req.query.page, 10) : undefined,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    log.error('Error fetching archived employees:', error);
    handleRouteError(error, req, res, 'فشل جلب الأرشيف');
  }
});

/**
 * GET /api/archive/branch-documents/all
 * Get archived branch documents (is_active = false)
 * NOTE: This must come BEFORE /:id route to avoid conflicts
 */
router.get('/branch-documents/all', async (req, res) => {
  try {
    let query = sql`
      SELECT bd.*, b.branch_name, b.branch_type
      FROM branch_documents bd
      INNER JOIN branches b ON bd.branch_id = b.id
      WHERE bd.is_active = false
    `;

    const branchIdFilter = getScopedBranchFilter(req, { allowMultiple: true });
    if (Array.isArray(branchIdFilter) && branchIdFilter.length > 0) {
      query = sql`${query} AND bd.branch_id = ANY(${branchIdFilter})`;
    } else if (!Array.isArray(branchIdFilter) && branchIdFilter) {
      query = sql`${query} AND bd.branch_id = ${branchIdFilter}`;
    }

    if (req.query.document_type) {
      query = sql`${query} AND bd.document_type = ${req.query.document_type}`;
    }

    query = sql`${query} ORDER BY bd.uploaded_at DESC`;

    const documents = await query;

    res.json({
      success: true,
      data: documents || [],
      count: documents?.length || 0
    });
  } catch (error) {
    log.error('Error fetching archived branch documents:', error);
    handleRouteError(error, req, res, 'فشل جلب مستندات الفرع المؤرشفة');
  }
});

/**
 * GET /api/archive/employee-documents/all
 * Get archived employee documents (is_active = false)
 * Main manager only
 * NOTE: This must come BEFORE /:id route to avoid conflicts
 */
router.get('/employee-documents/all', async (req, res) => {
  try {
    // Only main manager can access archived employee documents
    if (req.user?.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'يمكن للمدير الرئيسي فقط الوصول إلى المستندات المؤرشفة'
      });
    }

    const { Document } = await import('../models/Document.js');
    const scopedBranchId = getScopedBranchFilter(req, { allowMultiple: false });

    const filters = {
      branch_id: scopedBranchId || undefined,
      document_type: req.query.document_type,
      employee_id: req.query.employee_id ? parseInt(req.query.employee_id) : undefined
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) delete filters[key];
    });

    const documents = await Document.findArchived(filters);

    res.json({
      success: true,
      data: documents || [],
      count: documents?.length || 0
    });
  } catch (error) {
    log.error('Error fetching archived employee documents:', error);
    handleRouteError(error, req, res, 'فشل جلب المستندات المؤرشفة');
  }
});

/**
 * DELETE /api/archive/employee-documents/:id
 * Permanently delete archived employee document (hard delete)
 * Main manager only
 */
router.delete('/employee-documents/:id', async (req, res) => {
  try {
    // Only main manager can permanently delete documents
    if (req.user?.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'يمكن للمدير الرئيسي فقط حذف المستندات المؤرشفة'
      });
    }

    const documentId = parseInt(req.params.id);
    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف المستند غير صحيح'
      });
    }

    const { Document } = await import('../models/Document.js');

    // First check if document exists and is archived
    const existingDoc = await sql`
      SELECT id, file_path, r2_file_path, is_active, employee_id, updated_at, uploaded_at
      FROM employee_documents
      WHERE id = ${documentId}
    `;

    if (!existingDoc || existingDoc.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    const doc = existingDoc[0];

    if (doc.is_active) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف المستندات النشطة. يجب أرشفتها أولاً'
      });
    }

    assertArchivedEmployeeDocumentEligibleForPurge(doc);

    // Delete file from blob storage if it exists
    if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
      try {
        const { deleteFromBlob } = await import('../utils/blobStorage.js');
        await deleteFromBlob(doc.file_path);
      } catch (deleteError) {
        log.error('Error deleting file from blob storage:', deleteError);
        // Continue with database deletion even if blob deletion fails
      }
    }
    // Delete R2 copy if it exists
    if (doc.r2_file_path) {
      try {
        const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
        await deleteFromR2Mirror(doc.r2_file_path);
      } catch (e) { /* ignore */ }
    }

    // Permanently delete from database
    const deletedDocument = await Document.permanentDelete(documentId);

    if (!deletedDocument) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    res.json({
      success: true,
      message: 'تم حذف المستند نهائياً',
      data: deletedDocument
    });
  } catch (error) {
    if (error instanceof ArchivePolicyError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    }

    log.error('Error permanently deleting document:', error);
    handleRouteError(error, req, res, 'فشل حذف المستند');
  }
});

/**
 * DELETE /api/archive/:id
 * Permanently delete archived employee (hard delete from database)
 * Main manager only
 * This will also delete all employee documents due to ON DELETE CASCADE
 */
router.delete('/:id', async (req, res) => {
  try {
    // Only main manager can permanently delete employees
    if (req.user?.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'يمكن للمدير الرئيسي فقط حذف الموظفين نهائياً'
      });
    }

    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف الموظف غير صحيح'
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

    assertArchivedEmployeeEligibleForPurge(employee);

    // Get employee documents to delete from blob storage
    const documents = await sql`
      SELECT id, file_path, r2_file_path 
      FROM employee_documents 
      WHERE employee_id = ${employeeId}
    `;

    // Delete files from blob storage if they exist
    for (const doc of documents) {
      if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
        try {
          const { deleteFromBlob } = await import('../utils/blobStorage.js');
          await deleteFromBlob(doc.file_path);
        } catch (deleteError) {
          log.error('Error deleting file from blob storage:', deleteError);
          // Continue with database deletion even if blob deletion fails
        }
      }
      // Delete R2 copy if it exists
      if (doc.r2_file_path) {
        try {
          const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
          await deleteFromR2Mirror(doc.r2_file_path);
        } catch (e) { /* ignore */ }
      }
    }

    // Permanently delete employee from database
    // This will cascade delete all employee_documents due to ON DELETE CASCADE
    const [deletedEmployee] = await sql`
      DELETE FROM employees 
      WHERE id = ${employeeId}
      RETURNING id, first_name, second_name, third_name, fourth_name, employee_id_number
    `;

    if (!deletedEmployee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    res.json({
      success: true,
      message: 'تم حذف الموظف وبياناته ومستنداته نهائياً',
      data: deletedEmployee
    });
  } catch (error) {
    if (error instanceof ArchivePolicyError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    }

    log.error('Error permanently deleting employee:', error);
    handleRouteError(error, req, res, 'فشل حذف الموظف');
  }
});

/**
 * GET /api/archive/statistics
 * Get archive statistics grouped by branch, academic year, status, etc.
 */
router.get('/statistics', async (req, res) => {
  try {
    const { branch_type, academic_year } = req.query;

    let query = sql`
      SELECT 
        b.branch_name,
        b.branch_type,
        e.status,
        e.academic_year,
        COUNT(*) as count,
        DATE_TRUNC('month', e.created_at) as registration_month,
        DATE_TRUNC('month', e.status_changed_at) as status_change_month
      FROM employees e
      INNER JOIN branches b ON e.branch_id = b.id
      WHERE e.status NOT IN ('active', 'pending')
    `;

    if (branch_type) {
      query = sql`${query} AND b.branch_type = ${branch_type}`;
    }

    if (academic_year) {
      query = sql`${query} AND e.academic_year = ${academic_year}`;
    }

    query = sql`${query} 
      GROUP BY b.branch_name, b.branch_type, e.status, e.academic_year, 
               DATE_TRUNC('month', e.created_at), DATE_TRUNC('month', e.status_changed_at)
      ORDER BY b.branch_name, e.academic_year DESC, e.status_changed_at DESC
    `;

    const stats = await query;

    // Organize by branch -> academic year -> status -> registration/status change months
    const organized = {};

    stats.forEach(stat => {
      const branchKey = stat.branch_name;
      const yearKey = stat.academic_year || 'غير محدد';
      const statusKey = stat.status;
      const regMonth = stat.registration_month ? new Date(stat.registration_month).toISOString().slice(0, 7) : 'غير محدد';
      const changeMonth = stat.status_change_month ? new Date(stat.status_change_month).toISOString().slice(0, 7) : 'غير محدد';

      if (!organized[branchKey]) {
        organized[branchKey] = {
          branch_name: stat.branch_name,
          branch_type: stat.branch_type,
          academic_years: {}
        };
      }

      if (!organized[branchKey].academic_years[yearKey]) {
        organized[branchKey].academic_years[yearKey] = {
          academic_year: yearKey,
          statuses: {}
        };
      }

      if (!organized[branchKey].academic_years[yearKey].statuses[statusKey]) {
        organized[branchKey].academic_years[yearKey].statuses[statusKey] = {
          status: statusKey,
          periods: {}
        };
      }

      const periodKey = `${regMonth}_${changeMonth}`;
      if (!organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey]) {
        organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey] = {
          registration_month: regMonth,
          status_change_month: changeMonth,
          count: 0
        };
      }

      organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey].count += parseInt(stat.count);
    });

    res.json({
      success: true,
      data: organized
    });
  } catch (error) {
    log.error('Error fetching archive statistics:', error);
    handleRouteError(error, req, res, 'فشل جلب إحصائيات الأرشيف');
  }
});

/**
 * GET /api/archive/:id
 * Get archived employee details with documents
 * NOTE: This must come AFTER specific routes like /branch-documents/all
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (req.params.id === 'export') {
      return next('route');
    }

    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف الموظف غير صحيح'
      });
    }

    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // Check if employee is archived
    if (employee.status === 'active' || employee.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'هذا الموظف غير موجود في الأرشيف'
      });
    }

    // Get branch information (use raw query to include deactivated branches)
    const { default: sql } = await import('../config/database.js');
    const [branch] = await sql`SELECT branch_name, branch_type, is_active FROM branches WHERE id = ${employee.branch_id}`;

    // Get documents
    const { Document } = await import('../models/Document.js');
    const documents = await Document.findByEmployeeId(employee.id);

    res.json({
      success: true,
      data: {
        ...employee,
        branch_name: branch?.branch_name || 'غير معروف',
        branch_type: branch?.branch_type || 'unknown',
        branch_is_active: branch?.is_active ?? true,
        documents: documents || []
      }
    });
  } catch (error) {
    log.error('Error fetching archived employee:', error);
    handleRouteError(error, req, res, 'فشل جلب بيانات الموظف');
  }
});

/**
 * PUT /api/archive/:id/status
 * Update archived employee status
 * Note: Changing from archived status to active/pending should use /restore endpoint
 */
router.put('/:id/status', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    const result = await applyArchiveEmployeeStatusTransition({
      employeeId,
      status,
      reason,
      actor: req.user,
      restoreOnly: false
    });

    res.json({
      success: true,
      message: result.action === 'restored'
        ? `تم استعادة الموظف بنجاح إلى حالة ${status === 'active' ? 'نشط' : 'قيد الانتظار'}`
        : 'تم تحديث حالة الموظف بنجاح',
      data: result.employee
    });
  } catch (error) {
    if (error instanceof ArchivePolicyError) {
      const statusCode = error.code === 'EMPLOYEE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    }

    log.error('Error updating employee status:', error);
    handleRouteError(error, req, res, 'فشل تحديث حالة الموظف');
  }
});

/**
 * POST /api/archive/:id/restore
 * Restore archived employee to active or pending status
 */
router.post('/:id/restore', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    const result = await applyArchiveEmployeeStatusTransition({
      employeeId,
      status,
      reason: reason || 'تم الاستعادة من الأرشيف',
      actor: req.user,
      restoreOnly: true
    });

    res.json({
      success: true,
      message: `تم استعادة الموظف بنجاح إلى حالة ${status === 'active' ? 'نشط' : 'قيد الانتظار'}`,
      data: result.employee
    });
  } catch (error) {
    if (error instanceof ArchivePolicyError) {
      const statusCode = error.code === 'EMPLOYEE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    }

    log.error('Error restoring employee:', error);
    handleRouteError(error, req, res, 'فشل استعادة الموظف');
  }
});

/**
 * GET /api/archive/export
 * Export archived employees to Excel or CSV
 * Query params: same as GET /api/archive, plus format (excel or csv, default: excel)
 */
router.get('/export', async (req, res) => {
  try {
    const format = req.query.format || 'excel';
    const ExcelJS = (await import('exceljs')).default;

    // Use same filters as GET /api/archive
    const branchId = getScopedBranchFilter(req, { allowMultiple: true });

    const filters = {
      branch_id: branchId,
      status: req.query.status,
      academic_year: req.query.academic_year,
      registration_date_from: req.query.registration_date_from,
      registration_date_to: req.query.registration_date_to,
      status_change_date_from: req.query.status_change_date_from,
      status_change_date_to: req.query.status_change_date_to,
      search_name: req.query.search_name,
      search_id: req.query.search_id
      // No pagination for export - get all matching records
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined ||
        (Array.isArray(filters[key]) && filters[key].length === 0)) {
        delete filters[key];
      }
    });

    // Get all archived employees (no pagination)
    const result = await Employee.findArchived(filters);
    const employees = result.data;

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'رقم الموظف',
        'الاسم الأول',
        'الاسم الثاني',
        'الاسم الثالث',
        'الاسم الرابع',
        'رقم الهوية/الإقامة',
        'الفرع',
        'نوع الفرع',
        'الحالة',
        'السنة الدراسية',
        'تاريخ التسجيل',
        'تاريخ تغيير الحالة',
        'سبب تغيير الحالة'
      ];

      const csvRows = employees.map(emp => [
        emp.employee_id_number || '',
        emp.first_name || '',
        emp.second_name || '',
        emp.third_name || '',
        emp.fourth_name || '',
        emp.id_or_residency_number || '',
        emp.branch_name || '',
        emp.branch_type || '',
        statusLabels[emp.status] || emp.status || '',
        emp.academic_year || '',
        emp.created_at ? formatDate(emp.created_at) : '',
        emp.status_changed_at ? formatDate(emp.status_changed_at) : '',
        emp.status_change_reason || ''
      ]);

      // Convert to CSV string (simple implementation)
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Add BOM for Excel UTF-8 support
      const csvBuffer = Buffer.from('\ufeff' + csvContent, 'utf8');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="archived-employees-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvBuffer);
      return;
    }

    // Generate Excel (default)
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('الموظفين المؤرشفين');

    // Set RTL direction
    worksheet.views = [{ rightToLeft: true }];

    // Define columns
    worksheet.columns = [
      { header: 'رقم الموظف', key: 'employee_id_number', width: 15 },
      { header: 'الاسم الأول', key: 'first_name', width: 20 },
      { header: 'الاسم الثاني', key: 'second_name', width: 20 },
      { header: 'الاسم الثالث', key: 'third_name', width: 20 },
      { header: 'الاسم الرابع', key: 'fourth_name', width: 20 },
      { header: 'رقم الهوية/الإقامة', key: 'id_or_residency_number', width: 20 },
      { header: 'الفرع', key: 'branch_name', width: 25 },
      { header: 'نوع الفرع', key: 'branch_type', width: 15 },
      { header: 'الحالة', key: 'status', width: 20 },
      { header: 'السنة الدراسية', key: 'academic_year', width: 15 },
      { header: 'تاريخ التسجيل', key: 'created_at', width: 15 },
      { header: 'تاريخ تغيير الحالة', key: 'status_changed_at', width: 18 },
      { header: 'سبب تغيير الحالة', key: 'status_change_reason', width: 30 }
    ];

    // Add data rows
    employees.forEach(emp => {
      worksheet.addRow({
        employee_id_number: emp.employee_id_number || '',
        first_name: emp.first_name || '',
        second_name: emp.second_name || '',
        third_name: emp.third_name || '',
        fourth_name: emp.fourth_name || '',
        id_or_residency_number: emp.id_or_residency_number || '',
        branch_name: emp.branch_name || 'غير معروف',
        branch_type: emp.branch_type === 'school' ? 'مدرسة' : emp.branch_type === 'daycare' ? 'مركز رعاية نهارية' : emp.branch_type || '',
        status: statusLabels[emp.status] || emp.status || '',
        academic_year: emp.academic_year || '',
        created_at: emp.created_at ? formatDate(emp.created_at) : '',
        status_changed_at: emp.status_changed_at ? formatDate(emp.status_changed_at) : '',
        status_change_reason: emp.status_change_reason || ''
      });
    });

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12, name: 'Arial' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      textDirection: 'right-to-left'
    };
    headerRow.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Set RTL alignment for all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          horizontal: rowNumber === 1 ? 'center' : 'right',
          vertical: 'middle',
          wrapText: true,
          textDirection: 'right-to-left'
        };
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="archived-employees-${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    log.error('Error exporting archived employees:', error);
    handleRouteError(error, req, res, 'فشل تصدير البيانات');
  }
});

export default router;


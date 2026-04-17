/**
 * Admin Routes
 * Admin-only operations e.g., trigger background recalculation
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { recalculateBranchEmployeesInBatches } from '../utils/batchRecalculate.js';
import { clearByPrefix } from '../utils/simpleCache.js';
import {
  getEmployeesWithMissingDates,
  getEmployeesWithMissingDatesCount,
  convertEmployeeDates,
  deleteEmployee,
  batchFixAllEmployees
} from '../utils/fixMissingDates.js';
import {
  getEmployeesWithInvalidData,
  getEmployeesWithInvalidDataCount
} from '../utils/getInvalidDataEmployees.js';
import { Notification } from '../models/Notification.js';
import sql from '../config/database.js';
import {
  gregorianToHijri,
  hijriToGregorian,
  formatHijriToString,
  parseHijriString
} from '../utils/dateConverter.js';
import { BranchDocument } from '../models/BranchDocument.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { sendErrorNotification } from '../utils/errorNotificationService.js';

const router = express.Router();
router.use(authenticate);
router.use(requireMainManager);

// Trigger background recalculation for a branch (admin only)
router.post('/recalculate-branch', async (req, res) => {
  try {
    const branchId = parseInt(req.body.branch_id);
    if (isNaN(branchId)) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    // Start asynchronous recalculation (do not block)
    (async () => {
      try {
        await recalculateBranchEmployeesInBatches(branchId, { batchSize: 200, delayMs: 50 });
        // Invalidate caches for branch summary and statistics after recalculation
        clearByPrefix(`dashboard:summary:${branchId}`);
        clearByPrefix('branch-statistics');
      } catch (err) {
        console.error('Admin recalculation failed:', err);
      }
    })();

    return res.status(202).json({ success: true, message: 'Recalculation scheduled' });
  } catch (error) {
    console.error('Error scheduling recalculation:', error);
    return res.status(500).json({ success: false, message: 'Failed to schedule recalculation', error: error.message });
  }
});

// Get employees with missing dates of birth
router.get('/employees-missing-dates', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const [employees, totalCount] = await Promise.all([
      getEmployeesWithMissingDates(limit, offset),
      getEmployeesWithMissingDatesCount()
    ]);

    res.json({
      success: true,
      data: employees,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + employees.length < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching employees with missing dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees with missing dates',
      error: error.message
    });
  }
});

// Fix employee dates - convert or delete
router.post('/fix-employee-date', async (req, res) => {
  try {
    const { employee_id, action } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'employee_id is required'
      });
    }

    if (!action || !['convert', 'delete'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action is required and must be "convert" or "delete"'
      });
    }

    let result;
    if (action === 'convert') {
      result = await convertEmployeeDates(parseInt(employee_id));
    } else {
      result = await deleteEmployee(parseInt(employee_id));
    }

    res.json({
      success: true,
      message: `Employee ${action === 'convert' ? 'dates converted' : 'deleted'} successfully`,
      data: result
    });
  } catch (error) {
    console.error('Error fixing employee date:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fix employee date',
      error: error.message
    });
  }
});

// Batch fix all employees with missing or invalid dates
router.post('/fix-all-employee-dates', async (req, res) => {
  try {
    const { batch_size = 50, delay_ms = 100, auto_delete = false } = req.body;

    console.log('Starting batch fix for all employees with missing/invalid dates...');
    const results = await batchFixAllEmployees({
      batchSize: parseInt(batch_size) || 50,
      delayMs: parseInt(delay_ms) || 100,
      autoDelete: auto_delete === true
    });

    console.log('Batch fix completed:', results);

    return res.json({
      success: true,
      message: `تمت معالجة ${results.total} موظف. تم التحويل: ${results.converted}, تم الحذف: ${results.deleted}, فشل: ${results.failed}, تم التخطي: ${results.skipped}`,
      data: results
    });
  } catch (error) {
    console.error('Error during batch fix:', error);
    return res.status(500).json({
      success: false,
      message: 'فشلت عملية المعالجة المجمعة',
      error: error.message
    });
  }
});

// Get employees with invalid/incomplete data
router.get('/employees-invalid-data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const [employees, totalCount] = await Promise.all([
      getEmployeesWithInvalidData(limit, offset),
      getEmployeesWithInvalidDataCount()
    ]);

    res.json({
      success: true,
      data: employees,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + employees.length < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching employees with invalid data:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الموظفين ذوي البيانات غير الدقيقة',
      error: error.message
    });
  }
});

// Notify branch about invalid employee data
router.post('/notify-branch-invalid-data', async (req, res) => {
  try {
    const { employee_id } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'employee_id is required'
      });
    }

    // Get employee with invalid data details
    const employees = await getEmployeesWithInvalidData(1000, 0);
    const employee = employees.find(emp => emp.id === parseInt(employee_id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found or data is valid'
      });
    }

    // Get invalid fields
    const invalidFieldsText = employee.invalid_fields && employee.invalid_fields.length > 0
      ? employee.invalid_fields.join('، ')
      : 'بيانات غير صحيحة';

    // Create notification for the branch
    const notificationMessage = `يرجى مراجعة وتصحيح بيانات الموظف: ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}
        
المجالات غير الصحيحة:
${invalidFieldsText}`;

    const notification = await Notification.create({
      message: notificationMessage,
      importance_level: 2, // Medium importance
      created_by: req.user.id,
      branch_ids: [employee.branch_id]
    });

    res.json({
      success: true,
      message: `تم إرسال إشعار للفرع بخصوص الموظف ${employee.first_name} ${employee.second_name}`,
      data: notification
    });
  } catch (error) {
    console.error('Error notifying branch:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إرسال الإشعار للفرع',
      error: error.message
    });
  }
});

// Removed: Attendance system has been removed

// Get branch documents with date status (missing calendar types)
router.get('/branch-documents/date-status', async (req, res) => {
  try {
    const documents = await sql`
      SELECT 
        bd.id,
        bd.branch_id,
        b.branch_name,
        bd.document_type,
        bd.file_name,
        bd.issue_date,
        bd.issue_date_hijri,
        bd.expiry_date,
        bd.expiry_date_hijri,
        (bd.issue_date IS NOT NULL) as has_issue_gregorian,
        (bd.issue_date_hijri IS NOT NULL AND bd.issue_date_hijri != '') as has_issue_hijri,
        (bd.expiry_date IS NOT NULL) as has_expiry_gregorian,
        (bd.expiry_date_hijri IS NOT NULL AND bd.expiry_date_hijri != '') as has_expiry_hijri
      FROM branch_documents bd
      INNER JOIN branches b ON bd.branch_id = b.id
      WHERE bd.is_active = true
        AND (
          (bd.issue_date IS NOT NULL AND (bd.issue_date_hijri IS NULL OR bd.issue_date_hijri = '')) OR
          (bd.issue_date_hijri IS NOT NULL AND bd.issue_date_hijri != '' AND bd.issue_date IS NULL) OR
          (bd.expiry_date IS NOT NULL AND (bd.expiry_date_hijri IS NULL OR bd.expiry_date_hijri = '')) OR
          (bd.expiry_date_hijri IS NOT NULL AND bd.expiry_date_hijri != '' AND bd.expiry_date IS NULL)
        )
      ORDER BY b.branch_name, bd.document_type, bd.uploaded_at DESC
    `;

    res.json({
      success: true,
      data: documents || [],
      count: documents?.length || 0
    });
  } catch (error) {
    console.error('Error fetching branch documents date status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branch documents date status',
      error: error.message
    });
  }
});

// Get branch documents with abnormal dates (years under 2000 Gregorian or under 1400 Hijri)
router.get('/branch-documents/abnormal-dates', async (req, res) => {
  try {
    const documents = await sql`
      SELECT 
        bd.id,
        bd.branch_id,
        b.branch_name,
        bd.document_type,
        bd.file_name,
        bd.issue_date,
        bd.issue_date_hijri,
        bd.expiry_date,
        bd.expiry_date_hijri,
        CASE 
          WHEN bd.issue_date IS NOT NULL AND EXTRACT(YEAR FROM bd.issue_date) < 2000 THEN true
          ELSE false
        END as issue_gregorian_abnormal,
        CASE 
          WHEN bd.issue_date_hijri IS NOT NULL AND bd.issue_date_hijri != '' THEN
            CASE 
              WHEN CAST(SPLIT_PART(bd.issue_date_hijri, '/', 3) AS INTEGER) < 1400 THEN true
              ELSE false
            END
          ELSE false
        END as issue_hijri_abnormal,
        CASE 
          WHEN bd.expiry_date IS NOT NULL AND EXTRACT(YEAR FROM bd.expiry_date) < 2000 THEN true
          ELSE false
        END as expiry_gregorian_abnormal,
        CASE 
          WHEN bd.expiry_date_hijri IS NOT NULL AND bd.expiry_date_hijri != '' THEN
            CASE 
              WHEN CAST(SPLIT_PART(bd.expiry_date_hijri, '/', 3) AS INTEGER) < 1400 THEN true
              ELSE false
            END
          ELSE false
        END as expiry_hijri_abnormal
      FROM branch_documents bd
      INNER JOIN branches b ON bd.branch_id = b.id
      WHERE bd.is_active = true
        AND (
          (bd.issue_date IS NOT NULL AND EXTRACT(YEAR FROM bd.issue_date) < 2000) OR
          (bd.issue_date_hijri IS NOT NULL AND bd.issue_date_hijri != '' AND 
           CAST(SPLIT_PART(bd.issue_date_hijri, '/', 3) AS INTEGER) < 1400) OR
          (bd.expiry_date IS NOT NULL AND EXTRACT(YEAR FROM bd.expiry_date) < 2000) OR
          (bd.expiry_date_hijri IS NOT NULL AND bd.expiry_date_hijri != '' AND 
           CAST(SPLIT_PART(bd.expiry_date_hijri, '/', 3) AS INTEGER) < 1400)
        )
      ORDER BY b.branch_name, bd.document_type, bd.uploaded_at DESC
    `;

    res.json({
      success: true,
      data: documents || [],
      count: documents?.length || 0
    });
  } catch (error) {
    console.error('Error fetching branch documents with abnormal dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branch documents with abnormal dates',
      error: error.message
    });
  }
});

// Convert and update branch document dates
router.post('/branch-documents/:id/convert-dates', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const { convert_issue_date = false, convert_expiry_date = false } = req.body;

    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID'
      });
    }

    // Get document from database
    const [document] = await sql`
      SELECT * FROM branch_documents
      WHERE id = ${documentId} AND is_active = true
    `;

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const updates = {};
    let hasUpdates = false;

    // Convert issue_date if needed
    if (convert_issue_date) {
      // If Gregorian exists but Hijri missing
      if (document.issue_date && (!document.issue_date_hijri || document.issue_date_hijri === '')) {
        const hijriObj = gregorianToHijri(document.issue_date);
        if (hijriObj) {
          updates.issue_date_hijri = formatHijriToString(hijriObj);
          hasUpdates = true;
        }
      }
      // If Hijri exists but Gregorian missing
      else if (document.issue_date_hijri && document.issue_date_hijri !== '' && !document.issue_date) {
        const hijriObj = parseHijriString(document.issue_date_hijri);
        if (hijriObj) {
          const gregorianDate = hijriToGregorian(hijriObj.day, hijriObj.month, hijriObj.year);
          if (gregorianDate) {
            updates.issue_date = gregorianDate;
            hasUpdates = true;
          }
        }
      }
    }

    // Convert expiry_date if needed
    if (convert_expiry_date) {
      // If Gregorian exists but Hijri missing
      if (document.expiry_date && (!document.expiry_date_hijri || document.expiry_date_hijri === '')) {
        const hijriObj = gregorianToHijri(document.expiry_date);
        if (hijriObj) {
          updates.expiry_date_hijri = formatHijriToString(hijriObj);
          hasUpdates = true;
        }
      }
      // If Hijri exists but Gregorian missing
      else if (document.expiry_date_hijri && document.expiry_date_hijri !== '' && !document.expiry_date) {
        const hijriObj = parseHijriString(document.expiry_date_hijri);
        if (hijriObj) {
          const gregorianDate = hijriToGregorian(hijriObj.day, hijriObj.month, hijriObj.year);
          if (gregorianDate) {
            updates.expiry_date = gregorianDate;
            hasUpdates = true;
          }
        }
      }
    }

    if (!hasUpdates) {
      return res.json({
        success: true,
        message: 'No conversion needed - both calendar types already present or conversion not possible',
        data: document
      });
    }

    // Update document in database
    const [updated] = await sql`
      UPDATE branch_documents
      SET 
        issue_date = ${updates.issue_date !== undefined ? updates.issue_date : sql`issue_date`},
        issue_date_hijri = ${updates.issue_date_hijri !== undefined ? updates.issue_date_hijri : sql`issue_date_hijri`},
        expiry_date = ${updates.expiry_date !== undefined ? updates.expiry_date : sql`expiry_date`},
        expiry_date_hijri = ${updates.expiry_date_hijri !== undefined ? updates.expiry_date_hijri : sql`expiry_date_hijri`},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${documentId}
      RETURNING *
    `;

    res.json({
      success: true,
      message: 'Dates converted successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error converting branch document dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert dates',
      error: error.message
    });
  }
});

// Update branch document dates (admin only - no password required)
router.put('/branch-documents/:id/dates', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const { issue_date, issue_date_hijri, expiry_date, expiry_date_hijri } = req.body;

    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID'
      });
    }

    // Get document from database
    const [document] = await sql`
      SELECT * FROM branch_documents
      WHERE id = ${documentId} AND is_active = true
    `;

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update only date fields
    const [updated] = await sql`
      UPDATE branch_documents
      SET 
        issue_date = ${issue_date !== undefined ? issue_date : sql`issue_date`},
        issue_date_hijri = ${issue_date_hijri !== undefined ? issue_date_hijri : sql`issue_date_hijri`},
        expiry_date = ${expiry_date !== undefined ? expiry_date : sql`expiry_date`},
        expiry_date_hijri = ${expiry_date_hijri !== undefined ? expiry_date_hijri : sql`expiry_date_hijri`},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${documentId}
      RETURNING *
    `;

    res.json({
      success: true,
      message: 'Dates updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating branch document dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update dates',
      error: error.message
    });
  }
});

// POST /api/admin/test-email — Send test emails to manager & developer
router.post('/test-email', async (req, res) => {
  try {
    const managerEmail = process.env.MAIN_MANAGER_EMAIL;
    const developerEmail = process.env.DEVELOPER_EMAIL;
    const results = {};

    // 1. Test manager notification email
    if (managerEmail) {
      const r = await sendNotificationEmail({
        to: managerEmail,
        subject: '✅ اختبار نظام البريد - إشعار المدير',
        message: 'هذه رسالة اختبار للتأكد من أن نظام البريد يعمل بشكل صحيح. إذا وصلتك هذه الرسالة، فالنظام يعمل.',
        notificationType: 'test',
        appUrl: process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app',
        data: { 'النوع': 'اختبار إشعار المدير', 'التاريخ': new Date().toLocaleString('ar-SA') }
      });
      results.manager = { email: managerEmail, ...r };
    } else {
      results.manager = { error: 'MAIN_MANAGER_EMAIL not configured' };
    }

    // 2. Test error report email
    if (developerEmail) {
      const r = await sendErrorNotification({
        errorType: 'TEST_ERROR',
        message: 'This is a test error notification to verify the error reporting system works.',
        endpoint: '/api/admin/test-email',
        method: 'POST',
        statusCode: 500,
        page: '/admin',
        userAgent: req.headers['user-agent'],
        userId: req.user?.id,
        username: req.user?.username,
        timestamp: new Date().toISOString(),
      });
      results.developer = { email: developerEmail, ...r };
    } else {
      results.developer = { error: 'DEVELOPER_EMAIL not configured' };
    }

    const allSuccess = results.manager?.success && results.developer?.success;
    res.json({
      success: allSuccess,
      message: allSuccess ? 'تم إرسال رسائل الاختبار بنجاح' : 'بعض الرسائل فشلت',
      results
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

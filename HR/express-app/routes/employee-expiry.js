/**
 * Employee Expiry Routes
 * Endpoints for managing employee date expiry notifications, export, and inline updates.
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireManager, requireMainManager } from '../middleware/authorization.js';
import { getEmployeeExpiries, getExpirySummary } from '../utils/expiryService.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// All routes require authentication + at least manager role
router.use(authenticate);

/**
 * GET /api/employee-expiry/summary
 * Returns summary counts grouped by expiry type and status bucket.
 * Branch managers see only their branch; main managers see all.
 */
router.get('/summary', requireManager, async (req, res) => {
    try {
        const branchId = req.user.role === 'branch_manager' ? req.user.branch_id : (req.query.branch_id ? parseInt(req.query.branch_id) : undefined);

        const summary = await getExpirySummary({ branchId });

        res.json({ success: true, data: summary });
    } catch (error) {
        log.error('Error fetching expiry summary', { error: error.message });
        res.status(500).json({ success: false, message: 'فشل جلب ملخص التواريخ المنتهية' });
    }
});

/**
 * GET /api/employee-expiry/list
 * Returns paginated, filterable list of expiry records.
 * Branch managers see only their branch.
 */
router.get('/list', requireManager, async (req, res) => {
    try {
        const branchId = req.user.role === 'branch_manager'
            ? req.user.branch_id
            : (req.query.branch_id ? parseInt(req.query.branch_id) : undefined);

        const expiryType = req.query.expiry_type || undefined;
        const statusBucket = req.query.status_bucket || undefined;
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 500) : 100;
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const offset = (page - 1) * limit;

        // Validate statusBucket
        const validBuckets = ['expired', 'within_30_days', 'within_90_days', 'ok'];
        if (statusBucket && !validBuckets.includes(statusBucket)) {
            return res.status(400).json({ success: false, message: 'تصنيف الحالة غير صحيح' });
        }

        // Validate expiryType
        const validTypes = ['id_expiry', 'contract_end', 'passport_expiry', 'document_expiry'];
        if (expiryType && !validTypes.includes(expiryType)) {
            return res.status(400).json({ success: false, message: 'نوع التاريخ غير صحيح' });
        }

        const result = await getEmployeeExpiries({ branchId, expiryType, statusBucket, limit, offset });

        res.json({
            success: true,
            data: result.data,
            total: result.total,
            page,
            limit,
        });
    } catch (error) {
        log.error('Error fetching expiry list', { error: error.message });
        res.status(500).json({ success: false, message: 'فشل جلب قائمة التواريخ المنتهية' });
    }
});

/**
 * GET /api/employee-expiry/export
 * Export expiry records to Excel. Main manager only.
 */
router.get('/export', requireMainManager, async (req, res) => {
    try {
        const branchId = req.query.branch_id ? parseInt(req.query.branch_id) : undefined;
        const expiryType = req.query.expiry_type || undefined;
        const statusBucket = req.query.status_bucket || undefined;

        const result = await getEmployeeExpiries({ branchId, expiryType, statusBucket, limit: 10000 });

        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('تواريخ منتهية');

        worksheet.views = [{ rightToLeft: true }];

        worksheet.columns = [
            { header: 'رقم الموظف', key: 'employee_id_number', width: 15 },
            { header: 'الاسم', key: 'full_name', width: 30 },
            { header: 'رقم الهوية/الإقامة', key: 'id_or_residency_number', width: 20 },
            { header: 'الفرع', key: 'branch_name', width: 25 },
            { header: 'نوع التاريخ', key: 'expiry_type_label', width: 25 },
            { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 15 },
            { header: 'تاريخ الانتهاء هجري', key: 'expiry_date_hijri', width: 18 },
            { header: 'الأيام المتبقية', key: 'days_until_expiry', width: 15 },
            { header: 'الحالة', key: 'status_label', width: 18 },
        ];

        const statusLabels = {
            expired: 'منتهي',
            within_30_days: 'خلال 30 يوم',
            within_90_days: 'خلال 90 يوم',
            ok: 'ساري',
        };

        result.data.forEach(row => {
            worksheet.addRow({
                employee_id_number: row.employee_id_number || '',
                full_name: [row.first_name, row.second_name, row.third_name, row.fourth_name].filter(Boolean).join(' '),
                id_or_residency_number: row.id_or_residency_number || '',
                branch_name: row.branch_name || '',
                expiry_type_label: row.expiry_type_label || '',
                expiry_date: row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('en-CA') : '',
                expiry_date_hijri: row.expiry_date_hijri || '',
                days_until_expiry: row.days_until_expiry,
                status_label: statusLabels[row.status_bucket] || row.status_bucket,
            });
        });

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 12, name: 'Arial' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textDirection: 'right-to-left' };
        headerRow.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        // RTL alignment for all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                cell.alignment = {
                    horizontal: rowNumber === 1 ? 'center' : 'right',
                    vertical: 'middle', wrapText: true, textDirection: 'right-to-left'
                };
            });
        });

        // Color-code status column
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const statusCell = row.getCell('status_label');
            const daysCell = row.getCell('days_until_expiry');
            const days = daysCell.value;
            if (days !== null && days !== undefined) {
                if (days < 0) {
                    statusCell.font = { color: { argb: 'FFFF0000' }, bold: true };
                } else if (days <= 30) {
                    statusCell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                } else if (days <= 90) {
                    statusCell.font = { color: { argb: 'FFCCAA00' } };
                }
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="employee-expiry-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        log.error('Error exporting expiry report', { error: error.message });
        res.status(500).json({ success: false, message: 'فشل تصدير التقرير' });
    }
});

/**
 * POST /api/employee-expiry/notify-branches
 * Send expiry alert notifications to selected branches.
 * Main manager only.
 * Body: { branch_ids: [1, 2], message?: string }
 */
router.post('/notify-branches', requireMainManager, async (req, res) => {
    try {
        let { branch_ids, message } = req.body;

        if (!Array.isArray(branch_ids) || branch_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'يجب اختيار فرع واحد على الأقل' });
        }

        branch_ids = branch_ids.map(id => parseInt(id)).filter(id => !isNaN(id));

        // Get branch info
        const branches = await sql`
      SELECT id, branch_name, email
      FROM branches
      WHERE id = ANY(${branch_ids}) AND is_active = true
    `;

        if (branches.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم العثور على فروع نشطة' });
        }

        // Get expiry counts per branch
        const results = [];
        const appUrl = process.env.APP_URL || 'http://localhost:5173';

        for (const branch of branches) {
            const summary = await getExpirySummary({ branchId: branch.id });
            const expiredCount = summary.totals.expired || 0;
            const expiringSoonCount = summary.totals.within_30_days || 0;

            if (expiredCount === 0 && expiringSoonCount === 0) {
                results.push({ branch_id: branch.id, branch_name: branch.branch_name, status: 'skipped', reason: 'لا توجد تواريخ منتهية' });
                continue;
            }

            const emailMessage = message || `يوجد لديكم ${expiredCount} تاريخ منتهي و ${expiringSoonCount} تاريخ ينتهي خلال 30 يوم. يرجى تحديث البيانات.`;

            // Send email to branch if it has an email
            if (branch.email) {
                try {
                    await sendNotificationEmail({
                        to: branch.email,
                        subject: `تنبيه: تواريخ موظفين منتهية - ${branch.branch_name}`,
                        message: emailMessage,
                        notificationType: 'expiry_alert',
                        appUrl: `${appUrl}/employee-expiry`,
                        data: {
                            'تواريخ منتهية': `${expiredCount}`,
                            'تنتهي خلال 30 يوم': `${expiringSoonCount}`,
                            'الفرع': branch.branch_name,
                        }
                    });
                } catch (emailError) {
                    log.error('Failed to send expiry alert email to branch', { branch_id: branch.id, error: emailError.message });
                }
            }

            results.push({ branch_id: branch.id, branch_name: branch.branch_name, status: 'sent', expired: expiredCount, expiring_soon: expiringSoonCount });
        }

        // Also notify main manager
        try {
            const mainManagerEmail = 'Sharaksa@gmail.com';
            const branchNames = branches.map(b => b.branch_name).join('، ');
            await sendNotificationEmail({
                to: mainManagerEmail,
                subject: 'تم إرسال تنبيهات التواريخ المنتهية للفروع',
                message: `تم إرسال تنبيهات التواريخ المنتهية للفروع التالية: ${branchNames}`,
                notificationType: 'expiry_alert_summary',
                appUrl: `${appUrl}/employee-expiry`,
                data: { 'عدد الفروع': `${results.filter(r => r.status === 'sent').length}` }
            });
        } catch (emailError) {
            log.error('Failed to send summary email to main manager', { error: emailError.message });
        }

        res.json({
            success: true,
            message: 'تم إرسال التنبيهات بنجاح',
            data: results,
        });
    } catch (error) {
        log.error('Error notifying branches about expiry', { error: error.message });
        res.status(500).json({ success: false, message: 'فشل إرسال التنبيهات' });
    }
});

/**
 * PUT /api/employee-expiry/update-date
 * Inline update for a specific expiry date field.
 * Body: { employee_id, expiry_type, new_date, new_date_hijri?, document_id? }
 */
router.put('/update-date', requireManager, async (req, res) => {
    try {
        const { employee_id, expiry_type, new_date, new_date_hijri, document_id } = req.body;

        if (!employee_id || !expiry_type || !new_date) {
            return res.status(400).json({ success: false, message: 'البيانات المطلوبة ناقصة' });
        }

        const empId = parseInt(employee_id);
        if (isNaN(empId)) {
            return res.status(400).json({ success: false, message: 'معرف الموظف غير صحيح' });
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(new_date)) {
            return res.status(400).json({ success: false, message: 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)' });
        }

        // Validate branch access for branch managers
        if (req.user.role === 'branch_manager') {
            const [emp] = await sql`SELECT branch_id FROM employees WHERE id = ${empId}`;
            if (!emp || emp.branch_id !== req.user.branch_id) {
                return res.status(403).json({ success: false, message: 'لا يمكنك تعديل بيانات موظف من فرع آخر' });
            }
        }

        let updated;

        switch (expiry_type) {
            case 'id_expiry':
                [updated] = await sql`
          UPDATE employees
          SET id_expiry_date_gregorian = ${new_date},
              id_expiry_date_hijri = ${new_date_hijri || null},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${empId}
          RETURNING id, id_expiry_date_gregorian, id_expiry_date_hijri
        `;
                break;

            case 'contract_end':
                [updated] = await sql`
          UPDATE employees
          SET contract_end_date_gregorian = ${new_date},
              contract_end_date_hijri = ${new_date_hijri || null},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${empId}
          RETURNING id, contract_end_date_gregorian, contract_end_date_hijri
        `;
                break;

            case 'passport_expiry':
                [updated] = await sql`
          UPDATE employees
          SET passport_expiry_date = ${new_date},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${empId}
          RETURNING id, passport_expiry_date
        `;
                break;

            case 'document_expiry':
                if (!document_id) {
                    return res.status(400).json({ success: false, message: 'معرف المستند مطلوب لتحديث تاريخ المستند' });
                }
                [updated] = await sql`
          UPDATE employee_documents
          SET expiry_date = ${new_date},
              expiry_date_hijri = ${new_date_hijri || null},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${parseInt(document_id)} AND employee_id = ${empId}
          RETURNING id, expiry_date, expiry_date_hijri
        `;
                break;

            default:
                return res.status(400).json({ success: false, message: 'نوع التاريخ غير صحيح' });
        }

        if (!updated) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على السجل' });
        }

        res.json({
            success: true,
            message: 'تم تحديث التاريخ بنجاح',
            data: updated,
        });
    } catch (error) {
        log.error('Error updating expiry date', { error: error.message });
        res.status(500).json({ success: false, message: 'فشل تحديث التاريخ' });
    }
});

export default router;

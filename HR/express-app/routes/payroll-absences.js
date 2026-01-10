/**
 * Payroll Absence Routes
 * Branch: countdown/entry/view flows
 * Admin: cycles overview, reopen, export
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireManager, requireMainManager } from '../middleware/authorization.js';
import { PayrollAbsence } from '../models/PayrollAbsence.js';

const router = express.Router();
router.use(authenticate);

// Branch - get current state
router.get('/branch/state', requireManager, async (req, res) => {
  try {
    const branchId = req.user.role === 'branch_manager'
      ? req.user.branch_id
      : parseInt(req.query.branch_id || req.user.branch_id, 10);

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'معرف الفرع مفقود' });
    }

    const cycleId = req.query.cycle_id ? parseInt(req.query.cycle_id, 10) : null;
    const data = await PayrollAbsence.getBranchState(branchId, { cycleId });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting branch absence state:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل جلب حالة الغياب',
      error: error.message
    });
  }
});

// Branch - submit absences
router.post('/branch/submit', requireManager, async (req, res) => {
  try {
    const branchId = req.user.role === 'branch_manager'
      ? req.user.branch_id
      : parseInt(req.body.branch_id || req.user.branch_id, 10);

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'معرف الفرع مفقود' });
    }

    const result = await PayrollAbsence.submitBranchAbsences(branchId, req.user.id, {
      entries: req.body.entries || [],
      cycle_id: req.body.cycle_id,
      note: req.body.note
    });

    return res.json({
      success: true,
      message: 'تم حفظ بيانات الغياب بنجاح. لن يمكن تعديلها بعد الحفظ.',
      data: result
    });
  } catch (error) {
    console.error('Error submitting branch absences:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'فشل حفظ بيانات الغياب'
    });
  }
});

// Admin - list cycles
router.get('/admin/cycles', requireMainManager, async (req, res) => {
  try {
    const cycles = await PayrollAbsence.listCycles();
    return res.json({ success: true, data: cycles });
  } catch (error) {
    console.error('Error listing cycles:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل جلب الأشهر',
      error: error.message
    });
  }
});

// Admin - branches per cycle
router.get('/admin/cycles/:cycleId/branches', requireMainManager, async (req, res) => {
  try {
    const cycleId = parseInt(req.params.cycleId, 10);
    if (!cycleId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر غير صالح' });
    }
    const data = await PayrollAbsence.getBranchesForCycle(cycleId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting branches for cycle:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل جلب فروع الشهر',
      error: error.message
    });
  }
});

// Admin - branch detail entries for a cycle
router.get('/admin/cycles/:cycleId/branches/:branchId/entries', requireMainManager, async (req, res) => {
  try {
    const cycleId = parseInt(req.params.cycleId, 10);
    const branchId = parseInt(req.params.branchId, 10);
    if (!cycleId || !branchId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر أو الفرع غير صالح' });
    }
    const data = await PayrollAbsence.getBranchSubmissionDetail(cycleId, branchId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting branch submission detail:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل جلب تفاصيل الفرع',
      error: error.message
    });
  }
});

// Admin - manual reopen
router.post('/admin/reopen', requireMainManager, async (req, res) => {
  try {
    const { cycle_id: cycleId, branch_ids: branchIds, note, manual_expires_at: manualExpiresAt } = req.body;
    if (!cycleId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر مطلوب' });
    }
    await PayrollAbsence.reopenBranches(cycleId, branchIds || [], req.user.id, note, manualExpiresAt);
    return res.json({
      success: true,
      message: 'تم فتح الفرع/الفروع لإعادة الإدخال'
    });
  } catch (error) {
    console.error('Error reopening branches:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'فشل إعادة فتح الإدخال'
    });
  }
});

// Admin - reset cycle (clear submissions and return all to countdown)
router.post('/admin/reset', requireMainManager, async (req, res) => {
  try {
    const { cycle_id: cycleId } = req.body;
    if (!cycleId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر مطلوب' });
    }
    await PayrollAbsence.resetCycle(cycleId);
    return res.json({
      success: true,
      message: 'تمت إعادة تعيين الشهر وإرجاع جميع الفروع إلى العد التنازلي'
    });
  } catch (error) {
    console.error('Error resetting cycle:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'فشل إعادة تعيين الشهر'
    });
  }
});

// Admin - close windows manually
router.post('/admin/close', requireMainManager, async (req, res) => {
  try {
    const { cycle_id: cycleId, branch_ids: branchIds } = req.body;
    if (!cycleId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر مطلوب' });
    }
    await PayrollAbsence.closeBranches(cycleId, branchIds || []);
    return res.json({
      success: true,
      message: 'تم إغلاق الإدخال للفروع المحددة'
    });
  } catch (error) {
    console.error('Error closing branches:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'فشل إغلاق الإدخال'
    });
  }
});

// Admin - export Excel
router.post('/admin/export', requireMainManager, async (req, res) => {
  try {
    const { cycle_id: cycleId, branch_ids: branchIds } = req.body;
    if (!cycleId) {
      return res.status(400).json({ success: false, message: 'معرف الشهر مطلوب' });
    }

    const rows = await PayrollAbsence.getExportRows(cycleId, branchIds || []);
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('غيابات الفروع');

    sheet.columns = [
      { header: 'الفرع', key: 'branch_name', width: 25 },
      { header: 'نوع الفرع', key: 'branch_type', width: 15 },
      { header: 'اسم الموظف', key: 'full_name', width: 30 },
      { header: 'رقم الهوية', key: 'employee_id_number', width: 20 },
      { header: 'غياب بعذر', key: 'excused_absences', width: 15 },
      { header: 'غياب بدون عذر', key: 'unexcused_absences', width: 17 },
      { header: 'إجمالي الغياب', key: 'absences', width: 15 },
      { header: 'ملاحظات', key: 'notes', width: 30 },
      { header: 'رقم الحفظ', key: 'submission_number', width: 12 },
      { header: 'تاريخ الحفظ', key: 'submitted_at', width: 20 }
    ];

    // Format date as dd/mm/yyyy (Gregorian calendar only)
    const formatDateDDMMYYYY = (dateValue) => {
      if (!dateValue) return '';
      const date = new Date(dateValue);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    rows.forEach((row) => {
      sheet.addRow({
        branch_name: row.branch_name,
        branch_type: row.branch_type === 'school' ? 'مدرسة' : 'مركز',
        full_name: row.full_name,
        employee_id_number: row.employee_id_number,
        excused_absences: row.excused_absences ?? 0,
        unexcused_absences: row.unexcused_absences ?? 0,
        absences: row.absences,
        notes: row.notes || '',
        submission_number: row.submission_number || '',
        submitted_at: formatDateDDMMYYYY(row.submitted_at)
      });
    });

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: 'center' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="branch-absences.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting absences:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'فشل إنشاء ملف الإكسل'
    });
  }
});

export default router;

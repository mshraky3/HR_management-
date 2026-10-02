/**
 * Year-cycle routes (head office only)
 *   GET  /api/year-cycle/compliance?branch_type=   which branches finished the new-year update
 *   GET  /api/year-cycle/end-year-preview?branch_type=   what "end year" would change
 *   PUT  /api/year-cycle/deadline                  set / clear the review deadline of a year
 *   POST /api/year-cycle/remind                    in-app reminder to selected branches (no e-mail)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { getYearCycleCompliance, getEndYearPreview } from '../services/yearCycleService.js';
import { recordAudit, actorFromReq } from '../services/auditService.js';
import sql from '../config/database.js';

const router = express.Router();
router.use(authenticate);
router.use(requireMainManager);

const validType = (t) => (t === 'school' || t === 'healthcare_center' ? t : null);

router.get('/compliance', async (req, res) => {
  try {
    const data = await getYearCycleCompliance({ branchType: validType(req.query.branch_type) });
    res.json({ success: true, data });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب متابعة السنة الجديدة');
  }
});

router.get('/end-year-preview', async (req, res) => {
  try {
    const type = validType(req.query.branch_type);
    if (!type) return res.status(400).json({ success: false, message: 'نوع الفرع مطلوب' });
    res.json({ success: true, data: await getEndYearPreview(type) });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل حساب أثر إنهاء السنة');
  }
});

router.put('/deadline', async (req, res) => {
  try {
    const yearId = parseInt(req.body?.year_id, 10);
    const deadline = req.body?.review_deadline || null;
    if (!Number.isInteger(yearId)) return res.status(400).json({ success: false, message: 'السنة الدراسية مطلوبة' });
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))) {
      return res.status(400).json({ success: false, message: 'صيغة التاريخ غير صحيحة' });
    }
    const [row] = await sql`
      UPDATE academic_years SET review_deadline = ${deadline}, updated_at = NOW() WHERE id = ${yearId}
      RETURNING id, year_label, branch_type, review_deadline
    `;
    if (!row) return res.status(404).json({ success: false, message: 'السنة الدراسية غير موجودة' });
    await recordAudit({ entityType: 'academic_year', entityId: yearId, action: 'set_review_deadline', actor: actorFromReq(req), changes: { review_deadline: deadline } });
    res.json({ success: true, data: row });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل حفظ الموعد');
  }
});

const PENDING_LABELS = {
  review: 'اعتماد مراجعة موظفي السنة الجديدة',
  data: 'إكمال بيانات الموظفين',
  documents: 'رفع مستندات الفرع الناقصة',
  beneficiaries: 'اعتماد مراجعة المستفيدين',
  buses: 'ترحيل أو إدخال الباصات',
  activity: 'تسجيل الدخول ومتابعة المهام',
};

router.post('/remind', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.branch_ids) ? req.body.branch_ids.map((v) => parseInt(v, 10)).filter(Number.isInteger) : [];
    if (ids.length === 0 || ids.length > 100) {
      return res.status(400).json({ success: false, message: 'اختر من 1 إلى 100 فرع' });
    }
    const extra = String(req.body?.message || '').trim().slice(0, 500);

    const { branches } = await getYearCycleCompliance({});
    const byId = new Map(branches.map((b) => [b.id, b]));
    const createdBy = req.user.existsInDb ? req.user.id : null;
    let sent = 0;

    await sql.begin(async (tx) => {
      for (const id of ids) {
        const b = byId.get(id);
        if (!b || b.status === 'complete') continue;
        const pending = Object.entries(b.items)
          .filter(([key, item]) => item.applicable && !item.done && key !== 'activity')
          .map(([key]) => PENDING_LABELS[key]);
        if (pending.length === 0) continue;
        const message = [
          'تذكير من الإدارة: لم يكتمل تحديث بيانات السنة الجديدة في فرعكم.',
          `المطلوب: ${pending.join('، ')}.`,
          extra,
          'افتحوا لوحة التحكم لمتابعة المهام خطوة بخطوة.',
        ].filter(Boolean).join('\n');
        const [n] = await tx`
          INSERT INTO notifications (message, importance_level, created_by, is_active, expires_at)
          VALUES (${message}, 3, ${createdBy}, true, NOW() + INTERVAL '10 days')
          RETURNING id
        `;
        await tx`INSERT INTO notification_branches (notification_id, branch_id) VALUES (${n.id}, ${id})`;
        sent += 1;
      }
    });

    await recordAudit({ entityType: 'year_cycle', entityId: null, action: 'remind', actor: actorFromReq(req), changes: { requested: ids.length, sent } });
    res.json({ success: true, data: { sent, skipped: ids.length - sent } });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل إرسال التذكير');
  }
});

export default router;

/**
 * Task routes
 *   GET  /api/tasks/my               what a branch still has to do (computed server-side)
 *   GET  /api/tasks/manual           tasks assigned by the head office (main manager)
 *   POST /api/tasks/manual           assign a task to some or all branches (main manager)
 *   PUT  /api/tasks/manual/:id/done  mark an assigned task done (the branch or the head office)
 *   DELETE /api/tasks/manual/:id     withdraw an assigned task (main manager)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAnyManager, requireMainManager } from '../middleware/authorization.js';
import { resolveBranchAccessFromScope } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { buildBranchTasks } from '../services/taskEngine.js';
import { recordAudit, actorFromReq } from '../services/auditService.js';
import sql from '../config/database.js';

const router = express.Router();
router.use(authenticate);

router.get('/my', requireAnyManager, async (req, res) => {
  try {
    const requested = req.query.branch_id;
    const access = resolveBranchAccessFromScope(req.scope, requested); // policy-scope:allow-direct
    if (!access.allowed) {
      return res.status(access.reason === 'invalid_branch_id' ? 400 : 403).json({
        success: false,
        message: access.reason === 'invalid_branch_id' ? 'حدد الفرع' : 'تم رفض الوصول إلى هذا الفرع',
      });
    }
    const data = await buildBranchTasks(access.effectiveBranchId);
    if (!data) return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
    res.json({ success: true, data });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب المهام');
  }
});

router.get('/manual', requireMainManager, async (req, res) => {
  try {
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : null;
    const rows = await sql`
      SELECT t.id, t.branch_id, b.branch_name, t.title, t.description, t.due_date, t.deep_link, t.status, t.created_at, t.completed_at
      FROM branch_tasks t JOIN branches b ON b.id = t.branch_id
      WHERE t.status <> 'dismissed' ${branchId ? sql`AND t.branch_id = ${branchId}` : sql``}
      ORDER BY (t.status = 'open') DESC, t.due_date NULLS LAST, t.created_at DESC
      LIMIT 500
    `;
    res.json({ success: true, data: rows });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب المهام المسندة');
  }
});

router.post('/manual', requireMainManager, async (req, res) => {
  try {
    const { branch_ids: branchIds, branch_type: branchType, title, description, due_date: dueDate, deep_link: deepLink } = req.body || {};
    const cleanTitle = String(title || '').trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 200) {
      return res.status(400).json({ success: false, message: 'عنوان المهمة مطلوب (3 إلى 200 حرف)' });
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
      return res.status(400).json({ success: false, message: 'صيغة تاريخ الاستحقاق غير صحيحة' });
    }
    if (deepLink && !/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(String(deepLink))) {
      return res.status(400).json({ success: false, message: 'الرابط يجب أن يكون مساراً داخل النظام (مثل /employees)' });
    }

    let targets;
    if (Array.isArray(branchIds) && branchIds.length > 0) {
      targets = await sql`SELECT id FROM branches WHERE is_active = true AND id = ANY(${branchIds.map((v) => parseInt(v, 10)).filter(Number.isInteger)}::int[])`;
    } else if (branchType === 'school' || branchType === 'healthcare_center') {
      targets = await sql`SELECT id FROM branches WHERE is_active = true AND branch_type = ${branchType}`;
    } else if (branchType === 'all') {
      targets = await sql`SELECT id FROM branches WHERE is_active = true`;
    } else {
      return res.status(400).json({ success: false, message: 'اختر الفروع المستهدفة' });
    }
    if (targets.length === 0) return res.status(400).json({ success: false, message: 'لا توجد فروع مطابقة' });

    const createdBy = req.user.existsInDb ? req.user.id : null;
    await sql.begin(async (tx) => {
      for (const t of targets) {
        await tx`
          INSERT INTO branch_tasks (branch_id, title, description, due_date, deep_link, created_by)
          VALUES (${t.id}, ${cleanTitle}, ${description ? String(description).slice(0, 1000) : null}, ${dueDate || null}, ${deepLink || null}, ${createdBy})
        `;
      }
    });
    await recordAudit({
      entityType: 'branch_task', entityId: null, action: 'assign', actor: actorFromReq(req),
      changes: { title: cleanTitle, branches: targets.length, due_date: dueDate || null },
    });
    res.status(201).json({ success: true, data: { created: targets.length } });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل إسناد المهمة');
  }
});

router.put('/manual/:id/done', requireAnyManager, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [task] = await sql`SELECT id, branch_id FROM branch_tasks WHERE id = ${id}`;
    if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });
    if (req.user.role === 'branch_manager' && task.branch_id !== Number(req.user.branch_id)) {
      return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
    }
    if (req.user.role === 'branch_operations_manager') {
      return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
    }
    await sql`
      UPDATE branch_tasks SET status = 'done', completed_at = NOW(), completed_by_branch = ${req.user.role === 'branch_manager'}
      WHERE id = ${id}
    `;
    res.json({ success: true });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل تحديث المهمة');
  }
});

router.delete('/manual/:id', requireMainManager, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await sql`UPDATE branch_tasks SET status = 'dismissed' WHERE id = ${id} RETURNING id`;
    if (!row) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });
    res.json({ success: true });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل سحب المهمة');
  }
});

export default router;

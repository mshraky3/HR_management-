/**
 * Treatment Plans Routes
 * Public submission endpoints + authenticated admin endpoints
 * for collecting therapeutic/educational plans from healthcare employees
 */

import express from 'express';
import sql from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { uploadDocxSingle, validateDocxFile } from '../middleware/upload.js';
import TreatmentPlan from '../models/TreatmentPlan.js';
import {
    uploadTreatmentPlanToBlob,
    fetchBlobWithFallback,
} from '../utils/blobStorage.js';
import { sendErrorNotification } from '../utils/errorNotificationService.js';

const router = express.Router();

// =============================================
// PUBLIC ENDPOINTS (no authentication required)
// =============================================

/**
 * Get active healthcare branches (public)
 * GET /api/treatment-plans/branches
 */
router.get('/branches', async (req, res) => {
    try {
        const branches = await sql`
      SELECT id, branch_name
      FROM branches
      WHERE is_active = true AND branch_type = 'healthcare_center'
      ORDER BY branch_name
    `;
        res.json({ success: true, data: branches });
    } catch (error) {
        console.error('Error fetching healthcare branches:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: '/api/treatment-plans/branches',
            method: 'GET',
            statusCode: 500,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الفروع',
            error: error.message
        });
    }
});

/**
 * Submit a treatment plan (public, no auth)
 * POST /api/treatment-plans/submit
 */
router.post('/submit', (req, res, next) => {
    uploadDocxSingle(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'خطأ في رفع الملف'
            });
        }
        next();
    });
}, validateDocxFile, async (req, res) => {
    try {
        const { employee_name, branch_id, job_title, department, plan_type, notes } = req.body;

        // Validate required fields
        if (!employee_name || !branch_id || !job_title || !department || !plan_type) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب أن تكون موجودة'
            });
        }

        // Validate branch exists and is healthcare
        const [branch] = await sql`
      SELECT id, branch_name, branch_type
      FROM branches
      WHERE id = ${parseInt(branch_id)} AND is_active = true AND branch_type = 'healthcare_center'
    `;
        if (!branch) {
            return res.status(400).json({
                success: false,
                message: 'الفرع غير موجود أو غير فعال'
            });
        }

        // Upload file to Blob + R2
        const file = req.file;
        const { url: fileUrl, r2Url } = await uploadTreatmentPlanToBlob(
            file.buffer,
            file.originalname,
            file.mimetype,
            parseInt(branch_id)
        );

        // Create DB record
        const plan = await TreatmentPlan.create({
            employee_name: employee_name.trim(),
            branch_id: parseInt(branch_id),
            job_title,
            department,
            plan_type,
            file_url: fileUrl,
            r2_url: r2Url,
            original_filename: file.originalname,
            file_size: file.size,
            notes: notes || null
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الخطة بنجاح',
            data: { id: plan.id }
        });
    } catch (error) {
        console.error('Error submitting treatment plan:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_SUBMIT_ERROR',
            message: error.message,
            endpoint: '/api/treatment-plans/submit',
            method: 'POST',
            statusCode: 500,
            additionalInfo: {
                employee_name: req.body?.employee_name,
                branch_id: req.body?.branch_id,
                job_title: req.body?.job_title,
                plan_type: req.body?.plan_type,
                file_name: req.file?.originalname,
                file_size: req.file?.size,
            },
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال الخطة',
            error: error.message
        });
    }
});

// =============================================
// PROTECTED ENDPOINTS (authentication required)
// =============================================

/**
 * Get all treatment plans (with filters)
 * GET /api/treatment-plans
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { branch_id, job_title, department, status } = req.query;
        const filters = {};

        // Branch managers only see their own branch
        if (req.user.role === 'branch_manager') {
            filters.branch_id = req.user.branch_id;
        } else if (branch_id) {
            filters.branch_id = parseInt(branch_id);
        }

        if (job_title) filters.job_title = job_title;
        if (department) filters.department = department;
        if (status) filters.status = status;

        const plans = await TreatmentPlan.findAll(filters);

        res.json({ success: true, data: plans });
    } catch (error) {
        console.error('Error fetching treatment plans:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: '/api/treatment-plans',
            method: 'GET',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الخطط',
            error: error.message
        });
    }
});

/**
 * Get treatment plan statistics
 * GET /api/treatment-plans/stats
 */
router.get('/stats', authenticate, requireMainManager, async (req, res) => {
    try {
        const stats = await TreatmentPlan.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching treatment plan stats:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: '/api/treatment-plans/stats',
            method: 'GET',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الإحصائيات',
            error: error.message
        });
    }
});

/**
 * Download treatment plan file
 * GET /api/treatment-plans/:id/download
 */
router.get('/:id/download', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'معرف غير صحيح' });
        }

        const plan = await TreatmentPlan.findById(id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'الخطة غير موجودة' });
        }

        // Branch managers can only download from their branch
        if (req.user.role === 'branch_manager' && req.user.branch_id !== plan.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح لك' });
        }

        if (!plan.file_url) {
            return res.status(404).json({ success: false, message: 'الملف غير موجود' });
        }

        const { buffer, contentType } = await fetchBlobWithFallback(plan.file_url, plan.r2_url);

        const safeFilename = (plan.original_filename || 'plan.docx')
            .replace(/[\x00-\x1F\x7F-\x9F\r\n]/g, '');

        res.setHeader('Content-Type', contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
        return res.send(buffer);
    } catch (error) {
        console.error('Error downloading treatment plan:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_DOWNLOAD_ERROR',
            message: error.message,
            endpoint: `/api/treatment-plans/${req.params.id}/download`,
            method: 'GET',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل تحميل الملف',
            error: error.message
        });
    }
});

/**
 * Review/update treatment plan status
 * PUT /api/treatment-plans/:id/review
 */
router.put('/:id/review', authenticate, requireMainManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'معرف غير صحيح' });
        }

        const { status, review_notes } = req.body;
        if (!status || !['reviewed', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'حالة غير صحيحة'
            });
        }

        const existing = await TreatmentPlan.findById(id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'الخطة غير موجودة' });
        }

        const plan = await TreatmentPlan.updateStatus(id, status, req.user.id, review_notes);

        res.json({
            success: true,
            message: 'تم تحديث حالة الخطة بنجاح',
            data: plan
        });
    } catch (error) {
        console.error('Error reviewing treatment plan:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: `/api/treatment-plans/${req.params.id}/review`,
            method: 'PUT',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث حالة الخطة',
            error: error.message
        });
    }
});

/**
 * Get treatment plan by ID
 * GET /api/treatment-plans/:id
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'معرف غير صحيح' });
        }

        const plan = await TreatmentPlan.findById(id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'الخطة غير موجودة' });
        }

        // Branch managers can only see their branch
        if (req.user.role === 'branch_manager' && req.user.branch_id !== plan.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح لك' });
        }

        res.json({ success: true, data: plan });
    } catch (error) {
        console.error('Error fetching treatment plan:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: `/api/treatment-plans/${req.params.id}`,
            method: 'GET',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الخطة',
            error: error.message
        });
    }
});

/**
 * Delete treatment plan
 * DELETE /api/treatment-plans/:id
 */
router.delete('/:id', authenticate, requireMainManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'معرف غير صحيح' });
        }

        const existing = await TreatmentPlan.findById(id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'الخطة غير موجودة' });
        }

        await TreatmentPlan.delete(id);

        res.json({
            success: true,
            message: 'تم حذف الخطة بنجاح'
        });
    } catch (error) {
        console.error('Error deleting treatment plan:', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_ERROR',
            message: error.message,
            endpoint: `/api/treatment-plans/${req.params.id}`,
            method: 'DELETE',
            statusCode: 500,
            userId: req.user?.id,
            username: req.user?.username,
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        res.status(500).json({
            success: false,
            message: 'فشل في حذف الخطة',
            error: error.message
        });
    }
});

export default router;

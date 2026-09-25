/**
 * Treatment Plans Routes
 * Public submission endpoints + authenticated admin endpoints
 * for collecting therapeutic/educational plans from healthcare employees
 */

import express from 'express';
import sql from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, requireManager } from '../middleware/authorization.js';
import { uploadDocxSingle, validateDocxFile } from '../middleware/upload.js';
import TreatmentPlan from '../models/TreatmentPlan.js';
import {
    uploadTreatmentPlanToBlob,
    fetchBlobWithFallback,
} from '../utils/blobStorage.js';
import { sendErrorNotification } from '../utils/errorNotificationService.js';
import { handleUpload } from '@vercel/blob/client';
import { getBlobToken } from '../config/blobStorage.js';
import { uploadToR2Mirror, mirrorVercelFileToR2 } from '../utils/dualStorage.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';
import { randomUUID } from 'crypto';
import { generateFileName } from '../utils/fileUpload.js';
import { MAX_API_UPLOAD_BYTES } from '../middleware/upload.js';
import {
    presignR2Put,
    presignR2Get,
    headR2Object,
    readR2Prefix,
    deleteFromR2,
    r2PublicUrlForKey,
    extractKeyFromR2Url,
    isR2StorageConfigured,
} from '../utils/r2Storage.js';

const router = express.Router();

const normalizeUploadedFilename = (filename) => {
    if (!filename || typeof filename !== 'string') return filename;

    const looksMojibake = /[ØÙÃÂÐ]/.test(filename) || /[\x80-\x9F]/.test(filename);
    if (!looksMojibake) return filename;

    try {
        const fixed = Buffer.from(filename, 'latin1').toString('utf8').trim();
        if (!fixed || fixed.includes('�')) return filename;
        return fixed;
    } catch {
        return filename;
    }
};

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
        log.error('Error fetching healthcare branches:', error);
        handleRouteError(error, req, res, 'فشل في جلب الفروع');
    }
});

// ============================================================================
// Direct R2 uploads for the public submission form. The Vercel Blob store is
// blocked (over its free quota), so files go browser -> R2 with a signed URL
// and /submit-direct references them by key.
// ============================================================================

const TREATMENT_PLAN_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf',
];
const MAX_TREATMENT_PLAN_BYTES = 100 * 1024 * 1024;
const TREATMENT_PLAN_SIGNATURES = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b, 0x03, 0x04], // zip
    'application/msword': [0xd0, 0xcf, 0x11, 0xe0], // OLE2
};

const findHealthcareBranch = async (branchId) => {
    const [branch] = await sql`
      SELECT id FROM branches
      WHERE id = ${parseInt(branchId)} AND is_active = true AND branch_type = 'healthcare_center'
    `;
    return branch || null;
};

/**
 * Signed URL for uploading one treatment plan file straight to R2 (public, no auth)
 * POST /api/treatment-plans/upload-url
 * Body: branch_id, file_name, content_type, size
 */
router.post('/upload-url', async (req, res) => {
    try {
        const { branch_id, file_name, content_type, size } = req.body || {};
        if (!branch_id || !content_type) {
            return res.status(400).json({ success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' });
        }
        if (!TREATMENT_PLAN_TYPES.includes(content_type)) {
            return res.status(400).json({ success: false, message: 'نوع الملف غير مسموح به. يُسمح بملفات Word و PDF فقط' });
        }
        if (Number(size) > MAX_TREATMENT_PLAN_BYTES) {
            return res.status(400).json({ success: false, message: 'حجم الملف يتجاوز الحد الأقصى (100 ميجابايت)' });
        }
        if (!(await findHealthcareBranch(branch_id))) {
            return res.status(400).json({ success: false, message: 'الفرع غير موجود أو غير فعال' });
        }
        const key = `treatment-plans/${parseInt(branch_id)}/${randomUUID().slice(0, 8)}_${generateFileName(file_name || 'plan')}`;
        const uploadUrl = await presignR2Put(key, content_type);
        return res.json({ success: true, data: { upload_url: uploadUrl, key } });
    } catch (error) {
        log.error('Error creating treatment plan upload URL:', error);
        handleRouteError(error, req, res, 'فشل تجهيز رفع الملف');
    }
});

/**
 * Client upload token exchange (public, no auth)
 * Handles the Vercel Blob client upload protocol
 * POST /api/treatment-plans/client-upload
 */
router.post('/client-upload', async (req, res) => {
    try {
        const jsonResponse = await handleUpload({
            body: req.body,
            request: req,
            token: getBlobToken(),
            onBeforeGenerateToken: async (pathname) => {
                return {
                    allowedContentTypes: [
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/msword',
                        'application/pdf',
                    ],
                    maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
                    addRandomSuffix: false,
                };
            },
            onUploadCompleted: async ({ blob }) => {
                log.info('Client upload completed:', blob.pathname);
            },
        });
        return res.json(jsonResponse);
    } catch (error) {
        log.error('Client upload token error:', error);
        return res.status(400).json({ error: error.message });
    }
});

/**
 * Submit a treatment plan with pre-uploaded blob URL (public, no auth)
 * POST /api/treatment-plans/submit-direct
 */
router.post('/submit-direct', async (req, res) => {
    try {
        const { employee_name, branch_id, job_title, department, plan_type, notes, file_key, original_filename } = req.body;
        let { file_url, file_size } = req.body;

        // Validate required fields
        if (!employee_name || !branch_id || !job_title || !department || !plan_type || !(file_url || file_key) || !original_filename) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب أن تكون موجودة'
            });
        }

        // New uploads reference an R2 key from /upload-url; older clients send a Blob URL.
        let uploadedToR2 = false;
        if (file_key) {
            const prefix = `treatment-plans/${parseInt(branch_id)}/`;
            if (typeof file_key !== 'string' || !file_key.startsWith(prefix) || file_key.includes('..')) {
                return res.status(400).json({ success: false, message: 'رابط الملف غير صالح' });
            }
            const head = await headR2Object(file_key);
            if (!head) {
                return res.status(400).json({ success: false, message: 'لم يكتمل رفع الملف. الرجاء المحاولة مرة أخرى.' });
            }
            const signature = TREATMENT_PLAN_SIGNATURES[head.contentType];
            const firstBytes = await readR2Prefix(file_key, 8);
            if (!signature || !signature.every((b, i) => firstBytes[i] === b) || head.size > MAX_TREATMENT_PLAN_BYTES) {
                await deleteFromR2(r2PublicUrlForKey(file_key));
                return res.status(400).json({ success: false, message: 'نوع الملف غير مسموح به. يُسمح بملفات Word و PDF فقط' });
            }
            file_url = r2PublicUrlForKey(file_key);
            file_size = head.size;
            uploadedToR2 = true;
        } else if (!file_url.startsWith('https://') || !file_url.includes('.public.blob.vercel-storage.com/')) {
            return res.status(400).json({
                success: false,
                message: 'رابط الملف غير صالح'
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

        const normalizedFilename = normalizeUploadedFilename(original_filename);

        // R2 mirroring - best effort, skip for large files to avoid timeout
        let r2Url = uploadedToR2 ? file_url : null;
        const MAX_R2_MIRROR_SIZE = 20 * 1024 * 1024; // 20MB
        if (!uploadedToR2 && file_size && file_size <= MAX_R2_MIRROR_SIZE) {
            try {
                const blobPathMatch = file_url.match(/treatment-plans\/.+$/);
                if (blobPathMatch) {
                    const response = await fetch(file_url);
                    if (response.ok) {
                        const buffer = Buffer.from(await response.arrayBuffer());
                        r2Url = await uploadToR2Mirror(
                            blobPathMatch[0],
                            buffer,
                            response.headers.get('content-type') || 'application/octet-stream'
                        );
                    }
                }
            } catch (r2Err) {
                log.error('R2 mirror failed for client upload:', r2Err.message);
            }
        }

        // Create DB record
        const plan = await TreatmentPlan.create({
            employee_name: employee_name.trim(),
            branch_id: parseInt(branch_id),
            job_title,
            department,
            plan_type,
            file_url,
            r2_url: r2Url,
            original_filename: normalizedFilename,
            file_size: file_size || 0,
            notes: notes || null
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الخطة بنجاح',
            data: { id: plan.id }
        });
    } catch (error) {
        log.error('Error submitting treatment plan (direct):', error);
        sendErrorNotification({
            errorType: 'TREATMENT_PLAN_SUBMIT_ERROR',
            message: error.message,
            endpoint: '/api/treatment-plans/submit-direct',
            method: 'POST',
            statusCode: 500,
            additionalInfo: {
                employee_name: req.body?.employee_name,
                branch_id: req.body?.branch_id,
                file_url: req.body?.file_url,
            },
            timestamp: new Date().toISOString(),
            source: 'BACKEND',
        }).catch(() => { });
        handleRouteError(error, req, res, 'فشل في إرسال الخطة');
    }
});

/**
 * Submit a treatment plan (public, no auth)
 * POST /api/treatment-plans/submit
 */
router.post('/submit', (req, res, next) => {
    uploadDocxSingle(req, res, (err) => {
        if (err) {
            let message = err.message || 'خطأ في رفع الملف';
            if (err.code === 'LIMIT_FILE_SIZE') {
                message = 'حجم الملف يتجاوز الحد الأقصى المسموح (10 ميجابايت)';
            }
            return res.status(400).json({
                success: false,
                message
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
        const originalFilename = normalizeUploadedFilename(file.originalname);
        const { url: fileUrl, r2Url } = await uploadTreatmentPlanToBlob(
            file.buffer,
            originalFilename,
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
            original_filename: originalFilename,
            file_size: file.size,
            notes: notes || null
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الخطة بنجاح',
            data: { id: plan.id }
        });
    } catch (error) {
        log.error('Error submitting treatment plan:', error);
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
        handleRouteError(error, req, res, 'فشل في إرسال الخطة');
    }
});

// =============================================
// PROTECTED ENDPOINTS (authentication required)
// =============================================

/**
 * Get all treatment plans (with filters)
 * GET /api/treatment-plans
 */
router.get('/', authenticate, requireManager, async (req, res) => {
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
        log.error('Error fetching treatment plans:', error);
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
        handleRouteError(error, req, res, 'فشل في جلب الخطط');
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
        log.error('Error fetching treatment plan stats:', error);
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
        handleRouteError(error, req, res, 'فشل في جلب الإحصائيات');
    }
});

/**
 * Download treatment plan file
 * GET /api/treatment-plans/:id/download
 */
router.get('/:id/download', authenticate, requireManager, async (req, res) => {
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

        // Files above the API limit cannot pass through the function (Vercel caps
        // responses at ~4.5 MB): give the browser a short-lived R2 link instead.
        const r2Key = plan.r2_url ? extractKeyFromR2Url(plan.r2_url) : null;
        if (r2Key && Number(plan.file_size) > MAX_API_UPLOAD_BYTES && isR2StorageConfigured()) {
            const directUrl = await presignR2Get(r2Key, {
                fileName: plan.original_filename || 'plan.docx',
                inline: false,
            });
            return res.json({ success: true, direct_url: directUrl });
        }

        const { buffer, contentType, source } = await fetchBlobWithFallback(plan.file_url, plan.r2_url);

        // Lazy migration: mirror to R2 on first Vercel hit
        if (source === 'vercel' && !plan.r2_url) {
          setImmediate(async () => {
            try {
              const r2Url = await mirrorVercelFileToR2(plan.file_url, buffer, contentType);
              if (r2Url) await sql`UPDATE treatment_plans SET r2_url = ${r2Url} WHERE id = ${plan.id}`;
            } catch (e) { /* non-blocking */ }
          });
        }

        const safeFilename = (plan.original_filename || 'plan.docx')
            .replace(/[\x00-\x1F\x7F-\x9F\r\n]/g, '');
        const encodedFilename = encodeURIComponent(safeFilename);

        res.setHeader('Content-Type', contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="plan.docx"; filename*=UTF-8''${encodedFilename}`);
        return res.send(buffer);
    } catch (error) {
        log.error('Error downloading treatment plan:', error);
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
        handleRouteError(error, req, res, 'فشل تحميل الملف');
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
        log.error('Error reviewing treatment plan:', error);
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
        handleRouteError(error, req, res, 'فشل في تحديث حالة الخطة');
    }
});

/**
 * Get treatment plan by ID
 * GET /api/treatment-plans/:id
 */
router.get('/:id', authenticate, requireManager, async (req, res) => {
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
        log.error('Error fetching treatment plan:', error);
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
        handleRouteError(error, req, res, 'فشل في جلب الخطة');
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
        log.error('Error deleting treatment plan:', error);
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
        handleRouteError(error, req, res, 'فشل في حذف الخطة');
    }
});

export default router;

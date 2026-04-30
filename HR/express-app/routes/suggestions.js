/**
 * Suggestions Routes
 * API endpoints for managing suggestions from branches
 */

import express from 'express';
import Suggestion from '../models/Suggestion.js';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, requireManager } from '../middleware/authorization.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { User } from '../models/User.js';
import { Branch } from '../models/Branch.js';
import { resolveBranchAccessFromScope } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get importance levels and status options (for dropdowns)
 * GET /api/suggestions/options
 */
router.get('/options', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                importanceLevels: Suggestion.getImportanceLevels(),
                statusOptions: Suggestion.getStatusOptions()
            }
        });
    } catch (error) {
        log.error('Error getting options:', error);
        handleRouteError(error, req, res, 'فشل في جلب الخيارات');
    }
});

/**
 * Get statistics (Main Manager only)
 * GET /api/suggestions/stats
 */
router.get('/stats', requireMainManager, async (req, res) => {
    try {
        const [byImportance, byStatus, byBranch, overall] = await Promise.all([
            Suggestion.getStatsByImportance(),
            Suggestion.getStatsByStatus(),
            Suggestion.getStatsByBranch(),
            Suggestion.getOverallStats()
        ]);

        res.json({
            success: true,
            data: {
                byImportance,
                byStatus,
                byBranch,
                overall
            }
        });
    } catch (error) {
        log.error('Error getting stats:', error);
        handleRouteError(error, req, res, 'فشل في جلب الإحصائيات');
    }
});

/**
 * Get all suggestions
 * GET /api/suggestions
 * Query params: branch_id, importance_level, status
 */
router.get('/', requireManager, async (req, res) => {
    try {
        const { branch_id, importance_level, status } = req.query;
        const filters = {};

        // Branch managers can only see their own branch's suggestions
        if (req.user.role === 'branch_manager') {
            filters.branch_id = req.user.branch_id;
        } else if (branch_id) {
            filters.branch_id = parseInt(branch_id);
        }

        if (importance_level) {
            filters.importance_level = importance_level;
        }

        if (status) {
            filters.status = status;
        }

        const suggestions = await Suggestion.findAll(filters);

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        log.error('Error getting suggestions:', error);
        handleRouteError(error, req, res, 'فشل في جلب الاقتراحات');
    }
});

/**
 * Get suggestion by ID
 * GET /api/suggestions/:id
 */
router.get('/:id', requireManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'معرف الاقتراح غير صحيح'
            });
        }

        const suggestion = await Suggestion.findById(id);
        if (!suggestion) {
            return res.status(404).json({
                success: false,
                message: 'الاقتراح غير موجود'
            });
        }

        // Branch managers can only see their own branch's suggestions
        if (req.user.role === 'branch_manager' && suggestion.branch_id !== req.user.branch_id) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بعرض هذا الاقتراح'
            });
        }

        res.json({
            success: true,
            data: suggestion
        });
    } catch (error) {
        log.error('Error getting suggestion:', error);
        handleRouteError(error, req, res, 'فشل في جلب الاقتراح');
    }
});

/**
 * Create new suggestion
 * POST /api/suggestions
 * Body: { suggestion_text, importance_level }
 */
router.post('/', requireManager, async (req, res) => {
    try {
        const { suggestion_text, importance_level } = req.body;

        // Validation
        if (!suggestion_text || suggestion_text.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'نص الاقتراح مطلوب'
            });
        }

        // Validate importance level
        const validLevels = Object.keys(Suggestion.getImportanceLevels());
        if (importance_level && !validLevels.includes(importance_level)) {
            return res.status(400).json({
                success: false,
                message: 'مستوى الأهمية غير صحيح'
            });
        }

        // Get branch_id from user (branch managers) or require it for main managers
        const requestedBranchId = req.user.role === 'branch_manager' ? req.user.branch_id : req.body.branch_id; // policy-scope:allow-direct
        const branchAccess = resolveBranchAccessFromScope(req.scope, requestedBranchId);
        if (!branchAccess.allowed) {
            return res.status(400).json({
                success: false,
                message: 'معرف الفرع مطلوب'
            });
        }
        const branch_id = branchAccess.effectiveBranchId;

        const suggestion = await Suggestion.create({
            branch_id,
            suggestion_text: suggestion_text.trim(),
            importance_level: importance_level || 'useful'
        });

        // Send email notification to main managers
        try {
            const branch = await Branch.findById(branch_id);
            const branchName = branch ? branch.branch_name : 'غير محدد';
            const managerName = req.user.full_name || req.user.username;
            const importanceLabel = Suggestion.getImportanceLevels()[importance_level || 'useful'];
            const mainManagerEmail = process.env.MAIN_MANAGER_EMAIL || 'Sharaksa@gmail.com';

            log.info('Sending suggestion email', {
                to: mainManagerEmail,
                branch: branchName,
                importance: importanceLabel
            });

            const emailResult = await sendNotificationEmail({
                to: mainManagerEmail,
                subject: `اقتراح جديد من ${branchName}`,
                message: `تم تلقي اقتراح جديد من ${managerName} بمستوى أهمية: ${importanceLabel}`,
                notificationType: 'new_suggestion',
                appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/suggestions`,
                data: {
                    'الفرع': branchName,
                    'المرسل': managerName,
                    'مستوى الأهمية': importanceLabel,
                    'الاقتراح': suggestion_text.substring(0, 100) + (suggestion_text.length > 100 ? '...' : '')
                }
            });

            log.info('Suggestion email result', { emailResult });
        } catch (emailError) {
            log.error('Error sending suggestion notification email:', emailError);
            // Don't fail the request if email fails
        }

        res.status(201).json({
            success: true,
            message: 'تم إضافة الاقتراح بنجاح',
            data: suggestion
        });
    } catch (error) {
        log.error('Error creating suggestion:', error);
        handleRouteError(error, req, res, 'فشل في إضافة الاقتراح');
    }
});

/**
 * Update suggestion
 * PUT /api/suggestions/:id
 * Body: { suggestion_text, importance_level, status, admin_notes }
 */
router.put('/:id', requireManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'معرف الاقتراح غير صحيح'
            });
        }

        const existingSuggestion = await Suggestion.findById(id);
        if (!existingSuggestion) {
            return res.status(404).json({
                success: false,
                message: 'الاقتراح غير موجود'
            });
        }

        const { suggestion_text, importance_level, status, admin_notes } = req.body;
        const updateData = {};

        // Branch managers can only update their own suggestions (text and importance only)
        if (req.user.role === 'branch_manager') {
            if (existingSuggestion.branch_id !== req.user.branch_id) {
                return res.status(403).json({
                    success: false,
                    message: 'غير مصرح لك بتعديل هذا الاقتراح'
                });
            }
            // Branch managers can only edit text and importance
            if (suggestion_text) updateData.suggestion_text = suggestion_text.trim();
            if (importance_level) {
                const validLevels = Object.keys(Suggestion.getImportanceLevels());
                if (!validLevels.includes(importance_level)) {
                    return res.status(400).json({
                        success: false,
                        message: 'مستوى الأهمية غير صحيح'
                    });
                }
                updateData.importance_level = importance_level;
            }
        } else {
            // Main managers can update everything
            if (suggestion_text) updateData.suggestion_text = suggestion_text.trim();
            if (importance_level) {
                const validLevels = Object.keys(Suggestion.getImportanceLevels());
                if (!validLevels.includes(importance_level)) {
                    return res.status(400).json({
                        success: false,
                        message: 'مستوى الأهمية غير صحيح'
                    });
                }
                updateData.importance_level = importance_level;
            }
            if (status) {
                const validStatuses = Object.keys(Suggestion.getStatusOptions());
                if (!validStatuses.includes(status)) {
                    return res.status(400).json({
                        success: false,
                        message: 'حالة الاقتراح غير صحيحة'
                    });
                }
                updateData.status = status;
            }
            if (admin_notes !== undefined) {
                updateData.admin_notes = admin_notes;
            }
        }

        const suggestion = await Suggestion.update(id, updateData);

        // Email branch when manager responds
        try {
            const branch = await Branch.findById(existingSuggestion.branch_id);
            if (branch && branch.email && (updateData.admin_notes || updateData.status)) {
                const statusMap = { 'pending': 'قيد المراجعة', 'reviewed': 'تمت المراجعة', 'implemented': 'تم التنفيذ', 'rejected': 'مرفوض' };
                await sendNotificationEmail({
                    to: branch.email,
                    subject: `تحديث على اقتراحكم`,
                    message: `تم تحديث حالة اقتراحكم إلى: ${statusMap[suggestion.status] || suggestion.status}`,
                    notificationType: 'branch_notification',
                    appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/suggestions`,
                    data: {
                        'ملاحظات الإدارة': suggestion.admin_notes || 'بدون ملاحظات',
                    }
                });
            }
        } catch (emailError) {
            log.error('Failed to send suggestion update email:', emailError);
        }

        res.json({
            success: true,
            message: 'تم تحديث الاقتراح بنجاح',
            data: suggestion
        });
    } catch (error) {
        log.error('Error updating suggestion:', error);
        handleRouteError(error, req, res, 'فشل في تحديث الاقتراح');
    }
});

/**
 * Delete suggestion
 * DELETE /api/suggestions/:id
 */
router.delete('/:id', requireManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'معرف الاقتراح غير صحيح'
            });
        }

        const existingSuggestion = await Suggestion.findById(id);
        if (!existingSuggestion) {
            return res.status(404).json({
                success: false,
                message: 'الاقتراح غير موجود'
            });
        }

        // Branch managers can only delete their own suggestions
        if (req.user.role === 'branch_manager' && existingSuggestion.branch_id !== req.user.branch_id) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بحذف هذا الاقتراح'
            });
        }

        await Suggestion.delete(id);

        res.json({
            success: true,
            message: 'تم حذف الاقتراح بنجاح'
        });
    } catch (error) {
        log.error('Error deleting suggestion:', error);
        handleRouteError(error, req, res, 'فشل في حذف الاقتراح');
    }
});

export default router;

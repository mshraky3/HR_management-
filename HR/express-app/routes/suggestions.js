/**
 * Suggestions Routes
 * API endpoints for managing suggestions from branches
 */

import express from 'express';
import Suggestion from '../models/Suggestion.js';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';

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
        console.error('Error getting options:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الخيارات',
            error: error.message
        });
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
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الإحصائيات',
            error: error.message
        });
    }
});

/**
 * Get all suggestions
 * GET /api/suggestions
 * Query params: branch_id, importance_level, status
 */
router.get('/', async (req, res) => {
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
        console.error('Error getting suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الاقتراحات',
            error: error.message
        });
    }
});

/**
 * Get suggestion by ID
 * GET /api/suggestions/:id
 */
router.get('/:id', async (req, res) => {
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
        console.error('Error getting suggestion:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الاقتراح',
            error: error.message
        });
    }
});

/**
 * Create new suggestion
 * POST /api/suggestions
 * Body: { suggestion_text, importance_level }
 */
router.post('/', async (req, res) => {
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
        let branch_id;
        if (req.user.role === 'branch_manager') {
            branch_id = req.user.branch_id;
        } else if (req.body.branch_id) {
            branch_id = parseInt(req.body.branch_id);
        } else {
            return res.status(400).json({
                success: false,
                message: 'معرف الفرع مطلوب'
            });
        }

        const suggestion = await Suggestion.create({
            branch_id,
            suggestion_text: suggestion_text.trim(),
            importance_level: importance_level || 'useful'
        });

        res.status(201).json({
            success: true,
            message: 'تم إضافة الاقتراح بنجاح',
            data: suggestion
        });
    } catch (error) {
        console.error('Error creating suggestion:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إضافة الاقتراح',
            error: error.message
        });
    }
});

/**
 * Update suggestion
 * PUT /api/suggestions/:id
 * Body: { suggestion_text, importance_level, status, admin_notes }
 */
router.put('/:id', async (req, res) => {
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

        res.json({
            success: true,
            message: 'تم تحديث الاقتراح بنجاح',
            data: suggestion
        });
    } catch (error) {
        console.error('Error updating suggestion:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث الاقتراح',
            error: error.message
        });
    }
});

/**
 * Delete suggestion
 * DELETE /api/suggestions/:id
 */
router.delete('/:id', async (req, res) => {
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
        console.error('Error deleting suggestion:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في حذف الاقتراح',
            error: error.message
        });
    }
});

export default router;

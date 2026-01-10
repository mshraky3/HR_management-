/**
 * Dashboard Routes
 * Lightweight summary endpoint for dashboard (cached)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import sql from '../config/database.js';
import { getCache, setCache } from '../utils/simpleCache.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/dashboard/summary
 * Query params: branch_id (optional)
 * - For branch managers, branch_id will be forced to their branch
 * - Returns simple aggregated metrics and a short list of incomplete employees
 */
router.get('/summary', async (req, res) => {
    try {
        // Branch scoping
        let branchId = null;
        if (req.user.role === 'branch_manager') {
            branchId = req.user.branch_id;
        } else if (req.query.branch_id) {
            const parsed = parseInt(req.query.branch_id);
            if (!isNaN(parsed)) branchId = parsed;
        }

        const cacheKey = `dashboard:summary:${branchId || 'all'}`;

        // Admin can force refresh
        const forceRefresh = req.query.force_refresh === 'true' && req.user.role === 'main_manager';

        if (!forceRefresh) {
            const cached = getCache(cacheKey);
            if (cached) {
                res.set('X-Cache', 'HIT');
                return res.json({ success: true, data: cached });
            }
        }

        // Build summary
        let totalEmployees = 0;
        let incompleteCount = 0;
        let incompleteEmployees = [];

        if (branchId) {
            const totalRes = await sql`SELECT COUNT(*)::int as total FROM employees WHERE branch_id = ${branchId} AND (status IS NULL OR status IN ('active','pending'))`;
            totalEmployees = parseInt(totalRes[0]?.total || 0, 10);
            const incompleteRes = await sql`SELECT COUNT(*)::int as incomplete_count FROM employees WHERE branch_id = ${branchId} AND (data_completion_status IS NULL OR data_completion_status != 'complete')`;
            incompleteCount = parseInt(incompleteRes[0]?.incomplete_count || 0, 10);

            // Small list of incomplete employees for quick preview
            incompleteEmployees = await sql`
        SELECT id, employee_id_number, branch_id, first_name, second_name, third_name, fourth_name, data_completion_status
        FROM employees
        WHERE branch_id = ${branchId}
        AND (data_completion_status IS NULL OR data_completion_status != 'complete')
        ORDER BY updated_at DESC
        LIMIT 10
      `;
        } else {
            // Global summary for main manager
            const totalRes = await sql`SELECT COUNT(*)::int as total FROM employees WHERE (status IS NULL OR status IN ('active','pending'))`;
            totalEmployees = parseInt(totalRes[0]?.total || 0, 10);
            const incompleteRes = await sql`SELECT COUNT(*)::int as incomplete_count FROM employees WHERE (data_completion_status IS NULL OR data_completion_status != 'complete')`;
            incompleteCount = parseInt(incompleteRes[0]?.incomplete_count || 0, 10);
            // For global view, don't return full lists (only counts)
            incompleteEmployees = [];
        }

        const completionPercentage = totalEmployees === 0 ? 100 : Math.round(((totalEmployees - incompleteCount) / totalEmployees) * 100);

        const result = {
            totalEmployees,
            incompleteCount,
            incompleteEmployees,
            completionPercentage,
            lastUpdated: new Date().toISOString()
        };

        // Cache for short period (10s)
        setCache(cacheKey, result, 10 * 1000);
        res.set('X-Cache', 'MISS');
        return res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error in dashboard summary:', error);
        res.status(500).json({ success: false, message: 'فشل جلب ملخص لوحة التحكم', error: error.message });
    }
});

export default router;

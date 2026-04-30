/**
 * Dashboard Routes
 * Lightweight summary endpoint for dashboard (cached)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import sql from '../config/database.js';
import { getCache, setCache } from '../utils/simpleCache.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

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
        if (req.scope?.access?.denied) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول إلى هذا الفرع'
            });
        }

        const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });
        const branchId = Array.isArray(scopedBranch)
            ? (scopedBranch[0] || null)
            : (scopedBranch || null);

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
            // Only count active employees (exclude pending and inactive)
            const totalRes = await sql`SELECT COUNT(*)::int as total FROM employees WHERE branch_id = ${branchId} AND (status IS NULL OR status = 'active')`;
            totalEmployees = parseInt(totalRes[0]?.total || 0, 10);
            const incompleteRes = await sql`SELECT COUNT(*)::int as incomplete_count FROM employees WHERE branch_id = ${branchId} AND (status IS NULL OR status = 'active') AND (data_completion_status IS NULL OR data_completion_status != 'complete')`;
            incompleteCount = parseInt(incompleteRes[0]?.incomplete_count || 0, 10);

            // All incomplete employees for this branch (used by task engine for accurate counts)
            incompleteEmployees = await sql`
        SELECT id, employee_id_number, branch_id, first_name, second_name, third_name, fourth_name, data_completion_status
        FROM employees
        WHERE branch_id = ${branchId}
        AND (status IS NULL OR status = 'active')
        AND (data_completion_status IS NULL OR data_completion_status != 'complete')
        ORDER BY updated_at DESC
      `;
        } else {
            // Global summary for main manager (only active employees)
            const totalRes = await sql`SELECT COUNT(*)::int as total FROM employees WHERE (status IS NULL OR status = 'active')`;
            totalEmployees = parseInt(totalRes[0]?.total || 0, 10);
            const incompleteRes = await sql`SELECT COUNT(*)::int as incomplete_count FROM employees WHERE (status IS NULL OR status = 'active') AND (data_completion_status IS NULL OR data_completion_status != 'complete')`;
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
        log.error('Error in dashboard summary:', error);
        handleRouteError(error, req, res, 'فشل جلب ملخص لوحة التحكم');
    }
});

export default router;

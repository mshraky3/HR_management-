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
            const totalRes = await sql`SELECT COUNT(*)::int as total FROM employees WHERE branch_id = ${branchId} AND (status IS NULL OR status IN ('active', 'pending'))`;
            totalEmployees = parseInt(totalRes[0]?.total || 0, 10);
            const incompleteRes = await sql`SELECT COUNT(*)::int as incomplete_count FROM employees WHERE branch_id = ${branchId} AND (status IS NULL OR status IN ('active', 'pending')) AND (data_completion_status IS NULL OR data_completion_status != 'complete')`;
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

/**
 * GET /api/dashboard/main-overview (head office)
 * Headcount, incomplete data, open requests, account alerts and recent departures in one light request.
 * Headcount everywhere = active + pending employees of active branches.
 */
router.get('/main-overview', async (req, res) => {
    try {
        if (req.user.role !== 'main_manager') {
            return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
        }
        const [counts] = await sql`
            SELECT
              (SELECT COUNT(*)::int FROM branches WHERE is_active = true) AS branches,
              (SELECT COUNT(*)::int FROM employees e JOIN branches b ON b.id = e.branch_id AND b.is_active = true
                 WHERE e.status IN ('active', 'pending') OR e.status IS NULL) AS employees,
              (SELECT COUNT(*)::int FROM employees e JOIN branches b ON b.id = e.branch_id AND b.is_active = true
                 WHERE (e.status IN ('active', 'pending') OR e.status IS NULL) AND e.data_completion_status IS DISTINCT FROM 'complete') AS incomplete_employees,
              (SELECT COUNT(*)::int FROM employees e JOIN branches b ON b.id = e.branch_id AND b.is_active = true
                 WHERE e.status = 'pending') AS pending_employees,
              (SELECT COUNT(*)::int FROM requests WHERE status = 'pending') AS pending_requests,
              (SELECT COUNT(*)::int FROM branches WHERE is_active = true AND locked_until > NOW())
                + (SELECT COUNT(*)::int FROM users WHERE is_active = true AND locked_until > NOW()) AS locked_accounts,
              (SELECT COUNT(*)::int FROM branches WHERE is_active = true AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '14 days')) AS inactive_branches
        `;
        const departures = await sql`
            SELECT e.id, e.first_name, e.second_name, e.third_name, e.fourth_name, b.branch_name,
                   h.to_status AS status, h.reason_text, h.last_working_day, h.created_at
            FROM employee_status_history h
            JOIN employees e ON e.id = h.employee_id
            LEFT JOIN branches b ON b.id = e.branch_id
            WHERE h.to_status NOT IN ('active', 'pending') AND h.created_at > NOW() - INTERVAL '30 days'
              AND h.source IS DISTINCT FROM 'branch_deactivated'
            ORDER BY h.created_at DESC
            LIMIT 8
        `;
        res.json({
            success: true,
            data: {
                ...counts,
                departures: departures.map((d) => ({
                    id: d.id,
                    name: [d.first_name, d.second_name, d.third_name, d.fourth_name].filter(Boolean).join(' '),
                    branch_name: d.branch_name,
                    status: d.status,
                    reason: d.reason_text,
                    last_working_day: d.last_working_day,
                    at: d.created_at,
                })),
            },
        });
    } catch (error) {
        handleRouteError(error, req, res, 'فشل جلب نظرة عامة للإدارة');
    }
});

export default router;

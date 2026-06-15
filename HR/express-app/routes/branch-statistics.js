/**
 * Branch Manager Statistics Routes
 * Statistics about branch manager activity
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, requireAnyManager, loadAssignedBranches } from '../middleware/authorization.js';
import sql from '../config/database.js';
import { calculateEmployeeCompletion } from '../utils/dataCompletionUtils.js';
import { formatDate } from '../utils/dateConverter.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { withDbRetry } from '../utils/dbRetry.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// All routes require authentication and manager role
router.use(authenticate);
router.use(requireAnyManager);
router.use(loadAssignedBranches);

/**
 * GET /api/branch-statistics
 * Get statistics for all branch managers
 */
router.get('/', async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    // Get first and last day of current month
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

    // Get all branches (including number_of_employees for accurate completion calculation)
    const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });
    let branches;
    if (Array.isArray(scopedBranch) && scopedBranch.length === 0) {
      return res.json({ success: true, data: [], period: { month: currentMonth, year: currentYear, first_day: firstDayOfMonth, last_day: lastDayOfMonth } });
    } else if (scopedBranch !== null && scopedBranch !== undefined) {
      const ids = Array.isArray(scopedBranch) ? scopedBranch : [scopedBranch];
      branches = await withDbRetry(() => sql`
        SELECT id, branch_name, branch_type, username, is_active, number_of_employees
        FROM branches
        WHERE is_active = true AND id = ANY(${ids}::int[])
        ORDER BY branch_name
      `, { label: 'branch-statistics:branches' });
    } else {
      branches = await withDbRetry(() => sql`
        SELECT id, branch_name, branch_type, username, is_active, number_of_employees
        FROM branches
        WHERE is_active = true
        ORDER BY branch_name
      `, { label: 'branch-statistics:branches' });
    }

    // If no branches, return early
    if (!branches || branches.length === 0) {
      return res.json({
        success: true,
        data: [],
        period: {
          month: currentMonth,
          year: currentYear,
          first_day: firstDayOfMonth,
          last_day: lastDayOfMonth
        }
      });
    }

    // Get statistics for each branch
    // Performance Optimization: Calculate date ranges once before the loop
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const branchIds = branches.map(b => b.id).filter(Boolean);

    // IMPORTANT: Avoid N-branches * N-queries fan-out.
    // For small DB instances, the previous approach can trigger Postgres OOM.
    // We aggregate per-branch in a few queries, then assemble the same response.
    const [
      loginDaysRows,
      employeeStatsRows,
      employeeUpdatesRows,
      documentUploadsRows,
      employeeCreationsRows,
      statusChangesRows,
      lastActivityRows,
      lastLoginRows,
      monthlyLoginRows
    ] = await withDbRetry(() => Promise.all([
      // 1. Login days this month
      sql`
        SELECT branch_id, COUNT(DISTINCT login_date)::int AS login_count
        FROM user_logins
        WHERE branch_id = ANY(${branchIds})
        AND login_date >= ${firstDayOfMonth}
        AND login_date <= ${lastDayOfMonth}
        GROUP BY branch_id
      `,
      // 2. Employee completion statistics
      sql`
        SELECT
          branch_id,
          COUNT(*)::int AS total_employees,
          COUNT(*) FILTER (WHERE data_completion_status = 'complete')::int AS complete_employees,
          COUNT(*) FILTER (WHERE data_completion_status = 'incomplete')::int AS incomplete_employees,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_employees,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_employees
        FROM employees
        WHERE branch_id = ANY(${branchIds})
        AND status IN ('active', 'pending')
        GROUP BY branch_id
      `,
      // 3a. Employee updates (last 30 days)
      sql`
        SELECT branch_id, COUNT(*)::int AS update_count
        FROM employees
        WHERE branch_id = ANY(${branchIds})
        AND updated_at >= ${thirtyDaysAgoStr}
        GROUP BY branch_id
      `,
      // 3b. Document uploads (last 30 days)
      sql`
        SELECT e.branch_id, COUNT(*)::int AS upload_count
        FROM employee_documents ed
        INNER JOIN employees e ON ed.employee_id = e.id
        WHERE e.branch_id = ANY(${branchIds})
        AND ed.uploaded_at >= ${thirtyDaysAgoStr}
        AND ed.is_active = true
        GROUP BY e.branch_id
      `,
      // 3c. Employee creations (last 30 days)
      sql`
        SELECT branch_id, COUNT(*)::int AS creation_count
        FROM employees
        WHERE branch_id = ANY(${branchIds})
        AND created_at >= ${thirtyDaysAgoStr}
        GROUP BY branch_id
      `,
      // 3d. Status changes (last 30 days)
      sql`
        SELECT branch_id, COUNT(*)::int AS status_change_count
        FROM employees
        WHERE branch_id = ANY(${branchIds})
        AND status_changed_at IS NOT NULL
        AND status_changed_at >= ${thirtyDaysAgoStr}
        GROUP BY branch_id
      `,
      // 4. Last activity date per branch (employees + documents)
      sql`
        WITH emp AS (
          SELECT
            branch_id,
            MAX(updated_at) AS max_updated_at,
            MAX(created_at) AS max_created_at,
            MAX(status_changed_at) AS max_status_changed_at
          FROM employees
          WHERE branch_id = ANY(${branchIds})
          GROUP BY branch_id
        ),
        docs AS (
          SELECT
            e.branch_id,
            MAX(ed.uploaded_at) AS max_uploaded_at
          FROM employee_documents ed
          INNER JOIN employees e ON ed.employee_id = e.id
          WHERE e.branch_id = ANY(${branchIds})
          GROUP BY e.branch_id
        )
        SELECT
          b.id AS branch_id,
          GREATEST(
            COALESCE(emp.max_updated_at, '1970-01-01'::timestamp),
            COALESCE(docs.max_uploaded_at, '1970-01-01'::timestamp),
            COALESCE(emp.max_created_at, '1970-01-01'::timestamp),
            COALESCE(emp.max_status_changed_at, '1970-01-01'::timestamp)
          ) AS last_activity
        FROM branches b
        LEFT JOIN emp ON emp.branch_id = b.id
        LEFT JOIN docs ON docs.branch_id = b.id
        WHERE b.id = ANY(${branchIds})
      `,
      // 5. Last login date per branch
      sql`
        SELECT branch_id, MAX(login_date) AS last_login
        FROM user_logins
        WHERE branch_id = ANY(${branchIds})
        GROUP BY branch_id
      `,
      // 6. Monthly login history (last 6 months)
      sql`
        SELECT
          branch_id,
          DATE_TRUNC('month', login_date)::date AS month,
          COUNT(DISTINCT login_date)::int AS login_days
        FROM user_logins
        WHERE branch_id = ANY(${branchIds})
        AND login_date >= ${sixMonthsAgoStr}
        GROUP BY branch_id, DATE_TRUNC('month', login_date)
        ORDER BY month DESC
      `
    ]), { label: 'branch-statistics:aggregate' });

    const toMap = (rows, key) => {
      const m = new Map();
      for (const r of rows || []) m.set(r?.[key], r);
      return m;
    };

    const loginDaysMap = toMap(loginDaysRows, 'branch_id');
    const employeeStatsMap = toMap(employeeStatsRows, 'branch_id');
    const employeeUpdatesMap = toMap(employeeUpdatesRows, 'branch_id');
    const documentUploadsMap = toMap(documentUploadsRows, 'branch_id');
    const employeeCreationsMap = toMap(employeeCreationsRows, 'branch_id');
    const statusChangesMap = toMap(statusChangesRows, 'branch_id');
    const lastActivityMap = toMap(lastActivityRows, 'branch_id');
    const lastLoginMap = toMap(lastLoginRows, 'branch_id');

    const monthlyLoginHistoryByBranch = new Map();
    for (const r of monthlyLoginRows || []) {
      const id = r?.branch_id;
      if (!id) continue;
      if (!monthlyLoginHistoryByBranch.has(id)) monthlyLoginHistoryByBranch.set(id, []);
      monthlyLoginHistoryByBranch.get(id).push({
        month: r?.month || null,
        login_days: parseInt(r?.login_days || 0, 10) || 0
      });
    }

    const statistics = branches.map((branch) => {
      try {
        const loginDaysCount = parseInt(loginDaysMap.get(branch.id)?.login_count || 0, 10) || 0;

        const stats = employeeStatsMap.get(branch.id) || {
          total_employees: 0,
          complete_employees: 0,
          incomplete_employees: 0,
          active_employees: 0,
          pending_employees: 0
        };

        const safeStats = {
          total_employees: parseInt(stats.total_employees || 0, 10) || 0,
          complete_employees: parseInt(stats.complete_employees || 0, 10) || 0,
          incomplete_employees: parseInt(stats.incomplete_employees || 0, 10) || 0,
          active_employees: parseInt(stats.active_employees || 0, 10) || 0,
          pending_employees: parseInt(stats.pending_employees || 0, 10) || 0
        };

        let completionPercentage = 0;
        try {
          const employeeMetrics = calculateEmployeeCompletion(safeStats, branch);
          completionPercentage = employeeMetrics?.percentage || 0;
        } catch (calcError) {
          log.error(`Error calculating completion for branch ${branch.id}:`, calcError);
        }

        const employeeUpdatesCount = parseInt(employeeUpdatesMap.get(branch.id)?.update_count || 0, 10) || 0;
        const documentUploadsCount = parseInt(documentUploadsMap.get(branch.id)?.upload_count || 0, 10) || 0;
        const employeeCreationsCount = parseInt(employeeCreationsMap.get(branch.id)?.creation_count || 0, 10) || 0;
        const statusChangesCount = parseInt(statusChangesMap.get(branch.id)?.status_change_count || 0, 10) || 0;

        const totalActivities = employeeUpdatesCount + documentUploadsCount + employeeCreationsCount + statusChangesCount;

        const lastLoginVal = lastLoginMap.get(branch.id)?.last_login || null;
        const lastActivityVal = lastActivityMap.get(branch.id)?.last_activity || null;

        let daysSinceLastLogin = null;
        let daysSinceLastActivity = null;

        try {
          if (lastLoginVal) {
            const lastLoginDate = new Date(lastLoginVal);
            if (!isNaN(lastLoginDate.getTime())) {
              daysSinceLastLogin = Math.floor((new Date() - lastLoginDate) / (1000 * 60 * 60 * 24));
            }
          }
        } catch (e) {
          log.warn(`Error parsing last_login for branch ${branch.id}:`, e);
        }

        try {
          if (lastActivityVal) {
            const lastActivityDate = new Date(lastActivityVal);
            if (!isNaN(lastActivityDate.getTime())) {
              daysSinceLastActivity = Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24));
            }
          }
        } catch (e) {
          log.warn(`Error parsing last_activity for branch ${branch.id}:`, e);
        }

        const isOperational = (
          (daysSinceLastLogin !== null && daysSinceLastLogin <= 30) ||
          (daysSinceLastActivity !== null && daysSinceLastActivity <= 30)
        ) && safeStats.total_employees > 0 && totalActivities > 0;

        const monthlyLoginHistory = (monthlyLoginHistoryByBranch.get(branch.id) || []).filter(m => m.month !== null);

        return {
          branch_id: branch.id,
          branch_name: branch.branch_name || 'غير محدد',
          branch_type: branch.branch_type || null,
          username: branch.username || null,
          login_days_this_month: loginDaysCount,
          total_employees: safeStats.total_employees,
          complete_employees: safeStats.complete_employees,
          incomplete_employees: safeStats.incomplete_employees,
          active_employees: safeStats.active_employees,
          pending_employees: safeStats.pending_employees,
          completion_percentage: completionPercentage,
          activities_last_30_days: {
            employee_updates: employeeUpdatesCount,
            document_uploads: documentUploadsCount,
            employee_creations: employeeCreationsCount,
            status_changes: statusChangesCount,
            total: totalActivities
          },
          last_activity: lastActivityVal,
          last_login: lastLoginVal,
          monthly_login_history: monthlyLoginHistory,
          is_operational: isOperational,
          days_since_last_login: daysSinceLastLogin,
          days_since_last_activity: daysSinceLastActivity
        };
      } catch (branchError) {
        log.error(`Error processing branch ${branch?.id || 'unknown'}:`, branchError);
        return {
          branch_id: branch?.id || null,
          branch_name: branch?.branch_name || 'غير محدد',
          branch_type: branch?.branch_type || null,
          username: branch?.username || null,
          login_days_this_month: 0,
          total_employees: 0,
          complete_employees: 0,
          incomplete_employees: 0,
          active_employees: 0,
          pending_employees: 0,
          completion_percentage: 0,
          activities_last_30_days: {
            employee_updates: 0,
            document_uploads: 0,
            employee_creations: 0,
            status_changes: 0,
            total: 0
          },
          last_activity: null,
          last_login: null,
          monthly_login_history: [],
          is_operational: false,
          days_since_last_login: null,
          days_since_last_activity: null,
          error: branchError.message
        };
      }
    });

    res.json({
      success: true,
      data: statistics,
      period: {
        month: currentMonth,
        year: currentYear,
        first_day: firstDayOfMonth,
        last_day: lastDayOfMonth
      }
    });
  } catch (error) {
    log.error('Error fetching branch statistics:', error);
    // Log full error details for debugging
    log.error('Error stack:', error.stack);
    handleRouteError(error, req, res, 'فشل جلب إحصائيات الفروع');
  }
});

/**
 * POST /api/branch-statistics/performance-report
 * Generate performance report for branches
 */
router.post('/performance-report', async (req, res) => {
  try {
    const { month, year, branch_ids, format = 'excel' } = req.body;

    // Get statistics
    let branchesQuery = sql`
      SELECT * FROM branches WHERE is_active = true
    `;

    if (branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0) {
      branchesQuery = sql`
        SELECT * FROM branches 
        WHERE is_active = true 
        AND id = ANY(${branch_ids})
        ORDER BY branch_name
      `;
    } else {
      branchesQuery = sql`
        SELECT * FROM branches 
        WHERE is_active = true 
        ORDER BY branch_name
      `;
    }

    const branches = await branchesQuery;
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const firstDayOfMonth = new Date(targetYear, targetMonth - 1, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

    // Get detailed statistics for each branch
    // Performance Optimization: Calculate date range once before the loop
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const detailedStats = await Promise.all(
      branches.map(async (branch) => {
        // Performance Optimization: Execute all queries in parallel using Promise.all
        const [
          loginDays,
          employeeStats,
          activities,
          lastLogin
        ] = await Promise.all([
          // 1. Login days this month
          sql`
            SELECT COUNT(DISTINCT login_date)::int as login_count
            FROM user_logins
            WHERE branch_id = ${branch.id}
            AND login_date >= ${firstDayOfMonth}
            AND login_date <= ${lastDayOfMonth}
          `,
          // 2. Employee completion statistics
          sql`
            SELECT 
              COUNT(*) as total_employees,
              COUNT(*) FILTER (WHERE data_completion_status = 'complete') as complete_employees,
              COUNT(*) FILTER (WHERE status = 'active') as active_employees
            FROM employees
            WHERE branch_id = ${branch.id}
            AND (status = 'active' OR status = 'pending')
          `,
          // 3. Recent activities (last 30 days) - combined query
          sql`
            SELECT 
              COUNT(DISTINCT e.id) FILTER (WHERE e.updated_at >= ${thirtyDaysAgoStr}) as employee_updates,
              COUNT(DISTINCT ed.id) FILTER (WHERE ed.uploaded_at >= ${thirtyDaysAgoStr} AND ed.is_active = true) as document_uploads,
              COUNT(DISTINCT e2.id) FILTER (WHERE e2.created_at >= ${thirtyDaysAgoStr}) as employee_creations
            FROM employees e
            LEFT JOIN employee_documents ed ON ed.employee_id = e.id
            LEFT JOIN employees e2 ON e2.branch_id = e.branch_id
            WHERE e.branch_id = ${branch.id}
          `,
          // 4. Last login date
          sql`
            SELECT MAX(login_date) as last_login
            FROM user_logins
            WHERE branch_id = ${branch.id}
          `
        ]);

        // Extract results from parallel queries
        const stats = employeeStats[0] || {
          total_employees: 0,
          complete_employees: 0,
          active_employees: 0
        };

        // Use unified utility to calculate completion percentage
        // This ensures consistent calculation using branch.number_of_employees when available
        const employeeMetrics = calculateEmployeeCompletion(stats, branch);
        const completionPercentage = employeeMetrics.percentage;

        const daysSinceLastLogin = lastLogin[0]?.last_login
          ? Math.floor((new Date() - new Date(lastLogin[0].last_login)) / (1000 * 60 * 60 * 24))
          : null;

        const isOperational = (
          (daysSinceLastLogin !== null && daysSinceLastLogin <= 30) ||
          parseInt(activities[0]?.employee_updates || 0) > 0 ||
          parseInt(activities[0]?.document_uploads || 0) > 0
        ) && stats.total_employees > 0;

        return {
          branch_name: branch.branch_name,
          branch_type: branch.branch_type,
          login_days: parseInt(loginDays[0]?.login_count || 0),
          total_employees: parseInt(stats.total_employees),
          complete_employees: parseInt(stats.complete_employees),
          completion_percentage: completionPercentage,
          activities_last_30_days: {
            employee_updates: parseInt(activities[0]?.employee_updates || 0),
            document_uploads: parseInt(activities[0]?.document_uploads || 0),
            employee_creations: parseInt(activities[0]?.employee_creations || 0)
          },
          last_login: lastLogin[0]?.last_login,
          days_since_last_login: daysSinceLastLogin,
          is_operational: isOperational
        };
      })
    );

    // Generate report based on format
    if (format === 'excel') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('تقرير الأداء');

      // Add headers
      worksheet.columns = [
        { header: 'اسم الفرع', key: 'branch_name', width: 30 },
        { header: 'نوع الفرع', key: 'branch_type', width: 15 },
        { header: 'أيام تسجيل الدخول', key: 'login_days', width: 18 },
        { header: 'إجمالي الموظفين', key: 'total_employees', width: 15 },
        { header: 'الموظفون المكتملون', key: 'complete_employees', width: 18 },
        { header: 'نسبة الإكمال %', key: 'completion_percentage', width: 15 },
        { header: 'تحديثات الموظفين', key: 'employee_updates', width: 18 },
        { header: 'رفع المستندات', key: 'document_uploads', width: 18 },
        { header: 'آخر تسجيل دخول', key: 'last_login', width: 18 },
        { header: 'أيام منذ آخر دخول', key: 'days_since_last_login', width: 20 },
        { header: 'حالة التشغيل', key: 'is_operational', width: 15 }
      ];

      // Use unified formatDate function for consistent dd/mm/yyyy format

      // Helper function to format numbers (ensure English)
      const formatNumber = (value) => {
        if (value === null || value === undefined) return 'لا يوجد';
        return String(value);
      };

      // Add data
      detailedStats.forEach(stat => {
        worksheet.addRow({
          branch_name: stat.branch_name,
          branch_type: stat.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية',
          login_days: formatNumber(stat.login_days),
          total_employees: formatNumber(stat.total_employees),
          complete_employees: formatNumber(stat.complete_employees),
          completion_percentage: formatNumber(stat.completion_percentage),
          employee_updates: formatNumber(stat.activities_last_30_days.employee_updates),
          document_uploads: formatNumber(stat.activities_last_30_days.document_uploads),
          last_login: formatDate(stat.last_login) || 'لا يوجد',
          days_since_last_login: formatNumber(stat.days_since_last_login),
          is_operational: stat.is_operational ? 'نشط' : 'غير نشط'
        });
      });

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: 'center' };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="performance-report-${targetYear}-${targetMonth}.xlsx"`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // PDF format
      const PdfPrinter = (await import('@digicole/pdfmake-rtl')).default;
      // PDF generation would go here - similar to reports.js
      // For now, return JSON
      res.json({
        success: true,
        data: detailedStats,
        period: {
          month: targetMonth,
          year: targetYear
        }
      });
    }
  } catch (error) {
    log.error('Error generating performance report:', error);
    handleRouteError(error, req, res, 'فشل إنشاء تقرير الأداء');
  }
});

export default router;


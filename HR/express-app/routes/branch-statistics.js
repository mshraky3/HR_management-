/**
 * Branch Manager Statistics Routes
 * Statistics about branch manager activity
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import sql from '../config/database.js';

const router = express.Router();

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

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
    
    // Get all branches
    const branches = await sql`
      SELECT id, branch_name, branch_type, username, is_active
      FROM branches
      WHERE is_active = true
      ORDER BY branch_name
    `;
    
    // Get statistics for each branch
    const statistics = await Promise.all(
      branches.map(async (branch) => {
        // 1. Login days this month
        const loginDays = await sql`
          SELECT COUNT(DISTINCT login_date)::int as login_count
          FROM user_logins
          WHERE branch_id = ${branch.id}
          AND login_date >= ${firstDayOfMonth}
          AND login_date <= ${lastDayOfMonth}
        `;
        const loginDaysCount = parseInt(loginDays[0]?.login_count || 0, 10);
        
        // 2. Employee completion statistics
        const employeeStats = await sql`
          SELECT 
            COUNT(*) as total_employees,
            COUNT(*) FILTER (WHERE data_completion_status = 'complete') as complete_employees,
            COUNT(*) FILTER (WHERE data_completion_status = 'incomplete') as incomplete_employees,
            COUNT(*) FILTER (WHERE status = 'active') as active_employees,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_employees
          FROM employees
          WHERE branch_id = ${branch.id}
          AND (status = 'active' OR status = 'pending')
        `;
        
        const stats = employeeStats[0] || {
          total_employees: 0,
          complete_employees: 0,
          incomplete_employees: 0,
          active_employees: 0,
          pending_employees: 0
        };
        
        const completionPercentage = stats.total_employees > 0
          ? Math.round((stats.complete_employees / stats.total_employees) * 100)
          : 0;
        
        // 3. Recent activities (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        // Employee updates
        const employeeUpdates = await sql`
          SELECT COUNT(*)::int as update_count
          FROM employees
          WHERE branch_id = ${branch.id}
          AND updated_at >= ${thirtyDaysAgoStr}
        `;
        
        // Document uploads
        const documentUploads = await sql`
          SELECT COUNT(*)::int as upload_count
          FROM employee_documents ed
          INNER JOIN employees e ON ed.employee_id = e.id
          WHERE e.branch_id = ${branch.id}
          AND ed.uploaded_at >= ${thirtyDaysAgoStr}
          AND ed.is_active = true
        `;
        
        // Employee creations
        const employeeCreations = await sql`
          SELECT COUNT(*)::int as creation_count
          FROM employees
          WHERE branch_id = ${branch.id}
          AND created_at >= ${thirtyDaysAgoStr}
        `;
        
        // Status changes
        const statusChanges = await sql`
          SELECT COUNT(*)::int as status_change_count
          FROM employees
          WHERE branch_id = ${branch.id}
          AND status_changed_at >= ${thirtyDaysAgoStr}
          AND status_changed_at IS NOT NULL
        `;
        
        const totalActivities = 
          parseInt(employeeUpdates[0]?.update_count || 0, 10) +
          parseInt(documentUploads[0]?.upload_count || 0, 10) +
          parseInt(employeeCreations[0]?.creation_count || 0, 10) +
          parseInt(statusChanges[0]?.status_change_count || 0, 10);
        
        // 4. Last activity date
        const lastActivity = await sql`
          SELECT GREATEST(
            COALESCE((SELECT MAX(updated_at) FROM employees WHERE branch_id = ${branch.id}), '1970-01-01'::timestamp),
            COALESCE((SELECT MAX(uploaded_at) FROM employee_documents ed INNER JOIN employees e ON ed.employee_id = e.id WHERE e.branch_id = ${branch.id}), '1970-01-01'::timestamp),
            COALESCE((SELECT MAX(created_at) FROM employees WHERE branch_id = ${branch.id}), '1970-01-01'::timestamp),
            COALESCE((SELECT MAX(status_changed_at) FROM employees WHERE branch_id = ${branch.id} AND status_changed_at IS NOT NULL), '1970-01-01'::timestamp)
          ) as last_activity
        `;
        
        // 5. Last login date
        const lastLogin = await sql`
          SELECT MAX(login_time) as last_login
          FROM user_logins
          WHERE branch_id = ${branch.id}
        `;
        
        return {
          branch_id: branch.id,
          branch_name: branch.branch_name,
          branch_type: branch.branch_type,
          username: branch.username,
          login_days_this_month: parseInt(loginDaysCount, 10),
          total_employees: parseInt(stats.total_employees),
          complete_employees: parseInt(stats.complete_employees),
          incomplete_employees: parseInt(stats.incomplete_employees),
          active_employees: parseInt(stats.active_employees),
          pending_employees: parseInt(stats.pending_employees),
          completion_percentage: completionPercentage,
          activities_last_30_days: {
            employee_updates: parseInt(employeeUpdates[0]?.update_count || 0, 10),
            document_uploads: parseInt(documentUploads[0]?.upload_count || 0, 10),
            employee_creations: parseInt(employeeCreations[0]?.creation_count || 0, 10),
            status_changes: parseInt(statusChanges[0]?.status_change_count || 0, 10),
            total: totalActivities
          },
          last_activity: lastActivity[0]?.last_activity || null,
          last_login: lastLogin[0]?.last_login || null
        };
      })
    );
    
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
    console.error('Error fetching branch statistics:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات الفروع',
      error: error.message
    });
  }
});

export default router;


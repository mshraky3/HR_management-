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
          SELECT MAX(login_date) as last_login
          FROM user_logins
          WHERE branch_id = ${branch.id}
        `;
        
        // 6. Monthly login history (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];
        
        const monthlyLogins = await sql`
          SELECT 
            DATE_TRUNC('month', login_date)::date as month,
            COUNT(DISTINCT login_date)::int as login_days
          FROM user_logins
          WHERE branch_id = ${branch.id}
          AND login_date >= ${sixMonthsAgoStr}
          GROUP BY DATE_TRUNC('month', login_date)
          ORDER BY month DESC
        `;
        
        // 7. Determine operational status
        const daysSinceLastLogin = lastLogin[0]?.last_login 
          ? Math.floor((new Date() - new Date(lastLogin[0].last_login)) / (1000 * 60 * 60 * 24))
          : null;
        const daysSinceLastActivity = lastActivity[0]?.last_activity
          ? Math.floor((new Date() - new Date(lastActivity[0].last_activity)) / (1000 * 60 * 60 * 24))
          : null;
        
        // Operational criteria:
        // - Has logged in within last 30 days OR has activity within last 30 days
        // - Has employees
        // - Has some activity in last 30 days
        const isOperational = (
          (daysSinceLastLogin !== null && daysSinceLastLogin <= 30) ||
          (daysSinceLastActivity !== null && daysSinceLastActivity <= 30)
        ) && stats.total_employees > 0 && totalActivities > 0;
        
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
          last_login: lastLogin[0]?.last_login || null,
          monthly_login_history: monthlyLogins.map(m => ({
            month: m.month,
            login_days: m.login_days
          })),
          is_operational: isOperational,
          days_since_last_login: daysSinceLastLogin,
          days_since_last_activity: daysSinceLastActivity
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
    const detailedStats = await Promise.all(
      branches.map(async (branch) => {
        const loginDays = await sql`
          SELECT COUNT(DISTINCT login_date)::int as login_count
          FROM user_logins
          WHERE branch_id = ${branch.id}
          AND login_date >= ${firstDayOfMonth}
          AND login_date <= ${lastDayOfMonth}
        `;
        
        const employeeStats = await sql`
          SELECT 
            COUNT(*) as total_employees,
            COUNT(*) FILTER (WHERE data_completion_status = 'complete') as complete_employees,
            COUNT(*) FILTER (WHERE status = 'active') as active_employees
          FROM employees
          WHERE branch_id = ${branch.id}
          AND (status = 'active' OR status = 'pending')
        `;
        
        const stats = employeeStats[0] || {
          total_employees: 0,
          complete_employees: 0,
          active_employees: 0
        };
        
        const completionPercentage = stats.total_employees > 0
          ? Math.round((stats.complete_employees / stats.total_employees) * 100)
          : 0;
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const activities = await sql`
          SELECT 
            COUNT(DISTINCT e.id) FILTER (WHERE e.updated_at >= ${thirtyDaysAgoStr}) as employee_updates,
            COUNT(DISTINCT ed.id) FILTER (WHERE ed.uploaded_at >= ${thirtyDaysAgoStr} AND ed.is_active = true) as document_uploads,
            COUNT(DISTINCT e2.id) FILTER (WHERE e2.created_at >= ${thirtyDaysAgoStr}) as employee_creations
          FROM employees e
          LEFT JOIN employee_documents ed ON ed.employee_id = e.id
          LEFT JOIN employees e2 ON e2.branch_id = e.branch_id
          WHERE e.branch_id = ${branch.id}
        `;
        
        const lastLogin = await sql`
          SELECT MAX(login_date) as last_login
          FROM user_logins
          WHERE branch_id = ${branch.id}
        `;
        
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
      
      // Helper function to format date with English numbers
      const formatDateEnglish = (date) => {
        if (!date) return 'لا يوجد';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      };
      
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
          last_login: formatDateEnglish(stat.last_login),
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
    console.error('Error generating performance report:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء تقرير الأداء',
      error: error.message
    });
  }
});

export default router;


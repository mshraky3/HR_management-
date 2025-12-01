/**
 * Archive Routes
 * View archived employees (non-active statuses)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { Employee } from '../models/Employee.js';
import { Branch } from '../models/Branch.js';
import sql from '../config/database.js';

const router = express.Router();

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

/**
 * GET /api/archive
 * Get archived employees with filters
 * Query params: branch_id, status, academic_year, registration_date_from, registration_date_to,
 *                status_change_date_from, status_change_date_to
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      branch_id: req.query.branch_id 
        ? (Array.isArray(req.query.branch_id) 
            ? req.query.branch_id.map(id => parseInt(id)).filter(id => !isNaN(id))
            : [parseInt(req.query.branch_id)].filter(id => !isNaN(id)))
        : undefined,
      status: req.query.status,
      academic_year: req.query.academic_year,
      registration_date_from: req.query.registration_date_from,
      registration_date_to: req.query.registration_date_to,
      status_change_date_from: req.query.status_change_date_from,
      status_change_date_to: req.query.status_change_date_to
    };
    
    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || 
          (Array.isArray(filters[key]) && filters[key].length === 0)) {
        delete filters[key];
      }
    });
    
    const employees = await Employee.findArchived(filters);
    
    // Get branch information for each employee
    const employeesWithBranches = await Promise.all(
      employees.map(async (employee) => {
        const branch = await Branch.findById(employee.branch_id);
        return {
          ...employee,
          branch_name: branch?.branch_name || 'غير معروف',
          branch_type: branch?.branch_type || 'unknown'
        };
      })
    );
    
    res.json({
      success: true,
      data: employeesWithBranches,
      count: employeesWithBranches.length
    });
  } catch (error) {
    console.error('Error fetching archived employees:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الأرشيف',
      error: error.message
    });
  }
});

/**
 * GET /api/archive/statistics
 * Get archive statistics grouped by branch, academic year, status, etc.
 */
router.get('/statistics', async (req, res) => {
  try {
    const { branch_type, academic_year } = req.query;
    
    let query = sql`
      SELECT 
        b.branch_name,
        b.branch_type,
        e.status,
        e.academic_year,
        COUNT(*) as count,
        DATE_TRUNC('month', e.created_at) as registration_month,
        DATE_TRUNC('month', e.status_changed_at) as status_change_month
      FROM employees e
      INNER JOIN branches b ON e.branch_id = b.id
      WHERE e.status NOT IN ('active', 'pending')
    `;
    
    if (branch_type) {
      query = sql`${query} AND b.branch_type = ${branch_type}`;
    }
    
    if (academic_year) {
      query = sql`${query} AND e.academic_year = ${academic_year}`;
    }
    
    query = sql`${query} 
      GROUP BY b.branch_name, b.branch_type, e.status, e.academic_year, 
               DATE_TRUNC('month', e.created_at), DATE_TRUNC('month', e.status_changed_at)
      ORDER BY b.branch_name, e.academic_year DESC, e.status_changed_at DESC
    `;
    
    const stats = await query;
    
    // Organize by branch -> academic year -> status -> registration/status change months
    const organized = {};
    
    stats.forEach(stat => {
      const branchKey = stat.branch_name;
      const yearKey = stat.academic_year || 'غير محدد';
      const statusKey = stat.status;
      const regMonth = stat.registration_month ? new Date(stat.registration_month).toISOString().slice(0, 7) : 'غير محدد';
      const changeMonth = stat.status_change_month ? new Date(stat.status_change_month).toISOString().slice(0, 7) : 'غير محدد';
      
      if (!organized[branchKey]) {
        organized[branchKey] = {
          branch_name: stat.branch_name,
          branch_type: stat.branch_type,
          academic_years: {}
        };
      }
      
      if (!organized[branchKey].academic_years[yearKey]) {
        organized[branchKey].academic_years[yearKey] = {
          academic_year: yearKey,
          statuses: {}
        };
      }
      
      if (!organized[branchKey].academic_years[yearKey].statuses[statusKey]) {
        organized[branchKey].academic_years[yearKey].statuses[statusKey] = {
          status: statusKey,
          periods: {}
        };
      }
      
      const periodKey = `${regMonth}_${changeMonth}`;
      if (!organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey]) {
        organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey] = {
          registration_month: regMonth,
          status_change_month: changeMonth,
          count: 0
        };
      }
      
      organized[branchKey].academic_years[yearKey].statuses[statusKey].periods[periodKey].count += parseInt(stat.count);
    });
    
    res.json({
      success: true,
      data: organized
    });
  } catch (error) {
    console.error('Error fetching archive statistics:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات الأرشيف',
      error: error.message
    });
  }
});

/**
 * GET /api/archive/:id
 * Get archived employee details with documents
 */
router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(parseInt(req.params.id));
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }
    
    // Check if employee is archived
    if (employee.status === 'active' || employee.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'هذا الموظف غير موجود في الأرشيف'
      });
    }
    
    // Get branch information
    const branch = await Branch.findById(employee.branch_id);
    
    // Get documents
    const { Document } = await import('../models/Document.js');
    const documents = await Document.findByEmployeeId(employee.id);
    
    res.json({
      success: true,
      data: {
        ...employee,
        branch_name: branch?.branch_name || 'غير معروف',
        branch_type: branch?.branch_type || 'unknown',
        documents: documents || []
      }
    });
  } catch (error) {
    console.error('Error fetching archived employee:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب بيانات الموظف',
      error: error.message
    });
  }
});

/**
 * PUT /api/archive/:id/status
 * Update archived employee status
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;
    
    // Validation
    const validStatuses = ['active', 'pending', 'terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'حالة غير صحيحة'
      });
    }
    
    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }
    
    // Update status
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      req.user.branch_id || employee.branch_id,
      reason || null
    );
    
    res.json({
      success: true,
      message: 'تم تحديث حالة الموظف بنجاح',
      data: updatedEmployee
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث حالة الموظف',
      error: error.message
    });
  }
});

/**
 * GET /api/archive/branch-documents/all
 * Get archived branch documents (is_active = false)
 */
router.get('/branch-documents/all', async (req, res) => {
  try {
    let query = sql`
      SELECT bd.*, b.branch_name, b.branch_type
      FROM branch_documents bd
      INNER JOIN branches b ON bd.branch_id = b.id
      WHERE bd.is_active = false
    `;
    
    if (req.query.branch_id) {
      query = sql`${query} AND bd.branch_id = ${parseInt(req.query.branch_id)}`;
    }
    
    if (req.query.document_type) {
      query = sql`${query} AND bd.document_type = ${req.query.document_type}`;
    }
    
    query = sql`${query} ORDER BY bd.uploaded_at DESC`;
    
    const documents = await query;
    
    res.json({
      success: true,
      data: documents || [],
      count: documents?.length || 0
    });
  } catch (error) {
    console.error('Error fetching archived branch documents:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب مستندات الفرع المؤرشفة',
      error: error.message
    });
  }
});

export default router;


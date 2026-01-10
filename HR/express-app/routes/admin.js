/**
 * Admin Routes
 * Admin-only operations e.g., trigger background recalculation
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { recalculateBranchEmployeesInBatches } from '../utils/batchRecalculate.js';
import { clearByPrefix } from '../utils/simpleCache.js';
import { 
  getEmployeesWithMissingDates, 
  getEmployeesWithMissingDatesCount,
  convertEmployeeDates,
  deleteEmployee,
  batchFixAllEmployees
} from '../utils/fixMissingDates.js';
import {
  getEmployeesWithInvalidData,
  getEmployeesWithInvalidDataCount
} from '../utils/getInvalidDataEmployees.js';
import { Notification } from '../models/Notification.js';

const router = express.Router();
router.use(authenticate);
router.use(requireMainManager);

// Trigger background recalculation for a branch (admin only)
router.post('/recalculate-branch', async (req, res) => {
    try {
        const branchId = parseInt(req.body.branch_id);
        if (isNaN(branchId)) {
            return res.status(400).json({ success: false, message: 'branch_id is required' });
        }

        // Start asynchronous recalculation (do not block)
        (async () => {
            try {
                await recalculateBranchEmployeesInBatches(branchId, { batchSize: 200, delayMs: 50 });
                // Invalidate caches for branch summary and statistics after recalculation
                clearByPrefix(`dashboard:summary:${branchId}`);
                clearByPrefix('branch-statistics');
            } catch (err) {
                console.error('Admin recalculation failed:', err);
            }
        })();

        return res.status(202).json({ success: true, message: 'Recalculation scheduled' });
    } catch (error) {
        console.error('Error scheduling recalculation:', error);
        return res.status(500).json({ success: false, message: 'Failed to schedule recalculation', error: error.message });
    }
});

// Get employees with missing dates of birth
router.get('/employees-missing-dates', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const [employees, totalCount] = await Promise.all([
            getEmployeesWithMissingDates(limit, offset),
            getEmployeesWithMissingDatesCount()
        ]);

        res.json({
            success: true,
            data: employees,
            pagination: {
                total: totalCount,
                limit,
                offset,
                has_more: offset + employees.length < totalCount
            }
        });
    } catch (error) {
        console.error('Error fetching employees with missing dates:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch employees with missing dates', 
            error: error.message 
        });
    }
});

// Fix employee dates - convert or delete
router.post('/fix-employee-date', async (req, res) => {
    try {
        const { employee_id, action } = req.body;

        if (!employee_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'employee_id is required' 
            });
        }

        if (!action || !['convert', 'delete'].includes(action)) {
            return res.status(400).json({ 
                success: false, 
                message: 'action is required and must be "convert" or "delete"' 
            });
        }

        let result;
        if (action === 'convert') {
            result = await convertEmployeeDates(parseInt(employee_id));
        } else {
            result = await deleteEmployee(parseInt(employee_id));
        }

        res.json({
            success: true,
            message: `Employee ${action === 'convert' ? 'dates converted' : 'deleted'} successfully`,
            data: result
        });
    } catch (error) {
        console.error('Error fixing employee date:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to fix employee date', 
            error: error.message 
        });
    }
});

// Batch fix all employees with missing or invalid dates
router.post('/fix-all-employee-dates', async (req, res) => {
    try {
        const { batch_size = 50, delay_ms = 100, auto_delete = false } = req.body;

        console.log('Starting batch fix for all employees with missing/invalid dates...');
        const results = await batchFixAllEmployees({
            batchSize: parseInt(batch_size) || 50,
            delayMs: parseInt(delay_ms) || 100,
            autoDelete: auto_delete === true
        });
        
        console.log('Batch fix completed:', results);

        return res.json({
            success: true,
            message: `تمت معالجة ${results.total} موظف. تم التحويل: ${results.converted}, تم الحذف: ${results.deleted}, فشل: ${results.failed}, تم التخطي: ${results.skipped}`,
            data: results
        });
    } catch (error) {
        console.error('Error during batch fix:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'فشلت عملية المعالجة المجمعة', 
            error: error.message 
        });
    }
});

// Get employees with invalid/incomplete data
router.get('/employees-invalid-data', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const [employees, totalCount] = await Promise.all([
            getEmployeesWithInvalidData(limit, offset),
            getEmployeesWithInvalidDataCount()
        ]);

        res.json({
            success: true,
            data: employees,
            pagination: {
                total: totalCount,
                limit,
                offset,
                has_more: offset + employees.length < totalCount
            }
        });
    } catch (error) {
        console.error('Error fetching employees with invalid data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'فشل جلب الموظفين ذوي البيانات غير الدقيقة', 
            error: error.message 
        });
    }
});

// Notify branch about invalid employee data
router.post('/notify-branch-invalid-data', async (req, res) => {
    try {
        const { employee_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'employee_id is required' 
            });
        }

        // Get employee with invalid data details
        const employees = await getEmployeesWithInvalidData(1000, 0);
        const employee = employees.find(emp => emp.id === parseInt(employee_id));
        
        if (!employee) {
            return res.status(404).json({ 
                success: false, 
                message: 'Employee not found or data is valid' 
            });
        }

        // Get invalid fields
        const invalidFieldsText = employee.invalid_fields && employee.invalid_fields.length > 0 
            ? employee.invalid_fields.join('، ')
            : 'بيانات غير صحيحة';

        // Create notification for the branch
        const notificationMessage = `يرجى مراجعة وتصحيح بيانات الموظف: ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}
        
المجالات غير الصحيحة:
${invalidFieldsText}`;

        const notification = await Notification.create({
            message: notificationMessage,
            importance_level: 2, // Medium importance
            created_by: req.user.id,
            branch_ids: [employee.branch_id]
        });

        res.json({
            success: true,
            message: `تم إرسال إشعار للفرع بخصوص الموظف ${employee.first_name} ${employee.second_name}`,
            data: notification
        });
    } catch (error) {
        console.error('Error notifying branch:', error);
        res.status(500).json({ 
            success: false, 
            message: 'فشل إرسال الإشعار للفرع', 
            error: error.message 
        });
    }
});

// Removed: Attendance system has been removed

export default router;

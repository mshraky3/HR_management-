/**
 * Employee Routes
 * CRUD operations for employees
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess } from '../middleware/authorization.js';
import { validateRequired, validateEmployeeName, validateDate } from '../middleware/validation.js';
import { Document } from '../models/Document.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all employees (filtered by branch for branch managers)
router.get('/', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const filters = {
      branch_id: req.user.role === 'branch_manager' ? req.user.branch_id : req.query.branch_id,
      occupation: req.query.occupation,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined
    };
    
    const employees = await Employee.findAll(filters);
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: error.message
    });
  }
});

// Get employee by ID
router.get('/:id', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.findById(parseInt(req.params.id));
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
      // Check branch access
      if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee',
      error: error.message
    });
  }
});

// Create employee
router.post('/',
  validateRequired([
    'employee_id_number', 'branch_id', 'first_name', 'second_name', 'third_name', 'fourth_name',
    'occupation', 'nationality', 'id_or_residency_number',
    'id_type', 'gender'
  ]),
  validateEmployeeName,
  validateDate('date_of_birth_gregorian'),
  validateDate('date_of_birth_hijri'),
  validateDate('id_expiry_date_gregorian'),
  validateDate('id_expiry_date_hijri'),
  async (req, res) => {
    try {
      const { Employee } = await import('../models/Employee.js');
      
      // Validate date of birth is provided (either hijri or gregorian)
      const hasHijriDate = req.body.date_of_birth_hijri && req.body.date_of_birth_hijri.trim() !== '';
      const hasGregorianDate = req.body.date_of_birth_gregorian && req.body.date_of_birth_gregorian.trim() !== '';
      
      if (!hasHijriDate && !hasGregorianDate) {
        return res.status(400).json({
          success: false,
          message: 'تاريخ الميلاد مطلوب (يجب إدخال التاريخ إما هجري أو ميلادي)'
        });
      }
      
      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (req.user.role === 'branch_manager') {
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          return res.status(403).json({
            success: false,
            message: 'You can only add employees to your own branch'
          });
        }
        // Force branch_id to their branch
        req.body.branch_id = req.user.branch_id;
      }
      
      // Ensure date fields are properly set (null if not provided)
      if (!hasHijriDate) {
        req.body.date_of_birth_hijri = null;
      }
      if (!hasGregorianDate) {
        req.body.date_of_birth_gregorian = null;
      }
      
      // Validate field lengths before insertion
      const fieldLengths = {
        'first_name': 100,
        'second_name': 100,
        'third_name': 100,
        'fourth_name': 100,
        'occupation': 100,
        'nationality': 100,
        'religion': 100,
        'marital_status': 50,
        'educational_qualification': 200,
        'specialization': 200,
        'bank_name': 200,
        'email': 255,
        'phone_number': 50,
        'contract_type': 100,
        'id_or_residency_number': 100,
        'employee_id_number': 100
      };
      
      for (const [field, maxLength] of Object.entries(fieldLengths)) {
        if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].length > maxLength) {
          return res.status(400).json({
            success: false,
            message: `Field "${field}" exceeds maximum length of ${maxLength} characters`
          });
        }
      }
      
      // Set created_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id
      let createdByBranchId = req.body.branch_id;
      
      // If branch manager, force to their branch_id
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        createdByBranchId = req.user.branch_id;
      }
      
      // Ensure branch_id is set (should never be null at this point)
      if (!createdByBranchId) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.'
        });
      }
      
      const employee = await Employee.create({
        ...req.body,
        created_by: createdByBranchId,
        updated_by: createdByBranchId // For new records, updated_by = created_by
      });
      
      res.status(201).json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create employee',
        error: error.message
      });
    }
  }
);

// Update employee
router.put('/:id',
  validateEmployeeName,
  validateDate('date_of_birth_gregorian'),
  validateDate('date_of_birth_hijri'),
  validateDate('id_expiry_date_gregorian'),
  validateDate('id_expiry_date_hijri'),
  async (req, res) => {
    try {
      const { Employee } = await import('../models/Employee.js');
      
      // Check if employee exists and user has access
      const existingEmployee = await Employee.findById(parseInt(req.params.id));
      if (!existingEmployee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
      
      if (req.user.role === 'branch_manager' && req.user.branch_id !== existingEmployee.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // For branch managers, prevent changing branch_id (force it to their branch)
      if (req.user.role === 'branch_manager') {
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          return res.status(403).json({
            success: false,
            message: 'لا يمكنك تغيير فرع الموظف'
          });
        }
        // Force branch_id to their branch (prevent manipulation)
        req.body.branch_id = req.user.branch_id;
      }
      
      // Set updated_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id (from existing employee or request)
      let updatedByBranchId = req.body.branch_id || existingEmployee.branch_id;
      
      // If branch manager, force to their branch_id
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        updatedByBranchId = req.user.branch_id;
      }
      
      // Ensure branch_id is set (should never be null at this point)
      if (!updatedByBranchId) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.'
        });
      }
      
      const employee = await Employee.update(
        parseInt(req.params.id),
        req.body,
        updatedByBranchId
      );
      
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update employee',
        error: error.message
      });
    }
  }
);

// Soft delete employee (main manager only)
router.delete('/:id', async (req, res) => {
  try {
    // Only main manager can delete
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can delete employees'
      });
    }
    
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.softDelete(parseInt(req.params.id));
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    res.json({ success: true, message: 'Employee deactivated successfully', data: employee });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete employee',
      error: error.message
    });
  }
});

/**
 * Get employee documents
 * GET /api/employees/:id/documents
 */
router.get('/:id/documents', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.findById(parseInt(req.params.id));
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const filters = {
      document_type: req.query.document_type,
      mime_type: req.query.mime_type,
      is_verified: req.query.is_verified !== undefined ? req.query.is_verified === 'true' : undefined
    };

    const documents = await Document.findByEmployeeId(parseInt(req.params.id), filters);
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee documents',
      error: error.message
    });
  }
});

export default router;


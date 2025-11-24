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
    
    // Handle branch_id - support single value or array
    let branchId = null;
    if (req.user.role === 'branch_manager') {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      // Check if it's an array (comma-separated values)
      if (Array.isArray(req.query.branch_id)) {
        branchId = req.query.branch_id.map(id => parseInt(id)).filter(id => !isNaN(id));
      } else if (typeof req.query.branch_id === 'string' && req.query.branch_id.includes(',')) {
        // Comma-separated string
        branchId = req.query.branch_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      } else {
        // Single value
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }
    
    const filters = {
      branch_id: branchId,
      occupation: req.query.occupation,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      data_completion_status: req.query.data_completion_status,
      // Search filters (only for main manager)
      search_name: req.query.search_name,
      search_id: req.query.search_id,
      search_phone: req.query.search_phone
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

// Update employee completion status - MUST be before /:id route
router.post('/:id/update-completion-status', async (req, res) => {
  try {
    const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
    const updatedEmployee = await updateEmployeeCompletionStatus(parseInt(req.params.id));
    res.json({ success: true, data: updatedEmployee });
  } catch (error) {
    console.error('Error updating completion status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update completion status',
      error: error.message
    });
  }
});

// Get employee documents - MUST be before /:id route
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

// Get employee missing data - MUST be before /:id route
router.get('/:id/missing-data', async (req, res) => {
  try {
    const { Employee } = await import('../models/Employee.js');
    const { checkEmployeeDataCompletion } = await import('../utils/employeeDataCompletion.js');
    
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
    
    // Get documents, classifications, and certificates
    const sql = (await import('../config/database.js')).default;
    const [documents, classifications, certificates] = await Promise.all([
      sql`SELECT document_type FROM employee_documents WHERE employee_id = ${employee.id} AND is_active = true`,
      sql`SELECT profession FROM employee_professional_classifications WHERE employee_id = ${employee.id}`,
      sql`SELECT course_type FROM employee_course_certificates WHERE employee_id = ${employee.id}`
    ]);
    
    // Check completion
    const completion = await checkEmployeeDataCompletion(employee, {
      documents,
      classifications,
      certificates
    });
    
    res.json({
      success: true,
      data: {
        isComplete: completion.isComplete,
        missingFields: completion.missingFields
      }
    });
  } catch (error) {
    console.error('Error fetching missing data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch missing data',
      error: error.message
    });
  }
});

// Get employee by ID - MUST be after specific routes like /:id/missing-data
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
    'first_name', 'second_name', 'third_name', 'fourth_name',
    'id_or_residency_number', 'nationality'
  ]),
  validateEmployeeName,
  validateDate('date_of_birth_gregorian'),
  validateDate('date_of_birth_hijri'),
  validateDate('id_expiry_date_gregorian'),
  validateDate('id_expiry_date_hijri'),
  async (req, res) => {
    try {
      const { Employee } = await import('../models/Employee.js');
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      
      // Only validate date of birth if provided (no longer required)
      const hasHijriDate = req.body.date_of_birth_hijri && req.body.date_of_birth_hijri.trim() !== '';
      const hasGregorianDate = req.body.date_of_birth_gregorian && req.body.date_of_birth_gregorian.trim() !== '';
      
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
        updated_by: createdByBranchId, // For new records, updated_by = created_by
        data_completion_status: 'incomplete' // Default to incomplete
      });
      
      // Check and update completion status
      try {
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        res.status(201).json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.error('Error checking completion status:', completionError);
        // Still return success, but with original employee data
        res.status(201).json({ success: true, data: employee });
      }
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
      
      // Check and update completion status after update
      try {
        const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        res.json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.error('Error checking completion status:', completionError);
        // Still return success, but with original employee data
        res.json({ success: true, data: employee });
      }
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

export default router;


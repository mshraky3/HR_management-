/**
 * Branch Routes
 * CRUD operations for branches
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, checkBranchAccess } from '../middleware/authorization.js';
import { validateRequired } from '../middleware/validation.js';

const router = express.Router();

// Get all branches (filtered by role)
router.get('/', authenticate, async (req, res) => {
  try {
    const { Branch } = await import('../models/Branch.js');
    const filters = {
      branch_type: req.query.branch_type,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined
    };
    
    // Branch managers only see their own branch
    if (req.user && req.user.role === 'branch_manager' && req.user.branch_id) {
      filters.id = req.user.branch_id;
    }
    
    const branches = await Branch.findAll(filters);
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branches',
      error: error.message
    });
  }
});

// Get branch by ID
router.get('/:id', authenticate, checkBranchAccess, async (req, res) => {
  try {
    const { Branch } = await import('../models/Branch.js');
    const branch = await Branch.findById(parseInt(req.params.id));
    
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }
    
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branch',
      error: error.message
    });
  }
});

// Create branch (main manager only)
router.post('/',
  authenticate,
  requireMainManager,
  validateRequired(['branch_name', 'branch_location', 'branch_type', 'username', 'password']),
  async (req, res) => {
    try {
      const { Branch } = await import('../models/Branch.js');
      const branch = await Branch.create(req.body);
      
      res.status(201).json({ success: true, data: branch });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create branch',
        error: error.message
      });
    }
  }
);

// Update branch (main manager only)
router.put('/:id',
  authenticate,
  requireMainManager,
  async (req, res) => {
    try {
      const { Branch } = await import('../models/Branch.js');
      const branch = await Branch.update(parseInt(req.params.id), req.body);
      
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }
      
      res.json({ success: true, data: branch });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update branch',
        error: error.message
      });
    }
  }
);

// Soft delete branch (main manager only)
router.delete('/:id',
  authenticate,
  requireMainManager,
  async (req, res) => {
    try {
      const { Branch } = await import('../models/Branch.js');
      const branch = await Branch.softDelete(parseInt(req.params.id));
      
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }
      
      res.json({ success: true, message: 'Branch deactivated successfully', data: branch });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete branch',
        error: error.message
      });
    }
  }
);

export default router;


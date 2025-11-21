/**
 * User Routes
 * CRUD operations for users (main manager only)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { validateRequired, validateEmail } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and main manager role
router.use(authenticate);
router.use(requireMainManager);

// Get all users
router.get('/', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const filters = {
      role: req.query.role,
      branch_id: req.query.branch_id,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined
    };
    
    const users = await User.findAll(filters);
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const user = await User.findById(parseInt(req.params.id));
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Create new user (branch manager)
router.post('/', 
  validateRequired(['username', 'password', 'role', 'full_name']),
  validateEmail,
  async (req, res) => {
    try {
      const { User } = await import('../models/User.js');
      
      // Only allow creating branch_manager accounts
      if (req.body.role !== 'branch_manager') {
        return res.status(400).json({
          success: false,
          message: 'Can only create branch_manager accounts'
        });
      }
      
      const user = await User.create({
        ...req.body,
        created_by: req.user.id
      });
      
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error.message
      });
    }
  }
);

// Update user
router.put('/:id', validateEmail, async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const user = await User.update(parseInt(req.params.id), req.body);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// Soft delete user
router.delete('/:id', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const user = await User.softDelete(parseInt(req.params.id));
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({ success: true, message: 'User deactivated successfully', data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

export default router;


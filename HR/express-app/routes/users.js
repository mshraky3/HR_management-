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

// Get all users (main_manager only for account management)
router.get('/', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const filters = {
      role: 'main_manager', // Only return main_manager accounts
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true
    };
    
    const users = await User.findAll(filters);
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل جلب المستخدمين',
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
      message: 'فشل جلب المستخدم',
      error: error.message
    });
  }
});

// Create new user (main_manager only for account management)
router.post('/', 
  validateRequired(['username', 'password', 'full_name']),
  validateEmail,
  async (req, res) => {
    try {
      const { User } = await import('../models/User.js');
      
      // Only allow creating main_manager accounts
      const user = await User.create({
        ...req.body,
        role: 'main_manager', // Force role to main_manager
        branch_id: null, // main_manager has no branch_id
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

// Update user (main_manager only)
router.put('/:id', validateEmail, async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    
    // First verify the user exists and is a main_manager
    const existingUser = await User.findById(parseInt(req.params.id));
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (existingUser.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Can only update main_manager accounts'
      });
    }
    
    // Ensure role and branch_id remain unchanged
    const updateData = {
      ...req.body,
      role: 'main_manager', // Force role to main_manager
      branch_id: null // main_manager has no branch_id
    };
    
    const user = await User.update(parseInt(req.params.id), updateData);
    
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

// Soft delete user (main_manager only)
router.delete('/:id', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    
    // First verify the user exists and is a main_manager
    const existingUser = await User.findById(parseInt(req.params.id));
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (existingUser.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Can only delete main_manager accounts'
      });
    }
    
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


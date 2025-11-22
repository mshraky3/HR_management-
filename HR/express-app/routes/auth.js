/**
 * Authentication Routes
 * Login, logout, get current user
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Branch } from '../models/Branch.js';
import { generateToken } from '../utils/jwt.js';

const router = express.Router();

/**
 * Login endpoint
 * POST /api/auth/login
 * Body: { username, password }
 * Supports both user accounts (users table) and branch accounts (branches table)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // First, try to find user in users table
    let user = await User.findByUsername(username);
    let isBranchLogin = false;

    // If not found in users table, check branches table
    if (!user) {
      const branch = await Branch.findByUsername(username);
      if (branch) {
        // Check branch password
        if (branch.password !== password) {
          return res.status(401).json({
            success: false,
            message: 'Invalid username or password'
          });
        }

        // Check if branch is active
        if (!branch.is_active) {
          return res.status(403).json({
            success: false,
            message: 'Branch account is deactivated. Please contact administrator.'
          });
        }

        // Create a branch manager session
        isBranchLogin = true;
        user = {
          id: branch.id,
          username: branch.username,
          role: 'branch_manager',
          branch_id: branch.id,
          full_name: branch.branch_name,
          email: null,
          is_active: branch.is_active
        };
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Check if user is active (for regular user logins)
    if (!isBranchLogin && !user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }

    // Compare password (for regular user logins)
    if (!isBranchLogin && user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    });

    // Return token and user info (without password)
    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * Get current user info
 * GET /api/auth/me
 * Requires: Bearer token in Authorization header
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Get full user details from database
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return user info (without password)
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email,
        is_active: user.is_active,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info',
      error: error.message
    });
  }
});

// Logout endpoint
router.post('/logout', authenticate, (req, res) => {
  // TODO: Implement token blacklisting if needed
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;


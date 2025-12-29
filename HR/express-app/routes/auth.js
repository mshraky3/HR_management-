/**
 * Authentication Routes
 * Login, logout, get current user
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Branch } from '../models/Branch.js';
import { generateToken } from '../utils/jwt.js';
import { log } from '../utils/logger.js';

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
        message: 'اسم المستخدم وكلمة المرور مطلوبان'
      });
    }

    // First, try to find user in users table
    let user;
    let isBranchLogin = false;
    
    try {
      user = await User.findByUsername(username);
    } catch (dbError) {
      log.error('Database error in User.findByUsername', { error: dbError.message });
      return res.status(500).json({
        success: false,
        message: 'خطأ في اتصال قاعدة البيانات. يرجى التحقق من إعدادات الخادم.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // If not found in users table, check branches table
    if (!user) {
      let branch;
      try {
        branch = await Branch.findByUsername(username);
      } catch (dbError) {
        log.error('Database error in Branch.findByUsername', { error: dbError.message });
        return res.status(500).json({
          success: false,
          message: 'خطأ في اتصال قاعدة البيانات. يرجى التحقق من إعدادات الخادم.',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
      
      if (branch) {
        // Check branch password
        if (branch.password !== password) {
          return res.status(401).json({
            success: false,
            message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
          });
        }

        // Check if branch is active
        if (!branch.is_active) {
          return res.status(403).json({
            success: false,
            message: 'حساب الفرع معطل. يرجى الاتصال بالمسؤول.'
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
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
      });
    }

    // Check if user is active (for regular user logins)
    if (!isBranchLogin && !user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'الحساب معطل. يرجى الاتصال بالمسؤول.'
      });
    }

    // Compare password (for regular user logins)
    if (!isBranchLogin && user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    });

    // Track login for branch managers (only track once per day per branch)
    if (user.role === 'branch_manager' && user.branch_id) {
      try {
        const sql = (await import('../config/database.js')).default;
        const today = new Date().toISOString().split('T')[0];
        const ipAddress = req.ip || req.connection.remoteAddress || null;
        const userAgent = req.get('user-agent') || null;
        
        // Check if login already recorded for today
        const [existingLogin] = await sql`
          SELECT id FROM user_logins
          WHERE branch_id = ${user.branch_id}
          AND login_date = ${today}
          LIMIT 1
        `;
        
        // Only insert if no login recorded for today
        if (!existingLogin) {
          await sql`
            INSERT INTO user_logins (user_id, branch_id, login_date, ip_address, user_agent)
            VALUES (${isBranchLogin ? null : user.id}, ${user.branch_id}, ${today}, ${ipAddress}, ${userAgent})
          `;
        }
      } catch (loginTrackingError) {
        // Don't fail login if tracking fails, just log it
        log.warn('Error tracking login', { error: loginTrackingError.message });
      }
    }

    // Return token and user info (without password)
    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
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
    log.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تسجيل الدخول',
      error: process.env.NODE_ENV === 'production' 
        ? 'خطأ داخلي في الخادم. يرجى التحقق من سجلات الخادم.' 
        : error.message
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
        message: 'المستخدم غير موجود'
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
    log.error('Get user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل الحصول على معلومات المستخدم',
      error: error.message
    });
  }
});

// Logout endpoint
router.post('/logout', authenticate, (req, res) => {
  // TODO: Implement token blacklisting if needed
  res.json({
    success: true,
      message: 'تم تسجيل الخروج بنجاح'
  });
});

export default router;


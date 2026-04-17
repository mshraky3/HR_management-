/**
 * User Routes
 * CRUD operations for users (main manager only)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { validateRequired, validateEmail } from '../middleware/validation.js';
import { UserBranchAssignment } from '../models/User.js';
import sql from '../config/database.js';

const router = express.Router();

// All routes require authentication and main manager role
router.use(authenticate);
router.use(requireMainManager);

// Get all users — supports filtering by role (main_manager or branch_operations_manager)
router.get('/', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const allowedRoles = ['main_manager', 'branch_operations_manager'];
    const role = req.query.role && allowedRoles.includes(req.query.role) ? req.query.role : null;
    const filters = {
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true
    };
    if (role) filters.role = role;
    else filters.role = allowedRoles;

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

// Get all branch_operations_manager accounts with enriched data (assigned branches + stats)
// IMPORTANT: must be before /:id routes to avoid matching "branch-ops" as an id
router.get('/branch-ops/list', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const users = await User.findAll({ role: 'branch_operations_manager', is_active: true });

    const enriched = await Promise.all(users.map(async (u) => {
      const branches = await sql`
        SELECT uba.branch_id, b.branch_name, b.branch_type
        FROM user_branch_assignments uba
        JOIN branches b ON b.id = uba.branch_id
        WHERE uba.user_id = ${u.id}
        ORDER BY b.branch_name
      `;

      const [lastLogin] = await sql`
        SELECT created_at FROM user_otp_tokens
        WHERE user_id = ${u.id}
        ORDER BY created_at DESC LIMIT 1
      `;

      return {
        ...u,
        assigned_branches: branches,
        assigned_branches_count: branches.length,
        last_login_attempt: lastLogin?.created_at || null,
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get branch ops accounts', error: error.message });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const user = await User.findById(parseInt(req.params.id));

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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

// Create new user — supports main_manager and branch_operations_manager
router.post('/',
  validateRequired(['username', 'password', 'full_name']),
  async (req, res) => {
    try {
      const { User } = await import('../models/User.js');
      const allowedRoles = ['main_manager', 'branch_operations_manager'];
      const role = req.body.role && allowedRoles.includes(req.body.role) ? req.body.role : 'main_manager';

      const userData = {
        ...req.body,
        role,
        branch_id: null,
        created_by: req.user.id
      };

      // branch_operations_manager requires email
      if (role === 'branch_operations_manager' && !req.body.email) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب لحساب إدارة بيانات الفروع' });
      }

      // Check for duplicate username among active users
      const existingUser = await User.findByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم موجود مسبقاً، اختر اسماً آخر' });
      }

      // Check for duplicate email among active users of same role
      if (req.body.email) {
        const [emailExists] = await sql`
          SELECT id FROM users
          WHERE email = ${req.body.email} AND role = ${role} AND is_active = true
        `;
        if (emailExists) {
          return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر من نفس النوع' });
        }
      }

      const user = await User.create(userData);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      console.error('Error creating user:', error.message);
      res.status(500).json({
        success: false,
        message: 'فشل إنشاء الحساب',
        error: error.message
      });
    }
  }
);

// Update user — supports main_manager and branch_operations_manager
router.put('/:id', validateEmail, async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const allowedRoles = ['main_manager', 'branch_operations_manager'];

    const existingUser = await User.findById(parseInt(req.params.id));
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!allowedRoles.includes(existingUser.role)) {
      return res.status(403).json({ success: false, message: 'Can only update main_manager or branch_operations_manager accounts' });
    }

    // Prevent role change
    const updateData = {
      ...req.body,
      role: existingUser.role,
      branch_id: null
    };

    // Check email duplicate among active users of same role (exclude self)
    if (req.body.email) {
      const [emailExists] = await sql`
        SELECT id FROM users
        WHERE email = ${req.body.email} AND role = ${existingUser.role} AND is_active = true AND id != ${parseInt(req.params.id)}
      `;
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر من نفس النوع' });
      }
    }

    const user = await User.update(parseInt(req.params.id), updateData);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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

// Soft delete user — supports main_manager and branch_operations_manager
router.delete('/:id', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const allowedRoles = ['main_manager', 'branch_operations_manager'];

    const existingUser = await User.findById(parseInt(req.params.id));
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!allowedRoles.includes(existingUser.role)) {
      return res.status(403).json({ success: false, message: 'Can only delete main_manager or branch_operations_manager accounts' });
    }

    const user = await User.softDelete(parseInt(req.params.id));
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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

// Assign branch to branch_operations_manager
router.post('/:id/assign-branch', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const branchId = parseInt(req.body.branch_id);
    if (!userId || !branchId) {
      return res.status(400).json({ success: false, message: 'user_id and branch_id required' });
    }
    const { User } = await import('../models/User.js');
    const user = await User.findById(userId);
    if (!user || user.role !== 'branch_operations_manager') {
      return res.status(400).json({ success: false, message: 'User must be branch_operations_manager' });
    }
    const assignment = await UserBranchAssignment.assign(userId, branchId, req.user.id);
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign branch', error: error.message });
  }
});

// Unassign branch from branch_operations_manager
router.post('/:id/unassign-branch', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const branchId = parseInt(req.body.branch_id);
    if (!userId || !branchId) {
      return res.status(400).json({ success: false, message: 'user_id and branch_id required' });
    }
    const { User } = await import('../models/User.js');
    const user = await User.findById(userId);
    if (!user || user.role !== 'branch_operations_manager') {
      return res.status(400).json({ success: false, message: 'User must be branch_operations_manager' });
    }
    await UserBranchAssignment.unassign(userId, branchId);
    res.json({ success: true, message: 'Branch unassigned' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to unassign branch', error: error.message });
  }
});

// Get assigned branches for a user
router.get('/:id/assigned-branches', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const branchIds = await UserBranchAssignment.getAssignedBranches(userId);
    res.json({ success: true, data: branchIds });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get assigned branches', error: error.message });
  }
});

export default router;


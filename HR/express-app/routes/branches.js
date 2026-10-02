/**
 * Branch Routes
 * CRUD operations for branches
 */

import express from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, checkBranchAccess, loadAssignedBranches } from '../middleware/authorization.js';
import { validateRequired } from '../middleware/validation.js';
import { isValidEmail, isValidPhone } from '../utils/validators.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { sanitizeAccountsFor } from '../utils/accountSanitize.js';

const router = express.Router();

// Get all branches (filtered by role)
router.get('/', authenticate, loadAssignedBranches, async (req, res) => {
  try {
    const { Branch } = await import('../models/Branch.js');
    const filters = {
      branch_type: req.query.branch_type,
      is_active: req.query.is_active !== undefined ? (req.query.is_active === 'true' || req.query.is_active === true) : undefined
    };

    // Branch managers only see their own branch
    // Main managers should see all branches regardless of branch_id
    // IMPORTANT: Only apply branch_id filter for branch_manager role, never for main_manager
    if (req.user && req.user.role === 'branch_manager' && req.user.branch_id) {
      filters.id = req.user.branch_id;
    }

    // Safety check: Remove any branch_id filter if user is main_manager (in case frontend sends it)
    if (req.user && req.user.role === 'main_manager' && filters.id) {
      delete filters.id;
    }

    let branches = await Branch.findAll(filters);

    // Branch operations managers see only assigned branches
    if (req.user && req.user.role === 'branch_operations_manager' && req.user.assigned_branches) {
      branches = branches.filter(b => req.user.assigned_branches.includes(b.id));
    }

    res.json({ success: true, data: sanitizeAccountsFor(req.user, branches) });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب الفروع');
  }
});

// Update my branch (branch manager only - can update phone_number, email, and number_of_employees)
router.put('/my-branch',
  authenticate,
  async (req, res) => {
    try {
      // Only branch managers can use this endpoint
      if (!req.user || req.user.role !== 'branch_manager' || !req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. هذا المسار متاح فقط لمديري الفروع.'
        });
      }

      // Validate email if provided
      if (req.body.email !== undefined && req.body.email !== null && req.body.email !== '' && !isValidEmail(req.body.email)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة الإيميل غير صحيحة'
        });
      }

      // Validate phone number if provided
      if (req.body.phone_number !== undefined && req.body.phone_number !== null && req.body.phone_number !== '' && !isValidPhone(req.body.phone_number)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة رقم الجوال غير صحيحة'
        });
      }

      // Validate number_of_employees if provided
      if (req.body.number_of_employees !== undefined && req.body.number_of_employees !== null && req.body.number_of_employees !== '') {
        const numEmployees = parseInt(req.body.number_of_employees);
        if (isNaN(numEmployees) || numEmployees < 0) {
          return res.status(400).json({
            success: false,
            message: 'عدد الموظفين يجب أن يكون رقماً صحيحاً موجباً'
          });
        }
      }

      // The branch e-mail is where the login code is sent, so a branch manager may not
      // swap it for another address on their own: changes go through the request flow
      // (POST /api/auth/request-email-update) and the main manager. Setting it for the
      // first time (no e-mail on file yet) is still allowed.
      if (req.body.email !== undefined) {
        const { Branch: BranchModel } = await import('../models/Branch.js');
        const current = await BranchModel.findById(req.user.branch_id);
        const newEmail = req.body.email === '' ? null : req.body.email;
        if (current?.email && newEmail !== current.email) {
          return res.status(403).json({
            success: false,
            message: 'لا يمكن تغيير البريد الإلكتروني مباشرة. أرسل طلب تحديث البريد إلى المسؤول الرئيسي.'
          });
        }
      }

      // Only allow updating phone_number, email, and number_of_employees
      const allowedFields = ['phone_number', 'email', 'number_of_employees'];
      const updateData = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          // Convert empty string to null, except for number_of_employees which should be parsed as integer
          if (field === 'number_of_employees') {
            // Handle number_of_employees: parse as integer, or set to null if empty/null
            const value = req.body[field];
            if (value === '' || value === null || value === undefined) {
              updateData[field] = null;
            } else {
              const parsed = parseInt(value, 10);
              updateData[field] = isNaN(parsed) ? null : parsed;
            }
          } else {
            updateData[field] = req.body[field] === '' ? null : req.body[field];
          }
        }
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'لا توجد بيانات للتحديث'
        });
      }

      const { Branch } = await import('../models/Branch.js');
      const branch = await Branch.update(req.user.branch_id, updateData);

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }

      res.json({ success: true, data: sanitizeAccountsFor(req.user, branch) });
    } catch (error) {
      handleRouteError(error, req, res, 'فشل تحديث الفرع');
    }
  }
);

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

    res.json({ success: true, data: sanitizeAccountsFor(req.user, branch) });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب الفرع');
  }
});

// Create branch (main manager only)
router.post('/',
  authenticate,
  requireMainManager,
  validateRequired(['branch_name', 'branch_location', 'branch_type', 'username', 'password']),
  async (req, res) => {
    try {
      // Validate email if provided
      if (req.body.email && !isValidEmail(req.body.email)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة الإيميل غير صحيحة'
        });
      }

      // Validate phone number if provided
      if (req.body.phone_number && !isValidPhone(req.body.phone_number)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة رقم الجوال غير صحيحة'
        });
      }

      // Validate number_of_employees if provided
      if (req.body.number_of_employees !== undefined && req.body.number_of_employees !== null && req.body.number_of_employees !== '') {
        const numEmployees = parseInt(req.body.number_of_employees);
        if (isNaN(numEmployees) || numEmployees < 0) {
          return res.status(400).json({
            success: false,
            message: 'عدد الموظفين يجب أن يكون رقماً صحيحاً موجباً'
          });
        }
      }

      const { Branch } = await import('../models/Branch.js');
      const branch = await Branch.create(req.body);

      res.status(201).json({ success: true, data: branch });
    } catch (error) {
      handleRouteError(error, req, res, 'فشل إنشاء الفرع');
    }
  }
);

// Update branch (main manager only)
router.put('/:id',
  authenticate,
  requireMainManager,
  async (req, res) => {
    try {
      // Validate email if provided
      if (req.body.email && !isValidEmail(req.body.email)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة الإيميل غير صحيحة'
        });
      }

      // Validate phone number if provided
      if (req.body.phone_number && !isValidPhone(req.body.phone_number)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة رقم الجوال غير صحيحة'
        });
      }

      // Validate number_of_employees if provided
      if (req.body.number_of_employees !== undefined && req.body.number_of_employees !== null && req.body.number_of_employees !== '') {
        const numEmployees = parseInt(req.body.number_of_employees);
        if (isNaN(numEmployees) || numEmployees < 0) {
          return res.status(400).json({
            success: false,
            message: 'عدد الموظفين يجب أن يكون رقماً صحيحاً موجباً'
          });
        }
      }

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
      handleRouteError(error, req, res, 'فشل تحديث الفرع');
    }
  }
);

// Soft delete branch (main manager only)
// Also archives all employees in the branch with reason "تم حذف الفرع"
router.delete('/:id',
  authenticate,
  requireMainManager,
  async (req, res) => {
    try {
      const { Branch } = await import('../models/Branch.js');
      const branchId = parseInt(req.params.id);
      const branch = await Branch.softDelete(branchId);

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }

      // Archive all employees in this branch (regardless of current status)
      const sql = (await import('../config/database.js')).default;
      const archivedEmployees = await sql`
        UPDATE employees
        SET status = 'other',
            is_active = false,
            status_changed_at = CURRENT_TIMESTAMP,
            -- FK to users(id): a branch id here violates it. The reason below is
            -- what identifies this as a branch-deletion cascade.
            status_changed_by = NULL,
            status_change_reason = 'تم حذف الفرع',
            updated_at = CURRENT_TIMESTAMP
        WHERE branch_id = ${branchId}
          AND (status IN ('active', 'pending') OR is_active = true)
        RETURNING id
      `;

      res.json({
        success: true,
        message: 'Branch deactivated successfully',
        data: branch,
        archivedEmployeesCount: archivedEmployees.length
      });
    } catch (error) {
      handleRouteError(error, req, res, 'فشل حذف الفرع');
    }
  }
);

// --- Branch account security (main manager only) ---------------------------

function branchTempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

// Sets a temporary password (generated unless supplied); the branch must change it at next sign-in.
router.post('/:id/reset-password', authenticate, requireMainManager, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const password = req.body?.password ? String(req.body.password) : branchTempPassword();
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    const sql = (await import('../config/database.js')).default;
    const [branch] = await sql`
      UPDATE branches SET password = ${password}, must_change_password = true,
             token_version = token_version + 1, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, branch_name
    `;
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
    const { Branch } = await import('../models/Branch.js');
    Branch.clearCache(id);
    res.json({ success: true, data: { ...branch, temporary_password: password } });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل إعادة تعيين كلمة المرور');
  }
});

// Clears a lockout caused by wrong passwords.
router.post('/:id/unlock', authenticate, requireMainManager, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sql = (await import('../config/database.js')).default;
    const [branch] = await sql`
      UPDATE branches SET failed_attempts = 0, locked_until = NULL WHERE id = ${id} RETURNING id, username
    `;
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
    const { Branch } = await import('../models/Branch.js');
    Branch.clearCache(id);
    res.json({ success: true, data: branch });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل فك القفل');
  }
});

// Recent sign-ins and failures for one branch account.
router.get('/:id/activity', authenticate, requireMainManager, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sql = (await import('../config/database.js')).default;
    const events = await sql`
      SELECT event, ip_address, user_agent, created_at
      FROM login_events
      WHERE account_kind = 'branch' AND account_id = ${id}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    res.json({ success: true, data: events });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب سجل الدخول');
  }
});

export default router;

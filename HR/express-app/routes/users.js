/**
 * User Routes
 * Account management for head-office and operations-manager accounts (main manager only)
 */

import express from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { validateRequired, validateEmail } from '../middleware/validation.js';
import { UserBranchAssignment, User } from '../models/User.js';
import sql from '../config/database.js';
import { resolveBranchAccessFromScope } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();

const MANAGED_ROLES = ['main_manager', 'branch_operations_manager'];

// All routes require authentication and main manager role
router.use(authenticate);
router.use(requireMainManager);

function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Readable temporary password, shown once to the main manager. */
function generateTempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

// List accounts. ?role= filters; ?status=active|disabled|all (default active; ?is_active=true|false still works)
router.get('/', async (req, res) => {
  try {
    const role = req.query.role && MANAGED_ROLES.includes(req.query.role) ? req.query.role : null;
    const filters = { role: role || MANAGED_ROLES };

    const status = req.query.status;
    if (status === 'all') {
      // no is_active filter
    } else if (status === 'disabled') {
      filters.is_active = false;
    } else if (status === 'active' || status === undefined) {
      filters.is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : true;
    }

    const users = await User.findAll(filters);
    res.json({ success: true, data: users });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب المستخدمين');
  }
});

// Operations-manager accounts with assigned branches, last login and recent activity.
// IMPORTANT: must be before /:id routes to avoid matching "branch-ops" as an id
router.get('/branch-ops/list', async (req, res) => {
  try {
    const status = req.query.status;
    const filters = { role: 'branch_operations_manager' };
    if (status === 'disabled') filters.is_active = false;
    else if (status !== 'all') filters.is_active = true;

    const users = await User.findAll(filters);
    const ids = users.map((u) => u.id);

    const assignments = ids.length
      ? await sql`
          SELECT uba.user_id, uba.branch_id, b.branch_name, b.branch_type
          FROM user_branch_assignments uba
          JOIN branches b ON b.id = uba.branch_id
          WHERE uba.user_id = ANY(${ids}::int[])
          ORDER BY b.branch_name
        `
      : [];
    const byUser = new Map();
    for (const a of assignments) {
      if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
      byUser.get(a.user_id).push({ branch_id: a.branch_id, branch_name: a.branch_name, branch_type: a.branch_type });
    }

    const enriched = users.map((u) => {
      const branches = byUser.get(u.id) || [];
      return {
        ...u,
        assigned_branches: branches,
        assigned_branches_count: branches.length,
        // Kept for older clients: last_login_at is the real value now.
        last_login_attempt: u.last_login_at || null
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to get branch ops accounts');
  }
});

// Get user by ID (disabled accounts included)
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const user = id ? await User.findByIdAny(id) : null;

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب المستخدم');
  }
});

// Recent sign-ins and failures for one account
router.get('/:id/activity', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
    const events = await sql`
      SELECT event, ip_address, user_agent, created_at
      FROM login_events
      WHERE account_kind = 'user' AND account_id = ${id}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    res.json({ success: true, data: events });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل جلب سجل الدخول');
  }
});

// Create new user — supports main_manager and branch_operations_manager.
// For operations managers `assigned_branch_ids` is applied in the same transaction,
// so a failure cannot leave a half-created account.
router.post('/',
  validateRequired(['username', 'password', 'full_name']),
  async (req, res) => {
    try {
      const role = req.body.role && MANAGED_ROLES.includes(req.body.role) ? req.body.role : 'main_manager';

      if (String(req.body.password).length < 6) {
        return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      }

      // branch_operations_manager requires email
      if (role === 'branch_operations_manager' && !req.body.email) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب لحساب إدارة بيانات الفروع' });
      }
      if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
      }

      if (await User.usernameTaken(req.body.username)) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم موجود مسبقاً، اختر اسماً آخر' });
      }

      if (req.body.email) {
        const [emailExists] = await sql`
          SELECT id FROM users
          WHERE email = ${req.body.email} AND role = ${role} AND is_active = true
        `;
        if (emailExists) {
          return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر من نفس النوع' });
        }
      }

      const branchIds = role === 'branch_operations_manager' && Array.isArray(req.body.assigned_branch_ids)
        ? [...new Set(req.body.assigned_branch_ids.map(parseId).filter(Boolean))]
        : [];

      const userData = { ...req.body, role, branch_id: null, created_by: req.user.id };

      const user = await sql.begin(async (tx) => {
        const created = await User.create(userData, tx);
        for (const branchId of branchIds) {
          await tx`
            INSERT INTO user_branch_assignments (user_id, branch_id, assigned_by)
            SELECT ${created.id}, b.id, ${req.user.id} FROM branches b WHERE b.id = ${branchId} AND b.is_active = true
            ON CONFLICT (user_id, branch_id) DO NOTHING
          `;
        }
        return created;
      });

      res.status(201).json({ success: true, data: user });
    } catch (error) {
      log.error('Error creating user:', error.message);
      handleRouteError(error, req, res, 'فشل إنشاء الحساب');
    }
  }
);

// Update user — supports main_manager and branch_operations_manager.
// Also works on disabled accounts (so they can be edited before re-enabling).
router.put('/:id', validateEmail, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existingUser = id ? await User.findByIdAny(id) : null;
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!MANAGED_ROLES.includes(existingUser.role)) {
      return res.status(403).json({ success: false, message: 'Can only update main_manager or branch_operations_manager accounts' });
    }

    // Prevent role change; an empty password means "keep the current one"
    const updateData = { ...req.body, role: existingUser.role, branch_id: null };
    if (!updateData.password) delete updateData.password;
    if (updateData.password !== undefined && String(updateData.password).length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    if (updateData.username && updateData.username !== existingUser.username
        && await User.usernameTaken(updateData.username, { excludeUserId: id })) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم موجود مسبقاً، اختر اسماً آخر' });
    }

    // Removing the last head-office account (or your own) would lock everyone out.
    if (updateData.is_active === false && existingUser.is_active) {
      const guard = await checkDeactivationAllowed(req, existingUser);
      if (guard) return res.status(400).json({ success: false, message: guard });
    }

    // Check email duplicate among active users of same role (exclude self)
    if (req.body.email) {
      const [emailExists] = await sql`
        SELECT id FROM users
        WHERE email = ${req.body.email} AND role = ${existingUser.role} AND is_active = true AND id != ${id}
      `;
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر من نفس النوع' });
      }
    }

    const user = await User.update(id, updateData);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // A password change signs the account out everywhere.
    if (updateData.password !== undefined) {
      await sql`UPDATE users SET token_version = token_version + 1 WHERE id = ${id}`;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to update user');
  }
});

/** Returns an Arabic error string when this account must not be disabled, otherwise null. */
async function checkDeactivationAllowed(req, target) {
  if (target.id === req.user.id && req.user.kind !== 'branch') {
    return 'لا يمكنك تعطيل حسابك الحالي';
  }
  if (target.role === 'main_manager' && target.is_active) {
    const others = await User.countActiveMainManagers(target.id);
    if (others === 0) return 'لا يمكن تعطيل آخر حساب للمسؤول الرئيسي';
  }
  return null;
}

// Disable user (soft delete) — supports main_manager and branch_operations_manager
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existingUser = id ? await User.findByIdAny(id) : null;
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!MANAGED_ROLES.includes(existingUser.role)) {
      return res.status(403).json({ success: false, message: 'Can only delete main_manager or branch_operations_manager accounts' });
    }

    const guard = await checkDeactivationAllowed(req, existingUser);
    if (guard) return res.status(400).json({ success: false, message: guard });

    const user = await User.softDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User deactivated successfully', data: user });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to delete user');
  }
});

// Re-enable a disabled account
router.put('/:id/reactivate', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existingUser = id ? await User.findByIdAny(id) : null;
    if (!existingUser || !MANAGED_ROLES.includes(existingUser.role)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (existingUser.is_active) {
      return res.json({ success: true, data: existingUser, message: 'الحساب مفعل بالفعل' });
    }

    // The username may have been reused while the account was disabled.
    if (await User.usernameTaken(existingUser.username, { excludeUserId: id })) {
      return res.status(409).json({ success: false, message: 'اسم المستخدم مستخدم الآن لحساب آخر. غيّر اسم المستخدم أولاً.' });
    }

    let user;
    try {
      [user] = await sql`
        UPDATE users SET is_active = true, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, username, role, full_name, email, is_active
      `;
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'البريد الإلكتروني أو اسم المستخدم مستخدم لحساب نشط آخر.' });
      }
      throw err;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل تفعيل الحساب');
  }
});

// Unlock an account locked by wrong passwords
router.post('/:id/unlock', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [user] = id
      ? await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${id} RETURNING id, username`
      : [];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل فك القفل');
  }
});

// Set a temporary password (generated unless one is supplied). The account must change it at next sign-in.
// The new password is returned once so the head office can hand it over.
router.post('/:id/reset-password', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const target = id ? await User.findByIdAny(id) : null;
    if (!target || !MANAGED_ROLES.includes(target.role)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const password = req.body?.password ? String(req.body.password) : generateTempPassword();
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    await sql`
      UPDATE users SET password = ${password}, must_change_password = true,
             token_version = token_version + 1, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = ${id}
    `;
    res.json({ success: true, data: { id, username: target.username, temporary_password: password } });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل إعادة تعيين كلمة المرور');
  }
});

// Assign branch to branch_operations_manager
router.post('/:id/assign-branch', async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    const branchAccess = resolveBranchAccessFromScope(req.scope, req.body.branch_id); // policy-scope:allow-direct
    const branchId = branchAccess.effectiveBranchId;
    if (!userId || !branchId) {
      return res.status(400).json({ success: false, message: 'user_id and branch_id required' });
    }
    const user = await User.findById(userId);
    if (!user || user.role !== 'branch_operations_manager') {
      return res.status(400).json({ success: false, message: 'User must be branch_operations_manager' });
    }
    const [branch] = await sql`SELECT id FROM branches WHERE id = ${branchId} AND is_active = true`;
    if (!branch) {
      return res.status(400).json({ success: false, message: 'الفرع غير موجود أو غير مفعل' });
    }
    const assignment = await UserBranchAssignment.assign(userId, branchId, req.user.id);
    res.json({ success: true, data: assignment });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to assign branch');
  }
});

// Replace the whole set of assigned branches in one transaction
router.put('/:id/assigned-branches', async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    const user = userId ? await User.findById(userId) : null;
    if (!user || user.role !== 'branch_operations_manager') {
      return res.status(400).json({ success: false, message: 'User must be branch_operations_manager' });
    }
    const wanted = Array.isArray(req.body.branch_ids)
      ? [...new Set(req.body.branch_ids.map(parseId).filter(Boolean))]
      : null;
    if (!wanted) return res.status(400).json({ success: false, message: 'branch_ids array required' });

    await sql.begin(async (tx) => {
      await tx`DELETE FROM user_branch_assignments WHERE user_id = ${userId} AND NOT (branch_id = ANY(${wanted}::int[]))`;
      for (const branchId of wanted) {
        await tx`
          INSERT INTO user_branch_assignments (user_id, branch_id, assigned_by)
          SELECT ${userId}, b.id, ${req.user.id} FROM branches b WHERE b.id = ${branchId} AND b.is_active = true
          ON CONFLICT (user_id, branch_id) DO NOTHING
        `;
      }
    });
    const branchIds = await UserBranchAssignment.getAssignedBranches(userId);
    res.json({ success: true, data: branchIds });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to update assigned branches');
  }
});

// Unassign branch from branch_operations_manager
router.post('/:id/unassign-branch', async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    const branchAccess = resolveBranchAccessFromScope(req.scope, req.body.branch_id); // policy-scope:allow-direct
    const branchId = branchAccess.effectiveBranchId;
    if (!userId || !branchId) {
      return res.status(400).json({ success: false, message: 'user_id and branch_id required' });
    }
    const user = await User.findById(userId);
    if (!user || user.role !== 'branch_operations_manager') {
      return res.status(400).json({ success: false, message: 'User must be branch_operations_manager' });
    }
    await UserBranchAssignment.unassign(userId, branchId);
    res.json({ success: true, message: 'Branch unassigned' });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to unassign branch');
  }
});

// Get assigned branches for a user
router.get('/:id/assigned-branches', async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    const branchIds = await UserBranchAssignment.getAssignedBranches(userId);
    res.json({ success: true, data: branchIds });
  } catch (error) {
    handleRouteError(error, req, res, 'Failed to get assigned branches');
  }
});

export default router;

/**
 * Authorization Middleware
 * Role-based access control
 */

import sql from '../config/database.js';

/**
 * Check if user has required role
 * @param {string|string[]} allowedRoles - Role(s) allowed to access
 */
export const requireRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    // TODO: Get user from req.user (set by auth middleware)
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Required role: ' + roles.join(' or ')
      });
    }

    next();
  };
};

/**
 * Check if user is main manager
 */
export const requireMainManager = requireRole('main_manager');

/**
 * Check if user is branch manager or main manager
 */
export const requireManager = requireRole(['main_manager', 'branch_manager']);

/**
 * Check if user is any manager (main, branch, or branch_operations_manager)
 */
export const requireAnyManager = requireRole(['main_manager', 'branch_manager', 'branch_operations_manager']);

/**
 * Load assigned branch IDs for branch_operations_manager and attach to req.user.
 * For other roles this is a no-op pass-through.
 */
export const loadAssignedBranches = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return next();

    if (user.role === 'branch_operations_manager' && !user._assignedBranchesLoaded) {
      const rows = await sql`
        SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user.id}
      `;
      user.assigned_branches = rows.map(r => r.branch_id);
      user._assignedBranchesLoaded = true;
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user can access branch data
 * Branch managers can only access their own branch
 * Main managers can access all branches
 * Branch operations managers can only access their assigned branches
 */
export const checkBranchAccess = async (req, res, next) => {
  const user = req.user;
  // Check for branch ID in various places.
  // IMPORTANT: many routes use ":id" for non-branch resources (e.g. bus_id).
  // For bus-transportation routes we must NOT treat params.id as branch_id.
  const isBusTransportationRoute = (req.baseUrl || '').includes('/api/bus-transportation');
  const requestedBranchId = isBusTransportationRoute
    ? (req.params?.branchId || req.params?.branch_id || req.body?.branch_id || req.query?.branch_id)
    : (req.params?.branchId || req.params?.branch_id || req.params?.id || req.body?.branch_id || req.query?.branch_id);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Main manager can access all branches
  if (user.role === 'main_manager') {
    return next();
  }

  // Branch manager can only access their own branch
  if (user.role === 'branch_manager') {
    // If a specific branch ID is requested, check if it matches the user's branch
    if (requestedBranchId) {
      const userBranchId = user.branch_id ? user.branch_id.toString() : null;
      const requestedId = requestedBranchId.toString();

      if (!userBranchId || userBranchId !== requestedId) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط الوصول إلى بيانات فرعك.'
        });
      }
    }
    // If no branch ID is specified, allow access (will be filtered by the route handler)
    return next();
  }

  // Branch operations manager can only access assigned branches
  if (user.role === 'branch_operations_manager') {
    // Ensure assigned branches are loaded
    if (!user._assignedBranchesLoaded) {
      const rows = await sql`
        SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user.id}
      `;
      user.assigned_branches = rows.map(r => r.branch_id);
      user._assignedBranchesLoaded = true;
    }

    if (requestedBranchId) {
      const requestedId = parseInt(requestedBranchId);
      if (!user.assigned_branches || !user.assigned_branches.includes(requestedId)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط الوصول إلى بيانات الفروع المعينة لك.'
        });
      }
    }
    return next();
  }

  next();
};


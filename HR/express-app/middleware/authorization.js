/**
 * Authorization Middleware
 * Role-based access control
 */

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
 * Check if user can access branch data
 * Branch managers can only access their own branch
 * Main managers can access all branches
 */
export const checkBranchAccess = (req, res, next) => {
  const user = req.user;
  const requestedBranchId = req.params.branchId || req.body.branch_id || req.query.branch_id;

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
    if (user.branch_id && requestedBranchId && user.branch_id.toString() !== requestedBranchId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own branch data.'
      });
    }
  }

  next();
};


/**
 * Authentication Middleware
 * JWT-based authentication
 */

import { verifyToken, accountKindForRole } from '../utils/jwt.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { attachRequestScope } from './requestScope.js';

/**
 * Authenticate user via JWT token
 * Sets req.user with decoded token data
 * Validates user exists in database (even if inactive)
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log.warn('Authentication failed: No Bearer token provided', { path: req.path });
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required. Please provide a Bearer token.'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token
    const decoded = verifyToken(token);

    // `users` and `branches` have overlapping id spaces: the token's kind says which
    // table the account is in (old tokens without `kind` are inferred from the role).
    const kind = decoded.kind || accountKindForRole(decoded.role);

    let user = null;
    try {
      if (kind === 'branch') {
        const [branch] = await sql`
          SELECT id, username, is_active, token_version
          FROM branches
          WHERE id = ${decoded.id}
        `;
        if (branch) {
          user = {
            id: branch.id,
            username: branch.username,
            role: 'branch_manager',
            branch_id: branch.id,
            is_active: branch.is_active,
            token_version: branch.token_version
          };
        }
      } else {
        const [dbUser] = await sql`
          SELECT id, username, role, branch_id, is_active, token_version
          FROM users
          WHERE id = ${decoded.id}
        `;
        user = dbUser || null;
      }
    } catch (userCheckError) {
      log.error('Error checking account during authentication', {
        error: userCheckError.message,
        account_kind: kind,
        account_id: decoded.id
      });
      // DB unreachable — cannot verify identity, reject safely
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again.'
      });
    }

    if (!user) {
      log.warn('Authentication failed: account no longer exists', { account_kind: kind, account_id: decoded.id });
      return res.status(401).json({
        success: false,
        code: 'AUTH_NOT_FOUND',
        message: 'User account not found. Please login again.'
      });
    }

    // A disabled account or a bumped token_version (sign-out everywhere) ends the
    // session immediately instead of waiting for the token to expire.
    if (user.is_active === false) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_DISABLED',
        message: 'الحساب معطل. Authentication failed, please contact the administrator.'
      });
    }
    if ((user.token_version ?? 0) !== (decoded.tv ?? 0)) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REVOKED',
        message: 'انتهت الجلسة. Token revoked, please login again.'
      });
    }

    // Attach user info to request. Role and branch come from the database, not
    // from the token, so a role change takes effect on the next request.
    // existsInDb reflects whether this actor has a row in the users table.
    // Branch managers are stored in branches, not users — so their ID cannot
    // be used as a FK referencing users(id).
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id ?? null,
      kind,
      existsInDb: kind !== 'branch'
    };

    await attachRequestScope(req);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      log.warn('Authentication failed: Token expired', { path: req.path });
      return res.status(401).json({
        success: false,
        code: 'AUTH_EXPIRED',
        message: 'Token has expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      log.warn('Authentication failed: Invalid token', { path: req.path });
      return res.status(401).json({
        success: false,
        code: 'AUTH_INVALID',
        message: 'Invalid token. Please login again.'
      });
    }

    log.error('Authentication failed', { error: error.message, path: req.path, stack: error.stack });
    return res.status(401).json({
      success: false,
      code: 'AUTH_FAILED',
      message: 'Authentication failed',
      error: error.message
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 * Sets req.user if valid token is provided
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');

      try {
        const decoded = verifyToken(token);
        req.user = {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role,
          branch_id: decoded.branch_id
        };
      } catch (error) {
        // Invalid token, but continue without user (optional auth)
      }
    }

    await attachRequestScope(req);

    next();
  } catch (error) {
    // Continue even if there's an error (optional auth)
    next();
  }
};


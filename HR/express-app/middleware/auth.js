/**
 * Authentication Middleware
 * JWT-based authentication
 */

import { verifyToken } from '../utils/jwt.js';
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
        message: 'Authentication required. Please provide a Bearer token.'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token
    const decoded = verifyToken(token);

    // Validate user exists in database (even if inactive)
    let user = null;
    try {
      const [dbUser] = await sql`
        SELECT id, username, role, branch_id, is_active
        FROM users
        WHERE id = ${decoded.id}
      `;
      user = dbUser;
    } catch (userCheckError) {
      log.error('Error checking if user exists during authentication', {
        error: userCheckError.message,
        user_id: decoded.id
      });
      // DB unreachable — cannot verify identity, reject safely
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again.'
      });
    }

    // Branch managers are stored in the branches table, not users
    if (!user && decoded.role === 'branch_manager') {
      try {
        const [branch] = await sql`
          SELECT id, username, is_active
          FROM branches
          WHERE id = ${decoded.id}
        `;
        if (branch) {
          user = { id: branch.id, username: branch.username, role: 'branch_manager', branch_id: branch.id, is_active: branch.is_active };
        }
      } catch (branchCheckError) {
        log.error('Error checking branch during authentication', {
          error: branchCheckError.message,
          branch_id: decoded.id
        });
        return res.status(503).json({
          success: false,
          message: 'Service temporarily unavailable. Please try again.'
        });
      }
    }

    if (!user) {
      log.warn('Authentication failed: User no longer exists in database', { user_id: decoded.id });
      return res.status(401).json({
        success: false,
        message: 'User account not found. Please login again.'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      branch_id: decoded.branch_id,
      existsInDb: true
    };

    await attachRequestScope(req);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      log.warn('Authentication failed: Token expired', { path: req.path });
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      log.warn('Authentication failed: Invalid token', { path: req.path });
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }

    log.error('Authentication failed', { error: error.message, path: req.path, stack: error.stack });
    return res.status(401).json({
      success: false,
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


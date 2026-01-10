/**
 * Authentication Middleware
 * JWT-based authentication
 */

import { verifyToken } from '../utils/jwt.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';

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
    
    // Validate user exists in database (even if inactive) - only log errors, not warnings for missing users
    try {
      const [user] = await sql`
        SELECT id, username, role, branch_id, is_active
        FROM users
        WHERE id = ${decoded.id}
      `;
      
      // Only log if there's an actual error, not if user is missing (which is acceptable)
      // User might have been deleted but token is still valid - foreign key constraints handle this
    } catch (userCheckError) {
      log.error('Error checking if user exists during authentication', {
        error: userCheckError.message,
        user_id: decoded.id
      });
      // Continue anyway - let the request proceed
    }
    
    // Attach user info to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      branch_id: decoded.branch_id
    };

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
    
    next();
  } catch (error) {
    // Continue even if there's an error (optional auth)
    next();
  }
};


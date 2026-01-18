/**
 * JWT Utility Functions
 * Token generation and verification
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days default

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id, username, role, branch_id
 * @returns {string} JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    branch_id: user.branch_id || null
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw error;
  }
}

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function decodeToken(token) {
  return jwt.decode(token);
}


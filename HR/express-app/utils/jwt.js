/**
 * JWT Utility Functions
 * Token generation and verification
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET environment variable is required in production'); })()
  : 'your-secret-key-change-in-production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days default
const OTP_SESSION_EXPIRES_IN = '15m';

/**
 * Which table an account lives in. Branch managers are rows of `branches`, every
 * other role is a row of `users`, and the two id spaces overlap, so the token must
 * say which one it means. Tokens issued before `kind` existed are inferred from the
 * role (only branch managers ever came from `branches`).
 */
export function accountKindForRole(role) {
  return role === 'branch_manager' ? 'branch' : 'user';
}

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
    branch_id: user.branch_id || null,
    kind: user.kind || accountKindForRole(user.role),
    tv: Number.isInteger(user.token_version) ? user.token_version : 0
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * Short-lived token proving the password step succeeded. The OTP endpoints accept
 * only this, never a bare username, so the code step cannot be used to log in
 * without the password.
 */
export function signOtpSession({ kind, id, username }) {
  return jwt.sign({ purpose: 'otp', kind, id, username }, JWT_SECRET, {
    expiresIn: OTP_SESSION_EXPIRES_IN
  });
}

export function verifyOtpSession(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.purpose !== 'otp' || !['user', 'branch'].includes(decoded.kind) || !decoded.id) {
    const err = new Error('Invalid OTP session');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return decoded;
}

/**
 * Verify JWT token (login tokens only; an OTP-session token is not a login token)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.purpose === 'otp') {
    const err = new Error('OTP session token cannot be used to authenticate');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return decoded;
}

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

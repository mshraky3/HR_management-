/**
 * Small in-memory rate limiter.
 *
 * Serverless instances do not share memory, so this is a best-effort brake against
 * bursts from one client on a warm instance. The real brute-force protection is
 * stored in the database (users/branches.failed_attempts + locked_until and the
 * atomic OTP attempt counter in services/authService.js).
 */

const buckets = new Map();
const MAX_BUCKETS = 5000;

function prune(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {Object} opts
 * @param {string} opts.name - bucket namespace
 * @param {number} opts.windowMs
 * @param {number} opts.max - requests allowed per key per window
 * @param {(req) => string} [opts.key] - defaults to client IP
 * @param {string} [opts.message]
 */
export function rateLimit({ name, windowMs, max, key, message }) {
  return (req, res, next) => {
    // Integration tests fire many requests from one address; the database-backed
    // limits (lockout, OTP attempt cap) are what they exercise. Test runs only.
    if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_DISABLED === 'true') return next();
    const now = Date.now();
    prune(now);
    const id = `${name}:${key ? key(req) : clientIp(req)}`;
    let entry = buckets.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: message || 'محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        retryAfter
      });
    }
    next();
  };
}

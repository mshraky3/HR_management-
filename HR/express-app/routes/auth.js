/**
 * Authentication Routes
 * Login, OTP, current user, change password, logout
 *
 * Login flow:
 *   POST /login      password check -> main manager gets a token; branch managers and
 *                    operations managers get { requiresOTP, otp_session } and an e-mailed code
 *   POST /verify-otp { otp_session, otp }  -> token
 *   POST /resend-otp { otp_session }
 * The otp_session is a short-lived signed token issued only after the password step,
 * so the code step cannot be used to log in with just a username.
 */

import express from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { rateLimit, clientIp } from '../middleware/rateLimit.js';
import { User } from '../models/User.js';
import { Branch } from '../models/Branch.js';
import { Request } from '../models/Request.js';
import { generateToken, signOtpSession, verifyOtpSession } from '../utils/jwt.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import {
  maskEmail,
  logLoginEvent,
  lockMinutesRemaining,
  lockedResponse,
  registerLoginFailure,
  registerLoginSuccess,
  sendOtp,
  verifyOtp,
  trackBranchDailyLogin
} from '../services/authService.js';

const router = express.Router();

const BAD_CREDENTIALS = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const SESSION_EXPIRED_MSG = 'انتهت جلسة التحقق. يرجى تسجيل الدخول من جديد.';

const loginLimiter = rateLimit({ name: 'login', windowMs: 10 * 60 * 1000, max: 40 });
const otpLimiter = rateLimit({ name: 'otp', windowMs: 10 * 60 * 1000, max: 30 });
const emailRequestLimiter = rateLimit({
  name: 'email-update',
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: (req) => `${clientIp(req)}:${String(req.body?.username || '').toLowerCase()}`
});

function userPayload(account, extra = {}) {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    branch_id: account.branch_id,
    full_name: account.full_name,
    email: account.email ?? null,
    branch_type: account.branch_type || null,
    must_change_password: Boolean(account.must_change_password),
    ...extra
  };
}

function branchAccount(branch) {
  return {
    id: branch.id,
    username: branch.username,
    role: 'branch_manager',
    branch_id: branch.id,
    full_name: branch.branch_name,
    email: null,
    branch_type: branch.branch_type,
    must_change_password: branch.must_change_password,
    token_version: branch.token_version
  };
}

/** Loads the account an otp_session points at, or null when it is gone / disabled / wrong role. */
async function loadOtpAccount(session) {
  if (session.kind === 'branch') {
    const [branch] = await sql`SELECT * FROM branches WHERE id = ${session.id} AND is_active = true`;
    if (!branch) return null;
    return { kind: 'branch', row: branch, email: branch.email, displayName: branch.branch_name };
  }
  const [user] = await sql`SELECT * FROM users WHERE id = ${session.id} AND is_active = true`;
  // Only operations managers use the e-mail code; refusing every other role keeps the
  // head-office account off this path.
  if (!user || user.role !== 'branch_operations_manager') return null;
  return { kind: 'user', row: user, email: user.email, displayName: user.full_name || user.username };
}

function otpFailureResponse(res, result) {
  switch (result.reason) {
    case 'none':
      return res.status(400).json({ success: false, message: 'لا يوجد رمز تحقق نشط. يرجى طلب رمز جديد.' });
    case 'expired':
      return res.status(400).json({ success: false, expired: true, message: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.' });
    case 'locked':
      return res.status(429).json({ success: false, expired: true, message: 'تم تجاوز عدد المحاولات المسموحة. يرجى طلب رمز جديد.' });
    default:
      return res.status(401).json({
        success: false,
        message: `رمز التحقق غير صحيح. المحاولات المتبقية: ${result.remaining ?? 0}`
      });
  }
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    // Users (head office, operations) first, then branch accounts; same order as before.
    let account = null;
    let kind = 'user';
    try {
      account = await User.findByUsername(username);
      if (!account) {
        account = await Branch.findByUsername(username);
        kind = 'branch';
      }
    } catch (dbError) {
      log.error('Database error during login lookup', { error: dbError.message });
      return handleRouteError(dbError, req, res, 'خطأ في اتصال قاعدة البيانات. يرجى التحقق من إعدادات الخادم.');
    }

    if (!account) {
      await logLoginEvent(kind, null, username, 'unknown_user', req);
      return res.status(401).json({ success: false, message: BAD_CREDENTIALS });
    }

    const minutes = lockMinutesRemaining(account);
    if (minutes > 0) {
      await logLoginEvent(kind, account.id, username, 'blocked_locked', req);
      return res.status(429).json(lockedResponse(minutes));
    }

    // Passwords are stored as entered (owner decision); the compare stays as it was.
    if (account.password !== password) {
      const state = await registerLoginFailure(kind, account.id);
      await logLoginEvent(kind, account.id, username, 'bad_password', req);
      const lockedFor = lockMinutesRemaining(state);
      if (lockedFor > 0) return res.status(429).json(lockedResponse(lockedFor));
      return res.status(401).json({ success: false, message: BAD_CREDENTIALS });
    }

    // --- branch account: password OK -> e-mailed code -------------------------
    if (kind === 'branch') {
      if (!account.email) {
        return res.status(400).json({
          success: false,
          noEmail: true,
          username: account.username,
          branchName: account.branch_name,
          message: 'لا يوجد بريد إلكتروني مسجل لهذا الفرع. يرجى التواصل مع المسؤول.'
        });
      }
      return await startOtpLogin(req, res, 'branch', account, account.email, account.branch_name);
    }

    // --- operations manager: password OK -> e-mailed code ---------------------
    if (account.role === 'branch_operations_manager') {
      if (!account.email) {
        return res.status(400).json({
          success: false,
          noEmail: true,
          username: account.username,
          message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب. يرجى التواصل مع المسؤول.'
        });
      }
      return await startOtpLogin(req, res, 'user', account, account.email, account.full_name || account.username);
    }

    // --- head office (and any other user role): token right away -------------
    await registerLoginSuccess('user', account.id);
    await logLoginEvent('user', account.id, username, 'login_ok', req);

    const token = generateToken({
      id: account.id,
      username: account.username,
      role: account.role,
      branch_id: account.branch_id,
      kind: 'user',
      token_version: account.token_version
    });

    if (account.role === 'branch_manager' && account.branch_id) {
      await trackBranchDailyLogin(account.branch_id, account.id, req);
    }

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: userPayload(account)
    });
  } catch (error) {
    log.error('Login error', { error: error.message });
    handleRouteError(error, req, res, 'فشل تسجيل الدخول');
  }
});

async function startOtpLogin(req, res, kind, account, email, displayName) {
  const otpSession = signOtpSession({ kind, id: account.id, username: account.username });
  const result = await sendOtp(kind, account.id, email, displayName);

  if (!result.ok && result.reason === 'email_failed') {
    return res.status(500).json({ success: false, message: 'فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.' });
  }

  await logLoginEvent(kind, account.id, account.username, result.ok ? 'otp_sent' : 'otp_cooldown', req);
  res.json({
    success: true,
    requiresOTP: true,
    isUserOTP: kind === 'user',
    otp_session: otpSession,
    maskedEmail: maskEmail(email),
    username: account.username,
    message: result.ok
      ? 'تم التحقق من بيانات الدخول. تم إرسال رمز التحقق إلى البريد الإلكتروني.'
      : 'رمز التحقق قد أُرسل بالفعل. يرجى الانتظار قبل طلب رمز جديد.'
  });
}

/**
 * POST /api/auth/verify-otp
 * Body: { otp_session, otp }
 */
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { otp_session: otpSession, otp } = req.body || {};
    if (!otpSession || !otp) {
      return res.status(400).json({ success: false, message: 'رمز التحقق مطلوب' });
    }

    let session;
    try {
      session = verifyOtpSession(otpSession);
    } catch {
      return res.status(401).json({ success: false, sessionExpired: true, message: SESSION_EXPIRED_MSG });
    }

    const loaded = await loadOtpAccount(session);
    if (!loaded) {
      return res.status(401).json({ success: false, sessionExpired: true, message: 'الحساب غير موجود أو معطل' });
    }
    const { kind, row } = loaded;

    const result = await verifyOtp(kind, row.id, String(otp).trim());
    if (!result.ok) {
      await logLoginEvent(kind, row.id, row.username, `otp_${result.reason}`, req);
      return otpFailureResponse(res, result);
    }

    await registerLoginSuccess(kind, row.id);
    await logLoginEvent(kind, row.id, row.username, 'login_ok', req);

    if (kind === 'branch') {
      const account = branchAccount(row);
      const token = generateToken({ ...account, kind: 'branch' });
      await trackBranchDailyLogin(row.id, null, req);
      log.info('Branch OTP login successful', { branch_id: row.id });
      return res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        token,
        user: userPayload(account)
      });
    }

    const assigned = await sql`SELECT branch_id FROM user_branch_assignments WHERE user_id = ${row.id}`;
    const assignedBranchIds = assigned.map((r) => r.branch_id);
    const token = generateToken({
      id: row.id,
      username: row.username,
      role: row.role,
      branch_id: row.branch_id,
      kind: 'user',
      token_version: row.token_version
    });
    log.info('User OTP login successful', { userId: row.id });
    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: userPayload(row, { assigned_branches: assignedBranchIds })
    });
  } catch (error) {
    log.error('OTP verification error', { error: error.message });
    handleRouteError(error, req, res, 'فشل التحقق من الرمز');
  }
});

/**
 * POST /api/auth/resend-otp
 * Body: { otp_session }
 */
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { otp_session: otpSession } = req.body || {};
    if (!otpSession) {
      return res.status(400).json({ success: false, message: SESSION_EXPIRED_MSG, sessionExpired: true });
    }

    let session;
    try {
      session = verifyOtpSession(otpSession);
    } catch {
      return res.status(401).json({ success: false, sessionExpired: true, message: SESSION_EXPIRED_MSG });
    }

    const loaded = await loadOtpAccount(session);
    if (!loaded) {
      return res.status(401).json({ success: false, sessionExpired: true, message: 'الحساب غير موجود أو معطل' });
    }
    if (!loaded.email) {
      return res.status(400).json({ success: false, message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب.' });
    }

    const result = await sendOtp(loaded.kind, loaded.row.id, loaded.email, loaded.displayName);
    if (!result.ok && result.reason === 'cooldown') {
      return res.status(429).json({
        success: false,
        message: `يرجى الانتظار ${result.waitSeconds} ثانية قبل إعادة إرسال الرمز.`
      });
    }
    if (!result.ok) {
      return res.status(500).json({ success: false, message: 'فشل إرسال رمز التحقق.' });
    }

    await logLoginEvent(loaded.kind, loaded.row.id, loaded.row.username, 'otp_resent', req);
    res.json({
      success: true,
      maskedEmail: maskEmail(loaded.email),
      message: 'تم إعادة إرسال رمز التحقق بنجاح.'
    });
  } catch (error) {
    log.error('Resend OTP error', { error: error.message });
    handleRouteError(error, req, res, 'حدث خطأ أثناء إعادة إرسال الرمز.');
  }
});

/**
 * GET /api/auth/me
 * Looks in the table the token's kind names (users and branches share ids).
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    let user = null;

    if (req.user.kind === 'branch') {
      const [branch] = await sql`
        SELECT id, username, branch_name, branch_type, is_active, must_change_password
        FROM branches WHERE id = ${req.user.id}
      `;
      if (branch) {
        user = {
          id: branch.id,
          username: branch.username,
          role: 'branch_manager',
          branch_id: branch.id,
          full_name: branch.branch_name,
          email: null,
          is_active: branch.is_active,
          branch_type: branch.branch_type,
          must_change_password: branch.must_change_password,
          created_at: null
        };
      }
    } else {
      user = await User.findById(req.user.id);
      if (user) {
        const [flags] = await sql`SELECT must_change_password FROM users WHERE id = ${user.id}`;
        user.must_change_password = Boolean(flags?.must_change_password);
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_NOT_FOUND',
        message: 'Authentication failed. User not found.'
      });
    }

    let assigned_branches = null;
    if (user.role === 'branch_operations_manager') {
      try {
        const assignments = await sql`SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user.id}`;
        assigned_branches = assignments.map((r) => r.branch_id);
      } catch {
        assigned_branches = [];
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email,
        is_active: user.is_active,
        created_at: user.created_at,
        branch_type: user.branch_type || null,
        must_change_password: Boolean(user.must_change_password),
        ...(assigned_branches !== null && { assigned_branches })
      }
    });
  } catch (error) {
    log.error('Get user error', { error: error.message });
    handleRouteError(error, req, res, 'فشل الحصول على معلومات المستخدم');
  }
});

/**
 * PUT /api/auth/change-password
 * Body: { current_password, new_password }
 * Any signed-in account may change its own password. Signs out every other session
 * (token_version) and returns a fresh token for this one.
 */
router.put('/change-password', authenticate, loginLimiter, async (req, res) => {
  try {
    const { current_password: current, new_password: next } = req.body || {};
    if (typeof current !== 'string' || typeof next !== 'string' || !current || !next) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية والجديدة مطلوبتان' });
    }
    if (next.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }
    if (next === current) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' });
    }

    const table = req.user.kind === 'branch' ? 'branches' : 'users';
    const [account] = await sql.unsafe(
      `SELECT id, username, password, token_version${table === 'users' ? ', role, branch_id' : ''} FROM ${table} WHERE id = $1`,
      [req.user.id]
    );
    if (!account || account.password !== current) {
      await logLoginEvent(req.user.kind, req.user.id, req.user.username, 'change_password_bad_current', req);
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    const [updated] = await sql.unsafe(
      `UPDATE ${table} SET password = $2, must_change_password = false, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING token_version`,
      [req.user.id, next]
    );
    if (req.user.kind === 'branch') Branch.clearCache(req.user.id);

    await logLoginEvent(req.user.kind, req.user.id, req.user.username, 'password_changed', req);

    const token = generateToken({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      branch_id: req.user.branch_id,
      kind: req.user.kind,
      token_version: updated.token_version
    });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح', token });
  } catch (error) {
    log.error('Change password error', { error: error.message });
    handleRouteError(error, req, res, 'فشل تغيير كلمة المرور');
  }
});

// Logout endpoint
// Use optionalAuth instead of authenticate to allow logout even with expired tokens
router.post('/logout', optionalAuth, (req, res) => {
  res.json({
    success: true,
    message: 'تم تسجيل الخروج بنجاح'
  });
});

/**
 * Request email update (public – no auth required, used from login page)
 * POST /api/auth/request-email-update
 * Body: { username, newEmail }
 * Always answers the same way so it cannot be used to discover which usernames exist.
 */
router.post('/request-email-update', emailRequestLimiter, async (req, res) => {
  try {
    const { username, newEmail } = req.body || {};
    if (!username || !newEmail) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم والبريد الإلكتروني مطلوبان' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    const okResponse = { success: true, message: 'تم إرسال طلب تحديث البريد الإلكتروني للمسؤول بنجاح.' };

    const branch = await Branch.findByUsername(username);
    if (!branch) return res.json(okResponse);

    const [mainManager] = await sql`
      SELECT id, email, full_name FROM users WHERE role = 'main_manager' AND is_active = true ORDER BY id LIMIT 1
    `;
    if (!mainManager) return res.json(okResponse);

    // One open email-update request per branch is enough.
    const [openRequest] = await sql`
      SELECT id FROM requests
      WHERE branch_id = ${branch.id} AND request_name = 'طلب تحديث البريد الإلكتروني'
        AND created_at > NOW() - INTERVAL '1 day'
      LIMIT 1
    `;
    if (openRequest) return res.json(okResponse);

    await Request.create({
      branch_id: branch.id,
      main_manager_id: mainManager.id,
      employee_id: null,
      request_name: 'طلب تحديث البريد الإلكتروني',
      request_text: `يطلب فرع "${branch.branch_name}" تحديث البريد الإلكتروني إلى: ${newEmail}`,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      r2_attachment_url: null
    });

    try {
      const managerEmail = process.env.MAIN_MANAGER_EMAIL || mainManager.email;
      await sendNotificationEmail({
        to: managerEmail,
        subject: 'طلب تحديث بريد إلكتروني لفرع',
        message: `الفرع: ${branch.branch_name}\nالبريد المطلوب: ${newEmail}`,
        notificationType: 'branch_email_update_request',
        appUrl: `${process.env.FRONTEND_URL || 'https://hr-react-theta.vercel.app'}`,
        data: { branchName: branch.branch_name, newEmail }
      });
    } catch (emailErr) {
      log.warn('Failed to email main manager about email update request', { error: emailErr.message });
    }

    res.json(okResponse);
  } catch (error) {
    log.error('Request email update error', { error: error.message });
    handleRouteError(error, req, res, 'حدث خطأ أثناء إرسال الطلب.');
  }
});

export default router;

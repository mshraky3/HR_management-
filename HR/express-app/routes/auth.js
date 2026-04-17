/**
 * Authentication Routes
 * Login, logout, get current user
 */

import express from 'express';
import crypto from 'crypto';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Branch } from '../models/Branch.js';
import { Request } from '../models/Request.js';
import { generateToken } from '../utils/jwt.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { sendOTPEmail, sendNotificationEmail } from '../utils/emailService.js';

const router = express.Router();

// OTP config
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashOTP(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  const visible = local.length <= 3 ? local[0] : local.slice(0, 3);
  return `${visible}***@${domain}`;
}

async function ensureBranchOtpTableExists() {
  await sql`
    CREATE TABLE IF NOT EXISTS branch_otp_tokens (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      otp_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_branch_otp_branch_id ON branch_otp_tokens(branch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_branch_otp_expires ON branch_otp_tokens(expires_at)`;
}

async function ensureUserOtpTableExists() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_otp_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_otp_user_id ON user_otp_tokens(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_otp_expires ON user_otp_tokens(expires_at)`;
}

/**
 * Login endpoint
 * POST /api/auth/login
 * Body: { username, password }
 * Supports both user accounts (users table) and branch accounts (branches table)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'اسم المستخدم وكلمة المرور مطلوبان'
      });
    }

    // First, try to find user in users table
    let user;
    let isBranchLogin = false;

    try {
      user = await User.findByUsername(username);
    } catch (dbError) {
      log.error('Database error in User.findByUsername', { error: dbError.message });
      return res.status(500).json({
        success: false,
        message: 'خطأ في اتصال قاعدة البيانات. يرجى التحقق من إعدادات الخادم.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // If not found in users table, check branches table
    if (!user) {
      let branch;
      try {
        branch = await Branch.findByUsername(username);
      } catch (dbError) {
        log.error('Database error in Branch.findByUsername', { error: dbError.message });
        return res.status(500).json({
          success: false,
          message: 'خطأ في اتصال قاعدة البيانات. يرجى التحقق من إعدادات الخادم.',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }

      if (branch) {
        // Check branch password
        if (branch.password !== password) {
          return res.status(401).json({
            success: false,
            message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
          });
        }

        // Check if branch is active
        if (!branch.is_active) {
          return res.status(403).json({
            success: false,
            message: 'حساب الفرع معطل. يرجى الاتصال بالمسؤول.'
          });
        }

        // Branch login requires OTP via email
        const branchEmail = branch.email;
        if (!branchEmail) {
          return res.status(400).json({
            success: false,
            noEmail: true,
            username: branch.username,
            branchName: branch.branch_name,
            message: 'لا يوجد بريد إلكتروني مسجل لهذا الفرع. يرجى التواصل مع المسؤول.'
          });
        }

        // Guard against schema drift in production (prevents 500 if table is missing)
        await ensureBranchOtpTableExists();

        // Check resend cooldown
        const [recentOTP] = await sql`
          SELECT created_at,
                 EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_seconds
          FROM branch_otp_tokens
          WHERE branch_id = ${branch.id}
          ORDER BY created_at DESC LIMIT 1
        `;
        if (recentOTP) {
          const elapsed = Number(recentOTP.elapsed_seconds);
          if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
            return res.json({
              success: true,
              requiresOTP: true,
              maskedEmail: maskEmail(branchEmail),
              username: branch.username,
              message: 'رمز التحقق قد أُرسل بالفعل. يرجى الانتظار قبل طلب رمز جديد.'
            });
          }
        }

        // Invalidate old tokens and generate new OTP
        await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${branch.id}`;
        const code = generateOTP();
        const otpHash = hashOTP(code);

        await sql`
          INSERT INTO branch_otp_tokens (branch_id, otp_hash, expires_at)
          VALUES (${branch.id}, ${otpHash}, NOW() + INTERVAL '${sql.unsafe(String(OTP_EXPIRY_MINUTES))} minutes')
        `;

        // Send OTP email
        const emailResult = await sendOTPEmail(branchEmail, code, branch.branch_name);
        if (!emailResult.success) {
          log.error('Failed to send OTP email', { branchId: branch.id, error: emailResult.error });
          return res.status(500).json({
            success: false,
            message: 'فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.'
          });
        }

        return res.json({
          success: true,
          requiresOTP: true,
          maskedEmail: maskEmail(branchEmail),
          username: branch.username,
          message: 'تم التحقق من بيانات الدخول. تم إرسال رمز التحقق إلى البريد الإلكتروني.'
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
      });
    }

    // Check if user is active (for regular user logins)
    if (!isBranchLogin && !user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'الحساب معطل. يرجى الاتصال بالمسؤول.'
      });
    }

    // Compare password (for regular user logins)
    if (!isBranchLogin && user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
      });
    }

    // branch_operations_manager requires email OTP (same UX as branch login)
    if (user.role === 'branch_operations_manager') {
      const userEmail = user.email;
      if (!userEmail) {
        return res.status(400).json({
          success: false,
          noEmail: true,
          username: user.username,
          message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب. يرجى التواصل مع المسؤول.'
        });
      }

      await ensureUserOtpTableExists();

      // Check resend cooldown
      const [recentOTP] = await sql`
        SELECT created_at,
               EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_seconds
        FROM user_otp_tokens
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (recentOTP) {
        const elapsed = Number(recentOTP.elapsed_seconds);
        if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
          return res.json({
            success: true,
            requiresOTP: true,
            isUserOTP: true,
            maskedEmail: maskEmail(userEmail),
            username: user.username,
            message: 'رمز التحقق قد أُرسل بالفعل. يرجى الانتظار قبل طلب رمز جديد.'
          });
        }
      }

      // Invalidate old tokens and generate new OTP
      await sql`DELETE FROM user_otp_tokens WHERE user_id = ${user.id}`;
      const code = generateOTP();
      const otpHash = hashOTP(code);

      await sql`
        INSERT INTO user_otp_tokens (user_id, otp_hash, expires_at)
        VALUES (${user.id}, ${otpHash}, NOW() + INTERVAL '${sql.unsafe(String(OTP_EXPIRY_MINUTES))} minutes')
      `;

      const emailResult = await sendOTPEmail(userEmail, code, user.full_name || user.username);
      if (!emailResult.success) {
        log.error('Failed to send OTP email to user', { userId: user.id, error: emailResult.error });
        return res.status(500).json({
          success: false,
          message: 'فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.'
        });
      }

      return res.json({
        success: true,
        requiresOTP: true,
        isUserOTP: true,
        maskedEmail: maskEmail(userEmail),
        username: user.username,
        message: 'تم التحقق من بيانات الدخول. تم إرسال رمز التحقق إلى البريد الإلكتروني.'
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    });

    // Track login for branch managers (only track once per day per branch)
    if (user.role === 'branch_manager' && user.branch_id) {
      try {
        const sql = (await import('../config/database.js')).default;
        const today = new Date().toISOString().split('T')[0];
        const ipAddress = req.ip || req.connection.remoteAddress || null;
        const userAgent = req.get('user-agent') || null;

        // Check if login already recorded for today
        const [existingLogin] = await sql`
          SELECT id FROM user_logins
          WHERE branch_id = ${user.branch_id}
          AND login_date = ${today}
          LIMIT 1
        `;

        // Only insert if no login recorded for today
        if (!existingLogin) {
          await sql`
            INSERT INTO user_logins (user_id, branch_id, login_date, ip_address, user_agent)
            VALUES (${isBranchLogin ? null : user.id}, ${user.branch_id}, ${today}, ${ipAddress}, ${userAgent})
          `;
        }
      } catch (loginTrackingError) {
        // Don't fail login if tracking fails, just log it
        log.warn('Error tracking login', { error: loginTrackingError.message });
      }
    }

    // Return token and user info (without password)
    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email,
        branch_type: user.branch_type || null
      }
    });
  } catch (error) {
    log.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل تسجيل الدخول',
      error: process.env.NODE_ENV === 'production'
        ? 'خطأ داخلي في الخادم. يرجى التحقق من سجلات الخادم.'
        : error.message
    });
  }
});

/**
 * Verify email OTP and complete branch login
 * POST /api/auth/verify-otp
 * Body: { username, otp }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { username, otp, isUserOTP } = req.body;

    log.info('verify-otp request', { username, isUserOTP, hasOtp: !!otp });

    if (!username || !otp) {
      return res.status(400).json({
        success: false,
        message: 'اسم المستخدم ورمز التحقق مطلوبان'
      });
    }

    // === User-based OTP (branch_operations_manager) ===
    if (isUserOTP) {
      log.info('verify-otp: entering user OTP path', { username });
      const userAccount = await User.findByUsername(username);
      if (!userAccount || !userAccount.is_active) {
        log.warn('verify-otp: user not found or inactive', { username, found: !!userAccount });
        return res.status(401).json({
          success: false,
          message: 'الحساب غير موجود أو معطل'
        });
      }

      await ensureUserOtpTableExists();

      const [otpRecord] = await sql`
        SELECT id, otp_hash, expires_at, attempts,
               (NOW() > expires_at) as is_expired
        FROM user_otp_tokens
        WHERE user_id = ${userAccount.id}
        ORDER BY created_at DESC LIMIT 1
      `;

      if (!otpRecord) {
        log.warn('verify-otp: no OTP record found', { userId: userAccount.id });
        return res.status(400).json({
          success: false,
          message: 'لا يوجد رمز تحقق نشط. يرجى طلب رمز جديد.'
        });
      }

      log.info('verify-otp: OTP record found', { userId: userAccount.id, isExpired: otpRecord.is_expired, attempts: otpRecord.attempts });

      if (otpRecord.is_expired) {
        log.warn('verify-otp: OTP expired', { userId: userAccount.id });
        await sql`DELETE FROM user_otp_tokens WHERE user_id = ${userAccount.id}`;
        return res.status(400).json({
          success: false,
          message: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.',
          expired: true
        });
      }

      if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
        await sql`DELETE FROM user_otp_tokens WHERE user_id = ${userAccount.id}`;
        return res.status(429).json({
          success: false,
          message: 'تم تجاوز عدد المحاولات المسموحة. يرجى طلب رمز جديد.',
          expired: true
        });
      }

      const inputHash = hashOTP(otp);
      if (inputHash !== otpRecord.otp_hash) {
        await sql`
          UPDATE user_otp_tokens SET attempts = attempts + 1
          WHERE id = ${otpRecord.id}
        `;
        const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
        return res.status(401).json({
          success: false,
          message: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`
        });
      }

      // OTP verified — delete token and issue JWT
      await sql`DELETE FROM user_otp_tokens WHERE user_id = ${userAccount.id}`;

      // Load assigned branches for token
      const assignedBranches = await sql`
        SELECT branch_id FROM user_branch_assignments WHERE user_id = ${userAccount.id}
      `;
      const assignedBranchIds = assignedBranches.map(r => r.branch_id);

      const token = generateToken({
        id: userAccount.id,
        username: userAccount.username,
        role: userAccount.role,
        branch_id: userAccount.branch_id,
        assigned_branches: assignedBranchIds
      });

      log.info('User OTP login successful', { username, userId: userAccount.id });

      return res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        token,
        user: {
          id: userAccount.id,
          username: userAccount.username,
          role: userAccount.role,
          branch_id: userAccount.branch_id,
          full_name: userAccount.full_name,
          email: userAccount.email,
          assigned_branches: assignedBranchIds
        }
      });
    }

    // === Branch-based OTP (branch_manager) ===
    // Find branch
    const branch = await Branch.findByUsername(username);
    if (!branch || !branch.is_active) {
      return res.status(401).json({
        success: false,
        message: 'حساب الفرع غير موجود أو معطل'
      });
    }

    // Guard against schema drift in production (prevents 500 if table is missing)
    await ensureBranchOtpTableExists();

    // Find active OTP token
    const [otpRecord] = await sql`
      SELECT id, otp_hash, expires_at, attempts,
             (NOW() > expires_at) as is_expired
      FROM branch_otp_tokens
      WHERE branch_id = ${branch.id}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'لا يوجد رمز تحقق نشط. يرجى طلب رمز جديد.'
      });
    }

    // Check expiry
    if (otpRecord.is_expired) {
      await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${branch.id}`;
      return res.status(400).json({
        success: false,
        message: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.',
        expired: true
      });
    }

    // Check max attempts
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${branch.id}`;
      return res.status(429).json({
        success: false,
        message: 'تم تجاوز عدد المحاولات المسموحة. يرجى طلب رمز جديد.',
        expired: true
      });
    }

    // Verify OTP hash
    const inputHash = hashOTP(otp);
    if (inputHash !== otpRecord.otp_hash) {
      await sql`
        UPDATE branch_otp_tokens SET attempts = attempts + 1
        WHERE id = ${otpRecord.id}
      `;
      const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
      return res.status(401).json({
        success: false,
        message: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`
      });
    }

    // OTP verified — delete token and issue JWT
    await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${branch.id}`;

    const user = {
      id: branch.id,
      username: branch.username,
      role: 'branch_manager',
      branch_id: branch.id,
      full_name: branch.branch_name,
      email: null,
      is_active: branch.is_active,
      branch_type: branch.branch_type
    };

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    });

    // Track login
    try {
      const today = new Date().toISOString().split('T')[0];
      const ipAddress = req.ip || req.connection.remoteAddress || null;
      const userAgent = req.get('user-agent') || null;
      const [existingLogin] = await sql`
        SELECT id FROM user_logins
        WHERE branch_id = ${branch.id} AND login_date = ${today}
        LIMIT 1
      `;
      if (!existingLogin) {
        await sql`
          INSERT INTO user_logins (user_id, branch_id, login_date, ip_address, user_agent)
          VALUES (${null}, ${branch.id}, ${today}, ${ipAddress}, ${userAgent})
        `;
      }
    } catch (trackingError) {
      log.warn('Error tracking OTP login', { error: trackingError.message });
    }

    log.info('Branch OTP login successful', { username, branch_id: branch.id });

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email,
        branch_type: user.branch_type || null
      }
    });
  } catch (error) {
    log.error('OTP verification error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل التحقق من الرمز',
      error: process.env.NODE_ENV === 'production'
        ? 'خطأ داخلي في الخادم.'
        : error.message
    });
  }
});

/**
 * Resend OTP code
 * POST /api/auth/resend-otp
 * Body: { username }
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { username, isUserOTP } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });
    }

    // === User-based OTP (branch_operations_manager) ===
    if (isUserOTP) {
      const userAccount = await User.findByUsername(username);
      if (!userAccount || !userAccount.is_active) {
        return res.status(401).json({ success: false, message: 'الحساب غير موجود أو معطل' });
      }

      const userEmail = userAccount.email;
      if (!userEmail) {
        return res.status(400).json({ success: false, message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب.' });
      }

      await ensureUserOtpTableExists();

      const [recentOTP] = await sql`
        SELECT created_at,
               EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_seconds
        FROM user_otp_tokens
        WHERE user_id = ${userAccount.id}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (recentOTP) {
        const elapsed = Number(recentOTP.elapsed_seconds);
        if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
          const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
          return res.status(429).json({
            success: false,
            message: `يرجى الانتظار ${wait} ثانية قبل إعادة إرسال الرمز.`
          });
        }
      }

      await sql`DELETE FROM user_otp_tokens WHERE user_id = ${userAccount.id}`;
      const code = generateOTP();
      const otpHash = hashOTP(code);

      await sql`
        INSERT INTO user_otp_tokens (user_id, otp_hash, expires_at)
        VALUES (${userAccount.id}, ${otpHash}, NOW() + INTERVAL '${sql.unsafe(String(OTP_EXPIRY_MINUTES))} minutes')
      `;

      const emailResult = await sendOTPEmail(userEmail, code, userAccount.full_name || userAccount.username);
      if (!emailResult.success) {
        return res.status(500).json({ success: false, message: 'فشل إرسال رمز التحقق.' });
      }

      return res.json({
        success: true,
        maskedEmail: maskEmail(userEmail),
        message: 'تم إعادة إرسال رمز التحقق بنجاح.'
      });
    }

    // === Branch-based OTP ===
    const branch = await Branch.findByUsername(username);
    if (!branch || !branch.is_active) {
      return res.status(401).json({ success: false, message: 'حساب الفرع غير موجود أو معطل' });
    }

    const branchEmail = branch.email;
    if (!branchEmail) {
      return res.status(400).json({ success: false, message: 'لا يوجد بريد إلكتروني مسجل لهذا الفرع.' });
    }

    // Guard against schema drift in production (prevents 500 if table is missing)
    await ensureBranchOtpTableExists();

    // Check cooldown
    const [recentOTP] = await sql`
      SELECT created_at,
             EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_seconds
      FROM branch_otp_tokens
      WHERE branch_id = ${branch.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (recentOTP) {
      const elapsed = Number(recentOTP.elapsed_seconds);
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
        return res.status(429).json({
          success: false,
          message: `يرجى الانتظار ${wait} ثانية قبل إعادة إرسال الرمز.`
        });
      }
    }

    // Invalidate old and create new OTP
    await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${branch.id}`;
    const code = generateOTP();
    const otpHash = hashOTP(code);

    await sql`
      INSERT INTO branch_otp_tokens (branch_id, otp_hash, expires_at)
      VALUES (${branch.id}, ${otpHash}, NOW() + INTERVAL '${sql.unsafe(String(OTP_EXPIRY_MINUTES))} minutes')
    `;

    const emailResult = await sendOTPEmail(branchEmail, code, branch.branch_name);
    if (!emailResult.success) {
      return res.status(500).json({ success: false, message: 'فشل إرسال رمز التحقق.' });
    }

    res.json({
      success: true,
      maskedEmail: maskEmail(branchEmail),
      message: 'تم إعادة إرسال رمز التحقق بنجاح.'
    });
  } catch (error) {
    log.error('Resend OTP error', { error: error.message });
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إعادة إرسال الرمز.' });
  }
});

/**
 * Get current user info
 * GET /api/auth/me
 * Requires: Bearer token in Authorization header
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Get full user details from database
    let user = await User.findById(req.user.id);

    if (!user && req.user.role === 'branch_manager') {
      // Branch managers login via branches table - look up branch directly
      if (!req.user.branch_id) {
        return res.status(401).json({
          success: false,
          message: 'Branch ID not found for branch manager. Please login again.'
        });
      }
      const [branch] = await sql`
        SELECT id, username, branch_name, branch_type, is_active
        FROM branches WHERE id = ${req.user.branch_id}
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
          created_at: null
        };
      }
    }

    if (!user) {
      // Treat missing DB user as invalid/expired token so frontend can re-login cleanly
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. User not found.'
      });
    }

    // Return user info (without password)
    // For branch_operations_manager, include assigned branches
    let assigned_branches = null;
    if (user.role === 'branch_operations_manager') {
      try {
        const assignments = await sql`
          SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user.id}
        `;
        assigned_branches = assignments.map(r => r.branch_id);
      } catch (err) {
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
        ...(assigned_branches !== null && { assigned_branches })
      }
    });
  } catch (error) {
    log.error('Get user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'فشل الحصول على معلومات المستخدم',
      error: error.message
    });
  }
});

// Logout endpoint
// Use optionalAuth instead of authenticate to allow logout even with expired tokens
router.post('/logout', optionalAuth, (req, res) => {
  // TODO: Implement token blacklisting if needed
  // Logout should work even if token is expired/invalid
  res.json({
    success: true,
    message: 'تم تسجيل الخروج بنجاح'
  });
});

/**
 * Request email update (public – no auth required, used from login page)
 * POST /api/auth/request-email-update
 * Body: { username, newEmail }
 */
router.post('/request-email-update', async (req, res) => {
  try {
    const { username, newEmail } = req.body;
    if (!username || !newEmail) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم والبريد الإلكتروني مطلوبان' });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    const branch = await Branch.findByUsername(username);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
    }

    // Find main manager (role = 'main_manager')
    const [mainManager] = await sql`
      SELECT id, email, full_name FROM users WHERE role = 'main_manager' AND is_active = true LIMIT 1
    `;
    if (!mainManager) {
      return res.status(500).json({ success: false, message: 'لم يتم العثور على المسؤول الرئيسي' });
    }

    // Create a request record
    const requestData = {
      branch_id: branch.id,
      main_manager_id: mainManager.id,
      employee_id: null,
      request_name: 'طلب تحديث البريد الإلكتروني',
      request_text: `يطلب فرع "${branch.branch_name}" تحديث البريد الإلكتروني إلى: ${newEmail}`,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      r2_attachment_url: null
    };

    await Request.create(requestData);

    // Email the main manager
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

    res.json({ success: true, message: 'تم إرسال طلب تحديث البريد الإلكتروني للمسؤول بنجاح.' });
  } catch (error) {
    log.error('Request email update error', { error: error.message });
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إرسال الطلب.' });
  }
});

export default router;


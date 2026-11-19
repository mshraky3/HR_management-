/**
 * Cron endpoints. Called by Vercel Cron (see vercel.json), never by the SPA.
 *
 *   GET /api/cron/daily-alerts            real run
 *   GET /api/cron/daily-alerts?dry=1      counts only, sends nothing
 *
 * Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel sends exactly this header
 * when CRON_SECRET is set in the project). 503 if CRON_SECRET is unset, 401 if wrong.
 *
 * Everything is OFF by default:
 *   DAILY_ALERTS_ENABLED=true    must be exactly "true" or a real run sends nothing
 *   DAILY_ALERTS_BRANCHES=true   must be exactly "true" for branch-manager mails
 *   DAILY_ALERTS_MAIN_EMAIL      optional override of the main manager address
 *
 * Duplicate guard (PARTIAL): there is no send log in the database, so this only
 * remembers the Riyadh date of the last real run inside the current process.
 * A cold start, a second instance or a redeploy forgets it.
 */

import express from 'express';
import crypto from 'node:crypto';
import { checkAndSendDailyAlerts } from '../utils/dailyAlerts.js';
import { log } from '../utils/logger.js';

/** Constant-time comparison of the Bearer token with the secret (digests, so lengths never leak). */
export function hasValidBearer(header, secret) {
  const match = /^Bearer (.+)$/.exec(String(header || ''));
  if (!match || !secret) return false;
  const a = crypto.createHash('sha256').update(match[1]).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Calendar date (YYYY-MM-DD) in Riyadh, for the duplicate guard. */
export function riyadhDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(date);
}

export function createDailyAlertsHandler({ deps, now = () => new Date() } = {}) {
  let lastRunDate = null;

  return async (req, res) => {
    res.set('Cache-Control', 'no-store');

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ success: false, message: 'CRON_SECRET is not configured' });
    }
    if (!hasValidBearer(req.get('authorization'), secret)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const enabled = process.env.DAILY_ALERTS_ENABLED === 'true';
    const includeBranches = process.env.DAILY_ALERTS_BRANCHES === 'true';
    const dry = req.query.dry === '1' || req.query.dry === 'true';

    try {
      // A dry run works even while the switch is off: that is how the owner previews safely.
      if (dry) {
        const result = await checkAndSendDailyAlerts({ includeBranches, dryRun: true, deps });
        return res.status(result.errors.length ? 500 : 200).json({
          success: result.errors.length === 0,
          dry: true,
          enabled,
          branchesEnabled: includeBranches,
          ...result,
        });
      }

      if (!enabled) {
        return res.json({ success: true, skipped: true, reason: 'disabled' });
      }

      const today = riyadhDate(now());
      if (lastRunDate === today) {
        return res.json({ success: true, skipped: true, reason: 'already_sent_today' });
      }
      // Claim the day before sending so two overlapping calls cannot both send.
      lastRunDate = today;

      const result = await checkAndSendDailyAlerts({ includeBranches, dryRun: false, deps });
      if (result.errors.length > 0 && result.sentTotal === 0) {
        lastRunDate = null; // nothing went out: allow a retry
      }
      // No address, not even masked, in the answer to a real run.
      delete result.mainManager.maskedAddress;
      return res.status(result.errors.length ? 500 : 200).json({
        success: result.errors.length === 0,
        ...result,
      });
    } catch (error) {
      log.error('Daily alerts cron failed', { error: error.message });
      return res.status(500).json({ success: false, message: 'Daily alerts run failed' });
    }
  };
}

const router = express.Router();
router.get('/daily-alerts', createDailyAlertsHandler());

export default router;

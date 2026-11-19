/**
 * Daily Email Alerts
 * Sends critical statistics alerts to the main manager and, when asked, a daily
 * expiry notice to each branch manager that has a branch e-mail.
 *
 * It is NOT started by a timer any more. The only caller is the protected cron
 * endpoint GET /api/cron/daily-alerts (routes/cron.js), driven by a Vercel cron.
 * There is no send log: running this twice in one day sends the mails twice.
 */

import { sendStatisticsAlertEmail, sendNotificationEmail } from './emailService.js';
import { getExpirySummary } from './expiryService.js';
import sql from '../config/database.js';
import { log } from './logger.js';

export const DEFAULT_MAIN_MANAGER_EMAIL = 'Sharaksa@gmail.com';

/** Main manager address: DAILY_ALERTS_MAIN_EMAIL if set, otherwise the long-standing default. */
export function getMainManagerEmail() {
    const override = (process.env.DAILY_ALERTS_MAIN_EMAIL || '').trim();
    return override || DEFAULT_MAIN_MANAGER_EMAIL;
}

/** "sharaksa@gmail.com" -> "s***@g***.com" (never print a real address). */
export function maskEmail(email) {
    const value = String(email || '');
    const at = value.lastIndexOf('@');
    if (at < 1) return '***';
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const dot = domain.lastIndexOf('.');
    const host = dot > 0 ? domain.slice(0, dot) : domain;
    const tld = dot > 0 ? domain.slice(dot) : '';
    return `${local[0]}***@${host[0] || ''}***${tld}`;
}

/**
 * Check for critical alerts and send the e-mails.
 *
 * @param {object}  [options]
 * @param {boolean} [options.includeBranches=true] also send the branch-manager notices
 * @param {boolean} [options.dryRun=false] count only: read the database, send nothing
 * @param {string}  [options.mainManagerEmail] defaults to getMainManagerEmail()
 * @param {object}  [options.deps] test seam: { sql, sendStatisticsAlertEmail, sendNotificationEmail, getExpirySummary }
 * @returns {Promise<object>} counts only, never an e-mail address (the main manager one only masked)
 */
export async function checkAndSendDailyAlerts({
    includeBranches = true,
    dryRun = false,
    mainManagerEmail = getMainManagerEmail(),
    deps = {},
} = {}) {
    const d = { sql, sendStatisticsAlertEmail, sendNotificationEmail, getExpirySummary, ...deps };
    const appUrl = process.env.APP_URL || 'http://localhost:5173';

    const result = {
        dryRun,
        counts: null,
        mainManager: { hasAlerts: false, recipients: 0, sent: 0, maskedAddress: maskEmail(mainManagerEmail) },
        branches: { included: !!includeBranches, withEmail: 0, withAlerts: 0, recipients: 0, sent: 0 },
        sentTotal: 0,
        errors: [],
    };

    try {
        log.info('Checking for critical alerts...', { dryRun, includeBranches });

        // Query for critical statistics (legacy counts)
        const [stats] = await d.sql`
      SELECT
        COUNT(*) FILTER (WHERE contract_end_date_gregorian < CURRENT_DATE)::int as expired_contracts,
        COUNT(*) FILTER (WHERE contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '30 days' AND contract_end_date_gregorian >= CURRENT_DATE)::int as expiring_soon,
        COUNT(*) FILTER (WHERE id_expiry_date_gregorian < CURRENT_DATE)::int as expired_ids,
        COUNT(*) FILTER (WHERE id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '30 days' AND id_expiry_date_gregorian >= CURRENT_DATE)::int as ids_expiring_soon,
        COUNT(*) FILTER (WHERE data_completion_status = 'incomplete')::int as incomplete_data
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
    `;

        result.counts = {
            expiredContracts: stats.expired_contracts,
            expiringSoon: stats.expiring_soon,
            expiredIds: stats.expired_ids,
            idsExpiringSoon: stats.ids_expiring_soon,
            incompleteData: stats.incomplete_data,
        };

        // Check if there are any critical alerts
        const hasAlerts =
            stats.expired_contracts > 0 ||
            stats.expiring_soon > 0 ||
            stats.expired_ids > 0 ||
            stats.ids_expiring_soon > 0 ||
            stats.incomplete_data > 10;

        result.mainManager.hasAlerts = hasAlerts;
        result.mainManager.recipients = hasAlerts && mainManagerEmail ? 1 : 0;

        if (hasAlerts && !dryRun) {
            const sent = await d.sendStatisticsAlertEmail({
                to: mainManagerEmail,
                appUrl: `${appUrl}/employee-expiry`,
                alerts: result.counts,
            });
            if (sent?.success === false) {
                result.errors.push('main_manager_send_failed');
                log.error('Daily alert email to main manager failed');
            } else {
                result.mainManager.sent = 1;
                log.info('Daily alert email sent successfully', { alerts: result.counts });
            }
        } else if (!hasAlerts) {
            log.info('No critical alerts to send');
        }
    } catch (error) {
        result.errors.push('main_manager_alert_failed');
        log.error('Failed to check and send daily alerts', { error: error.message });
        // Without the statistics there is nothing sensible to say to the branches either.
        return finish(result);
    }

    // --- Branch-level expiry alerts ---
    if (includeBranches) {
        try {
            const summary = await d.getExpirySummary();
            for (const branch of summary.byBranch) {
                if (!branch.branch_email) continue;
                result.branches.withEmail += 1;
                const total = (branch.expired_count || 0) + (branch.expiring_soon_count || 0);
                if (total === 0) continue;
                result.branches.withAlerts += 1;
                result.branches.recipients += 1;
                if (dryRun) continue;

                const sent = await d.sendNotificationEmail({
                    to: branch.branch_email,
                    subject: `تنبيه يومي: تواريخ موظفين منتهية - ${branch.branch_name}`,
                    message: `يوجد لديكم ${branch.expired_count} تاريخ منتهي و ${branch.expiring_soon_count} تاريخ ينتهي خلال 30 يوم. يرجى مراجعة صفحة التواريخ المنتهية وتحديث البيانات.`,
                    notificationType: 'daily_expiry_alert',
                    appUrl: `${appUrl}/employee-expiry`,
                    data: {
                        'تواريخ منتهية': `${branch.expired_count}`,
                        'تنتهي خلال 30 يوم': `${branch.expiring_soon_count}`,
                        'الفرع': branch.branch_name,
                    }
                });
                if (sent?.success === false) {
                    result.errors.push('branch_send_failed');
                } else {
                    result.branches.sent += 1;
                }
            }
            log.info('Branch expiry alert emails processed', { sent: result.branches.sent });
        } catch (branchAlertError) {
            result.errors.push('branch_alerts_failed');
            log.error('Failed to send branch expiry alerts', { error: branchAlertError.message });
        }
    }

    return finish(result);
}

function finish(result) {
    result.sentTotal = result.mainManager.sent + result.branches.sent;
    return result;
}

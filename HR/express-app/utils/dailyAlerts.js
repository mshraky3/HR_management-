/**
 * Daily Email Alerts
 * Sends critical statistics alerts to main manager and branch managers
 */

import { sendStatisticsAlertEmail, sendNotificationEmail } from './emailService.js';
import { getExpirySummary } from './expiryService.js';
import sql from '../config/database.js';
import { log } from './logger.js';

/**
 * Check for critical alerts and send email if needed
 */
export async function checkAndSendDailyAlerts() {
    try {
        log.info('Checking for critical alerts...');

        const mainManagerEmail = 'Sharaksa@gmail.com';
        const appUrl = process.env.APP_URL || 'http://localhost:5173';

        // Query for critical statistics (legacy counts)
        const [stats] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE contract_end_date_gregorian < CURRENT_DATE)::int as expired_contracts,
        COUNT(*) FILTER (WHERE contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '30 days' AND contract_end_date_gregorian >= CURRENT_DATE)::int as expiring_soon,
        COUNT(*) FILTER (WHERE id_expiry_date_gregorian < CURRENT_DATE)::int as expired_ids,
        COUNT(*) FILTER (WHERE id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '30 days' AND id_expiry_date_gregorian >= CURRENT_DATE)::int as ids_expiring_soon,
        COUNT(*) FILTER (WHERE data_completion_status = 'incomplete')::int as incomplete_data
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
    `;

        // Check if there are any critical alerts
        const hasAlerts =
            stats.expired_contracts > 0 ||
            stats.expiring_soon > 0 ||
            stats.expired_ids > 0 ||
            stats.ids_expiring_soon > 0 ||
            stats.incomplete_data > 10;

        if (hasAlerts) {
            const alerts = {
                expiredContracts: stats.expired_contracts,
                expiringSoon: stats.expiring_soon,
                expiredIds: stats.expired_ids,
                idsExpiringSoon: stats.ids_expiring_soon,
                incompleteData: stats.incomplete_data,
            };

            await sendStatisticsAlertEmail({
                to: mainManagerEmail,
                appUrl: `${appUrl}/employee-expiry`,
                alerts,
            });

            log.info('Daily alert email sent successfully', { alerts });
        } else {
            log.info('No critical alerts to send');
        }

        // --- Branch-level expiry alerts ---
        try {
            const summary = await getExpirySummary();
            for (const branch of summary.byBranch) {
                if (!branch.branch_email) continue;
                const total = (branch.expired_count || 0) + (branch.expiring_soon_count || 0);
                if (total === 0) continue;

                await sendNotificationEmail({
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
            }
            log.info('Branch expiry alert emails sent');
        } catch (branchAlertError) {
            log.error('Failed to send branch expiry alerts', { error: branchAlertError.message });
        }
    } catch (error) {
        log.error('Failed to check and send daily alerts', { error: error.message });
    }
}

/**
 * Initialize daily alerts scheduler
 * Runs every day at 8:00 AM
 */
export function initializeDailyAlerts() {
    const checkTime = () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Run at 8:00 AM
        if (hours === 8 && minutes === 0) {
            checkAndSendDailyAlerts();
        }
    };

    // Check every minute
    setInterval(checkTime, 60 * 1000);

    log.info('Daily alerts scheduler initialized (runs at 8:00 AM)');
}

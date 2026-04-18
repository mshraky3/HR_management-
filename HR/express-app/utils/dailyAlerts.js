/**
 * Daily Email Alerts
 * Sends critical statistics alerts to main manager
 */

import { sendStatisticsAlertEmail } from './emailService.js';
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

        // Query for critical statistics
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
            stats.incomplete_data > 10; // Only alert if more than 10 employees with incomplete data

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
                appUrl: `${appUrl}/employee-statistics`,
                alerts,
            });

            log.info('Daily alert email sent successfully', { alerts });
        } else {
            log.info('No critical alerts to send');
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

/**
 * Test script for error notification email - IMPROVED VERSION
 * Run: node test-error-email.js
 */

import { sendErrorNotification } from './utils/errorNotificationService.js';

const testError = {
    errorType: 'DATABASE_CONNECTION_ERROR',
    message: 'Unable to connect to PostgreSQL database: ECONNREFUSED 127.0.0.1:5432',
    endpoint: '/api/employees',
    method: 'GET',
    statusCode: 500,
    page: '/employees',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    userId: 15,
    username: 'admin_user',
    branchId: 3,
    timestamp: new Date().toISOString(),
    stackTrace: `Error: Unable to connect to PostgreSQL database
    at Pool.connect (/app/node_modules/pg/lib/pool.js:285:14)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async getEmployees (/app/routes/employees.js:45:20)
    at async /app/routes/employees.js:28:5
Caused by: Error: ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)`,
    requestData: {
        query: { page: 1, limit: 50, branch_id: 3 },
        headers: { 'Accept-Language': 'ar-SA' }
    },
    responseData: {
        success: false,
        message: 'حدث خطأ في قاعدة البيانات',
        errorCode: 'DB_CONNECTION_FAILED'
    },
    additionalInfo: {
        dbHost: '127.0.0.1',
        dbPort: 5432,
        connectionAttempts: 3,
        lastSuccessfulConnection: '2024-01-14T12:30:00Z',
        connectionPoolStatus: 'exhausted'
    }
};

console.log('📧 Sending IMPROVED test error notification email...');
console.log('');

sendErrorNotification(testError).then(result => {
    if (result.success) {
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('');
        console.log('🎉 NEW FEATURES IN THIS EMAIL:');
        console.log('   • Quick action buttons (فتح الصفحة, سجلات النظام)');
        console.log('   • Environment badge (Production/Development)');
        console.log('   • Error frequency counter (if error repeats)');
        console.log('   • Unique Error ID in footer');
        console.log('');
        console.log('📬 Check your email inbox at alshraky3@gmail.com');
    } else {
        console.log('❌ Failed to send email');
        console.log('   Reason:', result.reason || result.error);
    }
    process.exit(0);
}).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});

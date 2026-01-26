#!/usr/bin/env node

/**
 * Payroll Absence Feature - Automated Test Suite
 * Tests critical paths for data integrity, authorization, and stability
 * Uses native Node.js fetch API (no external dependencies)
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';
const TEST_TIMEOUT = 30000;

// Test credentials (would be provided by user)
const TEST_CREDENTIALS = {
    mainManager: {
        username: 'test',
        password: 'test', // To be replaced
        token: null,
    },
    branchManager: {
        username: 'bbbb',
        password: 'bbbb', // To be replaced
        token: null,
        branchId: 12,
    },
};

// Utility functions
const log = {
    info: (msg) => console.log(`ℹ️  ${msg}`),
    success: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.log(`❌ ${msg}`),
    pending: (msg) => console.log(`⏳ ${msg}`),
    section: (title) => console.log(`\n${'='.repeat(60)}\n📋 ${title}\n${'='.repeat(60)}`),
};

const makeRequest = async (method, endpoint, data = null, token = null) => {
    try {
        const config = {
            method,
            timeout: TEST_TIMEOUT,
        };

        if (token) {
            config.headers = { Authorization: `Bearer ${token}` };
        }

        if (data) {
            config.headers = { ...config.headers, 'Content-Type': 'application/json' };
            config.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const responseData = await response.json().catch(() => null);

        return {
            success: response.ok,
            status: response.status,
            data: responseData
        };
    } catch (error) {
        return {
            success: false,
            status: 0,
            message: error.message,
            data: null,
        };
    }
};

/**
 * Authenticate user and get token
 */
const authenticate = async (username, password) => {
    try {
        const result = await makeRequest('POST', '/auth/login', {
            username,
            password
        });

        if (result.success && result.data?.token) {
            return result.data.token;
        }
        return null;
    } catch (error) {
        log.error(`Authentication error: ${error.message}`);
        return null;
    }
};

// Test cases
const tests = {
    /**
     * TEST 1: Authorization - Branch manager cannot access admin endpoints
     */
    async testAdminAuthorizationProtection() {
        log.section('TEST 1: Authorization - Admin Routes Protection');

        if (!TEST_CREDENTIALS.branchManager.token) {
            log.error('Branch manager token not available, skipping');
            return { passed: false, skipped: true };
        }

        const token = TEST_CREDENTIALS.branchManager.token;
        const adminEndpoints = [
            '/payroll-absences/admin/cycles',
            '/payroll-absences/admin/cycles/1/branches',
        ];

        let allPassed = true;
        for (const endpoint of adminEndpoints) {
            const result = await makeRequest('GET', endpoint, null, token);
            if (result.status === 403 || result.status === 401) {
                log.success(`Blocked: ${endpoint} - Status ${result.status}`);
            } else {
                log.error(`FAILED: ${endpoint} - Expected 403/401, got ${result.status}`);
                allPassed = false;
            }
        }

        return { passed: allPassed };
    },

    /**
     * TEST 2: Data Validation - Employee belongs-to-branch
     */
    async testEmployeeBelongsToBranch() {
        log.section('TEST 2: Data Validation - Employee Belongs-to-Branch');

        if (!TEST_CREDENTIALS.branchManager.token || !TEST_CREDENTIALS.branchManager.branchId) {
            log.error('Branch manager credentials not available');
            return { passed: false, skipped: true };
        }

        // Attempt to submit absence for non-existent employee (ID: 999999)
        const invalidPayload = {
            entries: [
                {
                    employee_id: 999999,
                    excused_absences: 1,
                    unexcused_absences: 0,
                    notes: 'Test',
                },
            ],
        };

        const result = await makeRequest(
            'POST',
            '/payroll-absences/branch/submit',
            invalidPayload,
            TEST_CREDENTIALS.branchManager.token
        );

        if (result.status === 400 && result.message?.includes('غير تابعين')) {
            log.success('Correctly rejected invalid employee ID');
            return { passed: true };
        } else {
            log.error(`Expected 400 with employee validation error, got: ${result.status} - ${result.message}`);
            return { passed: false };
        }
    },

    /**
     * TEST 3: Negative Absence Values
     */
    async testNegativeAbsenceValues() {
        log.section('TEST 3: Data Validation - Negative Absence Values');

        if (!TEST_CREDENTIALS.branchManager.token) {
            log.error('Branch manager token not available');
            return { passed: false, skipped: true };
        }

        log.pending('This test requires valid employee IDs from branch...');
        log.info('First, get valid employees for the branch');

        const stateResult = await makeRequest('GET', '/payroll-absences/branch/state', null, TEST_CREDENTIALS.branchManager.token);

        if (!stateResult.success || !stateResult.data?.data?.employees?.length) {
            log.error('Could not fetch employee list for branch');
            return { passed: false, skipped: true };
        }

        const employees = stateResult.data.data.employees;
        const testEmployee = employees[0];

        log.info(`Testing with employee: ${testEmployee.full_name} (ID: ${testEmployee.id})`);

        // Attempt negative submission
        const negativePayload = {
            entries: [
                {
                    employee_id: testEmployee.id,
                    excused_absences: -5, // Negative value
                    unexcused_absences: 0,
                    notes: 'Test negative',
                },
            ],
        };

        const result = await makeRequest(
            'POST',
            '/payroll-absences/branch/submit',
            negativePayload,
            TEST_CREDENTIALS.branchManager.token
        );

        // Check if accepted or rejected
        if (result.success) {
            log.error('❌ SECURITY ISSUE: Backend accepted negative absence value!');
            return { passed: false, issue: 'Backend should validate negative values' };
        } else if (result.status === 400) {
            log.success('Correctly rejected negative value');
            return { passed: true };
        } else {
            log.error(`Unexpected response: ${result.status} - ${result.message}`);
            return { passed: false };
        }
    },

    /**
     * TEST 4: Duplicate Submission Prevention
     */
    async testDuplicateSubmissionPrevention() {
        log.section('TEST 4: Duplicate Submission Prevention');

        if (!TEST_CREDENTIALS.branchManager.token) {
            log.error('Branch manager token not available');
            return { passed: false, skipped: true };
        }

        // Get branch state
        const stateResult = await makeRequest('GET', '/payroll-absences/branch/state', null, TEST_CREDENTIALS.branchManager.token);

        if (!stateResult.success) {
            log.error('Could not fetch branch state');
            return { passed: false, skipped: true };
        }

        const state = stateResult.data?.data;
        log.info(`Current state: ${state?.state}`);

        // If state is not entry_open, skip (cannot test re-submission)
        if (state?.state !== 'entry_open') {
            log.pending(`Cannot test: branch is in '${state?.state}' state, not 'entry_open'`);
            return { passed: false, skipped: true };
        }

        // TODO: Implement full cycle test
        log.pending('Full duplicate submission test requires test data setup');
        return { passed: false, skipped: true };
    },

    /**
     * TEST 5: Error Message Sensitivity (Database Error Leakage)
     */
    async testErrorMessageSensitivity() {
        log.section('TEST 5: Error Handling - Sensitive Information Leakage');

        if (!TEST_CREDENTIALS.mainManager.token) {
            log.error('Main manager token not available');
            return { passed: false, skipped: true };
        }

        // Try to export with invalid cycle ID
        const invalidExport = {
            cycle_id: -1,
            branch_ids: [],
        };

        const result = await makeRequest(
            'POST',
            '/payroll-absences/admin/export',
            invalidExport,
            TEST_CREDENTIALS.mainManager.token
        );

        if (!result.success) {
            const errorMsg = result.message || '';
            const hasSensitiveInfo =
                errorMsg.includes('SQL') ||
                errorMsg.includes('database') ||
                errorMsg.includes('query') ||
                errorMsg.includes('postgres');

            if (hasSensitiveInfo) {
                log.error('❌ SECURITY ISSUE: Error message exposes database details!');
                log.info(`Error message: "${errorMsg}"`);
                return { passed: false, issue: 'Error messages expose database details' };
            } else {
                log.success('Error message is appropriately generic');
                return { passed: true };
            }
        }

        return { passed: true };
    },

    /**
     * TEST 6: State Transitions
     */
    async testStateTransitions() {
        log.section('TEST 6: State Machine - Transitions');

        if (!TEST_CREDENTIALS.branchManager.token) {
            log.error('Branch manager token not available');
            return { passed: false, skipped: true };
        }

        const result = await makeRequest('GET', '/payroll-absences/branch/state', null, TEST_CREDENTIALS.branchManager.token);

        if (!result.success) {
            log.error('Could not fetch branch state');
            return { passed: false };
        }

        const state = result.data?.data?.state;
        const validStates = ['countdown', 'countdown_next', 'entry_open', 'view_only', 'closed'];

        if (validStates.includes(state)) {
            log.success(`Branch state is valid: '${state}'`);
            log.info(`Days until open: ${result.data?.data?.days_until_open || 'N/A'}`);
            return { passed: true };
        } else {
            log.error(`Invalid state returned: '${state}'`);
            return { passed: false };
        }
    },

    /**
     * TEST 7: Cycle Auto-Creation
     */
    async testCycleAutoCreation() {
        log.section('TEST 7: Cycle Management - Auto-Creation');

        if (!TEST_CREDENTIALS.branchManager.token) {
            log.error('Branch manager token not available');
            return { passed: false, skipped: true };
        }

        log.info('Fetching branch state (should auto-create current month cycle)...');

        const result = await makeRequest('GET', '/payroll-absences/branch/state', null, TEST_CREDENTIALS.branchManager.token);

        if (result.success && result.data?.data?.cycle?.id) {
            log.success(`Current cycle auto-created: ID ${result.data.data.cycle.id}`);
            log.info(`Cycle month: ${new Date(result.data.data.cycle.month_start).toLocaleDateString()}`);
            return { passed: true };
        } else {
            log.error('Cycle auto-creation failed');
            return { passed: false };
        }
    },
};

// Main execution
async function runAllTests() {
    log.section('PAYROLL ABSENCE FEATURE - TEST SUITE');

    log.info('🔐 Authenticating with provided credentials...\n');

    // Get tokens
    const mainManagerToken = await authenticate(
        TEST_CREDENTIALS.mainManager.username,
        TEST_CREDENTIALS.mainManager.password
    );

    const branchManagerToken = await authenticate(
        TEST_CREDENTIALS.branchManager.username,
        TEST_CREDENTIALS.branchManager.password
    );

    if (!mainManagerToken) {
        log.error(`Failed to authenticate main manager (${TEST_CREDENTIALS.mainManager.username})`);
    } else {
        log.success(`Main manager authenticated (${TEST_CREDENTIALS.mainManager.username})`);
        TEST_CREDENTIALS.mainManager.token = mainManagerToken;
    }

    if (!branchManagerToken) {
        log.error(`Failed to authenticate branch manager (${TEST_CREDENTIALS.branchManager.username})`);
    } else {
        log.success(`Branch manager authenticated (${TEST_CREDENTIALS.branchManager.username})`);
        TEST_CREDENTIALS.branchManager.token = branchManagerToken;
    }

    const results = {};
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Run each test
    for (const [name, testFn] of Object.entries(tests)) {
        try {
            const result = await testFn();
            results[name] = result;

            if (result.skipped) {
                skipped++;
            } else if (result.passed) {
                passed++;
            } else {
                failed++;
            }

            if (result.issue) {
                log.error(`Issue: ${result.issue}`);
            }
        } catch (error) {
            log.error(`Test error: ${error.message}`);
            results[name] = { passed: false, error: error.message };
            failed++;
        }
    }

    // Summary
    log.section('TEST SUMMARY');
    log.info(`✅ Passed: ${passed}`);
    log.error(`❌ Failed: ${failed}`);
    log.pending(`⏳ Skipped: ${skipped}`);

    return { passed, failed, skipped, results };
}

// Execute immediately
runAllTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
});

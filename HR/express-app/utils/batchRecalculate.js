/**
 * Batch recalculation utilities
 * Recalculate employee completion status in batches for a branch
 */

import { log } from './logger.js';

export async function recalculateBranchEmployeesInBatches(branchId, options = {}) {
    const { batchSize = 200, delayMs = 0 } = options;
    const { Employee } = await import('../models/Employee.js');
    const { updateEmployeeCompletionStatus } = await import('./employeeDataCompletion.js');

    let offset = 0;
    let processed = 0;
    while (true) {
        const filters = { branch_id: branchId, limit: batchSize, offset };
        const batch = await Employee.findAll(filters);
        if (!batch || batch.length === 0) break;

        // Update each employee in parallel for this batch
        await Promise.all(batch.map(emp => updateEmployeeCompletionStatus(emp.id).catch(err => {
            log.warn('Failed to update completion status for employee in batch', { employeeId: emp.id, error: err?.message });
            return null;
        })));

        processed += batch.length;
        offset += batch.length;

        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return { processed };
}

export default { recalculateBranchEmployeesInBatches };
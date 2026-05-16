/**
 * Archive Lifecycle Service
 * Enforces retention and purge policy for archived entities.
 */

import sql from '../config/database.js';
import { Employee } from '../models/Employee.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['active', 'pending'];
const ARCHIVED_STATUSES = [
    'terminated_article_80',
    'terminated_article_77',
    'resigned',
    'contract_ended',
    'non_renewal',
    'other'
];
const VALID_STATUSES = [...ACTIVE_STATUSES, ...ARCHIVED_STATUSES];

const getRetentionDays = (envKey, fallbackDays) => {
    const raw = process.env[envKey];
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallbackDays;
};

const calculateAgeInDays = (dateValue) => {
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    const now = Date.now();
    const ageMs = now - parsedDate.getTime();
    return Math.floor(ageMs / MS_PER_DAY);
};

export class ArchivePolicyError extends Error {
    constructor(message, code = 'ARCHIVE_POLICY_VIOLATION', details = {}) {
        super(message);
        this.name = 'ArchivePolicyError';
        this.code = code;
        this.details = details;
    }
}

const ensureRetentionElapsed = ({ archivedAt, retentionDays, label, code }) => {
    const ageDays = calculateAgeInDays(archivedAt);

    if (ageDays === null) {
        throw new ArchivePolicyError(
            `تعذر تحديد تاريخ الأرشفة لـ ${label}`,
            `${code}_MISSING_ARCHIVE_DATE`,
            { archivedAt, retentionDays }
        );
    }

    if (ageDays < retentionDays) {
        throw new ArchivePolicyError(
            `لا يمكن الحذف النهائي الآن. يلزم مرور ${retentionDays} يومًا على الأقل منذ الأرشفة لـ ${label}`,
            `${code}_RETENTION_NOT_ELIGIBLE`,
            { ageDays, retentionDays, archivedAt }
        );
    }

    return ageDays;
};

export const assertArchivedEmployeeEligibleForPurge = (employee) => {
    if (!employee) {
        throw new ArchivePolicyError('الموظف غير موجود', 'EMPLOYEE_NOT_FOUND');
    }

    if (employee.status === 'active' || employee.status === 'pending') {
        throw new ArchivePolicyError('لا يمكن الحذف النهائي لموظف نشط أو قيد الانتظار', 'EMPLOYEE_NOT_ARCHIVED');
    }

    const retentionDays = getRetentionDays('ARCHIVE_EMPLOYEE_RETENTION_DAYS', 30);
    const archivedAt = employee.status_changed_at || employee.updated_at || employee.created_at;

    const ageDays = ensureRetentionElapsed({
        archivedAt,
        retentionDays,
        label: 'الموظف',
        code: 'EMPLOYEE'
    });

    return { ageDays, retentionDays, archivedAt };
};

export const assertArchivedEmployeeDocumentEligibleForPurge = (document) => {
    if (!document) {
        throw new ArchivePolicyError('المستند غير موجود', 'DOCUMENT_NOT_FOUND');
    }

    if (document.is_active) {
        throw new ArchivePolicyError('لا يمكن الحذف النهائي لمستند نشط', 'DOCUMENT_NOT_ARCHIVED');
    }

    const retentionDays = getRetentionDays('ARCHIVE_DOCUMENT_RETENTION_DAYS', 14);
    const archivedAt = document.updated_at || document.uploaded_at;

    const ageDays = ensureRetentionElapsed({
        archivedAt,
        retentionDays,
        label: 'المستند',
        code: 'DOCUMENT'
    });

    return { ageDays, retentionDays, archivedAt };
};

const getStatusActorId = (actor) => {
    // status_changed_by is FK to users(id) — branch managers have no users row, use null
    if (!actor) return null;
    if (actor.role === 'branch_manager') return null;
    return actor.id || null;
};

const ensureValidTargetStatus = (status) => {
    if (!status || !VALID_STATUSES.includes(status)) {
        throw new ArchivePolicyError('حالة غير صحيحة', 'INVALID_STATUS');
    }
};

const ensureBranchIsActiveForRestore = async (branchId) => {
    const [branch] = await sql`SELECT is_active FROM branches WHERE id = ${branchId}`;

    if (!branch || branch.is_active === false) {
        throw new ArchivePolicyError(
            'لا يمكن استعادة موظف فرعه محذوف. يجب استعادة الفرع أولاً',
            'BRANCH_INACTIVE_FOR_RESTORE',
            { branchId }
        );
    }
};

export const applyArchiveEmployeeStatusTransition = async ({
    employeeId,
    status,
    reason,
    actor,
    restoreOnly = false
}) => {
    ensureValidTargetStatus(status);

    if (restoreOnly && !ACTIVE_STATUSES.includes(status)) {
        throw new ArchivePolicyError(
            'يجب اختيار حالة نشط أو قيد الانتظار للاستعادة',
            'RESTORE_STATUS_INVALID',
            { status }
        );
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
        throw new ArchivePolicyError('الموظف غير موجود', 'EMPLOYEE_NOT_FOUND', { employeeId });
    }

    const isCurrentArchived = ARCHIVED_STATUSES.includes(employee.status);
    const isTargetRestoreState = ACTIVE_STATUSES.includes(status);
    const actorId = getStatusActorId(actor);

    if (isTargetRestoreState) {
        if (!isCurrentArchived) {
            throw new ArchivePolicyError('هذا الموظف غير موجود في الأرشيف', 'EMPLOYEE_NOT_ARCHIVED', {
                employeeId,
                currentStatus: employee.status
            });
        }

        await ensureBranchIsActiveForRestore(employee.branch_id);

        const [restored] = await sql`
            UPDATE employees
            SET status = ${status},
                is_active = true,
                status_changed_at = CURRENT_TIMESTAMP,
                status_changed_by = ${actorId},
                status_change_reason = ${reason || 'تم الاستعادة من الأرشيف'},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${employeeId}
            RETURNING *
        `;

        return {
            action: 'restored',
            employee: restored,
            previousStatus: employee.status
        };
    }

    const updatedEmployee = await Employee.updateStatus(
        employeeId,
        status,
        actorId,
        reason || null
    );

    return {
        action: 'status_updated',
        employee: updatedEmployee,
        previousStatus: employee.status
    };
};

/**
 * Request Scope Middleware
 * Resolves branch/term/lifecycle scope once and attaches it to req.scope.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const toInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const parseIdList = (value) => {
    if (value === undefined || value === null || value === '') {
        return [];
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => toInt(item))
            .filter((item) => item !== null);
    }

    if (typeof value === 'string' && value.includes(',')) {
        return value
            .split(',')
            .map((item) => toInt(item.trim()))
            .filter((item) => item !== null);
    }

    const single = toInt(value);
    return single === null ? [] : [single];
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const parseBoolean = (value) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return null;
};

const resolveRequestedBranchIds = (req) => {
    const candidate = firstDefined(
        req.query?.branch_id,
        req.query?.branchId,
        req.body?.branch_id,
        req.body?.branchId,
        req.params?.branch_id,
        req.params?.branchId
    );

    return parseIdList(candidate);
};

const resolveRequestedTermId = (req) => {
    const candidate = firstDefined(
        req.query?.term_id,
        req.query?.termId,
        req.body?.term_id,
        req.body?.termId,
        req.body?.current_term_id,
        req.query?.current_term_id
    );

    const ids = parseIdList(candidate);
    return ids.length > 0 ? ids[0] : null;
};

const loadAssignedBranches = async (user) => {
    if (!user || user.role !== 'branch_operations_manager') {
        return [];
    }

    if (Array.isArray(user.assigned_branches) && user.assigned_branches.length > 0) {
        return user.assigned_branches.map((id) => toInt(id)).filter((id) => id !== null);
    }

    if (user._assignedBranchesLoaded) {
        return [];
    }

    const rows = await sql`
    SELECT branch_id FROM user_branch_assignments WHERE user_id = ${user.id}
  `;
    const assigned = rows.map((row) => row.branch_id).filter((id) => Number.isInteger(id));
    user.assigned_branches = assigned;
    user._assignedBranchesLoaded = true;
    return assigned;
};

export const attachRequestScope = async (req) => {
    const user = req.user || null;
    const role = user?.role || 'anonymous';
    const requestedBranchIds = resolveRequestedBranchIds(req);
    const requestedTermId = resolveRequestedTermId(req);

    let allowedBranchIds = [];
    let effectiveBranchIds = [...requestedBranchIds];
    let denied = false;
    let deniedReason = null;

    if (role === 'main_manager') {
        allowedBranchIds = [];
        effectiveBranchIds = [...requestedBranchIds];
    } else if (role === 'branch_manager') {
        const branchId = toInt(user?.branch_id);
        allowedBranchIds = branchId ? [branchId] : [];
        effectiveBranchIds = allowedBranchIds;

        if (requestedBranchIds.length > 0 && (!branchId || requestedBranchIds.some((id) => id !== branchId))) {
            denied = true;
            deniedReason = 'branch_manager_override_blocked';
        }
    } else if (role === 'branch_operations_manager') {
        allowedBranchIds = await loadAssignedBranches(user);
        if (requestedBranchIds.length === 0) {
            effectiveBranchIds = [...allowedBranchIds];
        } else {
            effectiveBranchIds = requestedBranchIds.filter((id) => allowedBranchIds.includes(id));
            if (effectiveBranchIds.length === 0) {
                denied = true;
                deniedReason = 'branch_operations_scope_denied';
            }
        }
    }

    const lifecycle = {
        includeInactive: parseBoolean(firstDefined(req.query?.include_inactive, req.body?.include_inactive)) === true,
        includeArchived: parseBoolean(firstDefined(req.query?.include_archived, req.body?.include_archived)) === true,
        includeDeleted: parseBoolean(firstDefined(req.query?.include_deleted, req.body?.include_deleted)) === true,
    };

    const scope = {
        resolvedAt: new Date().toISOString(),
        user: {
            id: user?.id || null,
            role,
            branchId: toInt(user?.branch_id),
        },
        branch: {
            requestedIds: requestedBranchIds,
            allowedIds: allowedBranchIds,
            effectiveIds: effectiveBranchIds,
            primaryId: effectiveBranchIds.length > 0 ? effectiveBranchIds[0] : null,
        },
        term: {
            requestedId: requestedTermId,
            effectiveId: requestedTermId,
        },
        lifecycle,
        access: {
            denied,
            deniedReason,
        },
    };

    req.scope = scope;
    req.getScope = () => req.scope;
    return scope;
};

export const resolveRequestScope = async (req, res, next) => {
    try {
        await attachRequestScope(req);
        next();
    } catch (error) {
        log.error('Failed to resolve request scope', {
            error: error.message,
            path: req.path,
            method: req.method,
        });
        next(error);
    }
};

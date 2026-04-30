/**
 * Policy Scope Utilities
 * Shared helpers for applying request scope and lifecycle defaults in routes/models.
 */

const toInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

export const parseScopedIds = (value) => {
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

export const getScopedBranchFilter = (req, options = {}) => {
    const { allowMultiple = true } = options;
    const scope = req.scope;

    if (!scope?.branch) {
        return allowMultiple ? undefined : null;
    }

    // Main manager with no explicit branch selection should keep unfiltered behavior.
    if (scope.user?.role === 'main_manager' && scope.branch.requestedIds.length === 0) {
        return allowMultiple ? undefined : null;
    }

    const ids = scope.branch.effectiveIds || [];
    if (ids.length === 0) {
        return allowMultiple ? [] : null;
    }

    return allowMultiple ? ids : ids[0];
};

export const getScopedTermFilter = (req) => {
    if (!req.scope?.term) return null;
    return req.scope.term.effectiveId;
};

export const resolveBranchAccessFromScope = (scope, requestedBranchId) => {
    const branchId = toInt(requestedBranchId);
    if (branchId === null) {
        return { allowed: false, reason: 'invalid_branch_id', effectiveBranchId: null };
    }

    if (!scope || !scope.user) {
        return { allowed: false, reason: 'missing_scope', effectiveBranchId: null };
    }

    if (scope.user.role === 'main_manager') {
        return { allowed: true, reason: null, effectiveBranchId: branchId };
    }

    const allowedIds = scope.branch?.allowedIds || [];
    if (allowedIds.includes(branchId)) {
        return { allowed: true, reason: null, effectiveBranchId: branchId };
    }

    return { allowed: false, reason: 'branch_scope_violation', effectiveBranchId: null };
};

const lifecyclePolicies = {
    notification: { field: 'is_active', activeValue: true, flag: 'includeInactive' },
    document: { field: 'is_active', activeValue: true, flag: 'includeInactive' },
    branch_document: { field: 'is_active', activeValue: true, flag: 'includeInactive' },
    branch: { field: 'is_active', activeValue: true, flag: 'includeInactive' },
    beneficiary: { field: 'is_archived', activeValue: false, flag: 'includeArchived' },
};

export const applyLifecyclePolicy = (entityName, filters = {}, scope = null) => {
    const policy = lifecyclePolicies[entityName];
    if (!policy) return { ...filters };

    const next = { ...filters };
    const includeFlag = scope?.lifecycle?.[policy.flag] === true;

    if (!includeFlag && next[policy.field] === undefined) {
        next[policy.field] = policy.activeValue;
    }

    return next;
};

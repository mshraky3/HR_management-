export const getLastSeen = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const date = new Date(raw);
        return isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
};

export const setLastSeen = (key, date = new Date()) => {
    try {
        localStorage.setItem(key, date.toISOString());
    } catch {
        // Ignore storage failures
    }
};

export const countNewByDate = (items, dateField, lastSeen) => {
    if (!Array.isArray(items) || items.length === 0) return 0;
    if (!lastSeen) return items.length;
    return items.filter((item) => {
        const raw = item?.[dateField];
        if (!raw) return false;
        const date = new Date(raw);
        return !isNaN(date.getTime()) && date > lastSeen;
    }).length;
};

export const getSeenCounts = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

export const setSeenCounts = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value || {}));
    } catch {
        // Ignore storage failures
    }
};
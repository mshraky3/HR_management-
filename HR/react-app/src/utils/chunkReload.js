/**
 * Recovery from a page chunk that fails to load.
 *
 * Every page is its own hashed file (assets/Employees-<hash>.js). A tab opened before
 * a new deployment still asks for the old file names, which no longer exist, so the
 * import fails: "Importing a module script failed." (Safari), "Failed to fetch
 * dynamically imported module" (Chrome, Edge), "error loading dynamically imported
 * module" (Firefox). Reloading fetches the new index.html and the new files.
 *
 * Guard: the time of the automatic reload is kept in sessionStorage (one tab, survives
 * the reload). A chunk failure within RELOAD_WINDOW_MS of that reload is let through to
 * the error boundary, which shows the error page and alerts as before, so a chunk that
 * really is broken can never reload in a loop. Without working sessionStorage there is
 * no guard, so there is no automatic reload either.
 */

export const RELOAD_AT_KEY = 'chunk-reload-at';
export const RECOVERY_KEY = 'chunk-reload-recovery';
export const RELOAD_WINDOW_MS = 5 * 60 * 1000;

const CHUNK_ERROR_PATTERNS = [
    'failed to fetch dynamically imported module', // Chrome, Edge
    'importing a module script failed', // Safari
    'error loading dynamically imported module', // Firefox
    'is not a valid javascript mime type', // Safari, when HTML comes back instead of the chunk
    'unable to preload css', // Vite, the page's CSS file is missing
    'chunkloaderror',
];

/** True for the errors a missing or unreachable chunk file produces, never for a bug inside a page. */
export function isChunkLoadError(error) {
    const message = typeof error === 'string' ? error : error?.message;
    const text = `${error?.name || ''} ${message || ''}`.toLowerCase();
    return CHUNK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

/**
 * The guard, with its browser dependencies passed in so it can be tested outside a browser.
 * getStorage: () => sessionStorage-like object (may throw), reload: () => void,
 * now: () => ms timestamp, getPage: () => current path.
 */
export function createChunkReloadGuard({ getStorage, reload, now = Date.now, getPage = () => '' }) {
    // Set once a reload has been started: this page is about to go away
    let reloadPending = false;

    const storage = () => {
        try {
            return getStorage() || null;
        } catch {
            return null;
        }
    };

    /**
     * Reload the page for a chunk-load error, once. True when a reload has been started
     * (now or by an earlier call): the caller should wait for the page to go away
     * instead of showing the error. False: let the error through.
     */
    function reloadOnce(error) {
        if (reloadPending) return true;
        if (!isChunkLoadError(error)) return false;

        const store = storage();
        if (!store) return false;

        const at = now();
        try {
            const last = Number(store.getItem(RELOAD_AT_KEY)) || 0;
            if (last && at >= last && at - last < RELOAD_WINDOW_MS) {
                // Already reloaded for this a moment ago and it did not help: real failure
                store.removeItem(RECOVERY_KEY);
                return false;
            }
            store.setItem(RELOAD_AT_KEY, String(at));
            // Storage that does not keep what is written (blocked, full) cannot stop a loop
            if (store.getItem(RELOAD_AT_KEY) !== String(at)) return false;
        } catch {
            return false;
        }

        // Best effort: what to log once the reloaded page has loaded its chunk
        try {
            const message = (typeof error === 'string' ? error : error?.message) || '';
            store.setItem(RECOVERY_KEY, JSON.stringify({ message, page: getPage(), at }));
        } catch { }

        reloadPending = true;
        try {
            reload();
        } catch {
            reloadPending = false;
            return false;
        }
        return true;
    }

    /** After a chunk has loaded: the failure an automatic reload just fixed (only once), else null. */
    function takeRecovery() {
        if (reloadPending) return null;
        const store = storage();
        if (!store) return null;
        try {
            const raw = store.getItem(RECOVERY_KEY);
            if (!raw) return null;
            store.removeItem(RECOVERY_KEY);
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    return {
        reloadOnce,
        takeRecovery,
        isReloadPending: () => reloadPending,
    };
}

const guard = createChunkReloadGuard({
    getStorage: () => window.sessionStorage,
    reload: () => window.location.reload(),
    getPage: () => window.location.pathname,
});

export const reloadOnceForChunkError = guard.reloadOnce;
export const takeChunkReloadRecovery = guard.takeRecovery;
export const isChunkReloadPending = guard.isReloadPending;

/**
 * Vite fires vite:preloadError when a dynamic import (or the CSS it preloads) fails.
 * The error is not suppressed with preventDefault(): Vite would then resolve the import
 * with undefined, which React.lazy turns into a second, misleading render error. The
 * import still rejects; lazyRetry in App.jsx sees the pending reload and keeps the
 * loading spinner until the page goes away.
 */
export function installPreloadErrorGuard() {
    window.addEventListener('vite:preloadError', (event) => {
        reloadOnceForChunkError(event.payload);
    });
}

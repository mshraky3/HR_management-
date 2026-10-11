/**
 * Guard logic of utils/chunkReload.js. Run with: npm test (node:test, no browser needed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createChunkReloadGuard,
    isChunkLoadError,
    RELOAD_AT_KEY,
    RECOVERY_KEY,
    RELOAD_WINDOW_MS,
} from './chunkReload.js';

// sessionStorage stand-in: survives "reloads" because every page load shares the same object
function memoryStorage() {
    const data = new Map();
    return {
        data,
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
    };
}

// One page load: a fresh guard (module state is per page) over the tab's storage
function pageLoad(storage, clock, overrides = {}) {
    const reloads = [];
    const guard = createChunkReloadGuard({
        getStorage: () => storage,
        reload: () => reloads.push(clock.now),
        now: () => clock.now,
        getPage: () => '/employees',
        ...overrides,
    });
    return { guard, reloads };
}

const safariError = () => new TypeError('Importing a module script failed.');

test('recognises chunk-load errors from every browser and from Vite', () => {
    assert.ok(isChunkLoadError(safariError()));
    assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Employees-abc.js')));
    assert.ok(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/assets/Employees-abc.js')));
    assert.ok(isChunkLoadError(new Error('Unable to preload CSS for /assets/Employees-abc.css')));
    assert.ok(isChunkLoadError(new TypeError("'text/html' is not a valid JavaScript MIME type.")));
    assert.ok(isChunkLoadError('Importing a module script failed.'));
    assert.ok(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 3 failed.' }));
});

test('does not treat real page bugs as chunk-load errors', () => {
    assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
    assert.equal(isChunkLoadError(new Error('Objects are not valid as a React child')), false);
    assert.equal(isChunkLoadError(new Error('Network Error')), false);
    assert.equal(isChunkLoadError(null), false);
    assert.equal(isChunkLoadError(undefined), false);
    assert.equal(isChunkLoadError({}), false);
});

test('first chunk failure reloads once and remembers what to log', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    const { guard, reloads } = pageLoad(storage, clock);

    assert.equal(guard.reloadOnce(safariError()), true);
    assert.deepEqual(reloads, [1_000_000]);
    assert.equal(guard.isReloadPending(), true);
    assert.equal(storage.getItem(RELOAD_AT_KEY), '1000000');
    assert.deepEqual(JSON.parse(storage.getItem(RECOVERY_KEY)), {
        message: 'Importing a module script failed.',
        page: '/employees',
        at: 1_000_000,
    });

    // vite:preloadError and the lazy() catch both see the same failure: still one reload
    assert.equal(guard.reloadOnce(safariError()), true);
    assert.equal(reloads.length, 1);
    // nothing to log while this page is going away
    assert.equal(guard.takeRecovery(), null);
});

test('reload fixed it: the recovery is handed out once for the low-severity log', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    pageLoad(storage, clock).guard.reloadOnce(safariError());

    clock.now += 2_000;
    const { guard } = pageLoad(storage, clock); // the reloaded page, its chunk loaded
    assert.deepEqual(guard.takeRecovery(), {
        message: 'Importing a module script failed.',
        page: '/employees',
        at: 1_000_000,
    });
    assert.equal(guard.takeRecovery(), null);
});

test('fails again right after the reload: no second reload, error let through', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    pageLoad(storage, clock).guard.reloadOnce(safariError());

    clock.now += 3_000;
    const { guard, reloads } = pageLoad(storage, clock);
    assert.equal(guard.reloadOnce(safariError()), false);
    assert.equal(reloads.length, 0);
    assert.equal(guard.isReloadPending(), false);
    // the reload did not fix it, so there is no "recovered" log to send later
    assert.equal(storage.getItem(RECOVERY_KEY), null);
});

test('a chunk that is always broken never loops', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    let totalReloads = 0;
    for (let load = 0; load < 20; load++) {
        const { guard, reloads } = pageLoad(storage, clock);
        guard.reloadOnce(safariError());
        totalReloads += reloads.length;
        clock.now += 10_000; // a slow page load, 10 s each
    }
    assert.equal(totalReloads, 1);
});

test('a later deployment in the same tab gets its own automatic reload', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    pageLoad(storage, clock).guard.reloadOnce(safariError());

    clock.now += RELOAD_WINDOW_MS + 1;
    const { guard, reloads } = pageLoad(storage, clock);
    assert.equal(guard.reloadOnce(safariError()), true);
    assert.equal(reloads.length, 1);
});

test('other errors never reload and leave storage alone', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    const { guard, reloads } = pageLoad(storage, clock);
    assert.equal(guard.reloadOnce(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
    assert.equal(reloads.length, 0);
    assert.equal(storage.data.size, 0);
});

test('no usable sessionStorage: no guard, so no automatic reload', () => {
    const clock = { now: 1_000_000 };
    const cases = {
        'sessionStorage access throws': () => { throw new Error('SecurityError'); },
        'sessionStorage missing': () => null,
        'setItem throws': () => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() { } }),
        'writes are dropped': () => ({ getItem: () => null, setItem() { }, removeItem() { } }),
    };
    for (const [name, getStorage] of Object.entries(cases)) {
        const { guard, reloads } = pageLoad(null, clock, { getStorage });
        assert.equal(guard.reloadOnce(safariError()), false, name);
        assert.equal(reloads.length, 0, name);
        assert.equal(guard.takeRecovery(), null, name);
    }
});

test('a reload that throws is reported as not started', () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    const { guard } = pageLoad(storage, clock, { reload: () => { throw new Error('blocked'); } });
    assert.equal(guard.reloadOnce(safariError()), false);
    assert.equal(guard.isReloadPending(), false);
});

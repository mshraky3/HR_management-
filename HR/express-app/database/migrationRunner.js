/**
 * Database Migration Runner
 *
 * Tracks and runs numbered migration files that export an `up(sql)` function.
 * Migration state is stored in the `schema_migrations` table.
 *
 * Convention for new migrations:
 *   export async function up(sql) { ... }
 *
 * Standalone execution still works by running the file directly.
 */

import { createRequire } from 'module';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable() {
    await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

async function getAppliedMigrations() {
    const rows = await sql`SELECT name FROM schema_migrations ORDER BY name`;
    return new Set(rows.map(r => r.name));
}

export async function runMigrations() {
    try {
        await ensureMigrationsTable();
        const applied = await getAppliedMigrations();

        // Read all .js migration files, sorted by name
        const files = readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.js'))
            .sort();

        for (const file of files) {
            if (applied.has(file)) {
                continue; // already ran
            }

            const filePath = join(MIGRATIONS_DIR, file);
            let mod;
            try {
                mod = await import(pathToFileURL(filePath).href);
            } catch (importErr) {
                log.warn(`Migration runner: could not import ${file}`, { error: importErr.message });
                continue;
            }

            if (typeof mod.up !== 'function') {
                // Old-style standalone file — skip auto-run, must be run manually
                continue;
            }

            log.info(`Running migration: ${file}`);
            const TRANSIENT_CODES = new Set(['CONNECTION_ENDED', 'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'ECONNRESET']);
            let attempt = 0;
            const maxAttempts = 3;
            while (true) {
                try {
                    await mod.up(sql);
                    await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
                    log.info(`✓ Migration applied: ${file}`);
                    break;
                } catch (err) {
                    attempt++;
                    const isTransient = TRANSIENT_CODES.has(err.code) || TRANSIENT_CODES.has(err.errno);
                    if (!isTransient || attempt >= maxAttempts) {
                        log.error(`Migration failed: ${file}`, { error: err.message });
                        throw err;
                    }
                    const delay = 2000 * attempt;
                    log.warn(`Migration ${file}: connection dropped, retrying in ${delay}ms (${attempt}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
    } catch (error) {
        log.error('Migration runner error', { error: error.message });
        throw error;
    }
}

/**
 * Migration 029: fill the missing calendar of every employee date
 *
 * Birth, ID expiry, contract start/end and work start are stored in Hijri and Gregorian. Where only one
 * side exists the other is calculated (Umm al-Qura, utils/calendarPairs.js). Only empty cells are
 * written, existing values are never changed. New and edited employees are completed by the model.
 *
 * Idempotent: a second run finds nothing to fill.
 */

import sql from '../../config/database.js';
import { CALENDAR_PAIRS, hijriFromGregorian, gregorianFromHijri } from '../../utils/calendarPairs.js';

export async function up(db = sql) {
  const cols = CALENDAR_PAIRS.flat().join(', ');
  const rows = await db.unsafe(`SELECT id, ${CALENDAR_PAIRS.flat().map((c) => (c.endsWith('_gregorian') ? `to_char(${c}, 'YYYY-MM-DD') AS ${c}` : c)).join(', ')} FROM employees`);
  let filled = 0;
  for (const row of rows) {
    const updates = {};
    for (const [hk, gk] of CALENDAR_PAIRS) {
      if (row[gk] && !row[hk]) {
        const h = hijriFromGregorian(row[gk]);
        if (h) updates[hk] = h;
      } else if (row[hk] && !row[gk]) {
        const g = gregorianFromHijri(row[hk]);
        if (g) updates[gk] = g;
      }
    }
    const keys = Object.keys(updates);
    if (keys.length === 0) continue;
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.unsafe(`UPDATE employees SET ${set} WHERE id = $1`, [row.id, ...keys.map((k) => updates[k])]);
    filled += keys.length;
  }
  console.log(`Migration 029: filled ${filled} missing calendar values (columns checked: ${cols.split(', ').length})`);
}

export async function down() {
  console.warn('Rollback not supported for migration 029 (data fill).');
  return { success: false, message: 'Rollback not supported' };
}

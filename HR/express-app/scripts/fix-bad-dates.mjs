/**
 * Repairs impossible dates and Hijri dates that drifted from their Gregorian partner.
 * DRY RUN BY DEFAULT: nothing is written unless --apply is given.
 *
 *   DATABASE_URL=postgres://... node scripts/fix-bad-dates.mjs                 # show what would change
 *   DATABASE_URL=postgres://... node scripts/fix-bad-dates.mjs --apply         # change it (one transaction)
 *   DATABASE_URL=postgres://... node scripts/fix-bad-dates.mjs --revert FILE   # undo an --apply from its before-image file
 *
 * Rules (Gregorian is the source of truth because every report, alert and age calculation uses it):
 *  1. Year 0001-0099 in a Gregorian field            -> +2000        (0026-05-21 -> 2026-05-21)
 *  2. Year 0400-0499                                 -> +1000, read as Hijri, converted   (0445 -> 1445 AH)
 *  3. Year 1300-1500 (a Hijri date typed into a Gregorian field) -> converted to Gregorian
 *  4. Year above 2100 where the Hijri partner is a real Hijri date -> Gregorian rebuilt from the Hijri partner
 *  5. Then every stored Hijri date that differs from the exact Umm al-Qura conversion of its Gregorian date is rewritten.
 * Not touched, only reported: a birth date that is impossible (needs the person's ID card).
 * Every changed row gets an audit_log entry (action 'data_fix_dates') and a before-image file for --revert.
 * updated_at is left alone so nobody editing the same employee gets a false "changed by someone else" conflict.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { gregorianToHijri, hijriToGregorian, formatHijriToString, parseHijriString } from '../utils/dateConverter.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REVERT = args.includes('--revert') ? args[args.indexOf('--revert') + 1] : null;
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');

const host = new URL(process.env.DATABASE_URL).hostname;
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
const sql = postgres(process.env.DATABASE_URL, { ssl: local ? false : 'require', max: 1, connect_timeout: 30 });

// table, gregorian column, hijri partner (or null), may be repaired by rules 1-4
const COLUMNS = [
  ['employees', 'id_expiry_date_gregorian', 'id_expiry_date_hijri', true],
  ['employees', 'contract_start_date_gregorian', 'contract_start_date_hijri', true],
  ['employees', 'contract_end_date_gregorian', 'contract_end_date_hijri', true],
  ['employees', 'passport_issue_date', null, true],
  ['employees', 'passport_expiry_date', null, true],
  ['employees', 'residency_issue_date', null, true],
  ['employees', 'date_of_birth_gregorian', 'date_of_birth_hijri', false],
  ['branch_documents', 'issue_date', 'issue_date_hijri', true],
  ['branch_documents', 'expiry_date', 'expiry_date_hijri', true],
  ['bus_details', 'lease_start_date_gregorian', 'lease_start_date_hijri', true],
  ['bus_details', 'lease_end_date_gregorian', 'lease_end_date_hijri', true]
];

const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const yearOf = (g) => Number(String(g).slice(0, 4));
const plausible = (g, lo = 1950, hi = 2100) => { const y = yearOf(g); return y >= lo && y <= hi; };

/** Returns { value, rule } for an impossible Gregorian value, or null when it needs a person to decide. */
function repairGregorian(g, hijriPartner) {
  const y = yearOf(g);
  const [, mm, dd] = String(g).split('-').map(Number);
  if (y >= 1 && y <= 99) { const v = iso(y + 2000, mm, dd); return plausible(v) ? { value: v, rule: 'year+2000' } : null; }
  const asHijri = (hy) => {
    const v = hijriToGregorian(dd, mm, hy);
    return v && plausible(v) ? v : null;
  };
  if (y >= 400 && y <= 499) { const v = asHijri(y + 1000); return v ? { value: v, rule: 'hijri typo 0xxx->1xxx' } : null; }
  if (y >= 1300 && y <= 1500) { const v = asHijri(y); return v ? { value: v, rule: 'hijri typed as gregorian' } : null; }
  if (y > 2100 && hijriPartner) {
    const h = parseHijriString(hijriPartner);
    if (h && h.year >= 1300 && h.year <= 1500) {
      const v = hijriToGregorian(h.day, h.month, h.year);
      return v && plausible(v) ? { value: v, rule: 'from hijri partner' } : null;
    }
  }
  return null;
}

async function revert(file) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0; let skipped = 0;
  await sql.begin(async (tx) => {
    for (const e of entries) {
      const cols = Object.keys(e.before);
      const [row] = await tx.unsafe(`SELECT ${cols.map((c) => `${c}::text AS ${c}`).join(', ')} FROM ${e.table} WHERE id = $1`, [e.id]);
      const unchanged = row && cols.every((c) => (row[c] ?? null) === (e.after[c] ?? null));
      if (!unchanged) { skipped++; continue; } // edited since: leave the newer value alone
      const sets = cols.map((c, i) => `${c} = ${isHijriCol(c) ? `$${i + 2}` : `$${i + 2}::date`}`).join(', ');
      await tx.unsafe(`UPDATE ${e.table} SET ${sets} WHERE id = $1`, [e.id, ...cols.map((c) => e.before[c])]);
      n++;
    }
  });
  console.log(`Reverted ${n} rows, skipped ${skipped} that were edited since.`);
}
const isHijriCol = (c) => c.endsWith('_hijri');

if (REVERT) { await revert(REVERT); await sql.end(); process.exit(0); }

// ---- plan -------------------------------------------------------------------------------------------------
const plan = new Map(); // `${table}:${id}` -> { table, id, before: {}, after: {}, notes: [] }
const unresolved = [];
const touch = (table, id) => {
  const key = `${table}:${id}`;
  if (!plan.has(key)) plan.set(key, { table, id, before: {}, after: {}, notes: [] });
  return plan.get(key);
};
const setCol = (table, id, col, oldV, newV, note) => {
  if ((oldV ?? null) === (newV ?? null)) return;
  const p = touch(table, id);
  if (!(col in p.before)) p.before[col] = oldV ?? null;
  p.after[col] = newV ?? null;
  if (note) p.notes.push(`${col}: ${note}`);
};

const tables = [...new Set(COLUMNS.map((c) => c[0]))];
for (const table of tables) {
  const cols = COLUMNS.filter((c) => c[0] === table);
  const select = [...new Set(cols.flatMap(([, g, h]) => [g, h].filter(Boolean)))];
  const rows = await sql.unsafe(`SELECT id, ${select.map((c) => `${c}::text AS ${c}`).join(', ')} FROM ${table} ORDER BY id`);
  for (const r of rows) {
    for (const [, g, h, repairable] of cols) {
      let gv = r[g];
      if (gv && !plausible(gv, g.includes('birth') ? 1930 : 1950, g.includes('birth') ? 2010 : 2100)) {
        const fix = repairable ? repairGregorian(gv, h ? r[h] : null) : null;
        if (fix) { setCol(table, r.id, g, gv, fix.value, `${gv} -> ${fix.value} (${fix.rule})`); gv = fix.value; }
        else { unresolved.push(`${table}.${g} id ${r.id}: ${gv}${h && r[h] ? ` (hijri partner ${r[h]})` : ''}`); continue; }
      }
      if (!h || !gv || r[h] === null || r[h] === '') continue;
      const exact = gregorianToHijri(gv);
      if (!exact) continue;
      const want = formatHijriToString(exact);
      const have = parseHijriString(r[h]);
      const same = have && have.day === exact.day && have.month === exact.month && have.year === exact.year;
      if (!same) setCol(table, r.id, h, r[h], want, `${r[h]} -> ${want}`);
    }
  }
}

// ---- report -----------------------------------------------------------------------------------------------
const byTable = {};
for (const p of plan.values()) {
  for (const c of Object.keys(p.after)) byTable[`${p.table}.${c}`] = (byTable[`${p.table}.${c}`] || 0) + 1;
}
console.log(APPLY ? 'APPLY MODE' : 'DRY RUN (nothing is written)');
console.log(`Rows to change: ${plan.size}`);
for (const [k, v] of Object.entries(byTable).sort()) console.log(`  ${k}: ${v}`);
console.log('\nImpossible dates repaired:');
for (const p of plan.values()) for (const n of p.notes) if (/year\+|hijri typ|from hijri/.test(n)) console.log(`  ${p.table} #${p.id} ${n}`);
if (unresolved.length) { console.log('\nNeeds a person (left unchanged):'); unresolved.forEach((u) => console.log('  ' + u)); }

if (!APPLY) { console.log('\nRun again with --apply to write these changes.'); await sql.end(); process.exit(0); }

// ---- apply ------------------------------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.resolve(`date-fix-before-${stamp}.json`);
fs.writeFileSync(outFile, JSON.stringify([...plan.values()].map(({ table, id, before, after }) => ({ table, id, before, after })), null, 1));
console.log(`\nBefore-image saved: ${outFile}`);

const [{ has_audit }] = await sql`SELECT to_regclass('public.audit_log') IS NOT NULL AS has_audit`;
if (!has_audit) console.log('audit_log table does not exist yet (migration 026 not applied): skipping audit entries; the before-image file is the record.');
await sql.begin(async (tx) => {
  for (const p of plan.values()) {
    const cols = Object.keys(p.after);
    const sets = cols.map((c, i) => `${c} = ${isHijriCol(c) ? `$${i + 2}` : `$${i + 2}::date`}`).join(', ');
    await tx.unsafe(`UPDATE ${p.table} SET ${sets} WHERE id = $1`, [p.id, ...cols.map((c) => p.after[c])]);
    if (has_audit && p.table === 'employees') {
      await tx`
        INSERT INTO audit_log (entity_type, entity_id, action, actor_kind, actor_name, changes)
        VALUES ('employee', ${p.id}, 'data_fix_dates', NULL, 'system: fix-bad-dates', ${tx.json({ before: p.before, after: p.after })})`;
    }
  }
});
console.log(`Applied ${plan.size} row changes.`);
await sql.end();

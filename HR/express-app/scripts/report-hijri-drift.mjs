/**
 * READ-ONLY report: stored Hijri dates that no longer match the exact Umm al-Qura conversion of their Gregorian
 * partner. The old converter was off by one day for many dates, and the forms kept whatever was stored.
 * Nothing is written. Correcting rows needs the owner's decision (which side is right differs per document).
 *
 *   DATABASE_URL=postgres://... node scripts/report-hijri-drift.mjs
 */
import postgres from 'postgres';
import { gregorianToHijri, parseHijriString } from '../utils/dateConverter.js';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.DATABASE_SSL === 'false' ? false : 'require', max: 1 });

const PAIRS = [
  ['employees', 'date_of_birth_gregorian', 'date_of_birth_hijri'],
  ['employees', 'contract_start_date_gregorian', 'contract_start_date_hijri'],
  ['employees', 'contract_end_date_gregorian', 'contract_end_date_hijri'],
  ['employees', 'id_expiry_date_gregorian', 'id_expiry_date_hijri'],
  ['employee_documents', 'expiry_date', 'expiry_date_hijri'],
  ['branch_documents', 'issue_date', 'issue_date_hijri'],
  ['branch_documents', 'expiry_date', 'expiry_date_hijri'],
  ['bus_details', 'lease_start_date_gregorian', 'lease_start_date_hijri'],
  ['bus_details', 'lease_end_date_gregorian', 'lease_end_date_hijri']
];

const dayNumber = (h) => h.year * 354.367 + (h.month - 1) * 29.53 + h.day; // rough ordinal: only to size the gap
let any = false;
for (const [table, g, h] of PAIRS) {
  let rows;
  try {
    rows = await sql.unsafe(`SELECT id, ${g}::text AS g, ${h} AS h FROM ${table} WHERE ${g} IS NOT NULL AND ${h} IS NOT NULL AND ${h} <> ''`);
  } catch (e) { console.log(`${table}.${h}: skipped (${e.message})`); continue; }
  let drift = 0; let unparsable = 0; const samples = []; let offByOne = 0;
  for (const r of rows) {
    const stored = parseHijriString(r.h);
    const exact = gregorianToHijri(String(r.g).slice(0, 10));
    if (!stored || !exact) { unparsable++; continue; }
    if (stored.day !== exact.day || stored.month !== exact.month || stored.year !== exact.year) {
      drift++;
      if (Math.abs(dayNumber(stored) - dayNumber(exact)) < 2.5) offByOne++;
      if (samples.length < 3) samples.push(`#${r.id} ${String(r.g).slice(0, 10)} stored ${r.h} exact ${exact.day}/${exact.month}/${exact.year}`);
    }
  }
  any = any || drift > 0;
  console.log(`${table}.${h}: ${rows.length} pairs, ${drift} differ (${offByOne} by about a day), ${unparsable} unreadable`);
  samples.forEach((s) => console.log('   ' + s));
}
console.log(any ? '\nDrift found. Nothing was changed.' : '\nNo drift found.');
await sql.end();

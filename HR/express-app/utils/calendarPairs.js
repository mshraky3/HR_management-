/**
 * Hijri / Gregorian pairs: the employee table stores several dates twice (a *_hijri text column
 * DD/MM/YYYY and a *_gregorian DATE column). Whenever one side is known the other is calculated here
 * (Umm al-Qura) so both calendars are always available for display, reports and certificates.
 */
import { gregorianToHijri, hijriToGregorian, formatHijriToString, parseHijriString } from './dateConverter.js';

export const CALENDAR_PAIRS = [
  ['date_of_birth_hijri', 'date_of_birth_gregorian'],
  ['id_expiry_date_hijri', 'id_expiry_date_gregorian'],
  ['contract_start_date_hijri', 'contract_start_date_gregorian'],
  ['contract_end_date_hijri', 'contract_end_date_gregorian'],
  ['work_start_date_hijri', 'work_start_date_gregorian'],
];

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

const toIso = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
};

export const hijriFromGregorian = (value) => {
  const iso = has(value) ? toIso(value) : null;
  return iso ? formatHijriToString(gregorianToHijri(iso)) : null;
};

export const gregorianFromHijri = (value) => {
  const parts = has(value) ? parseHijriString(value) : null;
  return parts ? hijriToGregorian(parts.day, parts.month, parts.year) : null;
};

/**
 * Fills the missing side of every pair in `data` (a create body, an update body or a full row).
 * On an update, changing only one side recalculates the other so they cannot drift apart;
 * clearing one side clears the other. Mutates and returns `data`.
 */
export function completeCalendarPairs(data) {
  for (const [hk, gk] of CALENDAR_PAIRS) {
    const hIn = Object.prototype.hasOwnProperty.call(data, hk);
    const gIn = Object.prototype.hasOwnProperty.call(data, gk);
    if (!hIn && !gIn) continue;

    if (gIn && !hIn) {
      // Never overwrite with null when the typed value could not be converted
      const h = has(data[gk]) ? hijriFromGregorian(data[gk]) : null;
      if (h || !has(data[gk])) data[hk] = h;
    } else if (hIn && !gIn) {
      const g = has(data[hk]) ? gregorianFromHijri(data[hk]) : null;
      if (g || !has(data[hk])) data[gk] = g;
    } else if (has(data[gk]) && !has(data[hk])) {
      data[hk] = hijriFromGregorian(data[gk]);
    } else if (has(data[hk]) && !has(data[gk])) {
      data[gk] = gregorianFromHijri(data[hk]);
    }
  }
  return data;
}

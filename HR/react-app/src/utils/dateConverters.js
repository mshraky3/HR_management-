/**
 * Date Converter Utility
 * Conversions between Hijri and Gregorian dates
 */

// Approximate duration of a lunar month in days
const LUNAR_MONTH = 29.53058868;

// --- Exact Umm al-Qura conversion -------------------------------------------
// Both directions come from the platform's Umm al-Qura calendar (Intl), so
// hijriToGregorian(gregorianToHijri(x)) === x for every date. The previous
// Hijri -> Gregorian used a 30-year arithmetic calendar (off by a day for most
// dates) while Gregorian -> Hijri used Intl, so saving a form rewrote stored
// Gregorian dates one day earlier. Keep this block identical in the API
// (utils/dateConverter.js) and the SPA (src/utils/dateConverters.js).
const MS_PER_DAY = 86400000;
const UMALQURA_MIN_YEAR = 1300;
const UMALQURA_MAX_YEAR = 1600;
const umalquraFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

function umalquraPartsAtUtc(utcMs) {
  const parts = umalquraFormatter.formatToParts(new Date(utcMs));
  const pick = (type) => parseInt(parts.find((p) => p.type === type)?.value, 10);
  return { day: pick('day'), month: pick('month'), year: pick('year') };
}

/** UTC midnight (ms) of a 'YYYY-MM-DD' string, a Date (its local calendar day) or any date string. */
function toUtcMidnight(input) {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const text = String(input).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function exactHijriToGregorian(day, month, year) {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if ([d, m, y].some((n) => Number.isNaN(n))) return null;
  if (y < UMALQURA_MIN_YEAR || y > UMALQURA_MAX_YEAR || m < 1 || m > 12 || d < 1 || d > 30) return null;

  // Mean-calendar estimate (1 Muharram 1 AH = 622-07-19 proleptic Gregorian), then settle on the
  // neighbouring day whose Umm al-Qura date matches exactly. A day that does not exist (30th of a
  // 29-day month) matches nothing and returns null.
  const daysSinceEpoch = (y - 1) * 354.36707 + (m - 1) * 29.530588 + (d - 1);
  const estimate = Date.UTC(622, 6, 19) + Math.round(daysSinceEpoch) * MS_PER_DAY;
  for (let step = 0; step <= 8; step++) {
    for (const sign of step === 0 ? [1] : [-1, 1]) {
      const candidate = estimate + sign * step * MS_PER_DAY;
      const p = umalquraPartsAtUtc(candidate);
      if (p.day === d && p.month === m && p.year === y) {
        const g = new Date(candidate);
        const pad = (n) => String(n).padStart(2, '0');
        return `${g.getUTCFullYear()}-${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`;
      }
    }
  }
  return null;
}

/**
 * Convert Gregorian date to Hijri
 * @param {string} dateString - Gregorian date string (YYYY-MM-DD)
 * @returns {Object} { day, month, year }
 */
export const gregorianToHijri = (dateString) => {
  if (!dateString) return null;

  const utcMs = toUtcMidnight(dateString);
  if (utcMs === null) return null;

  try {
    const p = umalquraPartsAtUtc(utcMs);
    if (!p.day || !p.month || !p.year) return null;
    return p;
  } catch (e) {
    // Platform without the Umm al-Qura calendar: arithmetic approximation
    return approximateGregorianToHijri(new Date(utcMs));
  }
};

/**
 * Convert Hijri date to Gregorian
 * @param {number} day 
 * @param {number} month 
 * @param {number} year 
 * @returns {string} Gregorian date string (YYYY-MM-DD)
 */
export const hijriToGregorian = (day, month, year) => {
  if (!day || !month || !year) return null;
  return exactHijriToGregorian(day, month, year);
};

// --- Helper Algorithms ---

/**
 * Approximate conversion from Gregorian to Hijri
 * Used as fallback
 */
function approximateGregorianToHijri(date) {
  let jd = Math.floor((date.getTime() + 60 * 60 * 1000) / 86400000) + 2440588 - 1;
  let l = jd - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  let l1 = l - 10631 * n + 354;
  let j1 = (Math.floor((10985 - l1) / 5316)) * (Math.floor((50 * l1) / 17719)) + (Math.floor(l1 / 5670)) * (Math.floor((43 * l1) / 15238));
  let l2 = l1 - (Math.floor((30 - j1) / 15)) * (Math.floor((17719 * j1) / 50)) - (Math.floor(j1 / 16)) * (Math.floor((15238 * j1) / 43)) + 29;
  let m1 = Math.floor((24 * l2) / 709);
  let d1 = l2 - Math.floor((709 * m1) / 24);
  let y1 = 30 * n + j1 - 30;

  return {
    day: d1,
    month: m1,
    year: y1
  };
}


/**
 * Format Hijri date object to string DD/MM/YYYY
 */
export const formatHijriToString = (hijriDate) => {
  if (!hijriDate || !hijriDate.day || !hijriDate.month || !hijriDate.year) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hijriDate.day)}/${pad(hijriDate.month)}/${hijriDate.year}`;
};

/**
 * Parse Hijri string DD/MM/YYYY to object
 */
export const parseHijriString = (dateString) => {
  if (!dateString) return null;
  const normalized = String(dateString).trim();
  // Accept d/m/yyyy, dd/m/yyyy, d/mm/yyyy, dd/mm/yyyy (slashes)
  const parts = normalized.split('/').map((p) => p.trim());
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if ([day, month, year].some((n) => Number.isNaN(n))) return null;
  return { day, month, year };
};

/**
 * Unified date formatting function - formats dates as dd/mm/yyyy
 * @param {string|Date} date - Date string or Date object
 * @returns {string} Formatted date string in dd/mm/yyyy format, or '-' if invalid
 */
export const formatDate = (date) => {
  if (!date) return '-';
  
  let d;
  if (typeof date === 'string') {
    // Handle ISO string dates (e.g., "1993-05-24T00:00:00.000Z" or "1993-05-24")
    if (date.includes('T')) {
      // Parse ISO string properly to handle timezone
      d = new Date(date);
    } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Handle YYYY-MM-DD format
      d = new Date(date + 'T00:00:00');
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  
  // Check if date is valid
  if (isNaN(d.getTime())) return '-';
  
  // Format as dd/mm/yyyy
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
};
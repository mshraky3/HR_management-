/**
 * Date Converter Utility
 * Conversions between Hijri and Gregorian dates
 */

// Approximate duration of a lunar month in days
const LUNAR_MONTH = 29.53058868;

/**
 * Convert Gregorian date to Hijri
 * @param {string} dateString - Gregorian date string (YYYY-MM-DD)
 * @returns {Object} { day, month, year }
 */
export const gregorianToHijri = (dateString) => {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  // Use Intl.DateTimeFormat for accurate conversion supported by browsers
  const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  });

  try {
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const year = parts.find(p => p.type === 'year')?.value;

    return {
      day: parseInt(day),
      month: parseInt(month),
      year: parseInt(year)
    };
  } catch (e) {
    // Fallback if islamic-umalqura is not supported
    console.warn('Islamic Umalqura calendar not supported, using approximation');
    return approximateGregorianToHijri(date);
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

  // Since exact algorithmic conversion is complex and varies (Umm al-Qura vs others),
  // and JS doesn't have a built-in "from Hijri" parser, we use an approximation
  // or a library-free implementation of the Kuwaiti algorithm which is commonly used.
  
  return kuwaitiHijriToGregorian(day, month, year);
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
 * Kuwaiti Algorithm for Hijri to Gregorian
 * Convert Hijri date to Gregorian using Julian Day Number calculation
 * This is the corrected version matching the backend algorithm
 */
function kuwaitiHijriToGregorian(day, month, year) {
  const iYear = parseInt(year);
  const iMonth = parseInt(month); // 1-indexed
  const iDay = parseInt(day);

  if (iYear < 1 || iYear > 1500 || iMonth < 1 || iMonth > 12 || iDay < 1 || iDay > 30) {
    return null;
  }

  // Hijri epoch: July 16, 622 CE = Julian Day 1948439.5
  const hijriEpoch = 1948439.5;
  
  // Calculate days from start of Hijri year
  // Determine if it's a leap year (11 leap years in 30-year cycle: 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29)
  const cycleYear = (iYear - 1) % 30;
  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
  const isLeapYear = leapYears.includes(cycleYear);
  
  // Hijri month lengths (standard pattern: 30, 29, 30, 29...)
  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  if (isLeapYear) {
    monthLengths[11] = 30; // Last month (Dhu al-Hijjah) is 30 days in leap year
  }
  
  // Calculate days from start of year
  let daysFromYearStart = iDay - 1; // -1 because we count from 0
  for (let m = 0; m < iMonth - 1; m++) {
    daysFromYearStart += monthLengths[m];
  }
  
  // Calculate total days since Hijri epoch
  // 30-year cycle has 11 leap years, so 354*19 + 355*11 = 10631 days
  const cycles = Math.floor((iYear - 1) / 30);
  const yearInCycle = (iYear - 1) % 30;
  
  // Calculate days from completed cycles
  const daysFromCycles = cycles * 10631;
  
  // Calculate days from completed years in current cycle
  let daysFromYears = 0;
  for (let y = 0; y < yearInCycle; y++) {
    const yCycleYear = y % 30;
    const yIsLeap = leapYears.includes(yCycleYear);
    daysFromYears += yIsLeap ? 355 : 354;
  }
  
  // Calculate Julian Day Number
  const jd = hijriEpoch + daysFromCycles + daysFromYears + daysFromYearStart;
  
  // Convert Julian Day Number to Gregorian Date
  // Algorithm from "Astronomical Algorithms" by Jean Meeus
  const j = Math.floor(jd) + 0.5;
  const z = Math.floor(j);
  const w = Math.floor((z - 1867216.25) / 36524.25);
  const x = Math.floor(w / 4);
  const a = z + 1 + w - x;
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const f = Math.floor(30.6001 * e);
  
  let gDay = b - d - f;
  let gMonth = e < 14 ? e - 1 : e - 13;
  let gYear = gMonth > 2 ? c - 4716 : c - 4715;

  // Format YYYY-MM-DD
  const pad = (n) => n.toString().padStart(2, '0');
  
  // Validate the resulting date - expanded range to handle historical dates
  if (gYear < 1000 || gYear > 2500) {
    console.warn(`Hijri to Gregorian conversion resulted in year ${gYear} (outside 1000-2500 range) for input: ${day}/${month}/${year}`);
    return null;
  }
  
  if (gMonth < 1 || gMonth > 12 || gDay < 1 || gDay > 31) {
    console.warn(`Hijri to Gregorian conversion resulted in invalid date: ${gYear}-${gMonth}-${gDay} for input: ${day}/${month}/${year}`);
    return null;
  }

  return `${gYear}-${pad(gMonth)}-${pad(gDay)}`;
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
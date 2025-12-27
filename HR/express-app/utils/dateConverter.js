/**
 * Date Converter Utility for Backend
 * Conversions between Hijri and Gregorian dates
 */

/**
 * Convert Gregorian date string (YYYY-MM-DD) to Hijri date object
 * @param {string} dateString - Gregorian date string (YYYY-MM-DD)
 * @returns {Object|null} { day, month, year } or null
 */
export const gregorianToHijri = (dateString) => {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  // Use Intl.DateTimeFormat for accurate conversion
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

    if (!day || !month || !year) return null;

    return {
      day: parseInt(day),
      month: parseInt(month),
      year: parseInt(year)
    };
  } catch (e) {
    console.warn('Islamic Umalqura calendar not supported, using approximation');
    return approximateGregorianToHijri(date);
  }
};

/**
 * Convert Hijri date object to Gregorian date string (YYYY-MM-DD)
 * @param {number} day 
 * @param {number} month 
 * @param {number} year 
 * @returns {string|null} Gregorian date string (YYYY-MM-DD) or null
 */
export const hijriToGregorian = (day, month, year) => {
  if (!day || !month || !year) return null;
  return kuwaitiHijriToGregorian(day, month, year);
};

/**
 * Format Hijri date object to string (DD/MM/YYYY)
 * @param {Object} hijriDate - { day, month, year }
 * @returns {string} Formatted date string
 */
export const formatHijriToString = (hijriDate) => {
  if (!hijriDate || !hijriDate.day || !hijriDate.month || !hijriDate.year) return null;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hijriDate.day)}/${pad(hijriDate.month)}/${hijriDate.year}`;
};

/**
 * Parse Hijri string (DD/MM/YYYY) to object
 * @param {string} dateString - Hijri date string (DD/MM/YYYY)
 * @returns {Object|null} { day, month, year } or null
 */
export const parseHijriString = (dateString) => {
  if (!dateString) return null;
  const parts = dateString.split('/');
  if (parts.length !== 3) return null;
  return {
    day: parseInt(parts[0]),
    month: parseInt(parts[1]),
    year: parseInt(parts[2])
  };
};

/**
 * Approximate conversion from Gregorian to Hijri (fallback)
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
 */
function kuwaitiHijriToGregorian(day, month, year) {
  const iYear = parseInt(year);
  const iMonth = parseInt(month) - 1; // 0-indexed
  const iDay = parseInt(day);

  const islamicEpoch = 227014;
  let z = iYear;
  
  // Cycle number
  let cycle = Math.floor(z / 30);
  
  // Year within cycle
  let yearInCycle = z % 30;
  
  let dayInYear = iDay;
  
  // Add days for past months
  // Alternate 30 and 29 days
  for (let m = 0; m < iMonth; m++) {
    // Months are 30, 29, 30, 29...
    // Except 12th month in leap years
    if (m % 2 === 0) {
      dayInYear += 30;
    } else {
      dayInYear += 29;
    }
  }
  
  // Calculate days since epoch
  // 354 days in normal year, 355 in leap year
  // 11 leap years in 30-year cycle: 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29
  
  let daysSinceEpoch = 
    islamicEpoch + 
    cycle * 10631 + // 10631 days in 30 years
    (yearInCycle - 1) * 354 + 
    Math.floor((3 + (11 * yearInCycle)) / 30) + 
    dayInYear - 1; // -1 because epoch is day 1

  let jd = daysSinceEpoch + 1948440 - 1; // Adjust to astronomial JD
  
  let l = jd + 68569;
  let n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  let i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  let j = Math.floor((80 * l) / 2447);
  let d = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  let m = j + 2 - 12 * l;
  let y = 100 * (n - 49) + i + l;

  // Format YYYY-MM-DD
  const pad = (n) => n.toString().padStart(2, '0');
  
  if (y < 1900 || y > 2100) {
    return null; // Invalid date range
  }

  return `${y}-${pad(m)}-${pad(d)}`;
}


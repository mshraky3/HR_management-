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
  // (Using Kuwaiti Algo leap years)
  
  let daysSinceEpoch = 
    islamicEpoch + 
    cycle * 10631 + // 10631 days in 30 years
    (yearInCycle - 1) * 354 + 
    Math.floor((3 + (11 * yearInCycle)) / 30) + 
    dayInYear - 1; // -1 because epoch is day 1

  // Convert Julian Day to Gregorian Date
  // Simplified JD to Gregorian
  // We can use the Date object by calculating milliseconds from 1970-01-01
  // JD for 1970-01-01 is 2440588
  // Islamic Epoch (JD) is actually ~1948439.5, our calculation above is a simplified offset
  
  // Let's use a more direct JD conversion to be safe
  // Re-implementing JD conversion to be self-contained
  
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
  
  // Verify date validity roughly
  if (y < 1900 || y > 2100) {
      // Fallback or error? Let's just return what we have, but formatted
  }

  return `${y}-${pad(m)}-${pad(d)}`;
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
  const parts = dateString.split('/');
  if (parts.length !== 3) return null;
  return {
    day: parseInt(parts[0]),
    month: parseInt(parts[1]),
    year: parseInt(parts[2])
  };
};

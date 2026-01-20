/**
 * Unified Date Validator
 * Validates dates with consistent rules across the entire application
 * Supports both Hijri and Gregorian dates
 */

import {
  gregorianToHijri,
  hijriToGregorian,
  formatHijriToString,
  parseHijriString,
} from "./dateConverter.js";

/**
 * Calculate age from date of birth
 */
function calculateAge(gregorianDate) {
  if (!gregorianDate) return null;

  let birthDate;
  if (typeof gregorianDate === "string") {
    birthDate = new Date(gregorianDate);
  } else {
    birthDate = new Date(gregorianDate);
  }

  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

/**
 * Validate and convert date
 * @param {string} input - Date string (Hijri: dd/mm/yyyy or Gregorian: yyyy-mm-dd)
 * @param {string} calendarType - 'hijri' | 'gregorian'
 * @param {string} dateType - 'birth_date' | 'expiry_date' | 'contract_date' | 'general'
 * @returns {Object} { valid, errors, warnings, hijri, gregorian, age? }
 */
export function validateDate(input, calendarType, dateType = "general") {
  const errors = [];
  const warnings = [];
  let hijri = null;
  let gregorian = null;
  let age = null;

  const pad2 = (n) => String(n).padStart(2, "0");
  const parseGregorianSlashDate = (value) => {
    // Accept d/m/yyyy, dd/m/yyyy, d/mm/yyyy, dd/mm/yyyy and return YYYY-MM-DD
    const parts = String(value)
      .trim()
      .split("/")
      .map((p) => p.trim());
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if ([day, month, year].some((n) => Number.isNaN(n))) return null;
    if (year < 1000 || year > 2500) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  };

  if (!input || typeof input !== "string" || input.trim() === "") {
    return {
      valid: false,
      errors: ["Date is required"],
      warnings: [],
      hijri: null,
      gregorian: null,
      age: null,
    };
  }

  try {
    if (calendarType === "hijri") {
      // Parse Hijri date (dd/mm/yyyy)
      const hijriParts = parseHijriString(input);

      if (
        !hijriParts ||
        isNaN(hijriParts.day) ||
        isNaN(hijriParts.month) ||
        isNaN(hijriParts.year)
      ) {
        return {
          valid: false,
          errors: ["Invalid Hijri date format. Expected format: dd/mm/yyyy"],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null,
        };
      }

      // Validate Hijri date values
      if (hijriParts.day < 1 || hijriParts.day > 30) {
        errors.push("Hijri day must be between 1 and 30");
      }
      if (hijriParts.month < 1 || hijriParts.month > 12) {
        errors.push("Hijri month must be between 1 and 12");
      }
      if (hijriParts.year < 1 || hijriParts.year > 1500) {
        errors.push("Hijri year must be between 1 and 1500");
      }

      // Check for 3-digit year (invalid)
      if (hijriParts.year < 1000) {
        errors.push(
          "Year must be 4 digits. 3-digit years (like 812) are not valid.",
        );
      }

      if (errors.length > 0) {
        return {
          valid: false,
          errors,
          warnings,
          hijri: null,
          gregorian: null,
          age: null,
        };
      }

      // Convert to Gregorian
      hijri = formatHijriToString(hijriParts);
      gregorian = hijriToGregorian(
        hijriParts.day,
        hijriParts.month,
        hijriParts.year,
      );

      if (!gregorian) {
        return {
          valid: false,
          errors: ["Failed to convert Hijri date to Gregorian"],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null,
        };
      }
    } else if (calendarType === "gregorian") {
      // Parse Gregorian date (YYYY-MM-DD) OR (D/M/YYYY)
      const normalizedInput = String(input).trim();
      const isoInput = normalizedInput.includes("/")
        ? parseGregorianSlashDate(normalizedInput)
        : normalizedInput;

      const date = new Date(isoInput);

      if (isNaN(date.getTime())) {
        return {
          valid: false,
          errors: [
            "Invalid Gregorian date format. Expected format: yyyy-mm-dd",
          ],
          warnings: [],
          hijri: null,
          gregorian: null,
          age: null,
        };
      }

      // Check for 3-digit year
      const year = date.getFullYear();
      if (year < 1000) {
        errors.push(
          "Year must be 4 digits. 3-digit years (like 812) are not valid.",
        );
      }

      gregorian = (isoInput || normalizedInput).split("T")[0]; // Ensure YYYY-MM-DD format

      // Convert to Hijri
      const hijriDate = gregorianToHijri(gregorian);
      if (hijriDate) {
        hijri = formatHijriToString(hijriDate);
      } else {
        errors.push("Failed to convert Gregorian date to Hijri");
      }
    } else {
      return {
        valid: false,
        errors: [
          `Invalid calendar type: ${calendarType}. Must be 'hijri' or 'gregorian'`,
        ],
        warnings: [],
        hijri: null,
        gregorian: null,
        age: null,
      };
    }

    // Validate the resulting Gregorian date
    if (!gregorian) {
      return {
        valid: false,
        errors: ["Could not determine Gregorian date"],
        warnings: [],
        hijri,
        gregorian: null,
        age: null,
      };
    }

    // Parse as local midnight to avoid timezone shifting issues with YYYY-MM-DD parsing
    const gregDate = new Date(`${gregorian}T00:00:00`);
    if (isNaN(gregDate.getTime())) {
      return {
        valid: false,
        errors: ["Invalid Gregorian date"],
        warnings: [],
        hijri,
        gregorian,
        age: null,
      };
    }

    const gregYear = gregDate.getFullYear();

    // General date validation
    if (gregYear < 1000) {
      errors.push(
        "Year must be 4 digits (minimum 1000). 3-digit years are not valid.",
      );
    }

    // Year limit only applies to non-expiry dates (expiry dates can be any future date)
    if (dateType !== "expiry_date" && gregYear > 2500) {
      errors.push("Year is too far in the future (maximum 2500)");
    }

    // Removed: "Date is too far in the future (more than 1 year ahead)" validation
    // Dates can now be any date in the future (no 1-year restriction)

    // Calculate age for birth dates
    if (dateType === "birth_date") {
      age = calculateAge(gregorian);

      if (age === null) {
        errors.push("Could not calculate age from date");
      } else if (age < 20) {
        errors.push(`Employee age (${age} years) must be at least 20 years`);
      } else if (age > 100) {
        errors.push(`Employee age (${age} years) must not exceed 100 years`);
      }
    }

    // Validate expiry dates - must be at least 1 day in the future (can be any future date)
    if (dateType === "expiry_date") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      gregDate.setHours(0, 0, 0, 0);

      // Must be strictly after today (at least 1 day in the future, but can be any future date)
      if (gregDate <= today) {
        errors.push(
          "تاريخ الانتهاء يجب أن يكون في المستقبل (غير منتهي الصلاحية)",
        );
      }
      // No upper limit - expiry dates can be any date in the future (50 years, 100 years, etc.)
    }

    // If any errors, return invalid
    if (errors.length > 0) {
      return { valid: false, errors, warnings, hijri, gregorian, age };
    }

    return { valid: true, errors: [], warnings, hijri, gregorian, age };
  } catch (error) {
    return {
      valid: false,
      errors: [`Date validation error: ${error.message}`],
      warnings: [],
      hijri: null,
      gregorian: null,
      age: null,
    };
  }
}

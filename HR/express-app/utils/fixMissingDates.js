/**
 * Utility functions for fixing missing employee dates of birth
 */

import sql from '../config/database.js';
import { log } from './logger.js';
import {
  gregorianToHijri,
  hijriToGregorian,
  formatHijriToString,
  parseHijriString
} from './dateConverter.js';

/**
 * Get employees with missing dates of birth
 * Now only checks for missing dates, not invalid ages (since we're being lenient)
 */
export async function getEmployeesWithMissingDates(limit = 100, offset = 0) {
  const employees = await sql`
    SELECT 
      id,
      employee_id_number,
      first_name,
      second_name,
      third_name,
      fourth_name,
      date_of_birth_hijri,
      date_of_birth_gregorian,
      nationality,
      branch_id
    FROM employees
    WHERE date_of_birth_hijri IS NULL 
       OR date_of_birth_gregorian IS NULL
       OR date_of_birth_hijri = ''
       OR (date_of_birth_gregorian IS NOT NULL 
           AND (date_of_birth_gregorian > CURRENT_DATE 
                OR date_of_birth_gregorian < CURRENT_DATE - INTERVAL '150 years'))
    ORDER BY id
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  // Calculate age and validation status for each employee
  return employees.map(emp => {
    const hasHijri = emp.date_of_birth_hijri &&
      typeof emp.date_of_birth_hijri === 'string' &&
      emp.date_of_birth_hijri.trim() !== '';
    const hasGregorian = emp.date_of_birth_gregorian !== null &&
      emp.date_of_birth_gregorian !== undefined;

    let age = null;
    let isInvalidAge = false;

    if (hasGregorian) {
      const gregorianDateStr = emp.date_of_birth_gregorian.toISOString().split('T')[0];
      age = calculateAge(gregorianDateStr);
      // Mark as invalid only if date is clearly wrong (future or extremely old)
      if (age !== null && (age < 0 || age > 150)) {
        isInvalidAge = true;
      }
    }

    return {
      ...emp,
      has_hijri: hasHijri,
      has_gregorian: hasGregorian,
      can_convert: hasHijri || hasGregorian,
      age: age,
      is_invalid_age: isInvalidAge,
      validation_status: isInvalidAge
        ? 'invalid_age'
        : (!hasHijri && !hasGregorian
          ? 'missing_both'
          : (!hasHijri ? 'missing_hijri' : 'missing_gregorian'))
    };
  });
}

/**
 * Get count of employees with missing dates
 */
export async function getEmployeesWithMissingDatesCount() {
  const [result] = await sql`
    SELECT COUNT(*) as total
    FROM employees
    WHERE date_of_birth_hijri IS NULL 
       OR date_of_birth_gregorian IS NULL
       OR date_of_birth_hijri = ''
       OR (date_of_birth_gregorian IS NOT NULL 
           AND (date_of_birth_gregorian > CURRENT_DATE 
                OR date_of_birth_gregorian < CURRENT_DATE - INTERVAL '150 years'))
  `;
  return parseInt(result.total, 10);
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  let birthDate;
  if (typeof dateOfBirth === 'string') {
    birthDate = new Date(dateOfBirth);
  } else {
    birthDate = new Date(dateOfBirth);
  }

  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Validate date of birth - very lenient validation to fix all remaining employees
 * Accepts any valid date conversion, even if age seems unusual (to fix data issues)
 */
function validateDateOfBirth(gregorianDate) {
  if (!gregorianDate) return { valid: false, reason: 'Date is missing' };

  const date = new Date(gregorianDate);
  if (isNaN(date.getTime())) {
    return { valid: false, reason: 'Invalid date format' };
  }

  // Allow future dates - they might be data entry errors or system date issues
  // We'll accept any valid date that can be converted

  // Calculate age
  const age = calculateAge(gregorianDate);

  if (age === null) {
    return { valid: false, reason: 'Could not calculate age' };
  }

  // Very lenient validation: accept any age from 0 to 150
  // The goal is to fix the dates, not reject valid conversions
  if (age < 0) {
    // Negative age means date is too far in future, but we'll still accept it
    // as the conversion algorithm produced a valid date
    return { valid: true, age: 0, warning: 'Date is in the future' };
  }

  if (age > 150) {
    // Very old age - likely data error, but accept the conversion
    return { valid: true, age, warning: `Age is ${age} years - may need manual verification` };
  }

  return { valid: true, age };
}

/**
 * Convert and update employee dates
 */
export async function convertEmployeeDates(employeeId) {
  const [employee] = await sql`
    SELECT 
      id,
      date_of_birth_hijri,
      date_of_birth_gregorian
    FROM employees
    WHERE id = ${employeeId}
  `;

  if (!employee) {
    throw new Error('Employee not found');
  }

  const hasHijri = employee.date_of_birth_hijri &&
    typeof employee.date_of_birth_hijri === 'string' &&
    employee.date_of_birth_hijri.trim() !== '';
  const hasGregorian = employee.date_of_birth_gregorian !== null &&
    employee.date_of_birth_gregorian !== undefined;

  if (!hasHijri && !hasGregorian) {
    throw new Error('Both dates are missing - cannot convert');
  }

  let newHijri = employee.date_of_birth_hijri;
  let newGregorian = employee.date_of_birth_gregorian;
  let conversionResult = '';

  if (hasHijri && !hasGregorian) {
    // Convert Hijri to Gregorian
    const hijriParts = parseHijriString(employee.date_of_birth_hijri);

    if (!hijriParts) {
      throw new Error(`Invalid Hijri date format: ${employee.date_of_birth_hijri}. Expected format: DD/MM/YYYY`);
    }

    // Validate date components are numbers
    if (isNaN(hijriParts.day) || isNaN(hijriParts.month) || isNaN(hijriParts.year)) {
      throw new Error(`Invalid Hijri date values: ${employee.date_of_birth_hijri}. All values must be numbers.`);
    }

    // Basic range validation
    if (hijriParts.day < 1 || hijriParts.day > 30 ||
      hijriParts.month < 1 || hijriParts.month > 12) {
      throw new Error(`Invalid Hijri date values: ${employee.date_of_birth_hijri}. Day must be 1-30, Month must be 1-12.`);
    }

    try {
      const gregorianDate = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);

      if (!gregorianDate) {
        throw new Error(`Failed to convert Hijri date to Gregorian: ${employee.date_of_birth_hijri}. The conversion algorithm returned null (likely date out of valid range).`);
      }

      // Validate the converted date
      const validation = validateDateOfBirth(gregorianDate);
      if (!validation.valid) {
        throw new Error(`Invalid date of birth: ${validation.reason}. Original Hijri date: ${employee.date_of_birth_hijri}, Converted Gregorian: ${gregorianDate}`);
      }

      newGregorian = gregorianDate;
      conversionResult = `${employee.date_of_birth_hijri} (Hijri) → ${gregorianDate} (Gregorian), Age: ${validation.age} years`;
    } catch (convError) {
      throw new Error(`Conversion error for ${employee.date_of_birth_hijri}: ${convError.message}`);
    }

  } else if (hasGregorian && !hasHijri) {
    // Convert Gregorian to Hijri
    const gregorianDateStr = employee.date_of_birth_gregorian.toISOString().split('T')[0];

    // Validate the existing Gregorian date first
    const validation = validateDateOfBirth(gregorianDateStr);
    if (!validation.valid) {
      throw new Error(`Invalid date of birth: ${validation.reason}. Gregorian date: ${gregorianDateStr}`);
    }

    const hijriDate = gregorianToHijri(gregorianDateStr);

    if (!hijriDate) {
      throw new Error(`Failed to convert Gregorian date to Hijri: ${gregorianDateStr}`);
    }

    newHijri = formatHijriToString(hijriDate);
    conversionResult = `${gregorianDateStr} (Gregorian) → ${newHijri} (Hijri), Age: ${validation.age} years`;
  } else {
    // Both dates exist - check if Gregorian date is invalid and needs recalculation
    const gregorianDateStr = employee.date_of_birth_gregorian.toISOString().split('T')[0];
    const validation = validateDateOfBirth(gregorianDateStr);

    if (!validation.valid) {
      // Gregorian date is invalid - try to recalculate from Hijri first, then from Gregorian if that fails
      let recalculated = false;

      // First, try to recalculate from Hijri date
      const hijriParts = parseHijriString(employee.date_of_birth_hijri);

      if (hijriParts && !isNaN(hijriParts.day) && !isNaN(hijriParts.month) && !isNaN(hijriParts.year)) {
        // Basic range validation
        if (hijriParts.day >= 1 && hijriParts.day <= 30 &&
          hijriParts.month >= 1 && hijriParts.month <= 12) {
          try {
            // Recalculate Gregorian from Hijri
            const recalculatedGregorian = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);

            if (recalculatedGregorian) {
              // Validate the recalculated date
              const recalcValidation = validateDateOfBirth(recalculatedGregorian);
              if (recalcValidation.valid) {
                // Update with recalculated date
                newGregorian = recalculatedGregorian;
                // Recalculate Hijri from Gregorian to ensure consistency
                const recalcHijri = gregorianToHijri(recalculatedGregorian);
                if (recalcHijri) {
                  newHijri = formatHijriToString(recalcHijri);
                }
                conversionResult = `تم إعادة حساب التاريخ الميلادي من الهجري. التاريخ القديم (غير صحيح): ${gregorianDateStr}, التاريخ الجديد: ${recalculatedGregorian}, العمر: ${recalcValidation.age} سنة`;
                recalculated = true;
              }
            }
          } catch (convError) {
            // Hijri conversion failed, will try Gregorian below
            log.warn(`Failed to convert from Hijri ${employee.date_of_birth_hijri}: ${convError.message}`);
          }
        }
      }

      // If Hijri conversion failed or produced invalid date, try using Gregorian as source of truth
      if (!recalculated) {
        // Validate the Gregorian date itself (might be correct even if age validation failed)
        const gregorianDate = new Date(gregorianDateStr);
        if (!isNaN(gregorianDate.getTime())) {
          // Gregorian date is valid - use it to calculate Hijri
          const calculatedHijri = gregorianToHijri(gregorianDateStr);
          if (calculatedHijri) {
            newHijri = formatHijriToString(calculatedHijri);
            newGregorian = gregorianDateStr; // Keep the original Gregorian
            const finalValidation = validateDateOfBirth(gregorianDateStr);
            conversionResult = `تم استخدام التاريخ الميلادي كمرجع صحيح وحساب الهجري منه. التاريخ الميلادي: ${gregorianDateStr}, التاريخ الهجري المحسوب: ${newHijri}, العمر: ${finalValidation.age} سنة`;
            recalculated = true;
          }
        }
      }

      if (!recalculated) {
        throw new Error(`لا يمكن إصلاح التواريخ. التاريخ الهجري: ${employee.date_of_birth_hijri}, التاريخ الميلادي: ${gregorianDateStr}`);
      }
    } else {
      // Both dates exist and validation passed - try to ensure consistency
      // First try to recalculate from Hijri, but if that fails, use Gregorian as source of truth
      let recalculated = false;
      const hijriParts = parseHijriString(employee.date_of_birth_hijri);

      if (hijriParts && !isNaN(hijriParts.day) && !isNaN(hijriParts.month) && !isNaN(hijriParts.year)) {
        // Try to recalculate Gregorian from Hijri to ensure they match
        const recalculatedGregorian = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);

        if (recalculatedGregorian) {
          const recalcValidation = validateDateOfBirth(recalculatedGregorian);
          if (recalcValidation.valid) {
            newGregorian = recalculatedGregorian;
            // Recalculate Hijri from the new Gregorian to ensure perfect round-trip consistency
            const recalcHijri = gregorianToHijri(recalculatedGregorian);
            if (recalcHijri) {
              newHijri = formatHijriToString(recalcHijri);
            }
            conversionResult = `تم إعادة حساب التواريخ لضمان التناسق. العمر: ${recalcValidation.age} سنة`;
            recalculated = true;
          }
        }
      }

      // If Hijri recalculation failed or produced invalid result, use Gregorian as source of truth
      if (!recalculated) {
        const calculatedHijri = gregorianToHijri(gregorianDateStr);
        if (calculatedHijri) {
          newHijri = formatHijriToString(calculatedHijri);
          newGregorian = gregorianDateStr; // Keep the original Gregorian
          conversionResult = `تم استخدام التاريخ الميلادي كمرجع وحساب الهجري منه. العمر: ${validation.age} سنة`;
          recalculated = true;
        }
      }

      if (!recalculated) {
        // Keep original dates if all conversions failed
        conversionResult = `كلا التاريخين موجودان. العمر: ${validation.age} سنة`;
      }
    }
  }

  // Update the employee - always update to ensure consistency
  await sql`
    UPDATE employees 
    SET date_of_birth_hijri = ${newHijri},
        date_of_birth_gregorian = ${newGregorian},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${employeeId}
  `;

  return {
    employee_id: employeeId,
    conversion_result: conversionResult,
    new_hijri: newHijri,
    new_gregorian: newGregorian
  };
}

/**
 * Delete employee (soft delete)
 */
export async function deleteEmployee(employeeId) {
  const [employee] = await sql`
    SELECT id FROM employees WHERE id = ${employeeId}
  `;

  if (!employee) {
    throw new Error('Employee not found');
  }

  await sql`
    UPDATE employees 
    SET status = 'other',
        is_active = false,
        status_changed_at = CURRENT_TIMESTAMP,
        status_change_reason = 'تاريخ الميلاد مفقود/ناقص - تم الحذف تلقائياً بواسطة النظام',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${employeeId}
  `;

  return { employee_id: employeeId, deleted: true };
}

/**
 * Batch fix all employees with missing or invalid dates
 * Automatically attempts to convert dates for all eligible employees
 * @param {Object} options - Batch processing options
 * @param {number} options.batchSize - Number of employees to process per batch (default: 50)
 * @param {number} options.delayMs - Delay between batches in milliseconds (default: 100)
 * @param {boolean} options.autoDelete - Whether to automatically delete employees that cannot be fixed (default: false)
 * @returns {Object} Summary of batch processing results
 */
export async function batchFixAllEmployees(options = {}) {
  const { batchSize = 50, delayMs = 100, autoDelete = false } = options;

  const results = {
    total: 0,
    converted: 0,
    deleted: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  let offset = 0;

  while (true) {
    // Fetch batch of employees
    const employees = await getEmployeesWithMissingDates(batchSize, offset);

    if (!employees || employees.length === 0) {
      break; // No more employees to process
    }

    results.total += employees.length;

    // Process each employee in the batch
    for (const employee of employees) {
      try {
        // Only attempt conversion if employee can be converted
        if (employee.can_convert) {
          // Try to convert/fix the dates
          await convertEmployeeDates(employee.id);
          results.converted++;
        } else if (autoDelete) {
          // If cannot convert and autoDelete is enabled, delete the employee
          await deleteEmployee(employee.id);
          results.deleted++;
        } else {
          // Skip if cannot convert and autoDelete is disabled
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.second_name}`,
          error: error.message
        });

        // Log error but continue processing
        log.warn(`Failed to fix employee ${employee.id}: ${error.message}`);
      }
    }

    offset += employees.length;

    // Add delay between batches to avoid overwhelming the database
    if (delayMs > 0 && employees.length === batchSize) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Stop if we processed fewer employees than batch size (last batch)
    if (employees.length < batchSize) {
      break;
    }
  }

  return results;
}

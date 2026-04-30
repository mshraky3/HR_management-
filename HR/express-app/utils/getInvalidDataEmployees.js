/**
 * Get employees with invalid data (not missing, but incorrect/invalid)
 * Invalid data includes:
 * - Invalid dates (future dates, ages out of reasonable range)
 * - Dates that don't match between Hijri and Gregorian
 * - Other validation failures
 */

import sql from '../config/database.js';
import { checkEmployeeDataCompletion } from './employeeDataCompletion.js';

const normalizeOptions = (arg1, arg2) => {
  // Backward compatibility: getEmployeesWithInvalidData(limit, offset)
  if (typeof arg1 === 'number' || arg1 === undefined) {
    return {
      limit: typeof arg1 === 'number' ? arg1 : 100,
      offset: typeof arg2 === 'number' ? arg2 : 0,
      branchIds: undefined,
      termId: undefined,
      academicYear: undefined,
      employeeId: undefined
    };
  }

  return {
    limit: Number.isInteger(arg1.limit) ? arg1.limit : 100,
    offset: Number.isInteger(arg1.offset) ? arg1.offset : 0,
    branchIds: Array.isArray(arg1.branchIds) ? arg1.branchIds : undefined,
    termId: arg1.termId !== undefined && arg1.termId !== null ? parseInt(arg1.termId, 10) : undefined,
    academicYear: arg1.academicYear,
    employeeId: arg1.employeeId !== undefined && arg1.employeeId !== null ? parseInt(arg1.employeeId, 10) : undefined
  };
};

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
 * Get employees with invalid data (not missing, but incorrect)
 */
export async function getEmployeesWithInvalidData(arg1 = 100, arg2 = 0) {
  const options = normalizeOptions(arg1, arg2);
  const {
    limit,
    offset,
    branchIds,
    termId,
    academicYear,
    employeeId
  } = options;

  if (Array.isArray(branchIds) && branchIds.length === 0) {
    return [];
  }

  // Get employees with invalid dates (dates that exist but are wrong)
  // Exclude employees with missing dates - only show those with invalid/wrong dates
  // Only include active employees from active branches
  let query = sql`
    SELECT 
      e.id,
      e.employee_id_number,
      e.first_name,
      e.second_name,
      e.third_name,
      e.fourth_name,
      e.date_of_birth_hijri,
      e.date_of_birth_gregorian,
      e.nationality,
      e.branch_id,
      e.academic_year,
      e.current_term_id,
      e.registration_term_id,
      e.data_completion_status,
      b.branch_name
    FROM employees e
    LEFT JOIN branches b ON e.branch_id = b.id
    WHERE e.date_of_birth_gregorian IS NOT NULL
       AND (e.status IS NULL OR e.status IN ('active', 'pending'))
       AND (b.is_active = true OR b.is_active IS NULL)
       AND (
         -- Invalid date: future date
         e.date_of_birth_gregorian > CURRENT_DATE
         -- Invalid date: too old (more than 150 years)
         OR e.date_of_birth_gregorian < (CURRENT_DATE - INTERVAL '150 years')
       )
  `;

  if (branchIds && branchIds.length > 0) {
    query = sql`${query} AND e.branch_id = ANY(${branchIds})`;
  }

  if (termId && !Number.isNaN(termId)) {
    query = sql`${query} AND (e.current_term_id = ${termId} OR e.registration_term_id = ${termId})`;
  }

  if (academicYear) {
    query = sql`${query} AND e.academic_year = ${academicYear}`;
  }

  if (employeeId && !Number.isNaN(employeeId)) {
    query = sql`${query} AND e.id = ${employeeId}`;
  }

  query = sql`${query}
    ORDER BY e.id
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const employees = await query;

  // Get detailed completion info for each employee and check for other invalid data
  const employeesWithDetails = await Promise.all(
    employees.map(async (emp) => {
      // Get completion details to check for other invalid data
      const completion = await checkEmployeeDataCompletion(emp);

      // Calculate age if date exists
      let age = null;
      let isInvalidAge = false;
      let invalidReasons = [];

      if (emp.date_of_birth_gregorian) {
        const gregorianDateStr = emp.date_of_birth_gregorian.toISOString().split('T')[0];
        age = calculateAge(gregorianDateStr);

        // Check for invalid age
        if (age !== null) {
          if (age < 0) {
            isInvalidAge = true;
            invalidReasons.push('تاريخ الميلاد في المستقبل');
          } else if (age > 150) {
            isInvalidAge = true;
            invalidReasons.push('العمر أكبر من 150 سنة (تاريخ غير معقول)');
          } else if (age < 16) {
            invalidReasons.push('العمر أقل من 16 سنة (غير عادي)');
          }
        } else {
          invalidReasons.push('تاريخ الميلاد غير صحيح');
        }
      }

      // Check if dates don't match (if both exist)
      if (emp.date_of_birth_hijri && emp.date_of_birth_gregorian && !invalidReasons.some(r => r.includes('تاريخ'))) {
        // We could add validation here to check if Hijri matches Gregorian
        // For now, we'll rely on the date validation above
      }

      return {
        ...emp,
        invalid_fields: invalidReasons,
        missing_fields: completion.missingFields || [],
        is_complete: completion.isComplete || false,
        age: age,
        is_invalid_age: isInvalidAge,
        has_invalid_date: isInvalidAge || invalidReasons.length > 0
      };
    })
  );

  // Filter to only return employees that actually have invalid data
  return employeesWithDetails.filter(emp => emp.has_invalid_date);
}

/**
 * Get count of employees with invalid data (not missing, but incorrect)
 */
export async function getEmployeesWithInvalidDataCount(options = {}) {
  const branchIds = Array.isArray(options.branchIds) ? options.branchIds : undefined;
  const termId = options.termId !== undefined && options.termId !== null ? parseInt(options.termId, 10) : undefined;
  const academicYear = options.academicYear;
  const employeeId = options.employeeId !== undefined && options.employeeId !== null ? parseInt(options.employeeId, 10) : undefined;

  if (Array.isArray(branchIds) && branchIds.length === 0) {
    return 0;
  }

  // Count employees with invalid dates (dates that exist but are wrong)
  // Only include active employees from active branches
  let query = sql`
    SELECT COUNT(*) as total
    FROM employees e
    LEFT JOIN branches b ON e.branch_id = b.id
    WHERE e.date_of_birth_gregorian IS NOT NULL
       AND (e.status IS NULL OR e.status IN ('active', 'pending'))
       AND (b.is_active = true OR b.is_active IS NULL)
       AND (
         -- Invalid date: future date
         e.date_of_birth_gregorian > CURRENT_DATE
         -- Invalid date: too old (more than 150 years)
         OR e.date_of_birth_gregorian < (CURRENT_DATE - INTERVAL '150 years')
       )
  `;

  if (branchIds && branchIds.length > 0) {
    query = sql`${query} AND e.branch_id = ANY(${branchIds})`;
  }

  if (termId && !Number.isNaN(termId)) {
    query = sql`${query} AND (e.current_term_id = ${termId} OR e.registration_term_id = ${termId})`;
  }

  if (academicYear) {
    query = sql`${query} AND e.academic_year = ${academicYear}`;
  }

  if (employeeId && !Number.isNaN(employeeId)) {
    query = sql`${query} AND e.id = ${employeeId}`;
  }

  const [result] = await query;
  return parseInt(result.total, 10);
}

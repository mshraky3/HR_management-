/**
 * Server-side input rules for employee create / update.
 *
 * Production data contains legacy values that do not meet these rules (passport-style ids,
 * Arabic-Indic digits, 11-digit ids...), so on UPDATE a rule is only enforced for a field the
 * request actually changes: an employee can still be edited without first "fixing" every old
 * value, but a new bad value cannot be introduced.
 */

import { isValidEmail } from './validators.js';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Arabic-Indic / Eastern-Arabic digits -> ASCII digits. */
export function toAsciiDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    return String(a !== -1 ? a : EASTERN_ARABIC_INDIC.indexOf(ch));
  });
}

const NULLABLE_TEXT_FIELDS = [
  'occupation', 'religion', 'marital_status', 'educational_qualification', 'specialization',
  'bank_name', 'email', 'phone_number', 'national_address', 'contract_type', 'job_title',
  'employee_id_number', 'passport_number', 'passport_issue_place', 'gender', 'id_type',
  'graduation_year', 'university_gpa',
  'date_of_birth_hijri', 'date_of_birth_gregorian', 'id_expiry_date_hijri', 'id_expiry_date_gregorian',
  'contract_start_date_hijri', 'contract_start_date_gregorian', 'contract_end_date_hijri', 'contract_end_date_gregorian',
  'passport_issue_date', 'passport_expiry_date', 'residency_issue_date', 'bank_iban',
];

/**
 * Normalises the values in place: trims strings, converts digits for id / phone / IBAN,
 * upper-cases and de-spaces the IBAN, and turns '' into null for optional fields so a cleared
 * field is stored as empty instead of being ignored or kept.
 */
export function normalizeEmployeeInput(body) {
  for (const key of Object.keys(body)) {
    if (typeof body[key] === 'string') body[key] = body[key].trim();
  }
  if (typeof body.id_or_residency_number === 'string') {
    body.id_or_residency_number = toAsciiDigits(body.id_or_residency_number).replace(/\s+/g, '');
  }
  if (typeof body.phone_number === 'string' && body.phone_number) {
    body.phone_number = toAsciiDigits(body.phone_number).replace(/[\s\-()]/g, '');
  }
  if (typeof body.bank_iban === 'string' && body.bank_iban) {
    body.bank_iban = toAsciiDigits(body.bank_iban).replace(/\s+/g, '').toUpperCase();
  }
  for (const field of NULLABLE_TEXT_FIELDS) {
    if (body[field] === '') body[field] = null;
  }
  return body;
}

const RULES = {
  id_or_residency_number: {
    test: (v) => /^\d{10}$/.test(v),
    message: 'رقم الهوية/الإقامة يجب أن يكون 10 أرقام',
  },
  bank_iban: {
    test: (v) => /^SA\d{22}$/.test(v),
    message: 'رقم الآيبان يجب أن يبدأ بـ SA ويتكون من 24 خانة',
  },
  phone_number: {
    test: (v) => /^05\d{8}$/.test(v),
    message: 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام',
  },
  national_address: {
    test: (v) => v.length <= 8,
    message: 'العنوان الوطني المختصر يجب ألا يزيد عن 8 خانات (مثل ABCD1234)',
  },
  email: {
    test: (v) => isValidEmail(v) && v.length <= 255,
    message: 'صيغة البريد الإلكتروني غير صحيحة',
  },
};

/**
 * @param {object} body    request body (already normalised)
 * @param {object} [existing]  current employee row on update; unchanged fields are not re-checked
 * @returns {string[]} Arabic error messages (empty when valid)
 */
export function validateEmployeeFields(body, existing = null) {
  const errors = [];
  for (const [field, rule] of Object.entries(RULES)) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    if (existing && String(existing[field] ?? '') === String(value)) continue;
    if (!rule.test(String(value))) errors.push(rule.message);
  }

  const start = body.contract_start_date_gregorian;
  const end = body.contract_end_date_gregorian;
  if (start && end && String(end).slice(0, 10) < String(start).slice(0, 10)) {
    errors.push('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية');
  }
  return errors;
}

/** Express middleware factory. On update it needs req.employee (middleware/employeeAccess.js). */
export const employeeInputGuard = ({ isUpdate }) => (req, res, next) => {
  normalizeEmployeeInput(req.body);
  const errors = validateEmployeeFields(req.body, isUpdate ? req.employee : null);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  next();
};

/** Names must be present when provided; on update each name may be omitted. */
export const validateEmployeeNamesPartial = (req, res, next) => {
  for (const key of ['first_name', 'second_name', 'third_name', 'fourth_name']) {
    if (key in req.body && !String(req.body[key] ?? '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن ترك أي من الأسماء الأربعة فارغاً',
      });
    }
  }
  next();
};

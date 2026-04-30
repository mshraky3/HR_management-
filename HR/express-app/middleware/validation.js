/**
 * Input Validation Middleware
 * Validates request data before processing
 */

/**
 * Validate required fields in request body
 * @param {string[]} requiredFields - Array of required field names
 */
// Field labels in Arabic for better error messages
const FIELD_LABELS = {
  'first_name': 'الاسم الأول',
  'second_name': 'الاسم الثاني',
  'third_name': 'الاسم الثالث',
  'fourth_name': 'الاسم الرابع',
  'id_or_residency_number': 'رقم الهوية/الإقامة',
  'job_title': 'المسمى الوظيفي',
  'phone_number': 'رقم الهاتف',
  'email': 'البريد الإلكتروني',
  'gender': 'الجنس',
  'bank_iban': 'الآيبان',
  'bank_name': 'اسم البنك',
  'national_address': 'العنوان الوطني',
  'nationality': 'الجنسية'
};

export const validateRequired = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      const missingFieldLabels = missingFields.map(field => FIELD_LABELS[field] || field);
      return res.status(400).json({
        success: false,
        message: `الحقول المطلوبة التالية مفقودة: ${missingFieldLabels.join('، ')}`,
        missingFields: missingFields,
        missingFieldLabels: missingFieldLabels
      });
    }

    next();
  };
};

/**
 * Validate email format
 */
export const validateEmail = (req, res, next) => {
  if (req.body.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'صيغة البريد الإلكتروني غير صحيحة. مثال: example@domain.com'
      });
    }
  }
  next();
};

/**
 * Validate employee name (must have 4 names)
 */
export const validateEmployeeName = (req, res, next) => {
  const { first_name, second_name, third_name, fourth_name } = req.body;

  if (!first_name || !second_name || !third_name || !fourth_name) {
    return res.status(400).json({
      success: false,
      message: 'يجب أن يحتوي الموظف على 4 أسماء بالضبط: الاسم الأول، الاسم الثاني، الاسم الثالث، الاسم الرابع'
    });
  }

  next();
};

/**
 * Validate date format
 * For Hijri dates, accepts dd/mm/yyyy format (stored as VARCHAR text)
 * For Gregorian dates, validates YYYY-MM-DD format
 */
export const validateDate = (fieldName) => {
  return (req, res, next) => {
    const dateValue = req.body[fieldName];

    // Skip validation if value is null, undefined, or empty string (optional fields)
    if (!dateValue || dateValue === null || dateValue === undefined || dateValue === '') {
      return next();
    }

    // Check if it's a Hijri date field - use explicit check
    const fieldNameLower = fieldName.toLowerCase();
    const isHijriField = fieldNameLower.includes('hijri');

    if (isHijriField) {
      // For Hijri dates, accept dd/mm/yyyy format (stored as VARCHAR text)
      // Accept any non-empty string - validation happens at database level
      if (typeof dateValue !== 'string') {
        const fieldLabel = fieldName.includes('birth') ? 'تاريخ الميلاد' : 'تاريخ انتهاء الهوية';
        return res.status(400).json({
          success: false,
          message: `صيغة التاريخ الهجري غير صحيحة لحقل ${fieldLabel}. يجب أن يكون التاريخ نصاً.`
        });
      }

      if (dateValue.trim() === '') {
        const fieldLabel = fieldName.includes('birth') ? 'تاريخ الميلاد' : 'تاريخ انتهاء الهوية';
        return res.status(400).json({
          success: false,
          message: `حقل ${fieldLabel} (هجري) لا يمكن أن يكون فارغاً.`
        });
      }

      // Hijri dates are stored as VARCHAR text, so we accept any non-empty string
      // The format dd/mm/yyyy is handled by the frontend component
      // No further validation needed - just ensure it's a non-empty string
      return next();
    } else {
      // For Gregorian dates, validate YYYY-MM-DD format
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        const fieldLabel = fieldName.includes('birth') ? 'تاريخ الميلاد' : 'تاريخ انتهاء الهوية';
        return res.status(400).json({
          success: false,
          message: `صيغة التاريخ الميلادي غير صحيحة لحقل ${fieldLabel}. يجب أن يكون التاريخ بالصيغة: YYYY-MM-DD (مثال: 2024-01-15)`
        });
      }
    }

    next();
  };
};

/**
 * Validate enum values
 */
export const validateEnum = (fieldName, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[fieldName];

    if (value && !allowedValues.includes(value)) {
      return res.status(400).json({
        success: false,
        message: `القيمة المدخلة لحقل ${fieldName} غير صحيحة. القيم المسموحة: ${allowedValues.join(', ')}`
      });
    }

    next();
  };
};


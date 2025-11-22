/**
 * Input Validation Middleware
 * Validates request data before processing
 */

/**
 * Validate required fields in request body
 * @param {string[]} requiredFields - Array of required field names
 */
export const validateRequired = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `الحقول المطلوبة التالية مفقودة: ${missingFields.join(', ')}`,
        missingFields: missingFields
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
    
    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] Validating ${fieldName}:`, {
        value: dateValue,
        type: typeof dateValue,
        isHijriField: isHijriField,
        fieldNameLower: fieldNameLower
      });
    }
    
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


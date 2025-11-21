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
        message: 'Missing required fields',
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
        message: 'Invalid email format'
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
      message: 'Employee must have exactly 4 names: first_name, second_name, third_name, fourth_name'
    });
  }

  next();
};

/**
 * Validate date format
 */
export const validateDate = (fieldName) => {
  return (req, res, next) => {
    const dateValue = req.body[fieldName];
    
    if (dateValue) {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          message: `Invalid date format for ${fieldName}. Use YYYY-MM-DD format.`
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
        message: `Invalid value for ${fieldName}. Allowed values: ${allowedValues.join(', ')}`
      });
    }
    
    next();
  };
};


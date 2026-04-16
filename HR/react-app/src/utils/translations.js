/**
 * Translation utility for converting English database values to Arabic
 */

export const translateValue = (field, value) => {
  if (!value || value === '-') return value;

  const translations = {
    gender: {
      'male': 'ذكر',
      'female': 'أنثى',
      'ذكر': 'ذكر',
      'أنثى': 'أنثى'
    },
    id_type: {
      'citizen': 'مواطن',
      'resident': 'مقيم',
      'مواطن': 'مواطن',
      'مقيم': 'مقيم'
    },
    marital_status: {
      'single': 'أعزب',
      'married': 'متزوج',
      'divorced': 'مطلق',
      'widowed': 'أرمل',
      'أعزب': 'أعزب',
      'متزوج': 'متزوج',
      'مطلق': 'مطلق',
      'أرمل': 'أرمل'
    },
    religion: {
      'islam': 'إسلام',
      'christianity': 'مسيحية',
      'judaism': 'يهودية',
      'other': 'أخرى',
      'إسلام': 'إسلام',
      'مسيحية': 'مسيحية',
      'يهودية': 'يهودية',
      'أخرى': 'أخرى'
    },
    status: {
      'active': 'نشط',
      'pending': 'قيد الانتظار',
      'archived': 'مؤرشف',
      'inactive': 'غير نشط',
      'نشط': 'نشط',
      'قيد الانتظار': 'قيد الانتظار',
      'مؤرشف': 'مؤرشف',
      'غير نشط': 'غير نشط'
    },
    data_completion_status: {
      'complete': 'مكتمل',
      'incomplete': 'غير مكتمل',
      'مكتمل': 'مكتمل',
      'غير مكتمل': 'غير مكتمل'
    }
  };

  // Normalize the value to lowercase for case-insensitive matching
  const normalizedValue = String(value).toLowerCase().trim();
  
  // Check if field has translations
  if (translations[field]) {
    // Try direct match first (case-sensitive)
    if (translations[field][value]) {
      return translations[field][value];
    }
    // Try case-insensitive match
    if (translations[field][normalizedValue]) {
      return translations[field][normalizedValue];
    }
  }

  // Return original value if no translation found
  return value;
};

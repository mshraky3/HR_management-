/**
 * Employee Constants
 * Centralized constants for employee-related values
 * This file ensures consistency across the application
 */

// ============================================================================
// JOB TITLES
// ============================================================================

/**
 * School job titles
 */
export const SCHOOL_JOB_TITLES = [
  'مدير',
  'وكيل',
  'معلم صفوف اولية',
  'معلم انجليزي',
  'معلم عربي',
  'معلم علوم',
  'معلم فيزياء',
  'معلم كيمياء',
  'معلم احياء',
  'معلم حساب آلي',
  'معلم اجتماعيات',
  'معلم تاريخ',
  'معلم جغرافيا',
  'معلم اسلاميات',
  'معلم رياضيات',
  'معلم اسرية',
  'معلم بدنية',
  'معلم فنية',
  'معلم رياض اطفال',
  'حارس',
  'سائق',
  'مساعد اداري',
  'عامل نظافة',
  'مرافق باص',
  'مرشد طلابي',
  'معلم لغة صينية',
  'معلم حساب ذهني'
];

/**
 * Healthcare center job titles
 */
export const HEALTHCARE_JOB_TITLES = [
  'مديرة مراكز',
  'الموارد البشرية',
  'حارس امن',
  'سائق',
  'مرافق سائق',
  'تمريض',
  'علاج طبيعي',
  'علاج وظيفي',
  'النطق و التخاطب',
  'اخصائي نفسي',
  'اخصائي اجتماعي',
  'مشرف فني عام',
  'مراقب اجتماعي',
  'الرعاية الشخصية',
  'معلم صف تربية خاصة',
  'معلم صف توحد'
];

/**
 * Get all job titles for a branch type
 * @param {string} branchType - Branch type ('school' or 'healthcare_center')
 * @returns {Array<string>} - Array of job titles
 */
export const getJobTitlesByBranchType = (branchType) => {
  if (branchType === 'school') {
    return SCHOOL_JOB_TITLES;
  } else if (branchType === 'healthcare_center') {
    return HEALTHCARE_JOB_TITLES;
  }
  return [];
};

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Common document types (available for all employees)
 */
export const COMMON_DOCUMENT_TYPES = [
  'id_or_residency',
  'direct_letter',
  'bank_iban',
  'primary_qualification',
  'employment_contract',
  'additional_courses',
  'medical_disclosure_form'
];

/**
 * School-specific document types
 */
export const SCHOOL_DOCUMENT_TYPES = [
  'professional_license',
  'experience_certificate'
];

/**
 * Healthcare center-specific document types
 */
export const HEALTHCARE_DOCUMENT_TYPES = [
  'classification',
  'speech_therapy_course',
  'speech_therapy_70_hours_course',
  'physical_therapy_course',
  'therapy_40_hours_course',
  'experience_certificate'
];

/**
 * Nationality-specific document types
 */
export const NON_SAUDI_DOCUMENT_TYPES = [
  'passport'
];

/**
 * Get all document types for an employee
 * @param {Object} employee - Employee object with nationality, job_title, branch_type
 * @returns {Array<string>} - Array of available document types
 */
export const getAvailableDocumentTypes = (employee) => {
  const { nationality, job_title, branch_type } = employee;
  const available = [...COMMON_DOCUMENT_TYPES];
  
  // Add nationality-specific documents
  if (nationality && !nationality.toLowerCase().includes('saudi') && !nationality.includes('سعودي')) {
    available.push(...NON_SAUDI_DOCUMENT_TYPES);
  }
  
  // Add branch-specific documents
  if (branch_type === 'school') {
    available.push(...SCHOOL_DOCUMENT_TYPES);
  } else if (branch_type === 'healthcare_center') {
    available.push(...HEALTHCARE_DOCUMENT_TYPES);
  }
  
  return [...new Set(available)]; // Remove duplicates
};

// ============================================================================
// DOCUMENT TYPE LABELS
// ============================================================================

/**
 * Document type labels in Arabic
 */
export const DOCUMENT_TYPE_LABELS = {
  'id_or_residency': 'الهوية/الإقامة',
  'direct_letter': 'خطاب مباشرة',
  'bank_iban': 'مستند الآيبان',
  'primary_qualification': 'المؤهل الأساسي',
  'employment_contract': 'عقد العمل',
  'additional_courses': 'الدورات الإضافية',
  'passport': 'جواز السفر',
  'professional_license': 'الترخيص المهني',
  'experience_certificate': 'شهادة الخبرة',
  'classification': 'شهادة التصنيف',
  'speech_therapy_course': 'دورة علاج النطق',
  'speech_therapy_70_hours_course': 'دورة 70 ساعة في التخاطب',
  'physical_therapy_course': 'دورة العلاج الطبيعي',
  'therapy_40_hours_course': 'دورة 40 ساعة',
  'medical_disclosure_form': 'نموذج افصاح طبي'
};

/**
 * Get document type label
 * @param {string} documentType - Document type
 * @returns {string} - Arabic label
 */
export const getDocumentTypeLabel = (documentType) => {
  return DOCUMENT_TYPE_LABELS[documentType] || documentType;
};

// ============================================================================
// BRANCH DOCUMENT TYPES
// ============================================================================

/**
 * Branch document type labels
 */
export const BRANCH_DOCUMENT_TYPE_LABELS = {
  'license': 'الترخيص',
  'permit': 'التصريح',
  'payroll_file': 'ملف مسيرات الرواتب',
  'attendance_file': 'ملف الحضور و الانصراف',
  'insurance': 'التأمين',
  'contract': 'العقد',
  'certification': 'الشهادة',
  'registration': 'السجل التجاري',
  'iban_file': 'ملف الآيبان',
  'security_contract': 'عقد الامن و السالامة',
  'civil_defense_certificate': 'شهادة الدفاع المدني',
  'municipality_certificate': 'شهادة بلدي',
  'insurance_certificate': 'شهادة التامينات',
  'operational_plan': 'الخطة التشغلية للمركز',
  'decision_obligation': 'قرار و الزام',
  'decision_commitment': 'قرار و تعهد',
  'staff_cadre': 'الكادر',
  'owner_civil_id_copy': 'نسخه من هوية الاحوال الشخصية لمالك المركز',
  'disclosure_commitment': 'افصاح و تعهد',
  'certification_commitment_form': 'نموذج تصديق و تعقد',
  'financial_platform_declaration': 'ملف اقرار المنصة المالية',
  'financial_claim_form': 'نموذج مطالبة مالية',
  'student_cadre_file': 'ملف الكادر الطلابي',
  'dropped_students': 'الطلاب المنقطعين',
  'free_seats': 'المقاعد المجانية',
  'acceptance_notifications': 'ملف اشعارات القبول',
  'other': 'أخرى'
};

/**
 * Get branch document type label
 * @param {string} documentType - Branch document type
 * @returns {string} - Arabic label
 */
export const getBranchDocumentTypeLabel = (documentType) => {
  return BRANCH_DOCUMENT_TYPE_LABELS[documentType] || documentType;
};

// ============================================================================
// NATIONALITY VALUES
// ============================================================================

/**
 * Common Saudi nationality variations
 */
export const SAUDI_NATIONALITY_VARIATIONS = [
  'Saudi Arabia',
  'المملكة العربية السعودية',
  'Saudi',
  'سعودي',
  'السعودية',
  'المملكة'
];

// ============================================================================
// ID TYPES
// ============================================================================

export const ID_TYPES = {
  CITIZEN: 'citizen',
  RESIDENT: 'resident'
};

// ============================================================================
// GENDER VALUES
// ============================================================================

export const GENDERS = {
  MALE: 'male',
  FEMALE: 'female'
};

// ============================================================================
// BRANCH TYPES
// ============================================================================

export const BRANCH_TYPES = {
  SCHOOL: 'school',
  HEALTHCARE_CENTER: 'healthcare_center'
};

// ============================================================================
// DATA COMPLETION STATUS
// ============================================================================

export const DATA_COMPLETION_STATUS = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete'
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  // Job Titles
  SCHOOL_JOB_TITLES,
  HEALTHCARE_JOB_TITLES,
  getJobTitlesByBranchType,
  
  // Document Types
  COMMON_DOCUMENT_TYPES,
  SCHOOL_DOCUMENT_TYPES,
  HEALTHCARE_DOCUMENT_TYPES,
  NON_SAUDI_DOCUMENT_TYPES,
  getAvailableDocumentTypes,
  
  // Labels
  DOCUMENT_TYPE_LABELS,
  getDocumentTypeLabel,
  BRANCH_DOCUMENT_TYPE_LABELS,
  getBranchDocumentTypeLabel,
  
  // Other Constants
  SAUDI_NATIONALITY_VARIATIONS,
  ID_TYPES,
  GENDERS,
  BRANCH_TYPES,
  DATA_COMPLETION_STATUS
};


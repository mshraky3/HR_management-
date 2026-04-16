/**
 * Employee Rules Configuration
 * Centralized rule-based system for employee validations and requirements
 * 
 * This file contains ALL business rules in a declarative format.
 * To add new rules, simply add entries to the appropriate rule objects.
 * The code will automatically handle all special cases.
 */

// ============================================================================
// RULE CONFIGURATION
// ============================================================================

/**
 * Nationality Rules
 * Define which nationalities are considered Saudi vs Non-Saudi
 */
export const NATIONALITY_RULES = {
  saudi: {
    variations: [
      'saudi arabia',
      'المملكة العربية السعودية',
      'saudi',
      'سعودي',
      'السعودية',
      'المملكة'
    ],
    // Requirements for Saudi employees
    requirements: {
      idType: 'citizen',
      dateOfBirthCalendar: 'hijri',
      idExpiryCalendar: null, // IDs don't expire for Saudis
      requiresPassport: false,
      requiresIdExpiryDate: false
    }
  },
  nonSaudi: {
    // Requirements for Non-Saudi employees
    requirements: {
      idType: 'resident',
      dateOfBirthCalendar: 'gregorian',
      idExpiryCalendar: 'gregorian',
      requiresPassport: true,
      requiresIdExpiryDate: true
    }
  }
};

/**
 * Branch Type Rules
 * Define rules for different branch types
 */
export const BRANCH_TYPE_RULES = {
  school: {
    label: 'مدرسة',
    // Required documents for schools
    requiredDocuments: [
      'license',
      'registration',
      'civil_defense_certificate',
      'municipality_certificate',
      'insurance_statement',
      'rental_contract'
    ],
    // Documents that are NOT required for schools
    excludedDocuments: [
      'permit',
      'security_contract',
      'certification'
    ],
    // Employee document requirements
    employeeDocumentRequirements: {
      professionalLicense: true
    }
  },
  healthcare_center: {
    label: 'مركز رعاية نهارية',
    // Required documents for healthcare centers
    requiredDocuments: [
      'license',
      'registration',
      'civil_defense_certificate',
      'municipality_certificate',
      'insurance_statement',
      'rental_contract',
      'operational_plan',
      'owner_civil_id_copy',
      'student_cadre_file'
    ],
    // Documents that are NOT required for healthcare centers
    excludedDocuments: [
      'certification'
    ],
    // Employee document requirements
    employeeDocumentRequirements: {
      professionalLicense: false
    }
  }
};

/**
 * Job Title Rules
 * Define document requirements for each job title
 * 
 * IMPORTANT: All job title checks must use these rules, NOT text comparisons
 */
export const JOB_TITLE_RULES = {
  // Classification required jobs (healthcare center only)
  classification: {
    jobTitles: [
      'علاج طبيعي',
      'علاج وظيفي',
      'اخصائي نفسي',
      'تمريض'
    ],
    requiredDocument: 'classification',
    branchType: 'healthcare_center'
  },

  // Experience certificate required jobs (varies by branch type)
  experienceCertificate: {
    school: {
      jobTitles: [
        'مدير',
        'وكيل'
      ],
      requiredDocument: 'experience_certificate'
    },
    healthcare_center: {
      jobTitles: [
        'مديرة مراكز',
        'مشرف فني عام'
      ],
      requiredDocument: 'experience_certificate'
    }
  },

  // Speech therapy 70-hour course
  speechTherapy70Hours: {
    jobTitles: [
      'النطق و التخاطب'
    ],
    requiredDocument: 'speech_therapy_70_hours_course',
    branchType: 'healthcare_center'
  },

  // Therapy 40-hour course
  therapy40Hours: {
    jobTitles: [
      'علاج طبيعي',
      'علاج وظيفي'
    ],
    requiredDocument: 'therapy_40_hours_course',
    branchType: 'healthcare_center'
  }
};

/**
 * Document Type Rules
 * Define which documents are available for which conditions
 */
export const DOCUMENT_TYPE_RULES = {
  // Common documents (available for all)
  common: [
    'id_or_residency',
    'direct_letter',
    'bank_iban',
    'primary_qualification',
    'employment_contract',
    'additional_courses',
    'medical_disclosure_form',
    'medical_insurance'
  ],

  // Nationality-based documents
  nationality: {
    nonSaudi: ['passport']
  },

  // Branch-based documents
  branch: {
    school: ['professional_license', 'experience_certificate'],
    healthcare_center: [
      'classification',
      'speech_therapy_70_hours_course',
      'speech_therapy_course',
      'physical_therapy_course',
      'therapy_40_hours_course',
      'experience_certificate'
    ]
  },

  // Job title-based documents (handled via JOB_TITLE_RULES)
  jobTitle: {
    // This is handled dynamically based on JOB_TITLE_RULES
  }
};

/**
 * Monthly Branch Documents
 * Documents that must be uploaded monthly
 * NOTE: 'payroll_file' is NOT included here because it's handled by the payroll absence system
 * which has its own dedicated task (calculatePayrollAbsenceTask) that opens when entry period starts
 */
export const MONTHLY_BRANCH_DOCUMENTS = [
  // Empty array - payroll is handled separately via payroll absence system
];

// ============================================================================
// RULE PROCESSORS
// ============================================================================

/**
 * Check if nationality matches Saudi rules
 */
export const isSaudiNationality = (nationality) => {
  if (!nationality) return false;

  const normalized = nationality.toLowerCase().trim();
  return NATIONALITY_RULES.saudi.variations.some(variation =>
    normalized.includes(variation.toLowerCase())
  );
};

/**
 * Get nationality requirements
 */
export const getNationalityRequirements = (nationality) => {
  if (isSaudiNationality(nationality)) {
    return NATIONALITY_RULES.saudi.requirements;
  }
  return NATIONALITY_RULES.nonSaudi.requirements;
};

/**
 * Get branch type rules
 */
export const getBranchTypeRules = (branchType) => {
  return BRANCH_TYPE_RULES[branchType] || null;
};

/**
 * Check if job title matches a rule
 * @param {string} jobTitle - Job title to check
 * @param {string} ruleKey - Rule key (e.g., 'classification', 'experienceCertificate')
 * @param {string} branchType - Branch type (optional, for branch-specific rules)
 * @returns {boolean} - True if job title matches the rule
 */
export const jobTitleMatchesRule = (jobTitle, ruleKey, branchType = null) => {
  if (!jobTitle) return false;

  const normalizedTitle = jobTitle.trim();
  const rule = JOB_TITLE_RULES[ruleKey];

  if (!rule) return false;

  // Handle branch-specific rules
  if (rule.branchType && branchType !== rule.branchType) {
    return false;
  }

  // Handle nested branch-specific rules (like experienceCertificate)
  if (rule[branchType]) {
    return rule[branchType].jobTitles.includes(normalizedTitle);
  }

  // Handle simple rules with jobTitles array
  if (rule.jobTitles) {
    return rule.jobTitles.includes(normalizedTitle);
  }

  return false;
};

/**
 * Get required document for a job title based on rules
 * @param {string} jobTitle - Job title
 * @param {string} branchType - Branch type
 * @returns {Array<string>} - Array of required document types
 */
export const getRequiredDocumentsForJobTitle = (jobTitle, branchType) => {
  if (!jobTitle) return [];

  const required = [];

  // Check all job title rules
  Object.keys(JOB_TITLE_RULES).forEach(ruleKey => {
    const rule = JOB_TITLE_RULES[ruleKey];

    // Handle nested branch-specific rules
    if (rule[branchType]) {
      if (rule[branchType].jobTitles.includes(jobTitle.trim())) {
        required.push(rule[branchType].requiredDocument);
      }
    } else if (rule.jobTitles) {
      // Check if branch type matches (if specified)
      if (!rule.branchType || rule.branchType === branchType) {
        if (rule.jobTitles.includes(jobTitle.trim())) {
          required.push(rule.requiredDocument);
        }
      }
    }
  });

  return required;
};

/**
 * Get all required documents for an employee
 * Combines nationality, branch, and job title requirements
 */
export const getAllRequiredDocuments = (employee) => {
  const { nationality, job_title, branch_type } = employee;
  const required = [];

  // Nationality-based requirements
  const nationalityReqs = getNationalityRequirements(nationality);
  if (nationalityReqs.requiresPassport) {
    required.push('passport');
  }

  // Branch-based requirements
  const branchRules = getBranchTypeRules(branch_type);
  if (branchRules?.employeeDocumentRequirements?.professionalLicense) {
    required.push('professional_license');
  }

  // Job title-based requirements
  const jobTitleDocs = getRequiredDocumentsForJobTitle(job_title, branch_type);
  required.push(...jobTitleDocs);

  return [...new Set(required)]; // Remove duplicates
};

/**
 * Get available document types for an employee
 */
export const getAvailableDocumentTypes = (employee) => {
  const { nationality, branch_type } = employee;
  const available = [...DOCUMENT_TYPE_RULES.common];

  // Add nationality-based documents
  if (!isSaudiNationality(nationality)) {
    available.push(...DOCUMENT_TYPE_RULES.nationality.nonSaudi);
  }

  // Add branch-based documents
  if (branch_type && DOCUMENT_TYPE_RULES.branch[branch_type]) {
    available.push(...DOCUMENT_TYPE_RULES.branch[branch_type]);
  }

  return [...new Set(available)]; // Remove duplicates
};

/**
 * Get required branch documents for a branch type
 */
export const getRequiredBranchDocuments = (branchType) => {
  const branchRules = getBranchTypeRules(branchType);
  if (!branchRules) return [];

  return [...new Set(branchRules.requiredDocuments || [])];
};

/**
 * Validate if a document type is allowed for an employee
 */
export const validateDocumentType = (documentType, employee) => {
  const { nationality, job_title, branch_type } = employee;

  // Check nationality requirements
  const nationalityReqs = getNationalityRequirements(nationality);
  if (documentType === 'passport' || documentType === 'passport_copy') {
    if (!nationalityReqs.requiresPassport) {
      return {
        allowed: false,
        reason: 'جواز السفر مطلوب فقط للموظفين غير السعوديين'
      };
    }
  }

  // Check branch requirements
  const branchRules = getBranchTypeRules(branch_type);
  if (documentType === 'professional_license') {
    if (!branchRules?.employeeDocumentRequirements?.professionalLicense) {
      return {
        allowed: false,
        reason: 'الترخيص المهني مطلوب فقط لموظفي المدارس'
      };
    }
  }

  // Check job title requirements
  const requiredDocs = getRequiredDocumentsForJobTitle(job_title, branch_type);
  if (requiredDocs.includes(documentType)) {
    return { allowed: true };
  }

  // Check if document is excluded for this branch type
  if (branchRules?.excludedDocuments?.includes(documentType)) {
    return {
      allowed: false,
      reason: `هذا المستند غير مطلوب لفرع من نوع ${branchRules.label}`
    };
  }

  // Check if document is available for this employee
  const availableDocs = getAvailableDocumentTypes(employee);
  if (!availableDocs.includes(documentType)) {
    // For job-specific documents, check if it's required
    const allRequired = getAllRequiredDocuments(employee);
    if (!allRequired.includes(documentType)) {
      return {
        allowed: false,
        reason: 'هذا المستند غير متاح لهذا الموظف'
      };
    }
  }

  return { allowed: true };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Rules
  NATIONALITY_RULES,
  BRANCH_TYPE_RULES,
  JOB_TITLE_RULES,
  DOCUMENT_TYPE_RULES,
  MONTHLY_BRANCH_DOCUMENTS,

  // Processors
  isSaudiNationality,
  getNationalityRequirements,
  getBranchTypeRules,
  jobTitleMatchesRule,
  getRequiredDocumentsForJobTitle,
  getAllRequiredDocuments,
  getAvailableDocumentTypes,
  getRequiredBranchDocuments,
  validateDocumentType
};


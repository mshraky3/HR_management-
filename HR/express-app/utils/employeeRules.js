/**
 * Employee Rules Configuration (Backend)
 * Centralized rule-based system for employee validations and requirements
 * 
 * This file mirrors the frontend employeeRules.js
 * All business rules are defined here in a declarative format
 */

// Import from frontend rules (if available) or define here
// For now, we'll define it here to keep backend independent

// ============================================================================
// RULE CONFIGURATION
// ============================================================================

/**
 * Nationality Rules
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
    requirements: {
      idType: 'citizen',
      dateOfBirthCalendar: 'hijri',
      idExpiryCalendar: null,
      requiresPassport: false,
      requiresIdExpiryDate: false
    }
  },
  nonSaudi: {
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
 */
export const BRANCH_TYPE_RULES = {
  school: {
    label: 'مدرسة',
    employeeDocumentRequirements: {
      professionalLicense: true
    }
  },
  healthcare_center: {
    label: 'مركز رعاية نهارية',
    employeeDocumentRequirements: {
      professionalLicense: false
    }
  }
};

/**
 * Job Title Rules
 * IMPORTANT: All job title checks must use these rules, NOT text comparisons
 */
export const JOB_TITLE_RULES = {
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
  speechTherapy70Hours: {
    jobTitles: [
      'النطق و التخاطب'
    ],
    requiredDocument: 'speech_therapy_70_hours_course',
    branchType: 'healthcare_center'
  },
  therapy40Hours: {
    jobTitles: [
      'علاج طبيعي',
      'علاج وظيفي'
    ],
    requiredDocument: 'therapy_40_hours_course',
    branchType: 'healthcare_center'
  }
};

// ============================================================================
// RULE PROCESSORS
// ============================================================================

export const isSaudiNationality = (nationality) => {
  if (!nationality) return false;
  const normalized = nationality.toLowerCase().trim();
  return NATIONALITY_RULES.saudi.variations.some(variation =>
    normalized.includes(variation.toLowerCase())
  );
};

export const getNationalityRequirements = (nationality) => {
  if (isSaudiNationality(nationality)) {
    return NATIONALITY_RULES.saudi.requirements;
  }
  return NATIONALITY_RULES.nonSaudi.requirements;
};

export const getBranchTypeRules = (branchType) => {
  return BRANCH_TYPE_RULES[branchType] || null;
};

export const jobTitleMatchesRule = (jobTitle, ruleKey, branchType = null) => {
  if (!jobTitle) return false;
  
  const normalizedTitle = jobTitle.trim();
  const rule = JOB_TITLE_RULES[ruleKey];
  
  if (!rule) return false;
  
  if (rule.branchType && branchType !== rule.branchType) {
    return false;
  }
  
  if (rule[branchType]) {
    return rule[branchType].jobTitles.includes(normalizedTitle);
  }
  
  if (rule.jobTitles) {
    return rule.jobTitles.includes(normalizedTitle);
  }
  
  return false;
};

export const getRequiredDocumentsForJobTitle = (jobTitle, branchType) => {
  if (!jobTitle) return [];
  
  const required = [];
  
  Object.keys(JOB_TITLE_RULES).forEach(ruleKey => {
    const rule = JOB_TITLE_RULES[ruleKey];
    
    if (rule[branchType]) {
      if (rule[branchType].jobTitles.includes(jobTitle.trim())) {
        required.push(rule[branchType].requiredDocument);
      }
    } else if (rule.jobTitles) {
      if (!rule.branchType || rule.branchType === branchType) {
        if (rule.jobTitles.includes(jobTitle.trim())) {
          required.push(rule.requiredDocument);
        }
      }
    }
  });
  
  return required;
};

export const validateDocumentType = (documentType, employee) => {
  const { nationality, job_title, branch_type } = employee;
  
  const nationalityReqs = getNationalityRequirements(nationality);
  if (documentType === 'passport' || documentType === 'passport_copy') {
    if (!nationalityReqs.requiresPassport) {
      return {
        allowed: false,
        reason: 'جواز السفر مطلوب فقط للموظفين غير السعوديين'
      };
    }
  }
  
  const branchRules = getBranchTypeRules(branch_type);
  if (documentType === 'professional_license') {
    if (!branchRules?.employeeDocumentRequirements?.professionalLicense) {
      return {
        allowed: false,
        reason: 'الترخيص المهني مطلوب فقط لموظفي المدارس'
      };
    }
  }
  
  const requiredDocs = getRequiredDocumentsForJobTitle(job_title, branch_type);
  if (requiredDocs.includes(documentType)) {
    return { allowed: true };
  }
  
  return { allowed: true };
};

export default {
  NATIONALITY_RULES,
  BRANCH_TYPE_RULES,
  JOB_TITLE_RULES,
  isSaudiNationality,
  getNationalityRequirements,
  getBranchTypeRules,
  jobTitleMatchesRule,
  getRequiredDocumentsForJobTitle,
  validateDocumentType
};


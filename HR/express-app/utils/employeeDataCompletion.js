/**
 * Employee Data Completion Checker
 * Determines if an employee has complete data based on:
 * - Basic required fields (name, ID, nationality)
 * - Nationality-specific requirements (Saudi vs non-Saudi)
 * - Profession-specific requirements
 * - Branch type requirements (school vs healthcare center)
 * - Manager/Supervisor special requirements
 * 
 * IMPORTANT: All job/profession-related decisions MUST use the job_title field
 * (structured dropdown selection), NOT the occupation field (free text input).
 * This ensures accurate and consistent decision-making based on standardized job titles.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

/**
 * Check if employee data is complete
 * 
 * IMPORTANT: Documents are optional in general, BUT employees cannot be marked as complete
 * until ALL required documents (based on their characteristics) are uploaded.
 * 
 * Required documents are determined by:
 * - Nationality: Non-Saudi employees need passport
 * - Profession: Speech therapists (70h course), Physical therapists (40h course)
 * - Role: Managers/Supervisors need experience certificate
 * - Branch Type: School employees need professional license
 * - Professional Classification: Certain professions need classification records (separate table)
 * 
 * @param {Object} employee - Employee object from database
 * @param {Object} options - Additional data (documents, classifications, certificates)
 * @returns {Object} - { isComplete: boolean, missingFields: string[] }
 */
export async function checkEmployeeDataCompletion(employee, options = {}) {
  const missingFields = [];

  // Get branch type
  const [branch] = await sql`
    SELECT branch_type FROM branches WHERE id = ${employee.branch_id}
  `;
  const branchType = branch?.branch_type || null;

  // Get documents if not provided
  let documents = options.documents;
  if (!documents) {
    documents = await sql`
      SELECT document_type FROM employee_documents 
      WHERE employee_id = ${employee.id} AND is_active = true
    `;
  }
  const documentTypes = documents.map(d => d.document_type);

  // Get classifications if not provided
  let classifications = options.classifications;
  if (!classifications) {
    classifications = await sql`
      SELECT profession FROM employee_professional_classifications 
      WHERE employee_id = ${employee.id}
    `;
  }
  const classificationProfessions = classifications.map(c => c.profession);

  // Get certificates if not provided
  let certificates = options.certificates;
  if (!certificates) {
    certificates = await sql`
      SELECT course_type FROM employee_course_certificates 
      WHERE employee_id = ${employee.id}
    `;
  }
  const certificateTypes = certificates.map(c => c.course_type);

  // BASIC REQUIRED FIELDS (always required)
  // These are already enforced at database level, but we check anyway
  if (!employee.first_name || !employee.second_name || !employee.third_name || !employee.fourth_name) {
    missingFields.push('الأسماء الرباعية');
  }
  if (!employee.id_or_residency_number) {
    missingFields.push('رقم الهوية/الإقامة');
  }
  if (!employee.nationality) {
    missingFields.push('الجنسية');
  }

  // COMMON FIELDS (required for complete data)
  if (!employee.employee_id_number) {
    missingFields.push('رقم الموظف');
  }
  // IMPORTANT: job_title is required for all job-related decisions
  // occupation is kept for backward compatibility but not used for decision-making
  if (!employee.job_title) {
    missingFields.push('المسمى الوظيفي');
  }
  if (!employee.gender) {
    missingFields.push('الجنس');
  }
  if (!employee.id_type) {
    missingFields.push('نوع الهوية');
  }

  // NATIONALITY-SPECIFIC REQUIREMENTS
  const nationalityLower = (employee.nationality || '').toLowerCase();
  const isSaudi = nationalityLower.includes('سعودي') ||
    nationalityLower.includes('saudi') ||
    nationalityLower.includes('السعودية') ||
    employee.id_type === 'citizen';
  const isNonSaudi = employee.id_type === 'resident' || (!isSaudi && employee.id_type);

  // Date of birth requirements: Saudi employees only need Hijri date, non-Saudis need Gregorian
  if (isSaudi) {
    // Saudi: Only Hijri date required
    if (!employee.date_of_birth_hijri) {
      missingFields.push('تاريخ الميلاد (هجري)');
    }
  } else if (isNonSaudi) {
    // Non-Saudi: Gregorian date required
    if (!employee.date_of_birth_gregorian) {
      missingFields.push('تاريخ الميلاد (ميلادي)');
    }
  } else {
    // Fallback: If nationality cannot be determined, require at least one date
    if (!employee.date_of_birth_gregorian && !employee.date_of_birth_hijri) {
      missingFields.push('تاريخ الميلاد');
    }
  }

  // Non-Saudi employees: REQUIRED - Passport document and passport number
  // All non-Saudi employees (residents) MUST have a passport copy uploaded
  if (isNonSaudi && employee.id_type === 'resident') {
    // Check for both 'passport' and 'passport_copy' to handle different naming conventions
    const hasPassport = documentTypes.includes('passport') || documentTypes.includes('passport_copy');
    if (!hasPassport) {
      missingFields.push('نسخة جواز السفر (مطلوب لغير السعوديين)');
    }
    if (!employee.passport_number) {
      missingFields.push('رقم جواز السفر');
    }
    // Added strict checks to match frontend validation
    if (!employee.passport_issue_date) {
      missingFields.push('تاريخ إصدار جواز السفر');
    }
    if (!employee.passport_expiry_date) {
      missingFields.push('تاريخ انتهاء جواز السفر');
    }
    if (!employee.passport_issue_place) {
      missingFields.push('مكان إصدار جواز السفر');
    }
    if (!employee.residency_issue_date) {
      missingFields.push('تاريخ إصدار الإقامة');
    }
  }

  // ============================================================================
  // DOCUMENT REQUIREMENTS
  // ============================================================================
  // NOTE: Documents are optional in general, BUT employees cannot be marked as
  // complete until ALL required documents (based on their characteristics) are uploaded.
  // Required documents are determined by:
  // 1. Common required documents (ID/Residency, Direct Letter, Bank IBAN)
  // 2. Nationality (non-Saudis need passport)
  // 3. Profession (certain professions need specific certificates/classifications)
  // 4. Role (managers need experience certificate)
  // 5. Branch type (school employees need professional license)
  // ============================================================================

  // COMMON REQUIRED DOCUMENTS (for all employees)
  // These four documents are mandatory for all employees to be considered complete
  if (!documentTypes.includes('id_or_residency')) {
    missingFields.push('الهوية/الإقامة (مستند مطلوب)');
  }
  if (!documentTypes.includes('direct_letter')) {
    missingFields.push('خطاب مباشرة (مستند مطلوب)');
  }
  if (!documentTypes.includes('bank_iban')) {
    missingFields.push('مستند الآيبان (مستند مطلوب)');
  }
  if (!documentTypes.includes('employment_contract')) {
    missingFields.push('عقد العمل (مستند مطلوب وأساسي)');
  }

  // PROFESSION-SPECIFIC REQUIREMENTS
  // IMPORTANT: Use job_title field (structured dropdown selection) instead of parsing occupation (free text)
  // This ensures accurate matching based on the actual job title selected by the user
  const jobTitle = employee.job_title || '';

  // Professions requiring professional classification (stored in separate table, not documents)
  // These professions MUST have a classification record to be considered complete
  // Based on job_title dropdown values from the form
  const classificationRequiredJobTitles = [
    'علاج طبيعي',      // Physiotherapy
    'علاج وظيفي',      // Occupational Therapy
    'اخصائي نفسي',    // Psychology
    'تمريض'            // Nursing
  ];

  const needsClassification = classificationRequiredJobTitles.includes(jobTitle);

  if (needsClassification) {
    const hasClassification = classificationProfessions.some(cp =>
      classificationRequiredJobTitles.some(jt =>
        cp.toLowerCase().includes(jt.toLowerCase())
      )
    );
    if (!hasClassification) {
      missingFields.push('التصنيف المهني (مطلوب لهذه المهنة)');
    }
  }

  // Speech Therapist: REQUIRED - 70-hour course certificate
  // Based on job_title dropdown value: 'النطق و التخاطب'
  if (jobTitle === 'النطق و التخاطب') {
    const has70HourCourse = documentTypes.includes('speech_therapy_70_hours_course') ||
      documentTypes.includes('speech_therapy_70h') ||
      documentTypes.includes('speech_therapy_course') || // Alternative name
      certificateTypes.includes('speech_therapy_70h');
    if (!has70HourCourse) {
      missingFields.push('شهادة دورة 70 ساعة (مطلوب لأخصائي النطق)');
    }
  }

  // Physical Therapist: REQUIRED - 40-hour course certificate
  // Note: This is different from Physiotherapy (which needs classification, not this certificate)
  // Based on job_title dropdown - if there's a specific "Physical Therapist" job title, add it here
  // Currently, the dropdown only has 'علاج طبيعي' (Physiotherapy) which requires classification
  // This check is kept for any future job titles that specifically require the 40-hour course
  // If no such job title exists in the dropdown, this check will never trigger

  // Manager/Supervisor: REQUIRED - Experience certificate
  // Based on job_title dropdown values from the form
  const managerJobTitles = [
    'مدير',              // Manager (school)
    'وكيل',              // Deputy (school)
    'مديرة مراكز',       // Center Director (healthcare)
    'مشرف فني عام'       // General Technical Supervisor (healthcare)
  ];

  const isManager = managerJobTitles.includes(jobTitle);

  if (isManager) {
    if (!documentTypes.includes('experience_certificate')) {
      missingFields.push('شهادة الخبرة (مطلوب للمدير/المشرف)');
    }
  }

  // BRANCH TYPE SPECIFIC REQUIREMENTS
  // School employees: REQUIRED - Professional license
  // All employees working in schools MUST have a professional license
  if (branchType === 'school') {
    if (!documentTypes.includes('professional_license')) {
      missingFields.push('الترخيص المهني (مطلوب لموظفي المدارس)');
    }
  }

  // ADDITIONAL COMMON FIELDS (for complete profile)
  // Note: Date of birth is already handled above based on nationality
  if (!employee.religion) {
    missingFields.push('الدين');
  }
  if (!employee.marital_status) {
    missingFields.push('الحالة الاجتماعية');
  }
  if (!employee.educational_qualification) {
    missingFields.push('المؤهل التعليمي');
  }

  // Specialization, graduation_year, and university_gpa are only required for higher education qualifications
  // Basic education levels (ابتدائي، متوسط، ثانوي، غير متعلم) do not require these fields
  const basicEducationLevels = ['ابتدائي', 'متوسط', 'ثانوي', 'غير متعلم'];
  const isBasicEducation = employee.educational_qualification &&
    basicEducationLevels.includes(employee.educational_qualification);

  if (!isBasicEducation && !employee.specialization) {
    missingFields.push('التخصص');
  }
  if (!employee.email) {
    missingFields.push('البريد الإلكتروني');
  }
  if (!employee.phone_number) {
    missingFields.push('رقم الجوال');
  }
  if (!employee.national_address) {
    missingFields.push('العنوان الوطني');
  }
  if (!employee.contract_type) {
    missingFields.push('نوع العقد');
  }

  // Check if total salary (base_salary + other_allowances) is provided
  const baseSalary = parseFloat(employee.base_salary || 0);
  const otherAllowances = parseFloat(employee.other_allowances || 0);
  const totalSalary = baseSalary + otherAllowances;
  if (totalSalary === 0 && !employee.base_salary && !employee.other_allowances) {
    missingFields.push('بيانات الراتب (الراتب الأساسي و/أو الدبلات)');
  }

  // ID expiry date: Only required for non-Saudis (residents have expiry dates)
  // Saudi citizens' national IDs don't expire
  if (!isSaudi) {
    if (!employee.id_expiry_date_gregorian && !employee.id_expiry_date_hijri) {
      missingFields.push('تاريخ انتهاء الهوية/الإقامة');
    }
  }

  // Check if employee has NO documents at all
  // Documents are optional for completion, but if there are NO documents, 
  // it should be flagged in missing data for attention
  const hasNoDocuments = documents.length === 0;
  if (hasNoDocuments) {
    missingFields.push('المستندات (لا توجد مستندات مرفوعة)');
  }

  // Calculate completion status
  // IMPORTANT: If employee has NO documents at all, they should be marked as incomplete
  // Required common documents (id_or_residency, direct_letter, bank_iban, employment_contract) 
  // MUST be present for completion, regardless of other documents.
  // These are the four essential documents that ALL employees must have.
  // Other profession-specific documents are tracked but don't block completion if employee has some documents.

  // Check for required common documents
  const requiredCommonDocuments = [
    'id_or_residency',
    'direct_letter',
    'bank_iban',
    'employment_contract'
  ];
  const hasAllRequiredDocuments = requiredCommonDocuments.every(docType =>
    documentTypes.includes(docType)
  );

  // Separate required document fields from optional ones
  const documentRelatedKeywords = ['مستند', 'شهادة', 'ترخيص', 'جواز', 'دورة', 'تصنيف'];
  const requiredDocumentKeywords = ['الهوية/الإقامة', 'خطاب مباشرة', 'مستند الآيبان', 'عقد العمل'];
  const missingRequiredDocuments = missingFields.filter(field =>
    documentRelatedKeywords.some(keyword => field.includes(keyword)) &&
    requiredDocumentKeywords.some(keyword => field.includes(keyword))
  );
  const nonDocumentMissingFields = missingFields.filter(field =>
    !documentRelatedKeywords.some(keyword => field.includes(keyword))
  );

  // Employee is complete only if:
  // 1. Has no documents at all → incomplete (for attention)
  // 2. Has all required common documents AND no non-document fields missing → complete
  // 3. Missing required documents OR missing non-document fields → incomplete
  const isComplete = hasNoDocuments ? false : (hasAllRequiredDocuments && nonDocumentMissingFields.length === 0);

  return {
    isComplete,
    missingFields
  };
}

/**
 * Update employee data completion status
 * @param {number} employeeId - Employee ID
 * @returns {Promise<Object>} - Updated employee with status
 */
export async function updateEmployeeCompletionStatus(employeeId) {
  try {
    // Get employee
    const [employee] = await sql`
      SELECT * FROM employees WHERE id = ${employeeId}
    `;

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Check completion
    const completion = await checkEmployeeDataCompletion(employee);

    // Update status
    const newStatus = completion.isComplete ? 'complete' : 'incomplete';

    await sql`
      UPDATE employees 
      SET data_completion_status = ${newStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${employeeId}
    `;

    return {
      ...employee,
      data_completion_status: newStatus,
      missingFields: completion.missingFields
    };
  } catch (error) {
    log.error('Error updating employee completion status:', { error: error.message });
    throw error;
  }
}


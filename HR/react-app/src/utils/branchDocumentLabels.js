/** Arabic names of the branch document types, shared by the branch-document pages. */
export const BRANCH_DOCUMENT_LABELS = {
  license: 'الترخيص',
  permit: 'التصريح',
  insurance: 'التأمين',
  insurance_print: 'كشف التأمينات',
  contract: 'العقد',
  rental_contract: 'عقد الايجار',
  registration: 'السجل التجاري',
  security_contract: 'عقد الامن والسلامة',
  civil_defense_certificate: 'شهادة الدفاع المدني',
  municipality_certificate: 'شهادة بلدي',
  insurance_certificate: 'شهادة التامينات',
  insurance_statement: 'كشف التأمينات',
  operational_plan: 'الخطة التشغلية',
  owner_civil_id_copy: 'نسخة هوية المالك',
  disclosure_commitment: 'إفصاح وتعهد',
  certification_commitment_form: 'نموذج تصديق وتعاقد',
  financial_platform_declaration: 'ملف إقرار المنصة المالية',
  financial_claim_form: 'نموذج مطالبة مالية',
  student_cadre_file: 'بيانات الطلاب',
  dropped_students: 'الطلاب المنقطعين',
  free_seats: 'المقاعد المتاحة',
  acceptance_notifications: 'إشعارات القبول',
};

export const branchDocumentLabel = (type) => BRANCH_DOCUMENT_LABELS[type] || type;

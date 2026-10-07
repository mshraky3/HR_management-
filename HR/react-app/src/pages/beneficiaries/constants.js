/** Shared constants for the beneficiaries pages. */

export const SERVICE_LABELS = {
  speech_therapy: 'نطق وتخاطب',
  physical_therapy: 'علاج طبيعي',
  occupational_therapy: 'علاج وظيفي',
  autism_therapy: 'علاج توحد',
  transport_service: 'خدمة نقل',
};

export const ENROLLMENT_OPTIONS = ['صباحية', 'مسائية'];
export const GENDER_OPTIONS = ['ذكر', 'أنثى'];

// Ceiling matches the beneficiaries_age_check constraint (migration 024). It has to exceed the
// oldest beneficiary on file, or the rollover cannot record them a year older.
export const AGE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export const EMPTY_BENEFICIARY = {
  beneficiary_number: '',
  enrollment_period: 'صباحية',
  beneficiary_name: '',
  civil_id: '',
  contact_number: '',
  gender: 'ذكر',
  age: '',
  speech_therapy: false,
  physical_therapy: false,
  occupational_therapy: false,
  autism_therapy: false,
  transport_service: false,
  free_student: false,
  notes: '',
};

export const EXPORT_COLUMN_OPTIONS = [
  { key: 'sequence_number', label: 'التسلسل' },
  { key: 'branch_name', label: 'الفرع' },
  { key: 'enrollment_period', label: 'فترة الالتحاق' },
  { key: 'beneficiary_name', label: 'اسم المستفيد' },
  { key: 'beneficiary_number', label: 'رقم المستفيد' },
  { key: 'civil_id', label: 'السجل المدني' },
  { key: 'contact_number', label: 'رقم التواصل' },
  { key: 'gender', label: 'الجنس' },
  { key: 'age', label: 'العمر' },
  { key: 'speech_therapy', label: 'نطق وتخاطب' },
  { key: 'physical_therapy', label: 'علاج طبيعي' },
  { key: 'occupational_therapy', label: 'علاج وظيفي' },
  { key: 'autism_therapy', label: 'علاج توحد' },
  { key: 'transport_service', label: 'خدمة نقل' },
  { key: 'free_student', label: 'طالب مجاني' },
  { key: 'notes', label: 'ملاحظات' },
];

/** The same filter the data table and its result count both use. */
export function matchesSearch(b, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (b.beneficiary_name || '').toLowerCase().includes(q)
    || (b.civil_id || '').includes(q)
    || (b.beneficiary_number || '').includes(q);
}

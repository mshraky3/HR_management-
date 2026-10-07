/**
 * The beneficiary data fields, shared by the add/edit dialog and the new-year review step.
 * `values` / `onChange(patch)` keep the parent's own state shape; `showGender` is off in the review
 * (gender is set once at registration and is context there, not something to re-check).
 */
import { FormField, Input, Select, Textarea, Chip, ChipGroup } from '../../ui';
import { SERVICE_LABELS, ENROLLMENT_OPTIONS, GENDER_OPTIONS, AGE_OPTIONS } from './constants';

export default function BeneficiaryFields({ values, onChange, showGender = true, ageLabel = 'العمر', autoFocus = false }) {
  const set = (field) => (e) => onChange({ [field]: e.target.value });

  return (
    <div className="ui-form-stack">
      <div className="bn-form-grid">
        <FormField label="اسم المستفيد" required>
          <Input value={values.beneficiary_name} onChange={set('beneficiary_name')} placeholder="اسم المستفيد الكامل" autoFocus={autoFocus} />
        </FormField>
        <FormField label="رقم المستفيد" required hint="6 أو 7 أرقام">
          <Input
            inputMode="numeric"
            maxLength={7}
            value={values.beneficiary_number}
            onChange={(e) => onChange({ beneficiary_number: e.target.value.replace(/\D/g, '').slice(0, 7) })}
            dir="ltr"
          />
        </FormField>
        <FormField label="السجل المدني" required>
          <Input value={values.civil_id} onChange={set('civil_id')} dir="ltr" />
        </FormField>
        <FormField label="رقم التواصل" required>
          <Input value={values.contact_number} onChange={set('contact_number')} placeholder="05XXXXXXXX" dir="ltr" />
        </FormField>
        <FormField label="فترة الالتحاق" required>
          <Select value={values.enrollment_period} onChange={set('enrollment_period')} options={ENROLLMENT_OPTIONS} />
        </FormField>
        {showGender && (
          <FormField label="الجنس" required>
            <Select value={values.gender} onChange={set('gender')} options={GENDER_OPTIONS} />
          </FormField>
        )}
        <FormField label={ageLabel} required>
          <Select value={values.age?.toString() || ''} onChange={set('age')} options={AGE_OPTIONS} placeholder="اختر العمر" />
        </FormField>
      </div>

      <fieldset className="bn-fieldset">
        <legend className="ui-field-label">الخدمات المقدمة</legend>
        <ChipGroup aria-label="الخدمات المقدمة">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => (
            <Chip key={key} selected={Boolean(values[key])} onClick={() => onChange({ [key]: !values[key] })}>{label}</Chip>
          ))}
          <Chip selected={Boolean(values.free_student)} onClick={() => onChange({ free_student: !values.free_student })}>طالب مجاني</Chip>
        </ChipGroup>
      </fieldset>

      <FormField label="ملاحظات">
        <Textarea rows={2} value={values.notes} onChange={set('notes')} placeholder="اختياري" />
      </FormField>
    </div>
  );
}

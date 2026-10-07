/**
 * Employee data sections. Every value is click-to-copy (CopyText). Dates that exist in both calendars show
 * the Hijri and Gregorian values side by side (the missing one is calculated by the server).
 */
import { Card, CopyText } from '../../../ui';
import { formatDate } from '../../../utils/dateConverters';
import './EmployeeInfoSections.css';

const RELIGIONS = { Islam: 'الإسلام', Christianity: 'المسيحية', Judaism: 'اليهودية', Others: 'أخرى' };
const MARITAL = { Single: 'أعزب', Married: 'متزوج', Divorced: 'مطلق', Widowed: 'أرمل' };
const GENDERS = { male: 'ذكر', female: 'أنثى' };
const ID_TYPES = { citizen: 'مواطن', resident: 'مقيم' };

const money = (v) => `${(parseFloat(v) || 0).toLocaleString('en-US')} ريال`;
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '' && v !== 0 && v !== '0' && v !== '0.00';

/** One label + copyable value. Renders nothing for an empty value unless `always`. */
function Field({ label, value, children, always = false, wide = false }) {
  const shown = children ?? value;
  if (!always && !filled(value)) return null;
  return (
    <div className={`ei-field${wide ? ' ei-wide' : ''}`}>
      <dt>{label}</dt>
      <dd><CopyText value={value}>{shown || '—'}</CopyText></dd>
    </div>
  );
}

/** A date stored in both calendars: two copyable values in one row. */
function DateField({ label, hijri, gregorian }) {
  if (!filled(hijri) && !filled(gregorian)) return null;
  const g = gregorian ? formatDate(gregorian) : '';
  return (
    <div className="ei-field ei-wide">
      <dt>{label}</dt>
      <dd className="ei-dates">
        <span className="ei-date"><small>هجري</small><CopyText value={hijri}>{hijri || '—'}</CopyText></span>
        <span className="ei-date"><small>ميلادي</small><CopyText value={g}>{g || '—'}</CopyText></span>
      </dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <Card title={title}>
      <dl className="ei-grid">{children}</dl>
    </Card>
  );
}

const EmployeeInfoSections = ({ employee, branches }) => {
  const e = employee;
  const branchName = branches.find((b) => b.id === e.branch_id)?.branch_name || e.branch_id;
  const salaryParts = [
    ['الراتب الأساسي', e.base_salary], ['بدل السكن', e.housing_allowance], ['بدل النقل', e.transportation_allowance],
    ['بدل نهاية الخدمة', e.end_of_service_allowance], ['بدل الإجازة السنوية', e.annual_leave_allowance], ['بدلات أخرى', e.other_allowances],
  ];
  const hasSalary = salaryParts.some(([, v]) => (parseFloat(v) || 0) !== 0);
  const total = salaryParts.reduce((sum, [, v]) => sum + (parseFloat(v) || 0), 0);
  const hasWork = e.contract_type || e.job_title || e.contract_start_date_gregorian || e.contract_start_date_hijri
    || e.contract_end_date_gregorian || e.contract_end_date_hijri || e.work_start_date_gregorian || e.work_start_date_hijri
    || filled(e.years_of_experience_in_same_institution) || filled(e.years_of_experience_in_company);

  return (
    <>
      <Section title="القسم الأول: المعلومات الأساسية">
        <Field label="المهنة" value={e.occupation} always />
        <Field label="الجنسية" value={e.nationality} always />
        <Field label="الفرع" value={branchName} always />
        <Field label="الجنس" value={GENDERS[e.gender]} always />
        <Field label="نوع الهوية" value={ID_TYPES[e.id_type]} always />
        <Field label="رقم الهوية/الإقامة" value={e.id_or_residency_number} always />
        <DateField label="تاريخ الميلاد" hijri={e.date_of_birth_hijri} gregorian={e.date_of_birth_gregorian} />
        <DateField label="انتهاء الهوية" hijri={e.id_expiry_date_hijri} gregorian={e.id_expiry_date_gregorian} />
        <Field label="الديانة" value={e.religion && (RELIGIONS[e.religion] || e.religion)} />
        <Field label="الحالة الاجتماعية" value={e.marital_status && (MARITAL[e.marital_status] || e.marital_status)} />
        <Field label="المؤهل التعليمي" value={e.educational_qualification} />
        <Field label="التخصص" value={e.specialization} />
        <Field label="العنوان الوطني" value={e.national_address} wide />
      </Section>

      {(e.email || e.phone_number) && (
        <Section title="القسم الثاني: معلومات الاتصال">
          <Field label="البريد الإلكتروني" value={e.email} />
          <Field label="رقم الهاتف" value={e.phone_number} />
        </Section>
      )}

      {hasWork && (
        <Section title="القسم الثالث: معلومات العمل">
          <Field label="المسمى الوظيفي" value={e.job_title} />
          <Field label="نوع العقد" value={e.contract_type} />
          <DateField label="بداية العقد" hijri={e.contract_start_date_hijri} gregorian={e.contract_start_date_gregorian} />
          <DateField label="نهاية العقد" hijri={e.contract_end_date_hijri} gregorian={e.contract_end_date_gregorian} />
          <DateField label="مباشرة العمل" hijri={e.work_start_date_hijri} gregorian={e.work_start_date_gregorian} />
          {filled(e.years_of_experience_in_same_institution) && (
            <Field label="سنوات الخبرة في نفس المؤسسة" value={`${e.years_of_experience_in_same_institution} سنة`} />
          )}
          {filled(e.years_of_experience_in_company) && (
            <Field label="سنوات الخبرة في الشركة" value={`${e.years_of_experience_in_company} سنة`} />
          )}
        </Section>
      )}

      {(e.bank_name || e.bank_iban) && (
        <Section title="القسم الرابع: المعلومات المالية">
          <Field label="البنك" value={e.bank_name} />
          <Field label="رقم الآيبان" value={e.bank_iban}>
            <bdi dir="ltr">{e.bank_iban}</bdi>
          </Field>
        </Section>
      )}

      {hasSalary && (
        <Section title="القسم الخامس: الراتب والبدلات">
          {salaryParts.map(([label, v]) => (parseFloat(v) || 0) !== 0 && (
            <Field key={label} label={label} value={String(parseFloat(v) || 0)}>{money(v)}</Field>
          ))}
          <div className="ei-field ei-wide ei-total">
            <dt>إجمالي الراتب والبدلات</dt>
            <dd><CopyText value={String(total)}>{money(total)}</CopyText></dd>
          </div>
        </Section>
      )}
    </>
  );
};

export default EmployeeInfoSections;

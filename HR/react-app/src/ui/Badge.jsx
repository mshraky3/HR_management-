/**
 * Badge / StatusBadge: one place that maps a status to a label and a colour.
 * (Employee statuses used to be mapped inline in several pages with different colours.)
 */

const TONE_CLASS = {
  success: 'badge badge-success',
  warning: 'badge badge-warning',
  danger: 'badge badge-danger',
  info: 'badge badge-info',
  neutral: 'badge badge-neutral',
};

export default function Badge({ tone = 'neutral', children, dot = false, className = '', ...rest }) {
  return (
    <span className={`${TONE_CLASS[tone] || TONE_CLASS.neutral}${className ? ` ${className}` : ''}`} {...rest}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Employee statuses (employees.status). `archived` = left the organisation. */
export const EMPLOYEE_STATUS_META = {
  active: { label: 'نشط', tone: 'success', archived: false },
  pending: { label: 'قيد التجديد', tone: 'warning', archived: false },
  terminated_article_80: { label: 'إنهاء المادة 80', tone: 'danger', archived: true },
  terminated_article_77: { label: 'إنهاء المادة 77', tone: 'danger', archived: true },
  resigned: { label: 'استقالة', tone: 'neutral', archived: true },
  contract_ended: { label: 'انتهاء العقد', tone: 'neutral', archived: true },
  non_renewal: { label: 'عدم التجديد', tone: 'warning', archived: true },
  other: { label: 'أخرى', tone: 'neutral', archived: true },
};

export const ARCHIVED_STATUS_OPTIONS = Object.entries(EMPLOYEE_STATUS_META)
  .filter(([, m]) => m.archived)
  .map(([value, m]) => ({ value, label: m.label }));

export function employeeStatusLabel(status) {
  return EMPLOYEE_STATUS_META[status]?.label || status || '—';
}

export function StatusBadge({ status, dot = true }) {
  const meta = EMPLOYEE_STATUS_META[status] || { label: status || '—', tone: 'neutral' };
  return <Badge tone={meta.tone} dot={dot}>{meta.label}</Badge>;
}

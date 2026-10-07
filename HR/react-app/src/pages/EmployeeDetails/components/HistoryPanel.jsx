import { useEffect, useMemo, useState } from 'react';
import { Card, Skeleton, ErrorState, EmptyState, Icon, employeeStatusLabel } from '../../../ui';
import { employeesAPI } from '../../../utils/api';

const FIELD_LABELS = {
  first_name: 'الاسم الأول', second_name: 'الاسم الثاني', third_name: 'الاسم الثالث', fourth_name: 'الاسم الرابع',
  id_or_residency_number: 'رقم الهوية/الإقامة', employee_id_number: 'رقم الموظف', nationality: 'الجنسية',
  job_title: 'المسمى الوظيفي', occupation: 'المهنة', phone_number: 'الجوال', email: 'البريد الإلكتروني',
  bank_iban: 'الآيبان', bank_name: 'البنك', national_address: 'العنوان الوطني', contract_type: 'نوع العقد',
  contract_start_date_gregorian: 'بداية العقد', contract_end_date_gregorian: 'نهاية العقد', work_start_date_gregorian: 'تاريخ مباشرة العمل',
  base_salary: 'الراتب الأساسي', housing_allowance: 'بدل السكن', transportation_allowance: 'بدل النقل',
  date_of_birth_gregorian: 'تاريخ الميلاد', id_expiry_date_gregorian: 'انتهاء الهوية', gender: 'الجنس',
  religion: 'الديانة', marital_status: 'الحالة الاجتماعية', educational_qualification: 'المؤهل', specialization: 'التخصص',
};
const fieldLabel = (f) => FIELD_LABELS[f] || f.replace(/_/g, ' ');

const SOURCE_LABELS = {
  offboard: 'إنهاء خدمة', status_route: 'تغيير حالة', delete_route: 'حذف', year_review: 'مراجعة السنة الجديدة',
  non_renewal: 'عدم تجديد', archive_restore: 'استعادة من الأرشيف', archive_status: 'تغيير من الأرشيف',
  bulk_archive: 'أرشفة جماعية', branch_deactivated: 'إيقاف الفرع', branch_reactivated: 'إعادة تفعيل الفرع',
};

const dt = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
};

const actorLabel = (e) => (e.actor_kind === 'branch' ? `الفرع (${e.actor_name || '—'})` : e.actor_name || 'النظام');

/** HistoryPanel: one timeline of status changes (reason, last working day) and edits (which fields changed). */
export default function HistoryPanel({ employeeId, reloadKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    employeesAPI.getHistory(employeeId)
      .then((res) => setData(res.data.data))
      .catch(() => setError(true));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [employeeId, reloadKey]);

  const items = useMemo(() => {
    if (!data) return [];
    const statusItems = data.status_history.map((h) => ({
      key: `s-${h.id}`, at: h.created_at, icon: h.to_status === 'active' || h.to_status === 'pending' ? 'restore' : 'archive',
      title: h.from_status ? `من ${employeeStatusLabel(h.from_status)} إلى ${employeeStatusLabel(h.to_status)}` : `الحالة: ${employeeStatusLabel(h.to_status)}`,
      lines: [
        h.reason_text && `السبب: ${h.reason_text}`,
        h.last_working_day && `آخر يوم عمل: ${String(h.last_working_day).slice(0, 10)}`,
        SOURCE_LABELS[h.source] && `المصدر: ${SOURCE_LABELS[h.source]}`,
      ].filter(Boolean),
      who: actorLabel(h),
    }));
    const auditItems = data.audit
      .filter((a) => ['update', 'transfer', 'link_branch'].includes(a.action))
      .map((a) => {
        const changes = a.changes || {};
        const keys = Object.keys(changes);
        const title = a.action === 'transfer' ? 'نقل إلى فرع آخر' : a.action === 'link_branch' ? 'ربط بفرع إضافي' : 'تعديل البيانات';
        return {
          key: `a-${a.id}`, at: a.created_at, icon: a.action === 'update' ? 'edit' : 'transfer', title,
          lines: a.action === 'update' ? [keys.length ? `الحقول: ${keys.map(fieldLabel).join('، ')}` : null].filter(Boolean) : [],
          who: actorLabel(a),
        };
      });
    return [...statusItems, ...auditItems].sort((x, y) => new Date(y.at) - new Date(x.at));
  }, [data]);

  if (error) return <ErrorState compact title="تعذّر تحميل السجل" onRetry={load} />;
  if (!data) return <Card><Skeleton lines={4} height={16} /></Card>;

  return (
    <Card title="سجل الموظف" subtitle="كل تغيير في الحالة أو البيانات مع من قام به ومتى">
      {items.length === 0 ? (
        <EmptyState compact icon="history" title="لا توجد أحداث مسجلة بعد" description="تظهر هنا التغييرات التي تتم من الآن فصاعداً." />
      ) : (
        <ol className="ui-timeline">
          {items.map((it) => (
            <li key={it.key} className="ui-timeline-item">
              <span className="ui-timeline-dot"><Icon name={it.icon} size={16} /></span>
              <div className="ui-timeline-body">
                <div className="ui-timeline-head">
                  <strong>{it.title}</strong>
                  <time className="ui-timeline-time">{dt(it.at)}</time>
                </div>
                {it.lines.map((l) => <p key={l} className="ui-timeline-line">{l}</p>)}
                <span className="ui-timeline-who">{it.who}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

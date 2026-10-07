/** Head-office statistics for one term: totals, services, per-branch table, ages, submission status. */
import { Card, StatCard, DataTable, Badge, EmptyState } from '../../ui';
import { SERVICE_LABELS } from './constants';

const pct = (part, whole) => (whole ? Math.round((Number(part) / Number(whole)) * 100) : 0);

const comboLabel = (n) => (n === 0 ? 'بدون خدمات' : n === 1 ? 'خدمة واحدة' : n === 2 ? 'خدمتان' : `${n} خدمات`);

export default function StatsPanel({ stats, submissionStatus }) {
  if (!stats) return <Card><EmptyState icon="chart" title="لا توجد إحصائيات" description="اختر فصلاً دراسياً لعرض الإحصائيات." /></Card>;
  const t = stats.totals || {};

  const branchColumns = [
    { key: 'branch_name', header: 'الفرع', mobilePrimary: true, render: (b) => <strong>{b.branch_name}</strong> },
    { key: 'total', header: 'الإجمالي', align: 'center' },
    { key: 'paid_student_count', header: 'مدفوع', align: 'center' },
    { key: 'free_student_count', header: 'مجاني', align: 'center' },
    { key: 'male_count', header: 'ذكور', align: 'center' },
    { key: 'female_count', header: 'إناث', align: 'center' },
    { key: 'morning_count', header: 'صباحية', align: 'center' },
    { key: 'evening_count', header: 'مسائية', align: 'center' },
    ...Object.entries(SERVICE_LABELS).map(([key, label]) => ({ key: `${key}_count`, header: label, align: 'center' })),
  ];

  return (
    <div className="bn-stack">
      <div className="ui-grid-stats">
        <StatCard label="إجمالي المستفيدين" value={t.total || 0} icon="users" tone="primary" />
        <StatCard label="مدفوعون" value={t.paid_student_count || 0} icon="wallet" tone="primary" />
        <StatCard label="مجانيون" value={t.free_student_count || 0} icon="graduation-cap" tone="success" />
        <StatCard label="ذكور" value={t.male_count || 0} icon="user" tone="primary" />
        <StatCard label="إناث" value={t.female_count || 0} icon="user" tone="primary" />
        <StatCard label="فترة صباحية" value={t.morning_count || 0} icon="clock" tone="warning" />
        <StatCard label="فترة مسائية" value={t.evening_count || 0} icon="clock" tone="primary" />
        <StatCard label="متوسط العمر" value={t.avg_age || '—'} icon="chart" tone="primary" />
      </div>

      <Card title="الخدمات">
        <ul className="bn-meters">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => {
            const count = t[`${key}_count`] || 0;
            return (
              <li key={key}>
                <div className="bn-meter-head"><span>{label}</span><span className="bn-num"><bdi>{count}</bdi> · <bdi>{pct(count, t.total)}%</bdi></span></div>
                <div className="bn-meter-track" role="presentation"><span className="bn-meter-fill" style={{ width: `${pct(count, t.total)}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </Card>

      {stats.branchStats?.length > 0 && (
        <Card title="توزيع المستفيدين حسب الفروع" flush>
          <DataTable columns={branchColumns} rows={stats.branchStats} rowKey="branch_id" dense />
        </Card>
      )}

      <div className="bn-split">
        {stats.ageDistribution?.length > 0 && (
          <Card title="توزيع الأعمار">
            <ul className="bn-meters">
              {stats.ageDistribution.map((ad) => (
                <li key={ad.age_group}>
                  <div className="bn-meter-head"><span>{ad.age_group}</span><span className="bn-num"><bdi>{ad.count}</bdi></span></div>
                  <div className="bn-meter-track" role="presentation"><span className="bn-meter-fill" style={{ width: `${pct(ad.count, t.total)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {stats.serviceCombinations?.length > 0 && (
          <Card title="عدد الخدمات لكل مستفيد">
            <ul className="bn-combos">
              {stats.serviceCombinations.map((sc) => (
                <li key={sc.service_count}><strong>{sc.beneficiary_count}</strong><span>{comboLabel(sc.service_count)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {submissionStatus.length > 0 && (
        <Card title="حالة إدخال البيانات" subtitle="هل أدخل كل فرع مستفيديه لهذا الفصل؟">
          <ul className="bn-submissions">
            {submissionStatus.map((ss) => (
              <li key={ss.branch_id}>
                <span>{ss.branch_name}</span>
                {ss.has_submitted
                  ? <Badge tone="success" dot><bdi>{ss.beneficiary_count}</bdi> مستفيد</Badge>
                  : <Badge tone="warning" dot>لم يتم الإدخال</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

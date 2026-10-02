import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader, Card, StatCard, Button, Badge, StatusBadge, ErrorState, Skeleton, EmptyState } from '../../ui';
import { dashboardAPI, yearCycleAPI } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_LABEL = { complete: 'مكتمل', in_progress: 'جارٍ', not_started: 'لم يبدأ', overdue: 'متأخر' };
const STATUS_TONE = { complete: 'success', in_progress: 'info', not_started: 'neutral', overdue: 'danger' };

const day = (value) => (value ? String(value).slice(0, 10) : '');

/** Head-office home: headcount, new-year progress per branch, recent departures. */
export default function MainDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    dashboardAPI.getMainOverview().then((r) => setOverview(r.data.data)).catch(() => setError(true));
    yearCycleAPI.getCompliance().then((r) => setCycle(r.data.data)).catch(() => setCycle({ failed: true }));
  };
  useEffect(load, []);

  if (error) return <Page><ErrorState onRetry={load} /></Page>;

  const behind = cycle?.branches
    ? [...cycle.branches].filter((b) => b.status !== 'complete').sort((a, b) => a.score - b.score).slice(0, 6)
    : [];
  const summary = cycle?.summary;

  return (
    <Page>
      <PageHeader
        title={`مرحباً ${user?.full_name || ''}`}
        subtitle="نظرة سريعة على الفروع والموظفين وتقدم تحديث السنة الجديدة"
        actions={(
          <>
            <Button variant="secondary" icon="refresh" onClick={load}>تحديث</Button>
            <Button variant="primary" icon="list-check" to="/year-cycle">متابعة السنة الجديدة</Button>
          </>
        )}
      />

      <div className="ui-grid-stats">
        <StatCard label="الفروع النشطة" value={overview?.branches} icon="building" to="/branches" loading={!overview} />
        <StatCard label="الموظفون (نشط + قيد التجديد)" value={overview?.employees} hint={overview ? `${overview.pending_employees} قيد التجديد` : undefined} icon="users" to="/employees" loading={!overview} />
        <StatCard label="بيانات موظفين ناقصة" value={overview?.incomplete_employees} tone="warning" icon="alert" to="/fix-missing-dates" loading={!overview} />
        <StatCard label="طلبات بانتظار الرد" value={overview?.pending_requests} tone={overview?.pending_requests ? 'danger' : 'success'} icon="inbox" to="/manage-requests" loading={!overview} />
      </div>

      <Card
        title="تقدم الفروع في تحديث السنة الجديدة"
        subtitle={summary ? `${summary.complete} من ${summary.total} فرع أنهى التحديث · متوسط الإنجاز ${summary.average_score}%` : undefined}
        actions={<Button variant="secondary" size="sm" to="/year-cycle" iconEnd="arrow-end">عرض كل الفروع</Button>}
      >
        {!cycle ? <Skeleton lines={4} height={16} /> : cycle.failed ? (
          <ErrorState compact title="تعذّر تحميل التقدم" onRetry={load} />
        ) : (
          <>
            <div className="ui-bar" aria-label="نسبة الفروع حسب الحالة">
              {['complete', 'in_progress', 'overdue', 'not_started'].map((k) => (
                summary[k] > 0 && <span key={k} className={`ui-bar-seg is-${k}`} style={{ flexGrow: summary[k] }} title={`${STATUS_LABEL[k]}: ${summary[k]}`} />
              ))}
            </div>
            <div className="ui-bar-legend">
              {['complete', 'in_progress', 'overdue', 'not_started'].map((k) => (
                <span key={k} className="ui-bar-legend-item"><i className={`ui-dot is-${k}`} />{STATUS_LABEL[k]} <strong>{summary[k]}</strong></span>
              ))}
            </div>
            {behind.length === 0 ? (
              <EmptyState compact icon="check-circle" title="كل الفروع أنهت التحديث" />
            ) : (
              <ul className="ui-behind-list">
                {behind.map((b) => (
                  <li key={b.id} className="ui-behind-item">
                    <div className="ui-behind-name">
                      <strong>{b.name}</strong>
                      <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                    </div>
                    <div className="ui-behind-meter" role="progressbar" aria-valuenow={b.score} aria-valuemin={0} aria-valuemax={100} aria-label={`إنجاز ${b.name}`}>
                      <span style={{ width: `${b.score}%` }} />
                    </div>
                    <span className="ui-behind-score">{b.score}%</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <div className="ui-two-col">
        <Card title="آخر المغادرين (30 يوماً)" actions={<Button variant="ghost" size="sm" to="/archive">الأرشيف</Button>}>
          {!overview ? <Skeleton lines={3} height={16} /> : overview.departures.length === 0 ? (
            <EmptyState compact icon="archive" title="لا مغادرات حديثة" />
          ) : (
            <ul className="ui-feed">
              {overview.departures.map((d) => (
                <li key={`${d.id}-${d.at}`} className="ui-feed-item">
                  <div>
                    <Link to={`/employees/${d.id}`} className="ui-link-cell">{d.name}</Link>
                    <span className="ui-cell-sub"> · {d.branch_name || '—'}</span>
                    {d.reason && <p className="ui-feed-note">{d.reason}</p>}
                  </div>
                  <div className="ui-feed-side">
                    <StatusBadge status={d.status} dot={false} />
                    <span className="ui-cell-sub">{day(d.last_working_day || d.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="تنبيهات الحسابات">
          {!overview ? <Skeleton lines={3} height={16} /> : (
            <ul className="ui-feed">
              <li className="ui-feed-item">
                <span>فروع لم تدخل النظام منذ 14 يوماً</span>
                <Badge tone={overview.inactive_branches > 0 ? 'warning' : 'success'}>{overview.inactive_branches}</Badge>
              </li>
              <li className="ui-feed-item">
                <span>حسابات مقفلة بسبب محاولات خاطئة</span>
                <Badge tone={overview.locked_accounts > 0 ? 'danger' : 'success'}>{overview.locked_accounts}</Badge>
              </li>
              <li className="ui-feed-item">
                <span>إدارة حسابات الفروع</span>
                <Button variant="ghost" size="sm" to="/branches">فتح</Button>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}

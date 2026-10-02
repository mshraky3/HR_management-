import { useCallback, useEffect, useState } from 'react';
import { Page, PageHeader, Card, Button, Badge, ErrorState, Skeleton, EmptyState, Alert } from '../../ui';
import { tasksAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import PayrollAbsenceBranch from '../PayrollAbsenceBranch.jsx';
import { getBranchDocumentTypeLabel } from '../../utils/employeeConstants';
import TaskCard from './TaskCard';
import { IssueEmployeesPanel, NotificationsPanel } from './TaskPanels';

function ProgressSummary({ summary }) {
  const percent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 100;
  return (
    <Card className="ui-summary">
      <div className="ui-summary-ring" style={{ '--p': percent }} role="img" aria-label={`أنجزت ${percent}%`}>
        <strong>{percent}%</strong>
      </div>
      <div className="ui-summary-text">
        <h2 className="ui-summary-title">
          {summary.open === 0 ? 'أحسنت! لا توجد مهام معلّقة' : `${summary.open} ${summary.open === 1 ? 'مهمة معلّقة' : 'مهام معلّقة'}`}
        </h2>
        <p className="ui-summary-sub">أُنجز {summary.done} من {summary.total} مهمة</p>
        <div className="ui-chips">
          {summary.critical > 0 && <Badge tone="danger" dot>{summary.critical} عاجلة</Badge>}
          {summary.overdue > 0 && <Badge tone="warning" dot>{summary.overdue} متأخرة</Badge>}
        </div>
      </div>
    </Card>
  );
}

/** BranchDashboard: what this branch still has to do, grouped and ordered by urgency. */
export default function BranchDashboard() {
  const { showSuccess, showError } = useNotification();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setError(false);
    return tasksAPI.getMy()
      .then((res) => setData(res.data.data))
      .catch(() => { if (!silent) setError(true); });
  }, []);

  useEffect(() => {
    load();
    // Refresh when the user comes back to the tab (after fixing something in another page)
    const onVisible = () => { if (!document.hidden) load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const completeManual = async (task) => {
    setCompleting(task.id);
    try {
      await tasksAPI.completeManual(task.manual_task_id);
      showSuccess('تم تسجيل إنجاز المهمة');
      await load(true);
    } catch (err) {
      showError(err.response?.data?.message || 'فشل تسجيل الإنجاز');
    } finally {
      setCompleting(null);
    }
  };

  if (error) return <Page><ErrorState onRetry={load} /></Page>;
  if (!data) {
    return (
      <Page>
        <PageHeader title="لوحة التحكم" />
        <Card><Skeleton lines={3} height={18} /></Card>
        <Card><Skeleton lines={4} height={18} /></Card>
      </Page>
    );
  }

  const renderTask = (task) => {
    let panel = null;
    if (task.inline?.type === 'salary_review' || task.inline?.type === 'iban_review') {
      panel = <IssueEmployeesPanel type={task.inline.type} items={task.inline.items} />;
    } else if (task.inline?.type === 'notifications') {
      panel = <NotificationsPanel items={task.inline.items} onChanged={() => load(true)} />;
    } else if (task.inline?.type === 'payroll_absence') {
      panel = <PayrollAbsenceBranch onComplete={() => load(true)} />;
    } else if (task.meta?.missing_types) {
      panel = (
        <ul className="ui-missing-list">
          {task.meta.missing_types.map((t) => <li key={t}>{getBranchDocumentTypeLabel(t)}</li>)}
        </ul>
      );
    }
    return (
      <TaskCard key={task.id} task={task} onComplete={completeManual} completing={completing === task.id}>
        {panel}
      </TaskCard>
    );
  };

  return (
    <Page>
      <PageHeader
        title={`مرحباً، ${data.branch.branch_name}`}
        subtitle="مهامك مرتبة حسب الأولوية: ابدأ بالعاجلة والمتأخرة، ثم المهمة."
        actions={<Button variant="secondary" icon="refresh" onClick={() => load()}>تحديث</Button>}
      />

      {data.degraded.length > 0 && (
        <Alert tone="warning">تعذّر حساب بعض المهام الآن ({data.degraded.length}). حدّث الصفحة بعد قليل.</Alert>
      )}

      <ProgressSummary summary={data.summary} />

      {data.sections.length === 0 && (
        <EmptyState icon="check-circle" title="لا توجد مهام الآن" description="سنُظهر هنا أي مهمة جديدة من الإدارة أو أي بيانات تحتاج استكمالاً." />
      )}

      {data.sections.map((section) => {
        const open = section.tasks.filter((t) => !t.done);
        const done = section.tasks.filter((t) => t.done);
        if (open.length === 0 && !(showDone && done.length > 0)) return null;
        return (
          <section key={section.id} className="ui-task-section" aria-labelledby={`sec-${section.id}`}>
            <h2 id={`sec-${section.id}`} className="ui-task-section-title">
              {section.title}
              <span className="ui-task-section-count">{open.length}</span>
            </h2>
            <div className="ui-task-list">
              {open.map(renderTask)}
              {showDone && done.map(renderTask)}
            </div>
          </section>
        );
      })}

      {data.summary.done > 0 && (
        <div className="ui-center">
          <Button variant="ghost" size="sm" onClick={() => setShowDone((s) => !s)} icon={showDone ? 'chevron-up' : 'chevron-down'}>
            {showDone ? 'إخفاء المهام المكتملة' : `عرض المهام المكتملة (${data.summary.done})`}
          </Button>
        </div>
      )}
    </Page>
  );
}

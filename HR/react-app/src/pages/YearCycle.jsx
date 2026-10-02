/**
 * Year cycle (head office): which branches finished the new-year update, and what each is missing.
 * Per-branch checklist with a score and status, filters, reminders (in-app, no e-mail),
 * assigning a task to branches, and the review deadline.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, StatCard, Toolbar, SearchInput, Select, Button, Badge, DataTable, Icon, Modal, FormField, Input,
  Textarea, Alert, useConfirm,
} from '../ui';
import { yearCycleAPI, tasksAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { normalizeSearch } from './employees/employeeUtils';

const STATUS_LABEL = { complete: 'مكتمل', in_progress: 'جارٍ', not_started: 'لم يبدأ', overdue: 'متأخر' };
const STATUS_TONE = { complete: 'success', in_progress: 'info', not_started: 'neutral', overdue: 'danger' };
const TYPE_LABEL = { school: 'مدرسة', healthcare_center: 'مركز رعاية' };
const ITEMS = [
  { key: 'review', label: 'مراجعة الموظفين' },
  { key: 'data', label: 'بيانات الموظفين' },
  { key: 'documents', label: 'مستندات الفرع' },
  { key: 'beneficiaries', label: 'المستفيدون' },
  { key: 'buses', label: 'الباصات' },
  { key: 'activity', label: 'النشاط' },
];
const LINK_PRESETS = [
  { value: '', label: 'بدون رابط' },
  { value: '/employees?tab=year-review', label: 'مراجعة موظفي السنة الجديدة' },
  { value: '/employees?data_completion_status=incomplete', label: 'إكمال بيانات الموظفين' },
  { value: '/branch-documents', label: 'مستندات الفرع' },
  { value: '/beneficiaries', label: 'المستفيدون' },
  { value: '/bus-transportation', label: 'الباصات' },
  { value: '/employee-expiry', label: 'التواريخ المنتهية' },
];

function ItemCell({ item }) {
  if (!item?.applicable) return <span className="ui-cell-sub" title="لا ينطبق">—</span>;
  const icon = item.done ? 'check-circle' : item.state === 'in_progress' ? 'clock' : 'x-circle';
  return (
    <span className={`ui-yc-item is-${item.done ? 'done' : item.state}`} title={item.detail}>
      <Icon name={icon} size={18} />
      <span className="ui-yc-item-text">{item.detail}</span>
    </span>
  );
}

const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('966') ? digits : `966${digits.replace(/^0/, '')}`;
  return `https://wa.me/${intl}`;
};

function exportCsv(rows) {
  const head = ['الفرع', 'النوع', 'الحالة', 'الإنجاز %', ...ITEMS.map((i) => i.label), 'آخر دخول'];
  const body = rows.map((b) => [
    b.name, TYPE_LABEL[b.branch_type], STATUS_LABEL[b.status], b.score,
    ...ITEMS.map((i) => (b.items[i.key]?.applicable ? b.items[i.key].detail : '—')),
    b.last_login_at ? String(b.last_login_at).slice(0, 10) : 'لم يدخل',
  ]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const csv = `﻿${[head, ...body].map((r) => r.map(esc).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `متابعة-السنة-الجديدة-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function YearCycle() {
  const { showSuccess, showError } = useNotification();
  const { confirm } = useConfirm();

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'score', dir: 'asc' });

  const [assignOpen, setAssignOpen] = useState(false);
  const [task, setTask] = useState({ title: '', description: '', due_date: '', deep_link: '', target: 'selected' });
  const [assigning, setAssigning] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlines, setDeadlines] = useState({});
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [reminding, setReminding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    yearCycleAPI.getCompliance()
      .then((res) => setData(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = normalizeSearch(search);
    const list = data.branches.filter((b) => {
      if (typeFilter && b.branch_type !== typeFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      return !q || normalizeSearch(b.name).includes(q);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'ar') * dir;
      if (sort.key === 'status') return (STATUS_LABEL[a.status]).localeCompare(STATUS_LABEL[b.status], 'ar') * dir;
      return (a.score - b.score) * dir;
    });
  }, [data, search, typeFilter, statusFilter, sort]);

  const sendReminders = async (ids) => {
    const targets = ids.filter((id) => data.branches.find((b) => b.id === id)?.status !== 'complete');
    if (targets.length === 0) { showError('كل الفروع المحددة أنهت التحديث'); return; }
    const ok = await confirm({
      title: 'إرسال تذكير',
      message: `سيصل ${targets.length} فرع إشعاراً في لوحة التحكم يوضح ما ينقصه تحديداً. لن يُرسل بريد إلكتروني.`,
      confirmText: 'إرسال التذكير',
    });
    if (!ok) return;
    setReminding(true);
    try {
      const res = await yearCycleAPI.remind(targets);
      showSuccess(`تم إرسال التذكير إلى ${res.data.data.sent} فرع`);
      setSelected(new Set());
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إرسال التذكير');
    } finally {
      setReminding(false);
    }
  };

  const assign = async (e) => {
    e.preventDefault();
    setAssigning(true);
    try {
      const body = { title: task.title, description: task.description, due_date: task.due_date || undefined, deep_link: task.deep_link || undefined };
      if (task.target === 'selected') body.branch_ids = [...selected];
      else body.branch_type = task.target;
      const res = await tasksAPI.assignManual(body);
      showSuccess(`تم إسناد المهمة إلى ${res.data.data.created} فرع`);
      setAssignOpen(false);
      setTask({ title: '', description: '', due_date: '', deep_link: '', target: 'selected' });
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إسناد المهمة');
    } finally {
      setAssigning(false);
    }
  };

  const saveDeadlines = async () => {
    setSavingDeadline(true);
    try {
      for (const [type, value] of Object.entries(deadlines)) {
        const year = data.years[type];
        if (year?.id && (value || '') !== (year.review_deadline ? String(year.review_deadline).slice(0, 10) : '')) {
          await yearCycleAPI.setDeadline(year.id, value || null);
        }
      }
      showSuccess('تم حفظ الموعد');
      setDeadlineOpen(false);
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل حفظ الموعد');
    } finally {
      setSavingDeadline(false);
    }
  };

  const columns = [
    {
      key: 'name', header: 'الفرع', sortable: true, mobilePrimary: true,
      render: (b) => (
        <div className="ui-cell-stack">
          <strong>{b.name}</strong>
          <span className="ui-cell-sub">{TYPE_LABEL[b.branch_type]}</span>
        </div>
      ),
    },
    ...ITEMS.filter((i) => i.key !== 'activity').map((i) => ({
      key: i.key, header: i.label, render: (b) => <ItemCell item={b.items[i.key]} />,
    })),
    { key: 'activity', header: 'النشاط', mobileHidden: true, render: (b) => <ItemCell item={b.items.activity} /> },
    {
      key: 'score', header: 'الإنجاز', sortable: true,
      render: (b) => (
        <div className="ui-score" role="progressbar" aria-valuenow={b.score} aria-valuemin={0} aria-valuemax={100} aria-label={`إنجاز ${b.name}`}>
          <span className={`ui-score-bar is-${b.status}`} style={{ width: `${b.score}%` }} />
          <span className="ui-score-text">{b.score}%</span>
        </div>
      ),
    },
    { key: 'status', header: 'الحالة', sortable: true, render: (b) => <Badge tone={STATUS_TONE[b.status]} dot>{STATUS_LABEL[b.status]}</Badge> },
    {
      key: 'actions', header: '', align: 'end',
      render: (b) => (
        <div className="ui-row-actions-group">
          {b.status !== 'complete' && <Button size="sm" variant="soft" icon="bell" onClick={() => sendReminders([b.id])}>تذكير</Button>}
          {waLink(b.phone_number) && b.status !== 'complete' && (
            <Button size="sm" variant="ghost" icon="phone" href={waLink(b.phone_number)} target="_blank" rel="noopener noreferrer" aria-label={`واتساب ${b.name}`} title="مراسلة على واتساب" />
          )}
        </div>
      ),
    },
  ];

  const years = data?.years || {};

  return (
    <Page>
      <PageHeader
        title="متابعة السنة الجديدة"
        subtitle="أي الفروع أنهت تحديث بياناتها وأيها لم تبدأ، وما الناقص بالضبط في كل فرع"
        actions={(
          <>
            <Button variant="secondary" icon="refresh" onClick={load} loading={loading && Boolean(data)}>تحديث</Button>
            <Button variant="secondary" icon="download" onClick={() => exportCsv(rows)} disabled={!data}>تصدير</Button>
            <Button variant="secondary" icon="calendar" onClick={() => { setDeadlines(Object.fromEntries(Object.entries(years).map(([t, y]) => [t, y.review_deadline ? String(y.review_deadline).slice(0, 10) : '']))); setDeadlineOpen(true); }} disabled={!data}>موعد الاعتماد</Button>
            <Button variant="primary" icon="plus" onClick={() => setAssignOpen(true)}>إسناد مهمة</Button>
          </>
        )}
      />

      {data && Object.entries(years).map(([type, y]) => (
        !y.label ? (
          <Alert key={type} tone="warning" title={`${TYPE_LABEL[type]}: لا توجد سنة دراسية جديدة`}>
            لم تُنشأ السنة الدراسية الجديدة بعد. أنشئها من صفحة السنة الدراسية والفصول لتبدأ مراجعة الموظفين.
          </Alert>
        ) : null
      ))}

      <div className="ui-grid-stats">
        <StatCard label="أنهت التحديث" value={data?.summary.complete} tone="success" icon="check-circle" loading={!data} hint={data ? `من ${data.summary.total} فرع` : undefined} />
        <StatCard label="جارٍ العمل" value={data?.summary.in_progress} tone="primary" icon="clock" loading={!data} />
        <StatCard label="لم تبدأ" value={data?.summary.not_started} tone="warning" icon="alert" loading={!data} />
        <StatCard label="متأخرة عن الموعد" value={data?.summary.overdue} tone="danger" icon="flag" loading={!data}
          hint={Object.values(years).some((y) => y.review_deadline) ? `الموعد: ${Object.values(years).filter((y) => y.review_deadline).map((y) => String(y.review_deadline).slice(0, 10))[0]}` : 'لم يُحدَّد موعد'} />
      </div>

      <Card flush>
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث باسم الفرع…" />
          <Select aria-label="نوع الفرع" className="ui-toolbar-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            options={[{ value: '', label: 'كل الأنواع' }, { value: 'school', label: 'مدارس' }, { value: 'healthcare_center', label: 'مراكز رعاية' }]} />
          <Select aria-label="الحالة" className="ui-toolbar-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: '', label: 'كل الحالات' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
        </Toolbar>

        {selected.size > 0 && (
          <div className="ui-bulkbar" role="region" aria-label="إجراءات جماعية">
            <strong>{selected.size} فرع محدد</strong>
            <div className="ui-inline-actions">
              <Button size="sm" variant="primary" icon="bell" loading={reminding} onClick={() => sendReminders([...selected])}>إرسال تذكير</Button>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => { setTask((t) => ({ ...t, target: 'selected' })); setAssignOpen(true); }}>إسناد مهمة</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
            </div>
          </div>
        )}

        <DataTable
          caption="تقدم الفروع في تحديث السنة الجديدة"
          columns={columns}
          rows={rows}
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={load}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          sort={sort}
          onSortChange={setSort}
          emptyIcon="building"
          emptyTitle="لا توجد فروع مطابقة"
        />
      </Card>

      <Modal
        open={assignOpen}
        onClose={assigning ? undefined : () => setAssignOpen(false)}
        title="إسناد مهمة للفروع"
        description="تظهر المهمة في لوحة تحكم الفرع بموعدها ورابطها حتى يضغط الفرع «تم»."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)} disabled={assigning}>إلغاء</Button>
            <Button variant="primary" type="submit" form="assign-form" loading={assigning} disabled={task.target === 'selected' && selected.size === 0}>إسناد المهمة</Button>
          </>
        )}
      >
        <form id="assign-form" onSubmit={assign} className="ui-form-stack">
          <FormField label="عنوان المهمة" required><Input value={task.title} onChange={(e) => setTask((t) => ({ ...t, title: e.target.value }))} minLength={3} maxLength={200} required /></FormField>
          <FormField label="تفاصيل (اختياري)"><Textarea value={task.description} onChange={(e) => setTask((t) => ({ ...t, description: e.target.value }))} rows={3} maxLength={1000} /></FormField>
          <div className="ui-form-grid">
            <FormField label="آخر موعد"><Input type="date" value={task.due_date} onChange={(e) => setTask((t) => ({ ...t, due_date: e.target.value }))} /></FormField>
            <FormField label="الصفحة المرتبطة"><Select value={task.deep_link} onChange={(e) => setTask((t) => ({ ...t, deep_link: e.target.value }))} options={LINK_PRESETS} /></FormField>
          </div>
          <FormField label="الفروع المستهدفة" required>
            <Select
              value={task.target}
              onChange={(e) => setTask((t) => ({ ...t, target: e.target.value }))}
              options={[
                { value: 'selected', label: `الفروع المحددة في الجدول (${selected.size})` },
                { value: 'school', label: 'كل المدارس' },
                { value: 'healthcare_center', label: 'كل مراكز الرعاية' },
                { value: 'all', label: 'كل الفروع' },
              ]}
            />
          </FormField>
          {task.target === 'selected' && selected.size === 0 && <Alert tone="info">حدّد فروعاً من الجدول أولاً، أو اختر مجموعة فروع من القائمة.</Alert>}
        </form>
      </Modal>

      <Modal
        open={deadlineOpen}
        onClose={savingDeadline ? undefined : () => setDeadlineOpen(false)}
        size="sm"
        title="موعد اعتماد مراجعة الموظفين"
        description="الفرع الذي لم يكمل بعد هذا التاريخ يظهر «متأخراً»."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDeadlineOpen(false)} disabled={savingDeadline}>إلغاء</Button>
            <Button variant="primary" onClick={saveDeadlines} loading={savingDeadline}>حفظ</Button>
          </>
        )}
      >
        <div className="ui-form-stack">
          {Object.entries(years).filter(([, y]) => y.id).map(([type, y]) => (
            <FormField key={type} label={`${TYPE_LABEL[type]} (${y.label})`}>
              <Input type="date" value={deadlines[type] || ''} onChange={(e) => setDeadlines((d) => ({ ...d, [type]: e.target.value }))} />
            </FormField>
          ))}
          {Object.values(years).every((y) => !y.id) && <Alert tone="warning">لا توجد سنة دراسية جديدة لتحديد موعد لها.</Alert>}
        </div>
      </Modal>
    </Page>
  );
}

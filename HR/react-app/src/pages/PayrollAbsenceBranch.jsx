/**
 * Payroll absences panel (branch managers; shown inside the dashboard task): enter each employee's excused / unexcused absence days for the month
 * when the entry window is open. Saving is allowed once per month; afterwards the saved sheet is read-only.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Alert, Button, Input, Textarea, DataTable, Skeleton, useConfirm } from '../ui';
import { payrollAbsenceAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import './PayrollAbsence.css';

const ddmmyyyy = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const mmyyyy = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const PayrollAbsenceBranch = ({ onComplete }) => {
  const { confirm } = useConfirm();
  const { showError, showSuccess } = useNotification();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [entries, setEntries] = useState({});

  const activeCycle = state?.active_cycle || state?.cycle;
  const cycleLabel = useMemo(() => (activeCycle?.month_start ? mmyyyy(activeCycle.month_start) : ''), [activeCycle]);

  const loadState = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await payrollAbsenceAPI.getBranchState();
      const data = res?.data?.data;
      setState(data);
      if (data?.employees?.length) {
        // Pre-filled by the server (includes the earlier submission when the window was re-opened)
        const defaults = {};
        data.employees.forEach((emp) => {
          defaults[emp.id] = { excused_absences: emp.excused_absences ?? 0, unexcused_absences: emp.unexcused_absences ?? 0, notes: emp.notes || '' };
        });
        setEntries(defaults);
      }
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'تعذر تحميل حالة الغياب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadState(); }, []);

  const setField = (id, field, value) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  const setDays = (id, field) => (e) => setField(id, field, Math.max(0, Number(e.target.value) || 0));

  const submit = async () => {
    if (!state?.employees?.length) return;
    const ok = await confirm({ title: 'حفظ الغيابات', message: 'سيتم الحفظ لمرة واحدة لهذا الشهر ولا يمكن التعديل بعد الحفظ. هل أنت متأكد؟', confirmText: 'حفظ' });
    if (!ok) return;
    setSaving(true);
    try {
      await payrollAbsenceAPI.submitBranch({
        entries: state.employees.map((emp) => ({
          employee_id: emp.id,
          excused_absences: parseInt(entries[emp.id]?.excused_absences, 10) || 0,
          unexcused_absences: parseInt(entries[emp.id]?.unexcused_absences, 10) || 0,
          notes: entries[emp.id]?.notes || '',
        })),
        cycle_id: activeCycle?.id,
      });
      showSuccess('تم الحفظ. للتعديل لاحقاً، يرجى مراسلة إدارة الموارد البشرية لفتح الإدخال.');
      await loadState();
      if (onComplete) onComplete();
    } catch (err) {
      showError(err?.response?.data?.message || 'فشل الحفظ، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const total = (id) => (entries[id]?.excused_absences || 0) + (entries[id]?.unexcused_absences || 0);

  const entryColumns = [
    {
      key: 'name', header: 'الموظف', mobilePrimary: true,
      render: (emp) => (<span>{emp.full_name}{emp.is_new && <> <Badge tone="info">جديد</Badge></>}</span>),
    },
    { key: 'id', header: 'رقم الهوية', mobileHidden: true, render: (emp) => <bdi>{emp.employee_id}</bdi> },
    { key: 'excused', header: 'أيام الغياب بعذر', width: '9rem', render: (emp) => <Input type="number" min="0" aria-label={`غياب بعذر: ${emp.full_name}`} value={entries[emp.id]?.excused_absences ?? 0} onChange={setDays(emp.id, 'excused_absences')} /> },
    { key: 'unexcused', header: 'أيام الغياب بدون عذر', width: '9rem', render: (emp) => <Input type="number" min="0" aria-label={`غياب بدون عذر: ${emp.full_name}`} value={entries[emp.id]?.unexcused_absences ?? 0} onChange={setDays(emp.id, 'unexcused_absences')} /> },
    { key: 'total', header: 'الإجمالي', align: 'center', render: (emp) => <strong>{total(emp.id)}</strong> },
    { key: 'notes', header: 'ملاحظات', render: (emp) => <Textarea rows={2} aria-label={`ملاحظات: ${emp.full_name}`} value={entries[emp.id]?.notes || ''} onChange={(e) => setField(emp.id, 'notes', e.target.value)} placeholder="ملاحظات إضافية" /> },
  ];

  const savedColumns = [
    { key: 'full_name', header: 'الموظف', mobilePrimary: true },
    { key: 'employee_id_number', header: 'رقم الهوية', mobileHidden: true, render: (r) => <bdi>{r.employee_id_number}</bdi> },
    { key: 'excused', header: 'غياب بعذر', align: 'center', render: (r) => r.excused_absences ?? 0 },
    { key: 'unexcused', header: 'غياب بدون عذر', align: 'center', render: (r) => r.unexcused_absences ?? 0 },
    { key: 'total', header: 'الإجمالي', align: 'center', render: (r) => r.absences ?? ((r.excused_absences ?? 0) + (r.unexcused_absences ?? 0)) },
    { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—' },
  ];

  if (loading) return <Skeleton lines={5} height={16} />;

  return (
    <div className="pa-panel">
      <div className="pa-meta">
        <Badge tone="info">الشهر: <bdi>{cycleLabel || 'غير محدد'}</bdi></Badge>
        {state?.last_submission && <Badge tone="success" dot>تم الحفظ في <bdi>{ddmmyyyy(state.last_submission.submitted_at)}</bdi></Badge>}
      </div>

      {loadError && <Alert tone="danger" action={<Button size="sm" variant="secondary" icon="refresh" onClick={loadState}>إعادة المحاولة</Button>}>{loadError}</Alert>}

      {(state?.state === 'countdown' || state?.state === 'countdown_next') && (
        <Alert tone="info" title="انتظار فتح التسجيل">
          يبدأ في {ddmmyyyy(state.target_open_at)} (بعد <bdi>{state.days_until_open}</bdi> يوماً). يفتح التسجيل تلقائياً في آخر يوم من الشهر.
        </Alert>
      )}
      {state?.state === 'view_only' && (
        <Alert tone="info" title="عرض البيانات المحفوظة">
          ينتهي العرض في {ddmmyyyy(state.view_until)}، وبعدها يظهر العد التنازلي للشهر التالي.
        </Alert>
      )}

      {state?.state === 'entry_open' && (
        <>
          <p className="pa-muted">أدخل عدد أيام الغياب وملاحظات كل موظف. الحفظ متاح مرة واحدة فقط لهذا الشهر.</p>
          <Card flush>
            <DataTable columns={entryColumns} rows={state.employees || []} rowKey="id" emptyIcon="users" emptyTitle="لا يوجد موظفون لتسجيل غيابهم" />
          </Card>
          <div>
            <Button variant="primary" icon="check" loading={saving} onClick={submit}>حفظ الغيابات</Button>
          </div>
        </>
      )}

      {state?.state === 'view_only' && (
        <Card title="الغيابات المحفوظة" flush>
          <DataTable columns={savedColumns} rows={state.entries || []} rowKey="employee_id" emptyIcon="clipboard" emptyTitle="لا توجد بيانات محفوظة" />
        </Card>
      )}
    </div>
  );
};

export default PayrollAbsenceBranch;

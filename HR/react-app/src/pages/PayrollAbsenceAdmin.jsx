/**
 * Payroll absences (head office): for a chosen month, which branches saved their absence sheet, re-open or close
 * a branch's entry, reset the month, inspect a branch's entries, and export to Excel.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, StatCard, Toolbar, Select, Input, FormField, Button, Badge, DataTable, Modal, Alert, useConfirm,
} from '../ui';
import { payrollAbsenceAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import './PayrollAbsence.css';

const ddmmyyyy = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const mmyyyy = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const STATUS = {
  entry_open: { text: 'مفتوح للتسجيل', tone: 'success' },
  view_only: { text: 'عرض فقط', tone: 'info' },
  closed: { text: 'مغلق', tone: 'neutral' },
};
const statusOf = (status) => STATUS[status] || { text: 'عد تنازلي', tone: 'warning' };

export default function PayrollAbsenceAdmin() {
  const { confirm } = useConfirm();
  const { showError, showSuccess } = useNotification();

  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null); // null | 'reopen' | 'close' | 'reset' | 'export'
  const [selected, setSelected] = useState(new Set());
  const [reopenNote, setReopenNote] = useState('');
  const [reopenUntil, setReopenUntil] = useState('');
  const [detail, setDetail] = useState(null); // { branch, data }
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCycles = async () => {
    setLoading(true);
    try {
      const res = await payrollAbsenceAPI.getCycles();
      const data = res?.data?.data || [];
      setCycles(data);
      if (data.length > 0) {
        const now = new Date();
        const current = data.find((c) => { const d = new Date(c.month_start); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
        setCycleId((current || data[0]).id);
      } else {
        setCycleId(null);
      }
    } catch (err) {
      showError(err?.response?.data?.message || 'فشل تحميل الأشهر');
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async (id) => {
    if (!id) return;
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await payrollAbsenceAPI.getBranches(id);
      setBranches(res?.data?.data?.branches || []);
    } catch (err) {
      showError(err?.response?.data?.message || 'فشل تحميل فروع الشهر');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCycles(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (cycleId) loadBranches(cycleId); }, [cycleId]);

  const summary = useMemo(() => ({
    submitted: branches.filter((b) => (b.submission_count || 0) > 0).length,
    entryOpen: branches.filter((b) => b.status === 'entry_open' || b.manual_opened).length,
    totalAbsences: branches.reduce((sum, b) => sum + (parseInt(b.total_absences, 10) || 0), 0),
  }), [branches]);

  const allSelected = branches.length > 0 && selected.size === branches.length;
  const ids = () => Array.from(selected);

  const run = async (kind, action, doneMessage, failMessage) => {
    setProcessing(kind);
    try {
      const result = await action();
      showSuccess(doneMessage);
      if (kind !== 'export') await loadBranches(cycleId);
      return result;
    } catch (err) {
      showError(err?.response?.data?.message || failMessage);
      return null;
    } finally {
      setProcessing(null);
    }
  };

  const reopen = () => run('reopen', () => payrollAbsenceAPI.reopenBranches({ cycle_id: cycleId, branch_ids: ids(), note: reopenNote || null, manual_expires_at: reopenUntil || null }), 'تم فتح الفروع المختارة لإعادة الإدخال', 'فشل إعادة الفتح');
  const close = () => run('close', () => payrollAbsenceAPI.closeBranches({ cycle_id: cycleId, branch_ids: ids() }), 'تم إغلاق الإدخال للفروع المختارة', 'فشل إغلاق الإدخال');
  const exportExcel = async () => {
    const res = await run('export', () => payrollAbsenceAPI.exportBranches({ cycle_id: cycleId, branch_ids: ids() }), 'تم إنشاء ملف الإكسل', 'فشل إنشاء ملف الإكسل');
    if (res) downloadFile(new Blob([res.data]), 'branch-absences.xlsx');
  };
  const reset = async () => {
    const ok = await confirm({
      title: 'إعادة تعيين الشهر',
      message: 'سيتم إعادة تعيين الشهر الحالي لجميع الفروع إلى حالة العد التنازلي وحذف البيانات المحفوظة. هل أنت متأكد؟',
      tone: 'danger',
      confirmText: 'إعادة التعيين',
    });
    if (ok) run('reset', () => payrollAbsenceAPI.resetCycle({ cycle_id: cycleId }), 'تمت إعادة تعيين الشهر وإرجاع جميع الفروع إلى العد التنازلي', 'فشل إعادة التعيين');
  };

  const openDetail = async (branch) => {
    setDetail({ branch, data: null });
    setDetailLoading(true);
    try {
      const res = await payrollAbsenceAPI.getBranchEntries(cycleId, branch.branch_id);
      setDetail({ branch, data: res?.data?.data || { entries: [] } });
    } catch {
      setDetail({ branch, data: { entries: [] } });
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    { key: 'branch_name', header: 'الفرع', mobilePrimary: true, render: (b) => <strong>{b.branch_name}</strong> },
    { key: 'status', header: 'الحالة', render: (b) => { const s = statusOf(b.status); return <Badge tone={s.tone} dot>{s.text}</Badge>; } },
    { key: 'submission_count', header: 'مرات الحفظ', align: 'center', render: (b) => b.submission_count || 0 },
    { key: 'total_excused', header: 'غياب بعذر', align: 'center', render: (b) => b.total_excused || 0 },
    { key: 'total_unexcused', header: 'غياب بدون عذر', align: 'center', render: (b) => b.total_unexcused || 0 },
    { key: 'total_absences', header: 'الإجمالي', align: 'center', render: (b) => <strong>{b.total_absences || 0}</strong> },
    { key: 'last', header: 'آخر حفظ', mobileHidden: true, render: (b) => ddmmyyyy(b.last_submitted_at) },
    { key: 'details', header: '', align: 'end', render: (b) => <Button size="sm" variant="soft" icon="eye" onClick={() => openDetail(b)}>التفاصيل</Button> },
  ];

  const entryColumns = [
    { key: 'full_name', header: 'الموظف', mobilePrimary: true },
    { key: 'employee_id_number', header: 'رقم الهوية', mobileHidden: true, render: (r) => <bdi>{r.employee_id_number}</bdi> },
    { key: 'excused', header: 'بعذر', align: 'center', render: (r) => r.excused_absences ?? 0 },
    { key: 'unexcused', header: 'بدون عذر', align: 'center', render: (r) => r.unexcused_absences ?? 0 },
    { key: 'total', header: 'الإجمالي', align: 'center', render: (r) => r.absences ?? ((r.excused_absences ?? 0) + (r.unexcused_absences ?? 0)) },
    { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—' },
  ];

  return (
    <Page>
      <PageHeader title="مسيرات الرواتب" subtitle="متابعة إدخال غيابات الموظفين الشهرية لكل فرع" />

      <div className="ui-grid-stats">
        <StatCard label="الفروع" value={branches.length} icon="building" tone="primary" loading={loading && branches.length === 0} />
        <StatCard label="تم الحفظ" value={summary.submitted} icon="check-circle" tone="success" loading={loading && branches.length === 0} />
        <StatCard label="مفتوح الآن" value={summary.entryOpen} icon="clock" tone="warning" loading={loading && branches.length === 0} />
        <StatCard label="إجمالي الغيابات" value={summary.totalAbsences} icon="chart" tone="danger" loading={loading && branches.length === 0} />
      </div>

      <Card flush>
        <Toolbar>
          <FormField label="الشهر" className="pa-filter">
            <Select value={cycleId ? String(cycleId) : ''} onChange={(e) => setCycleId(e.target.value ? parseInt(e.target.value, 10) : null)} options={cycles.map((c) => ({ value: String(c.id), label: mmyyyy(c.month_start) }))} />
          </FormField>
          <FormField label="ملاحظة إعادة الفتح" className="pa-filter">
            <Input value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} placeholder="اختياري" />
          </FormField>
          <FormField label="حد زمني لإعادة الفتح" className="pa-filter">
            <Input type="date" value={reopenUntil} onChange={(e) => setReopenUntil(e.target.value)} />
          </FormField>
        </Toolbar>
        <Toolbar>
          <Button variant="secondary" onClick={() => setSelected(allSelected ? new Set() : new Set(branches.map((b) => b.branch_id)))} disabled={loading || branches.length === 0}>{allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</Button>
          <Badge tone="info"><bdi>{selected.size}</bdi> محدد</Badge>
          <Button variant="primary" icon="refresh" loading={processing === 'reopen'} disabled={Boolean(processing) || selected.size === 0} onClick={reopen}>فتح إدخال يدوي</Button>
          <Button variant="secondary" icon="lock" loading={processing === 'close'} disabled={Boolean(processing) || selected.size === 0} onClick={close}>إغلاق الإدخال</Button>
          <Button variant="secondary" icon="download" loading={processing === 'export'} disabled={Boolean(processing) || selected.size === 0} onClick={exportExcel}>تصدير إكسل</Button>
          <Button variant="danger" icon="restore" loading={processing === 'reset'} disabled={Boolean(processing) || !cycleId} onClick={reset} className="pa-push">إعادة تعيين الشهر</Button>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={branches}
          rowKey="branch_id"
          loading={loading}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          emptyIcon="building"
          emptyTitle="لا توجد فروع لهذا الشهر"
        />
      </Card>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `تفاصيل الموظفين · ${detail.branch.branch_name}` : ''} size="xl">
        {detail && (detailLoading || !detail.data ? <p className="pa-muted">جاري التحميل…</p> : detail.data.entries?.length ? (
          <DataTable columns={entryColumns} rows={detail.data.entries} rowKey="employee_id" dense />
        ) : <Alert tone="info">لا توجد بيانات محفوظة لهذا الفرع.</Alert>)}
      </Modal>
    </Page>
  );
}

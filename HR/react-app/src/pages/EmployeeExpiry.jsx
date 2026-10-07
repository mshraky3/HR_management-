/**
 * Expiring employee dates: ID / residency, contract, passport and document expiry across the branch (branch
 * manager) or every branch (head office). Update a date in place, export to Excel, ask a branch to update a
 * date, or notify several branches at once.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Page, PageHeader, Card, Tabs, Toolbar, Select, Chip, ChipGroup, Button, IconButton, Badge, Input, Modal, FormField,
  Textarea, DataTable, Pagination, Alert,
} from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { employeeExpiryAPI, branchesAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import './EmployeeExpiry.css';

const STATUS_LABELS = { expired: 'منتهي', within_30_days: 'خلال 30 يوم', within_90_days: 'خلال 90 يوم', ok: 'ساري' };
const STATUS_TONE = { expired: 'danger', within_30_days: 'warning', within_90_days: 'info', ok: 'success' };
const TYPE_LABELS = { id_expiry: 'الهوية/الإقامة', contract_end: 'العقد', passport_expiry: 'الجواز', document_expiry: 'مستند' };
const PAGE_SIZE = 50;

const fullName = (row) => [row.first_name, row.second_name, row.third_name, row.fourth_name].filter(Boolean).join(' ');
const rowKey = (row) => `${row.employee_id}-${row.expiry_type}-${row.document_id || ''}`;
const isoDay = (value) => (value ? new Date(value).toISOString().split('T')[0] : '');

const prefillTaskMessage = (row) => {
  const lines = [
    `يرجى مراجعة وتحديث تاريخ الموظف: ${fullName(row) || 'غير محدد'}`,
    `نوع التاريخ: ${row.expiry_type_label || TYPE_LABELS[row.expiry_type] || row.expiry_type}`,
    `التاريخ الحالي (ميلادي): ${row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('en-CA') : '-'}`,
  ];
  if (row.expiry_date_hijri) lines.push(`التاريخ الحالي (هجري): ${row.expiry_date_hijri}`);
  lines.push('الرجاء تحديثه في أسرع وقت.');
  return lines.join('\n');
};

function DaysBadge({ days }) {
  if (Math.abs(days) > 20000) return <Badge tone="neutral">تاريخ غير صحيح</Badge>;
  if (days < 0) return <Badge tone="danger">متأخر <bdi>{Math.abs(days)}</bdi> يوم</Badge>;
  return <Badge tone={days <= 30 ? 'warning' : days <= 90 ? 'info' : 'success'}><bdi>{days}</bdi> يوم</Badge>;
}

export default function EmployeeExpiry() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess } = useNotification();
  const isMain = isMainManager();

  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const [filterBranch, setFilterBranch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const [editingKey, setEditingKey] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editDateHijri, setEditDateHijri] = useState('');
  const [saving, setSaving] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState([]);

  const [taskRow, setTaskRow] = useState(null);
  const [taskMessage, setTaskMessage] = useState('');
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  const filterParams = useCallback(() => {
    const params = {};
    if (filterBranch) params.branch_id = filterBranch;
    if (filterType) params.expiry_type = filterType;
    if (filterStatus) params.status_bucket = filterStatus;
    return params;
  }, [filterBranch, filterType, filterStatus]);

  const loadList = useCallback(async () => {
    try {
      setListLoading(true);
      const res = await employeeExpiryAPI.getList({ page, limit: PAGE_SIZE, ...filterParams() });
      if (res?.data?.success) {
        setRecords(res.data.data || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      showError('فشل تحميل القائمة');
    } finally {
      setListLoading(false);
    }
  }, [page, filterParams, showError]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    (async () => {
      try {
        const [summaryRes, branchesRes] = await Promise.all([
          employeeExpiryAPI.getSummary(),
          isMain ? branchesAPI.getAll({ is_active: true }) : Promise.resolve(null),
        ]);
        if (summaryRes?.data?.success) setSummary(summaryRes.data.data);
        if (branchesRes?.data?.success) setBranches(branchesRes.data.data || []);
      } catch {
        showError('فشل تحميل البيانات');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelEdit = () => { setEditingKey(null); setEditDate(''); setEditDateHijri(''); };

  const startEdit = (row) => {
    setEditingKey(rowKey(row));
    setEditDate(isoDay(row.expiry_date));
    setEditDateHijri(row.expiry_date_hijri || '');
  };

  const saveEdit = async (row) => {
    if (!editDate) { showError('يرجى إدخال التاريخ'); return; }
    try {
      setSaving(true);
      const payload = { employee_id: row.employee_id, expiry_type: row.expiry_type, new_date: editDate, new_date_hijri: editDateHijri || undefined };
      if (row.document_id) payload.document_id = row.document_id;
      const res = await employeeExpiryAPI.updateDate(payload);
      if (res?.data?.success) {
        showSuccess('تم تحديث التاريخ بنجاح');
        cancelEdit();
        const [, summaryRes] = await Promise.all([loadList(), employeeExpiryAPI.getSummary()]);
        if (summaryRes?.data?.success) setSummary(summaryRes.data.data);
      }
    } catch (err) {
      showError(err.response?.data?.message || 'فشل تحديث التاريخ');
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    try {
      setExporting(true);
      const res = await employeeExpiryAPI.exportExcel(filterParams());
      downloadFile(new Blob([res.data]), `employee-expiry-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('تم تحميل التقرير بنجاح');
    } catch {
      showError('فشل تحميل التقرير');
    } finally {
      setExporting(false);
    }
  };

  const notifyBranches = async () => {
    if (selectedBranches.length === 0) { showError('يرجى اختيار فرع واحد على الأقل'); return; }
    try {
      setNotifying(true);
      const res = await employeeExpiryAPI.notifyBranches({ branch_ids: selectedBranches });
      if (res?.data?.success) {
        const sent = res.data.data.filter((r) => r.status === 'sent').length;
        const skipped = res.data.data.filter((r) => r.status === 'skipped').length;
        showSuccess(`تم إرسال التنبيهات: ${sent} فرع. تم تجاوز: ${skipped} فرع (بدون تواريخ منتهية).`);
        setSelectedBranches([]);
      }
    } catch {
      showError('فشل إرسال التنبيهات');
    } finally {
      setNotifying(false);
    }
  };

  const sendRowTask = async () => {
    if (!taskRow) return;
    try {
      setTaskSubmitting(true);
      const res = await employeeExpiryAPI.requestUpdateTask({
        employee_id: taskRow.employee_id,
        branch_id: taskRow.branch_id,
        expiry_type: taskRow.expiry_type,
        expiry_type_label: taskRow.expiry_type_label,
        current_expiry_date: isoDay(taskRow.expiry_date),
        current_expiry_date_hijri: taskRow.expiry_date_hijri || undefined,
        status_bucket: taskRow.status_bucket,
        document_id: taskRow.document_id || undefined,
        custom_message: taskMessage,
        employee_name: fullName(taskRow),
      });
      if (res?.data?.success) {
        showSuccess('تم إرسال مهمة تحديث التاريخ للفرع');
        setTaskRow(null);
      }
    } catch (err) {
      showError(err?.response?.status === 409 ? 'يوجد طلب تحديث مفتوح بالفعل لهذا التاريخ' : err.response?.data?.message || 'فشل إرسال مهمة التحديث');
    } finally {
      setTaskSubmitting(false);
    }
  };

  const toggle = (setter, value) => { setter((prev) => (prev === value ? '' : value)); setPage(1); };
  const totals = summary?.totals || {};
  const grand = (totals.expired || 0) + (totals.within_30_days || 0) + (totals.within_90_days || 0) + (totals.ok || 0);

  const columns = [
    {
      key: 'employee', header: 'الموظف', mobilePrimary: true,
      render: (row) => (<span className="ex-name"><strong>{fullName(row)}</strong>{row.employee_id_number && <small>{row.employee_id_number}</small>}</span>),
    },
    { key: 'id', header: 'رقم الهوية', mobileHidden: true, render: (row) => (row.id_or_residency_number ? <bdi>{row.id_or_residency_number}</bdi> : '—') },
    ...(isMain ? [{ key: 'branch', header: 'الفرع', mobileHidden: true, render: (row) => row.branch_name }] : []),
    { key: 'type', header: 'النوع', render: (row) => <Badge tone="neutral">{row.expiry_type_label}</Badge> },
    {
      key: 'date', header: 'تاريخ الانتهاء',
      render: (row) => (editingKey === rowKey(row) ? (
        <span className="ex-edit">
          <Input type="date" aria-label="تاريخ الانتهاء الميلادي" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
          <Input aria-label="تاريخ الانتهاء الهجري" value={editDateHijri} onChange={(e) => setEditDateHijri(e.target.value)} placeholder="هجري (اختياري)" dir="ltr" />
        </span>
      ) : (
        <span className="ex-name">
          <bdi>{row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('en-CA') : '—'}</bdi>
          {row.expiry_date_hijri && <small>{row.expiry_date_hijri}</small>}
        </span>
      )),
    },
    { key: 'days', header: 'المتبقي', render: (row) => <DaysBadge days={row.days_until_expiry} /> },
    { key: 'status', header: 'الحالة', render: (row) => <Badge tone={STATUS_TONE[row.status_bucket]} dot>{STATUS_LABELS[row.status_bucket]}</Badge> },
    {
      key: 'actions', header: '', align: 'end',
      render: (row) => (editingKey === rowKey(row) ? (
        <span className="ex-actions">
          <Button size="sm" variant="primary" icon="check" loading={saving} onClick={() => saveEdit(row)}>حفظ</Button>
          <IconButton icon="x" label="إلغاء" onClick={cancelEdit} />
        </span>
      ) : (
        <span className="ex-actions">
          <IconButton icon="edit" label="تعديل التاريخ" onClick={() => startEdit(row)} />
          {isMain && <Button size="sm" variant="soft" icon="flag" onClick={() => { setTaskRow(row); setTaskMessage(prefillTaskMessage(row)); }}>طلب تحديث</Button>}
        </span>
      )),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="التواريخ المنتهية"
        subtitle="متابعة وتحديث تواريخ انتهاء الهوية والعقد والجواز ومستندات الموظفين"
        actions={isMain ? <Button variant="primary" icon="download" loading={exporting} onClick={exportExcel}>تصدير Excel</Button> : null}
      />

      <Tabs
        value={filterStatus || 'all'}
        onChange={(id) => { setFilterStatus(id === 'all' ? '' : id); setPage(1); }}
        ariaLabel="تصفية حسب الحالة"
        items={[
          { id: 'all', label: 'الكل', count: summary ? grand : undefined },
          { id: 'expired', label: 'منتهي', count: totals.expired || 0 },
          { id: 'within_30_days', label: 'خلال 30 يوم', count: totals.within_30_days || 0 },
          { id: 'within_90_days', label: 'خلال 90 يوم', count: totals.within_90_days || 0 },
          { id: 'ok', label: 'ساري', count: totals.ok || 0 },
        ]}
      />

      {summary?.byType && (
        <Card title="حسب نوع التاريخ" subtitle="اضغط على نوع لتصفية القائمة">
          <ChipGroup aria-label="نوع التاريخ">
            {Object.entries(summary.byType).map(([type, data]) => (
              <Chip key={type} selected={filterType === type} onClick={() => toggle(setFilterType, type)}>
                {TYPE_LABELS[type] || data.label}
                {(data.expired > 0 || data.within_30_days > 0) ? ` · ${data.expired || 0} منتهي · ${data.within_30_days || 0} قريب` : ''}
              </Chip>
            ))}
          </ChipGroup>
        </Card>
      )}

      {isMain && summary?.byBranch?.length > 0 && (
        <Card
          title="إرسال تنبيهات للفروع"
          subtitle="يصل التنبيه بالبريد لمن لديه بريد مسجّل"
          actions={(
            <>
              <Button size="sm" variant="soft" onClick={() => setSelectedBranches(summary.byBranch.map((b) => b.branch_id))}>تحديد الكل</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedBranches([])}>إلغاء التحديد</Button>
              <Button size="sm" variant="primary" icon="mail" loading={notifying} disabled={selectedBranches.length === 0} onClick={notifyBranches}>إرسال تنبيه (<bdi>{selectedBranches.length}</bdi>)</Button>
            </>
          )}
        >
          <ChipGroup aria-label="الفروع">
            {summary.byBranch.map((b) => (
              <Chip
                key={b.branch_id}
                selected={selectedBranches.includes(b.branch_id)}
                onClick={() => setSelectedBranches((prev) => (prev.includes(b.branch_id) ? prev.filter((id) => id !== b.branch_id) : [...prev, b.branch_id]))}
              >
                {b.branch_name}{b.expired_count > 0 ? ` · ${b.expired_count} منتهي` : ''}{b.expiring_soon_count > 0 ? ` · ${b.expiring_soon_count} قريب` : ''}{!b.branch_email ? ' · بدون بريد' : ''}
              </Chip>
            ))}
          </ChipGroup>
        </Card>
      )}

      <Card flush>
        {isMain && (
          <Toolbar>
            <Select
              aria-label="الفرع"
              className="ex-filter"
              value={filterBranch}
              onChange={(e) => { setFilterBranch(e.target.value); setPage(1); }}
              options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
              placeholder="كل الفروع"
            />
            <Badge tone="neutral">إجمالي النتائج <bdi>{total}</bdi></Badge>
          </Toolbar>
        )}
        <DataTable
          columns={columns}
          rows={records}
          rowKey={rowKey}
          loading={listLoading}
          emptyIcon="check-circle"
          emptyTitle="لا توجد نتائج مطابقة"
          emptyDescription="جرّب تغيير الفلاتر."
         
          footer={total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} pageSizeOptions={[PAGE_SIZE]} /> : null}
        />
      </Card>

      <Modal
        open={Boolean(taskRow)}
        onClose={() => !taskSubmitting && setTaskRow(null)}
        title="إرسال مهمة تحديث للفرع"
        description="سيتم إنشاء مهمة للفرع لمراجعة وتحديث هذا التاريخ."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setTaskRow(null)} disabled={taskSubmitting}>إلغاء</Button>
            <Button variant="primary" loading={taskSubmitting} onClick={sendRowTask}>إرسال المهمة</Button>
          </>
        )}
      >
        <FormField label="رسالة المهمة">
          <Textarea rows={7} value={taskMessage} onChange={(e) => setTaskMessage(e.target.value)} placeholder="اكتب رسالة المهمة" />
        </FormField>
        {!taskMessage.trim() && <Alert tone="warning">الرسالة فارغة: سيصل الفرع طلب بلا نص.</Alert>}
      </Modal>
    </Page>
  );
}

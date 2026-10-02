import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, FormField, Select, Alert, Badge, DataTable, Checkbox, Icon } from '../../ui';
import { employeeImportAPI } from '../../utils/api';
import { downloadFile } from '../../utils/downloadFile';
import { useNotification } from '../../contexts/NotificationContext';

const STATUS = {
  ok: ['جاهز', 'success'],
  error: ['به أخطاء', 'danger'],
  duplicate: ['مكرر', 'warning'],
};

/**
 * ImportModal: add many employees from an Excel file.
 * 1) pick the branch (head office) and download the template, 2) upload and review what will happen
 * (nothing is written yet), 3) import the rows that passed. Documents and the remaining fields are
 * completed afterwards from each employee's page.
 */
export default function ImportModal({ open, onClose, isMain, branches, onDone }) {
  const { showError, showSuccess } = useNotification();
  const fileRef = useRef(null);
  const [branchId, setBranchId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) { setBranchId(''); setFile(null); setPreview(null); setError(''); setResult(null); setOnlyProblems(false); }
  }, [open]);

  const needsBranch = isMain && !branchId;

  const downloadTemplate = async () => {
    try {
      const res = await employeeImportAPI.template();
      downloadFile(res.data, 'employees-template.xlsx');
    } catch {
      showError('تعذّر تحميل القالب');
    }
  };

  const check = async () => {
    setError('');
    setBusy('preview');
    try {
      const res = await employeeImportAPI.preview(file, branchId || undefined);
      setPreview(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'تعذّر فحص الملف');
    } finally {
      setBusy('');
    }
  };

  const commit = async () => {
    setError('');
    setBusy('commit');
    try {
      const rows = preview.rows.filter((r) => r.status === 'ok').map((r) => r.raw);
      const res = await employeeImportAPI.commit(branchId || undefined, rows);
      setResult(res.data.data);
      showSuccess(`تمت إضافة ${res.data.data.created} موظف`);
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.message || 'فشل الاستيراد');
    } finally {
      setBusy('');
    }
  };

  const shownRows = useMemo(
    () => (preview ? preview.rows.filter((r) => !onlyProblems || r.status !== 'ok') : []),
    [preview, onlyProblems],
  );

  const columns = [
    { key: 'row', header: 'السطر', width: '4.5rem', render: (r) => <bdi>{r.row}</bdi> },
    {
      key: 'name', header: 'الموظف', mobilePrimary: true,
      render: (r) => (
        <div className="ui-cell-stack">
          <strong>{[r.data.first_name, r.data.second_name, r.data.third_name, r.data.fourth_name].filter(Boolean).join(' ') || '—'}</strong>
          <bdi className="ui-cell-sub">{r.data.id_or_residency_number || '—'}</bdi>
        </div>
      ),
    },
    { key: 'job', header: 'المسمى', mobileHidden: true, render: (r) => r.data.job_title || '—' },
    { key: 'status', header: 'النتيجة', render: (r) => <Badge tone={STATUS[r.status][1]} dot>{STATUS[r.status][0]}</Badge> },
    {
      key: 'errors', header: 'الملاحظات',
      render: (r) => (r.errors.length ? <ul className="ui-error-list">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : '—'),
    },
  ];

  const step = result ? 'done' : preview ? 'review' : 'upload';

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      size={step === 'review' ? 'xl' : 'md'}
      title="استيراد موظفين من Excel"
      description={step === 'upload' ? 'أضف عدة موظفين دفعة واحدة بدل إدخالهم واحداً واحداً' : undefined}
      footer={(
        <>
          {step === 'upload' && (
            <>
              <Button variant="secondary" onClick={onClose}>إغلاق</Button>
              <Button variant="primary" icon="upload" onClick={check} loading={busy === 'preview'} disabled={!file || needsBranch}>فحص الملف</Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={Boolean(busy)}>اختيار ملف آخر</Button>
              <Button variant="primary" icon="check" onClick={commit} loading={busy === 'commit'} disabled={preview.counts.ok === 0}>
                استيراد {preview.counts.ok} موظف
              </Button>
            </>
          )}
          {step === 'done' && <Button variant="primary" onClick={onClose}>تم</Button>}
        </>
      )}
    >
      {error && <Alert tone="danger">{error}</Alert>}

      {step === 'upload' && (
        <div className="ui-form-stack">
          <ol className="ui-steps">
            <li>
              <strong>حمّل القالب</strong>
              <span>ملف Excel جاهز بالأعمدة المطلوبة وتعليمات التعبئة.</span>
              <Button variant="secondary" size="sm" icon="download" onClick={downloadTemplate}>تحميل القالب</Button>
            </li>
            {isMain && (
              <li>
                <strong>اختر الفرع</strong>
                <FormField label="الفرع الذي ستُضاف إليه الموظفون" required>
                  <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="اختر الفرع"
                    options={branches.filter((b) => b.is_active).map((b) => ({ value: String(b.id), label: b.branch_name }))} />
                </FormField>
              </li>
            )}
            <li>
              <strong>ارفع الملف بعد تعبئته</strong>
              <input ref={fileRef} type="file" accept=".xlsx" className="ui-file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && <span className="ui-cell-sub"><Icon name="file" size={14} /> {file.name}</span>}
            </li>
          </ol>
        </div>
      )}

      {step === 'review' && (
        <div className="ui-form-stack">
          <div className="ui-chips">
            <Badge tone="success" dot>{preview.counts.ok} جاهز للاستيراد</Badge>
            {preview.counts.error > 0 && <Badge tone="danger" dot>{preview.counts.error} به أخطاء</Badge>}
            {preview.counts.duplicate > 0 && <Badge tone="warning" dot>{preview.counts.duplicate} مكرر</Badge>}
            <span className="ui-cell-sub">الفرع: {preview.branch.name}</span>
          </div>
          {(preview.counts.error > 0 || preview.counts.duplicate > 0) && (
            <Alert tone="warning">
              لن تُستورد الصفوف التي بها أخطاء أو المكررة. يمكنك استيراد الجاهزة الآن وتصحيح الباقي في الملف ثم رفعه مرة أخرى.
            </Alert>
          )}
          <Checkbox checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} label="عرض الصفوف التي بها مشاكل فقط" />
          <DataTable caption="معاينة الاستيراد" columns={columns} rows={shownRows} rowKey="row" dense emptyIcon="check-circle" emptyTitle="لا توجد مشاكل" />
        </div>
      )}

      {step === 'done' && (
        <div className="ui-form-stack">
          <Alert tone="success" title={`تمت إضافة ${result.created} موظف`}>
            {result.skipped > 0 ? `تم تخطي ${result.skipped} صفاً (أخطاء أو مكرر).` : 'كل الصفوف أُضيفت.'}
            {' '}الموظفون الجدد بياناتهم غير مكتملة: أكمل المستندات والبيانات الناقصة من صفحة الموظفين.
          </Alert>
        </div>
      )}
    </Modal>
  );
}

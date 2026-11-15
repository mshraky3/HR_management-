/**
 * Partnerships of a healthcare centre (الشراكات): government or private partners, the service they give, contact, contract.
 *
 *   <PartnershipsPanel branchId={12} />   one branch (no branch column or filter)
 *   <PartnershipsPanel />                 all branches the user may see (branch column, branch filter, branch in the form)
 *
 * List with one search box and a government / private filter, add / edit / delete, optional contract file.
 */
import { useMemo, useState } from 'react';
import { Card, Button, Badge, Modal, FormField, Input, Select, Textarea, SearchInput, Toolbar, DataTable, CopyText, useConfirm } from '../../ui';
import { branchPartnershipsAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/dateConverters';
import { uploadErrorMessage } from '../../utils/uploadLimits';
import UnifiedDatePicker from '../UnifiedDatePicker.jsx';
import { RecordFileField, RecordFileName, RecordActions, RecordPreviewModal } from './RecordParts';
import {
  isoDay, daysUntilDay, errorText, useDebouncedValue, useRecordList, useHealthcareBranches, useRecordFiles,
} from './recordHelpers';
import './BranchRecords.css';

const PARTNER_TYPES = [
  { value: 'government', label: 'حكومي' },
  { value: 'private', label: 'غير حكومي (خاص)' },
];
const TYPE_BADGE = {
  government: { label: 'حكومي', tone: 'info' },
  private: { label: 'خاص', tone: 'neutral' },
};

const EMPTY_FORM = {
  branch_id: '', partner_name: '', partner_type: '', service_type: '', description: '', contact_name: '', contact_phone: '',
  contract_start_date: '', contract_start_date_hijri: '', contract_end_date: '', contract_end_date_hijri: '', file: null, remove_file: false,
};

const TEXT_KEYS = ['partner_name', 'partner_type', 'service_type', 'description', 'contact_name', 'contact_phone'];
const DATE_KEYS = ['contract_start_date', 'contract_start_date_hijri', 'contract_end_date', 'contract_end_date_hijri'];

/** Display only: expired / ends within 30 days / valid. */
function contractStatus(row) {
  const days = daysUntilDay(row.contract_end_date);
  if (days === null) return null;
  if (days < 0) return { label: 'منتهي', tone: 'danger' };
  if (days <= 30) return { label: 'ينتهي قريباً', tone: 'warning' };
  return { label: 'ساري', tone: 'success' };
}

function DateLine({ day, hijri }) {
  if (!day && !hijri) return <span>—</span>;
  return (
    <span className="br-date">
      {day && <span>{formatDate(day)}</span>}
      {hijri && <span className="br-sub">{hijri} هـ</span>}
    </span>
  );
}

export default function PartnershipsPanel({ branchId = null }) {
  const allBranches = !branchId;
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'edit' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { branches } = useHealthcareBranches(allBranches);
  const files = useRecordFiles(branchPartnershipsAPI);

  const filters = useMemo(
    () => ({ branch_id: allBranches ? branchFilter : branchId, search: debouncedSearch, partner_type: typeFilter }),
    [allBranches, branchFilter, branchId, debouncedSearch, typeFilter],
  );
  const { rows, loading, failed, reload } = useRecordList(branchPartnershipsAPI, filters);
  const hasFilters = Boolean(search || branchFilter || typeFilter);

  // ---- form ------------------------------------------------------------------------------------------------------------
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const text = (key) => ({ value: form[key], onChange: (e) => set({ [key]: e.target.value }) });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      branch_id: allBranches ? (branches.length === 1 ? String(branches[0].id) : (branchFilter || '')) : String(branchId),
      partner_type: typeFilter,
    });
    setMode('create');
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      ...EMPTY_FORM,
      branch_id: String(row.branch_id),
      partner_name: row.partner_name || '',
      partner_type: row.partner_type || '',
      service_type: row.service_type || '',
      description: row.description || '',
      contact_name: row.contact_name || '',
      contact_phone: row.contact_phone || '',
      contract_start_date: isoDay(row.contract_start_date),
      contract_start_date_hijri: row.contract_start_date_hijri || '',
      contract_end_date: isoDay(row.contract_end_date),
      contract_end_date_hijri: row.contract_end_date_hijri || '',
    });
    setMode('edit');
  };

  const closeForm = () => {
    if (saving) return;
    setMode(null);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.partner_name.trim()) { showWarning('اسم الجهة مطلوب'); return; }
    if (!form.partner_type) { showWarning('الرجاء اختيار نوع الشراكة (حكومي أو غير حكومي)'); return; }
    if (mode === 'create' && !form.branch_id) { showWarning('الرجاء اختيار الفرع'); return; }
    if (form.contract_start_date && form.contract_end_date && form.contract_end_date < form.contract_start_date) {
      showWarning('تاريخ نهاية العقد قبل تاريخ بدايته');
      return;
    }

    const values = {};
    TEXT_KEYS.forEach((key) => { values[key] = String(form[key] ?? '').trim(); });
    DATE_KEYS.forEach((key) => { values[key] = form[key] || ''; });

    try {
      setSaving(true);
      if (mode === 'create') {
        const data = new FormData();
        data.append('branch_id', form.branch_id);
        Object.entries(values).forEach(([key, value]) => { if (value) data.append(key, value); });
        if (form.file) data.append('file', form.file);
        await branchPartnershipsAPI.upload(data);
        showSuccess('تمت إضافة الشراكة بنجاح');
      } else if (form.file || form.remove_file) {
        const data = new FormData();
        Object.entries(values).forEach(([key, value]) => data.append(key, value)); // empty values clear the field
        if (form.file) data.append('file', form.file);
        else data.append('remove_file', 'true');
        await branchPartnershipsAPI.updateWithFile(editing.id, data);
        showSuccess('تم تحديث الشراكة بنجاح');
      } else {
        await branchPartnershipsAPI.update(editing.id, values);
        showSuccess('تم تحديث الشراكة بنجاح');
      }
      setMode(null);
      setEditing(null);
      setForm(EMPTY_FORM);
      reload();
    } catch (error) {
      showError(uploadErrorMessage(error) || (mode === 'create' ? 'فشل إضافة الشراكة' : 'فشل تحديث الشراكة'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: 'حذف الشراكة',
      message: `هل أنت متأكد من حذف الشراكة مع «${row.partner_name}»؟`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (!ok) return;
    try {
      await branchPartnershipsAPI.delete(row.id);
      showSuccess('تم الحذف');
      reload();
    } catch (error) {
      showError(await errorText(error, 'فشل الحذف'));
    }
  };

  // ---- table -----------------------------------------------------------------------------------------------------------
  const columns = [
    {
      key: 'partner_name',
      header: 'الجهة',
      mobilePrimary: true,
      render: (row) => (
        <div className="br-main">
          <strong>{row.partner_name}</strong>
          {row.description && <span className="br-sub">{row.description}</span>}
        </div>
      ),
    },
    ...(allBranches ? [{ key: 'branch_name', header: 'الفرع', render: (row) => row.branch_name || '—' }] : []),
    {
      key: 'partner_type',
      header: 'النوع',
      render: (row) => {
        const meta = TYPE_BADGE[row.partner_type];
        return meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : '—';
      },
    },
    { key: 'service_type', header: 'نوع الخدمة', render: (row) => row.service_type || '—' },
    {
      key: 'contact',
      header: 'التواصل',
      render: (row) => {
        if (!row.contact_name && !row.contact_phone) return '—';
        return (
          <div className="br-main">
            {row.contact_name && <span>{row.contact_name}</span>}
            {row.contact_phone && <CopyText value={row.contact_phone}><bdi dir="ltr">{row.contact_phone}</bdi></CopyText>}
          </div>
        );
      },
    },
    {
      key: 'contract',
      header: 'العقد',
      render: (row) => {
        const start = isoDay(row.contract_start_date);
        const end = isoDay(row.contract_end_date);
        const status = contractStatus(row);
        if (!start && !end && !row.contract_start_date_hijri && !row.contract_end_date_hijri) return '—';
        return (
          <div className="br-main">
            <span className="br-range"><span className="br-sub">من</span> <DateLine day={start} hijri={row.contract_start_date_hijri} /></span>
            <span className="br-range"><span className="br-sub">إلى</span> <DateLine day={end} hijri={row.contract_end_date_hijri} /></span>
            {status && <span><Badge tone={status.tone}>{status.label}</Badge></span>}
          </div>
        );
      },
    },
    { key: 'file', header: 'الملف', render: (row) => <RecordFileName row={row} /> },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'end',
      render: (row) => <RecordActions row={row} files={files} onEdit={openEdit} onDelete={remove} />,
    },
  ];

  return (
    <>
      <Card
        flush
        title="الشراكات"
        subtitle="الجهات الحكومية وغير الحكومية التي يتشارك معها المركز"
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>إضافة شراكة</Button>}
      >
        <Toolbar>
          <SearchInput
            className="ui-grow"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="ابحث باسم الجهة أو الخدمة أو المسؤول…"
          />
          <Select
            aria-label="نوع الشراكة"
            className="br-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={PARTNER_TYPES}
            placeholder="جميع الأنواع"
          />
          {allBranches && (
            <Select
              aria-label="الفرع"
              className="br-filter"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
              placeholder="جميع الفروع"
            />
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          error={failed && rows.length === 0 ? true : null}
          onRetry={reload}
          caption="الشراكات"
          emptyIcon="users"
          emptyTitle={hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد شراكات بعد'}
          emptyDescription={hasFilters ? 'جرّب تغيير كلمة البحث أو الفلاتر.' : 'أضف أول شراكة للمركز.'}
          emptyAction={hasFilters ? null : <Button variant="primary" icon="plus" onClick={openCreate}>إضافة شراكة</Button>}
        />
      </Card>

      <Modal
        open={Boolean(mode)}
        onClose={closeForm}
        title={mode === 'edit' ? 'تعديل الشراكة' : 'إضافة شراكة'}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="br-partnership-form" loading={saving}>{mode === 'edit' ? 'حفظ' : 'إضافة'}</Button>
          </>
        )}
      >
        <form id="br-partnership-form" onSubmit={submit} className="ui-form-stack" noValidate>
          {allBranches && (
            <FormField label="الفرع" required>
              <Select
                value={form.branch_id}
                onChange={(e) => set({ branch_id: e.target.value })}
                options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
                placeholder="اختر الفرع"
                disabled={mode === 'edit'}
              />
            </FormField>
          )}
          <div className="br-form-grid">
            <FormField label="اسم الجهة" required>
              <Input {...text('partner_name')} maxLength={255} />
            </FormField>
            <FormField label="نوع الشراكة" required>
              <Select {...text('partner_type')} options={PARTNER_TYPES} placeholder="اختر النوع" />
            </FormField>
          </div>
          <FormField label="نوع الخدمة">
            <Input {...text('service_type')} maxLength={150} placeholder="مثال: نقل بالحافلات" />
          </FormField>
          <div className="br-form-grid">
            <FormField label="اسم المسؤول">
              <Input {...text('contact_name')} maxLength={255} />
            </FormField>
            <FormField label="رقم التواصل">
              <Input {...text('contact_phone')} maxLength={50} dir="ltr" inputMode="tel" />
            </FormField>
          </div>
          <div className="br-form-grid">
            <UnifiedDatePicker
              label="تاريخ بداية العقد"
              hijriValue={form.contract_start_date_hijri}
              gregorianValue={form.contract_start_date}
              onChange={(hijri, gregorian) => set({ contract_start_date_hijri: hijri, contract_start_date: gregorian })}
              dateType="general"
            />
            <UnifiedDatePicker
              label="تاريخ نهاية العقد"
              hijriValue={form.contract_end_date_hijri}
              gregorianValue={form.contract_end_date}
              onChange={(hijri, gregorian) => set({ contract_end_date_hijri: hijri, contract_end_date: gregorian })}
              dateType="general"
            />
          </div>
          <FormField label="الوصف">
            <Textarea rows={3} {...text('description')} maxLength={5000} />
          </FormField>
          <RecordFileField
            currentName={editing?.has_file ? editing.file_name : ''}
            file={form.file}
            onFileChange={(file) => set({ file })}
            removeCurrent={form.remove_file}
            onRemoveChange={(remove_file) => set({ remove_file })}
            disabled={saving}
          />
        </form>
      </Modal>

      <RecordPreviewModal preview={files.preview} onClose={files.closePreview} />
    </>
  );
}

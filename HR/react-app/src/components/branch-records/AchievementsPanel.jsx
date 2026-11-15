/**
 * Thank-you certificates and accomplishments of a healthcare centre (شهادات الشكر والإنجازات).
 *
 *   <AchievementsPanel branchId={12} />   one branch (no branch column or filter)
 *   <AchievementsPanel />                 all branches the user may see (branch column, branch filter, branch in the form)
 *
 * List with one search box, add / edit / delete, optional file (preview, download).
 */
import { useMemo, useState } from 'react';
import { Card, Button, Modal, FormField, Input, Select, Textarea, SearchInput, Toolbar, DataTable, useConfirm } from '../../ui';
import { branchAchievementsAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/dateConverters';
import { uploadErrorMessage } from '../../utils/uploadLimits';
import UnifiedDatePicker from '../UnifiedDatePicker.jsx';
import { RecordFileField, RecordFileName, RecordActions, RecordPreviewModal } from './RecordParts';
import {
  isoDay, errorText, useDebouncedValue, useRecordList, useHealthcareBranches, useRecordFiles,
} from './recordHelpers';
import './BranchRecords.css';

const EMPTY_FORM = {
  branch_id: '', title: '', description: '', issuer: '', achievement_date: '', achievement_date_hijri: '', file: null, remove_file: false,
};

export default function AchievementsPanel({ branchId = null }) {
  const allBranches = !branchId;
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'edit' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { branches } = useHealthcareBranches(allBranches);
  const files = useRecordFiles(branchAchievementsAPI);

  const filters = useMemo(
    () => ({ branch_id: allBranches ? branchFilter : branchId, search: debouncedSearch }),
    [allBranches, branchFilter, branchId, debouncedSearch],
  );
  const { rows, loading, failed, reload } = useRecordList(branchAchievementsAPI, filters);
  const hasFilters = Boolean(search || branchFilter);

  // ---- form ------------------------------------------------------------------------------------------------------------
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, branch_id: allBranches ? (branches.length === 1 ? String(branches[0].id) : (branchFilter || '')) : String(branchId) });
    setMode('create');
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      ...EMPTY_FORM,
      branch_id: String(row.branch_id),
      title: row.title || '',
      description: row.description || '',
      issuer: row.issuer || '',
      achievement_date: isoDay(row.achievement_date),
      achievement_date_hijri: row.achievement_date_hijri || '',
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
    if (!form.title.trim()) { showWarning('اسم الشهادة أو الإنجاز مطلوب'); return; }
    if (mode === 'create' && !form.branch_id) { showWarning('الرجاء اختيار الفرع'); return; }

    const texts = {
      title: form.title.trim(),
      description: form.description.trim(),
      issuer: form.issuer.trim(),
      achievement_date: form.achievement_date,
      achievement_date_hijri: form.achievement_date_hijri,
    };

    try {
      setSaving(true);
      if (mode === 'create') {
        const data = new FormData();
        data.append('branch_id', form.branch_id);
        Object.entries(texts).forEach(([key, value]) => { if (value) data.append(key, value); });
        if (form.file) data.append('file', form.file);
        await branchAchievementsAPI.upload(data);
        showSuccess('تمت إضافة الشهادة أو الإنجاز بنجاح');
      } else if (form.file || form.remove_file) {
        const data = new FormData();
        Object.entries(texts).forEach(([key, value]) => data.append(key, value)); // empty values clear the field
        if (form.file) data.append('file', form.file);
        else data.append('remove_file', 'true');
        await branchAchievementsAPI.updateWithFile(editing.id, data);
        showSuccess('تم تحديث السجل بنجاح');
      } else {
        await branchAchievementsAPI.update(editing.id, texts);
        showSuccess('تم تحديث السجل بنجاح');
      }
      setMode(null);
      setEditing(null);
      setForm(EMPTY_FORM);
      reload();
    } catch (error) {
      showError(uploadErrorMessage(error) || (mode === 'create' ? 'فشل إضافة السجل' : 'فشل تحديث السجل'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: 'حذف الشهادة أو الإنجاز',
      message: `هل أنت متأكد من حذف «${row.title}»؟`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (!ok) return;
    try {
      await branchAchievementsAPI.delete(row.id);
      showSuccess('تم الحذف');
      reload();
    } catch (error) {
      showError(await errorText(error, 'فشل الحذف'));
    }
  };

  // ---- table -----------------------------------------------------------------------------------------------------------
  const columns = [
    {
      key: 'title',
      header: 'الشهادة أو الإنجاز',
      mobilePrimary: true,
      render: (row) => (
        <div className="br-main">
          <strong>{row.title}</strong>
          {row.description && <span className="br-sub">{row.description}</span>}
        </div>
      ),
    },
    ...(allBranches ? [{ key: 'branch_name', header: 'الفرع', render: (row) => row.branch_name || '—' }] : []),
    { key: 'issuer', header: 'الجهة المانحة', render: (row) => row.issuer || '—' },
    {
      key: 'achievement_date',
      header: 'التاريخ',
      render: (row) => {
        const day = isoDay(row.achievement_date);
        if (!day && !row.achievement_date_hijri) return '—';
        return (
          <span className="br-date">
            {day && <span>{formatDate(day)}</span>}
            {row.achievement_date_hijri && <span className="br-sub">{row.achievement_date_hijri} هـ</span>}
          </span>
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
        title="شهادات الشكر والإنجازات"
        subtitle="الشهادات والإنجازات التي حصل عليها المركز"
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>إضافة شهادة أو إنجاز</Button>}
      >
        <Toolbar>
          <SearchInput
            className="ui-grow"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="ابحث بالاسم أو الجهة المانحة أو الوصف…"
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
          caption="شهادات الشكر والإنجازات"
          emptyIcon="award"
          emptyTitle={hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد شهادات أو إنجازات بعد'}
          emptyDescription={hasFilters ? 'جرّب تغيير كلمة البحث أو الفرع.' : 'أضف أول شهادة شكر أو إنجاز للمركز.'}
          emptyAction={hasFilters ? null : <Button variant="primary" icon="plus" onClick={openCreate}>إضافة شهادة أو إنجاز</Button>}
        />
      </Card>

      <Modal
        open={Boolean(mode)}
        onClose={closeForm}
        title={mode === 'edit' ? 'تعديل شهادة أو إنجاز' : 'إضافة شهادة أو إنجاز'}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="br-achievement-form" loading={saving}>{mode === 'edit' ? 'حفظ' : 'إضافة'}</Button>
          </>
        )}
      >
        <form id="br-achievement-form" onSubmit={submit} className="ui-form-stack" noValidate>
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
          <FormField label="اسم الشهادة أو الإنجاز" required>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={255} placeholder="مثال: شهادة شكر من وزارة الصحة" />
          </FormField>
          <FormField label="الجهة المانحة">
            <Input value={form.issuer} onChange={(e) => set({ issuer: e.target.value })} maxLength={255} />
          </FormField>
          <div className="br-form-grid">
            <UnifiedDatePicker
              label="التاريخ"
              hijriValue={form.achievement_date_hijri}
              gregorianValue={form.achievement_date}
              onChange={(hijri, gregorian) => set({ achievement_date_hijri: hijri, achievement_date: gregorian })}
              dateType="general"
            />
          </div>
          <FormField label="الوصف">
            <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} />
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

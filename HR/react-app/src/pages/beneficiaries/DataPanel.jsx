/** Beneficiary list: search, table (cards on phones), and row actions for those who may edit. */
import { useMemo } from 'react';
import { Card, Toolbar, SearchInput, DataTable, Badge, Button, IconButton, EmptyState } from '../../ui';
import { SERVICE_LABELS, matchesSearch } from './constants';

export default function DataPanel({ beneficiaries, isMain, canEdit, activeTerm, searchQuery, onSearch, onAdd, onEdit, onDelete }) {
  const rows = useMemo(() => beneficiaries.filter((b) => matchesSearch(b, searchQuery)), [beneficiaries, searchQuery]);

  const columns = [
    { key: 'n', header: '#', width: '3rem', mobileHidden: true, render: (_, i) => i + 1 },
    ...(isMain ? [{ key: 'branch_name', header: 'الفرع', mobileHidden: true }] : []),
    {
      key: 'beneficiary_name', header: 'اسم المستفيد', mobilePrimary: true,
      render: (b) => <strong>{b.beneficiary_name}</strong>,
    },
    { key: 'enrollment_period', header: 'الفترة' },
    { key: 'beneficiary_number', header: 'رقم المستفيد', render: (b) => <bdi>{b.beneficiary_number}</bdi> },
    { key: 'civil_id', header: 'السجل المدني', mobileHidden: true, render: (b) => <bdi>{b.civil_id}</bdi> },
    { key: 'contact_number', header: 'التواصل', render: (b) => <bdi>{b.contact_number}</bdi> },
    { key: 'gender', header: 'الجنس', mobileHidden: true },
    { key: 'age', header: 'العمر', align: 'center' },
    {
      key: 'services', header: 'الخدمات',
      render: (b) => {
        const on = Object.entries(SERVICE_LABELS).filter(([key]) => b[key]);
        return on.length === 0 ? '—' : (
          <span className="bn-pills">{on.map(([key, label]) => <Badge key={key} tone="info">{label}</Badge>)}</span>
        );
      },
    },
    { key: 'free_student', header: 'مجاني', mobileHidden: true, render: (b) => (b.free_student ? <Badge tone="success">مجاني</Badge> : '—') },
    {
      key: 'notes', header: 'ملاحظات', mobileHidden: true,
      render: (b) => (b.notes ? <span className="bn-notes" title={b.notes}>{b.notes}</span> : '—'),
    },
    ...(canEdit ? [{
      key: 'actions', header: '', align: 'end',
      render: (b) => (
        <span className="bn-row-actions">
          <IconButton icon="edit" label="تعديل" onClick={() => onEdit(b)} />
          <IconButton icon="trash" label="حذف" className="bn-danger" onClick={() => onDelete(b)} />
        </span>
      ),
    }] : [])];

  return (
    <Card flush>
      {beneficiaries.length > 0 && (
        <Toolbar>
          <SearchInput
            className="ui-grow"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            onClear={() => onSearch('')}
            placeholder="بحث بالاسم أو رقم الهوية أو رقم المستفيد…"
          />
          {searchQuery && <Badge tone="neutral"><bdi>{rows.length}</bdi> نتيجة</Badge>}
        </Toolbar>
      )}
      {beneficiaries.length === 0 ? (
        <EmptyState
          icon="graduation-cap"
          title="لا توجد بيانات"
          description={!activeTerm ? 'لا يوجد فصل دراسي نشط حالياً' : canEdit ? 'ابدأ بإضافة المستفيدين' : 'لا توجد بيانات مسجلة لهذا الفصل'}
          action={canEdit && activeTerm ? <Button variant="primary" icon="plus" onClick={onAdd}>إضافة مستفيد</Button> : null}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          emptyIcon="search"
          emptyTitle="لا توجد نتائج"
          emptyDescription="جرّب كلمة بحث أخرى."
        />
      )}
    </Card>
  );
}

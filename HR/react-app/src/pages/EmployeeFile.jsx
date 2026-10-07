/**
 * Employee file (head office): find one employee, pick which uploaded documents and data fields to include,
 * and download the file as a PDF. One search box matches name, ID, employee number, phone, email and job title.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Page, PageHeader, Card, SearchInput, Select, FormField, Button, Badge, Checkbox, Chip, ChipGroup, DataTable, Skeleton, EmptyState,
} from '../ui';
import { employeesAPI, documentsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getDocumentTypeLabel } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import { useBranches } from '../hooks/useBranches';
import { FILE_FIELDS, DEFAULT_FILE_FIELDS } from './employeeFileFields';
import './EmployeeFile.css';

const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

export default function EmployeeFile() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { branches: rawBranches } = useBranches();
  const branches = useMemo(() => [...rawBranches].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')), [rawBranches]);

  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [selectedFields, setSelectedFields] = useState(DEFAULT_FILE_FIELDS);
  const [generating, setGenerating] = useState(false);
  const timerRef = useRef(null);

  const term = search.trim();
  const hasQuery = term.length >= 2 || Boolean(branchId);

  useEffect(() => {
    if (!isMainManager()) window.location.href = '/dashboard';
  }, [isMainManager]);

  // Debounced single-box search (needs 2+ characters, or a branch)
  useEffect(() => {
    if (!hasQuery) { setEmployees([]); return undefined; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const filters = { is_active: true };
        if (term.length >= 2) filters.search = term;
        if (branchId) filters.branch_id = parseInt(branchId, 10);
        const response = await employeesAPI.getAll(filters);
        if (response.data.success) setEmployees(response.data.data || []);
      } catch (error) {
        console.error('Error loading employees:', error);
        showError('فشل تحميل الموظفين');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, branchId]);

  useEffect(() => {
    if (!selected) { setDocuments([]); setSelectedDocumentIds([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingDocuments(true);
      try {
        const response = await documentsAPI.getAll({ employee_id: selected.id });
        if (!cancelled && response.data.success) setDocuments(response.data.data || []);
      } catch (error) {
        console.error(`Error loading documents for employee ${selected.id}:`, error);
        if (!cancelled) setDocuments([]);
      } finally {
        if (!cancelled) setLoadingDocuments(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const allDocsSelected = documents.length > 0 && documents.every((d) => selectedDocumentIds.includes(d.id));
  const allFieldsSelected = selectedFields.length === FILE_FIELDS.length;
  const toggle = (setter) => (value) => setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  const clearSearch = () => {
    setSearch('');
    setBranchId('');
    setEmployees([]);
    setSelected(null);
  };

  const generate = async () => {
    if (!selected) { showWarning('الرجاء اختيار موظف'); return; }
    if (selectedFields.length === 0) { showWarning('الرجاء اختيار حقل واحد على الأقل للعرض'); return; }
    try {
      setGenerating(true);
      const fileTitle = `ملف الموظف ${fullName(selected) || 'موظف'}`;
      const response = await employeesAPI.generateEmployeeFile({
        title: fileTitle,
        employee_ids: [selected.id],
        selectedFields,
        selected_documents: { [selected.id]: selectedDocumentIds },
      }, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      downloadFile(blob, `${fileTitle}.pdf`);
      showSuccess('تم إنشاء الملف بنجاح');
    } catch (error) {
      console.error('Error generating file:', error);
      showError(error.response?.data?.message || error.message || 'فشل إنشاء الملف');
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    { key: 'name', header: 'الموظف', mobilePrimary: true, render: (e) => <strong>{fullName(e)}</strong> },
    { key: 'num', header: 'رقم الموظف', render: (e) => <bdi>{e.employee_id_number || '—'}</bdi> },
    { key: 'id', header: 'رقم الهوية', mobileHidden: true, render: (e) => <bdi>{e.id_or_residency_number || '—'}</bdi> },
    { key: 'phone', header: 'الجوال', mobileHidden: true, render: (e) => <bdi>{e.phone_number || '—'}</bdi> },
    {
      key: 'pick', header: '', align: 'end', width: '1%',
      render: (e) => (selected?.id === e.id
        ? <Badge tone="success" dot>محدد</Badge>
        : <Button size="sm" variant="soft" onClick={() => setSelected(e)}>اختيار</Button>),
    },
  ];

  if (!isMainManager()) return null;

  return (
    <Page>
      <PageHeader
        title="ملف موظف"
        subtitle="ابحث عن موظف، اختر المستندات والحقول، ثم أنشئ الملف بصيغة PDF"
        actions={selected ? <Button variant="primary" icon="download" loading={generating} onClick={generate}>إنشاء الملف</Button> : null}
      />

      <Card
        title="البحث عن الموظف"
        subtitle="اكتب جزءاً من الاسم أو رقم الهوية أو رقم الموظف أو الجوال أو البريد في خانة واحدة"
        actions={(search || branchId) ? <Button size="sm" variant="ghost" icon="x" onClick={clearSearch}>مسح البحث</Button> : null}
      >
        <div className="ef-search">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو البريد…" />
          <FormField label="الفرع" className="ef-branch">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))} placeholder="جميع الفروع" />
          </FormField>
        </div>
        {term.length === 1 && !branchId && <p className="ef-hint">أدخل حرفين على الأقل</p>}
      </Card>

      {hasQuery && (
        <Card title="نتائج البحث" flush>
          <DataTable columns={columns} rows={employees} rowKey="id" loading={searching} onRowClick={setSelected} emptyIcon="search" emptyTitle="لا يوجد موظفون ينطبق عليهم البحث" />
        </Card>
      )}

      {selected && (
        <>
          <Card
            title={`المستندات · ${fullName(selected)}`}
            subtitle="اختر المستندات التي تُرفق في نهاية الملف"
            actions={documents.length > 0 ? <Button size="sm" variant="soft" onClick={() => setSelectedDocumentIds(allDocsSelected ? [] : documents.map((d) => d.id))}>{allDocsSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</Button> : null}
          >
            {loadingDocuments ? <Skeleton lines={3} height={16} /> : documents.length === 0 ? (
              <EmptyState compact icon="file" title="لا توجد مستندات لهذا الموظف" />
            ) : (
              <div className="ef-docs">
                {documents.map((doc, index) => (
                  <Checkbox
                    key={doc.id || index}
                    checked={selectedDocumentIds.includes(doc.id)}
                    onChange={() => toggle(setSelectedDocumentIds)(doc.id)}
                    label={(
                      <span className="ef-doc">
                        <strong>{getDocumentTypeLabel(doc.document_type) || 'مستند'}</strong>
                        <span className="ef-muted"><bdi>{doc.filename || doc.file_name || 'بدون اسم'}</bdi></span>
                        {doc.description && <span className="ef-muted">({doc.description})</span>}
                        {doc.expiry_date && <span className="ef-muted">ينتهي {formatDate(doc.expiry_date)}</span>}
                      </span>
                    )}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card
            title="الحقول المعروضة"
            actions={(
              <>
                <Badge tone="info"><bdi>{selectedFields.length}</bdi> من <bdi>{FILE_FIELDS.length}</bdi></Badge>
                <Button size="sm" variant="soft" onClick={() => setSelectedFields(allFieldsSelected ? [] : FILE_FIELDS.map((f) => f.value))}>{allFieldsSelected ? 'مسح الكل' : 'تحديد الكل'}</Button>
              </>
            )}
          >
            <ChipGroup aria-label="الحقول">
              {FILE_FIELDS.map((f) => <Chip key={f.value} selected={selectedFields.includes(f.value)} onClick={() => toggle(setSelectedFields)(f.value)}>{f.label}</Chip>)}
            </ChipGroup>
          </Card>

          <div>
            <Button variant="primary" icon="download" loading={generating} onClick={generate}>إنشاء الملف</Button>
          </div>
        </>
      )}
    </Page>
  );
}

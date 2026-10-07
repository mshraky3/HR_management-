/**
 * Branch documents overview (head office, and operations managers for their branches).
 * Document-centric: for every required document type, which branches have it and which are missing,
 * with quick upload, preview, download, edit and delete. Head office can also export PDF bundles.
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Page, PageHeader, Card, StatCard, Tabs, Toolbar, SearchInput, Select, Button, IconButton, Badge, Icon, Modal, FormField, Input,
  Textarea, EmptyState, Skeleton, useConfirm,
} from '../ui';
import { branchDocumentsAPI, branchesAPI, clearCache } from '../utils/api';
import { API_URL } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { getRequiredBranchDocuments, getMonthlyRequiredBranchDocuments } from '../utils/employeeHelpers';
import { RESTRICTED_DOCUMENT_TYPES } from '../utils/documentRestrictions';
import { downloadFile } from '../utils/downloadFile';
import UnifiedDatePicker from '../components/UnifiedDatePicker.jsx';
import { MAX_UPLOAD_BYTES, fileTooLargeMessage } from '../utils/uploadLimits';
import './BranchDocumentsManagement.css';

const DOCUMENT_TYPE_LABELS = {
  license: 'الترخيص',
  permit: 'التصريح',
  insurance: 'التأمين',
  insurance_print: 'كشف التأمينات',
  contract: 'العقد',
  rental_contract: 'عقد الايجار',
  registration: 'السجل التجاري',
  security_contract: 'عقد الامن والسلامة',
  civil_defense_certificate: 'شهادة الدفاع المدني',
  municipality_certificate: 'شهادة بلدي',
  insurance_certificate: 'شهادة التامينات',
  insurance_statement: 'كشف التأمينات',
  operational_plan: 'الخطة التشغلية',
  owner_civil_id_copy: 'نسخة هوية المالك',
  disclosure_commitment: 'إفصاح وتعهد',
  certification_commitment_form: 'نموذج تصديق وتعاقد',
  financial_platform_declaration: 'ملف إقرار المنصة المالية',
  financial_claim_form: 'نموذج مطالبة مالية',
  student_cadre_file: 'بيانات الطلاب',
  dropped_students: 'الطلاب المنقطعين',
  free_seats: 'المقاعد المتاحة',
  acceptance_notifications: 'إشعارات القبول',
};

const EMPTY_FORM = {
  branch_id: '', document_type: '', description: '', document_number: '', issue_date: '', issue_date_hijri: '',
  expiry_date: '', expiry_date_hijri: '', iban_number: '', bank_name: '', file: null,
};

const label = (type) => DOCUMENT_TYPE_LABELS[type] || type;

export default function BranchDocumentsManagement() {
  const { isMainManager, isBranchOperationsManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();
  const isMain = isMainManager();
  const isOps = isBranchOperationsManager();

  const assignedBranchIds = useMemo(
    () => (Array.isArray(user?.assigned_branches) ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite) : []),
    [user?.assigned_branches],
  );

  const [branches, setBranches] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formMode, setFormMode] = useState(null); // 'upload' | 'edit' | null
  const [editingDocument, setEditingDocument] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'missing' | 'existing'
  const [searchText, setSearchText] = useState('');
  const [expanded, setExpanded] = useState(new Set());

  const [pdfMode, setPdfMode] = useState('type'); // 'type' | 'branch'
  const [pdfType, setPdfType] = useState('');
  const [pdfBranch, setPdfBranch] = useState('');
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // ---- loading ---------------------------------------------------------------------------------------------------------
  const loadBranches = async () => {
    try {
      setLoading(true);
      const filters = { is_active: true };
      if (!isMain && !isOps && user?.branch_id) filters.id = user.branch_id;
      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        const list = response.data.data || [];
        const next = isOps ? list.filter((b) => assignedBranchIds.includes(parseInt(b.id, 10))) : list;
        setBranches(next);
        if (!isMain && !isOps && user?.branch_id) setForm((prev) => ({ ...prev, branch_id: user.branch_id }));
        else if (isOps && next.length === 1) setForm((prev) => ({ ...prev, branch_id: prev.branch_id || String(next[0].id) }));
      }
    } catch {
      showError('فشل تحميل الفروع');
    } finally {
      setLoading(false);
    }
  };

  const loadAllDocuments = async () => {
    try {
      setDocumentsLoading(true);
      const toLoad = isMain
        ? branches
        : isOps
          ? branches.filter((b) => assignedBranchIds.includes(parseInt(b.id, 10)))
          : branches.filter((b) => b.id === user?.branch_id);
      const results = await Promise.allSettled(toLoad.map((b) => branchDocumentsAPI.getAll({ branch_id: b.id })));
      const docs = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.data.success && result.value.data.data) docs.push(...result.value.data.data);
        } else {
          const status = result.reason?.response?.status;
          if (status !== 401 && status !== 403) console.warn(`Failed to load documents for branch ${toLoad[index]?.id}:`, result.reason);
        }
      });
      setAllDocuments(docs);
    } catch (error) {
      if (error.response?.status !== 401 && error.response?.status !== 403) showError('فشل تحميل المستندات');
    } finally {
      setDocumentsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBranches(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (branches.length > 0) loadAllDocuments(); }, [branches]);

  useEffect(() => {
    const fromUrl = searchParams.get('branch_id');
    if (fromUrl && branches.some((b) => String(b.id) === String(fromUrl))) setBranchFilter(String(fromUrl));
  }, [branches, searchParams]);

  // ---- derived data ----------------------------------------------------------------------------------------------------
  const requiredDocsByBranch = useMemo(() => {
    const monthly = getMonthlyRequiredBranchDocuments();
    const map = {};
    branches.forEach((b) => {
      map[b.id] = new Set(getRequiredBranchDocuments(b.branch_type).filter((t) => !monthly.includes(t)));
    });
    return map;
  }, [branches]);

  const documentStatus = useMemo(() => {
    const status = {};
    branches.forEach((b) => {
      status[b.id] = {};
      requiredDocsByBranch[b.id].forEach((type) => {
        // active and with a stored file reference (same rule as the dashboard)
        const docs = allDocuments.filter((d) => d.branch_id === b.id && d.document_type === type && d.is_active !== false && (d.file_path || d.file_url || d.blob_url));
        status[b.id][type] = { exists: docs.length > 0, documents: docs, count: docs.length };
      });
    });
    return status;
  }, [branches, allDocuments, requiredDocsByBranch]);

  const allDocumentTypes = useMemo(() => {
    const types = new Set();
    branches.forEach((b) => requiredDocsByBranch[b.id].forEach((t) => types.add(t)));
    let list = Array.from(types).sort();
    if (!isMain) list = list.filter((t) => !RESTRICTED_DOCUMENT_TYPES.includes(t));
    return list;
  }, [branches, requiredDocsByBranch, isMain]);

  const uploadableTypes = useMemo(() => Object.keys(DOCUMENT_TYPE_LABELS).filter((t) => isMain || !RESTRICTED_DOCUMENT_TYPES.includes(t)), [isMain]);

  const isMissing = (branch, type) => requiredDocsByBranch[branch.id]?.has(type) && !documentStatus[branch.id]?.[type]?.exists;
  const isPresent = (branch, type) => requiredDocsByBranch[branch.id]?.has(type) && documentStatus[branch.id]?.[type]?.exists;

  const filtered = useMemo(() => {
    let filteredBranches = [...branches];
    let filteredTypes = [...allDocumentTypes];
    if (branchFilter) filteredBranches = filteredBranches.filter((b) => b.id === parseInt(branchFilter, 10));
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      filteredBranches = filteredBranches.filter((b) => b.branch_name?.toLowerCase().includes(q));
      filteredTypes = filteredTypes.filter((t) => label(t).toLowerCase().includes(q));
    }
    if (typeFilter) filteredTypes = filteredTypes.filter((t) => t === typeFilter);
    if (statusFilter === 'missing') filteredTypes = filteredTypes.filter((t) => filteredBranches.some((b) => isMissing(b, t)));
    else if (statusFilter === 'existing') filteredTypes = filteredTypes.filter((t) => filteredBranches.some((b) => isPresent(b, t)));
    return { filteredBranches, filteredTypes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, allDocumentTypes, branchFilter, statusFilter, typeFilter, searchText, documentStatus, requiredDocsByBranch]);

  const stats = useMemo(() => {
    let total = 0;
    let existing = 0;
    filtered.filteredBranches.forEach((b) => filtered.filteredTypes.forEach((t) => {
      if (!requiredDocsByBranch[b.id]?.has(t)) return;
      total++;
      if (documentStatus[b.id]?.[t]?.exists) existing++;
    }));
    return { total, existing, missing: total - existing, rate: total > 0 ? Math.round((existing / total) * 100) : 0 };
  }, [filtered, documentStatus, requiredDocsByBranch]);

  const hasFilters = Boolean(branchFilter || typeFilter || statusFilter || searchText);
  const clearFilters = () => { setBranchFilter(''); setTypeFilter(''); setStatusFilter(''); setSearchText(''); };
  const toggleExpanded = (type) => setExpanded((prev) => { const next = new Set(prev); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  const allExpanded = filtered.filteredTypes.length > 0 && filtered.filteredTypes.every((t) => expanded.has(t));

  // ---- PDF export (head office) ----------------------------------------------------------------------------------------
  const generatePdf = async () => {
    const byType = pdfMode === 'type';
    if (byType && !pdfType) { showError('الرجاء اختيار نوع المستند'); return; }
    if (!byType && !pdfBranch) { showError('الرجاء اختيار الفرع'); return; }
    setPdfGenerating(true);
    try {
      const response = await fetch(`${API_URL}/api/branch-documents/${byType ? 'generate-pdf-by-type' : 'generate-pdf-by-branch'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(byType ? { document_type: pdfType } : { branch_id: parseInt(pdfBranch, 10) }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'فشل في إنشاء ملف PDF');
      }
      const blob = await response.blob();
      if (byType) downloadFile(blob, `${label(pdfType)}_جميع_الفروع.pdf`);
      else downloadFile(blob, `مستندات_${branches.find((b) => b.id === parseInt(pdfBranch, 10))?.branch_name || 'فرع'}.pdf`);
      showSuccess('تم إنشاء ملف PDF بنجاح');
      setPdfType('');
      setPdfBranch('');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError(error.message || 'حدث خطأ أثناء إنشاء ملف PDF');
    } finally {
      setPdfGenerating(false);
    }
  };

  // ---- upload / edit ---------------------------------------------------------------------------------------------------
  const openUpload = (branchId = '', documentType = '') => {
    setForm({ ...EMPTY_FORM, branch_id: branchId || form.branch_id || '', document_type: documentType });
    setFormMode('upload');
  };

  const openEdit = (doc) => {
    setEditingDocument(doc);
    setForm({
      ...EMPTY_FORM,
      branch_id: doc.branch_id,
      document_type: doc.document_type,
      description: doc.description || '',
      document_number: doc.document_number || '',
      issue_date: doc.issue_date ? String(doc.issue_date).split('T')[0] : '',
      issue_date_hijri: doc.issue_date_hijri || '',
      expiry_date: doc.expiry_date ? String(doc.expiry_date).split('T')[0] : '',
      expiry_date_hijri: doc.expiry_date_hijri || '',
      iban_number: doc.iban_number || '',
      bank_name: doc.bank_name || '',
    });
    setFormMode('edit');
  };

  const closeForm = () => {
    if (saving) return;
    setFormMode(null);
    setEditingDocument(null);
    setForm(EMPTY_FORM);
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showWarning(fileTooLargeMessage(file.name));
      e.target.value = '';
      return;
    }
    setForm((prev) => ({ ...prev, file }));
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (formMode === 'upload') {
      if (!form.branch_id || !form.document_type || !form.file) { showError('يرجى إدخال جميع الحقول المطلوبة'); return; }
      try {
        setSaving(true);
        const data = new FormData();
        Object.keys(form).forEach((key) => { if (form[key] !== null && form[key] !== '') data.append(key, form[key]); });
        clearCache('/api/branch-documents');
        const response = await branchDocumentsAPI.upload(data);
        if (response.data.success) {
          showSuccess('تم رفع المستند بنجاح');
          if (response.data.data) setAllDocuments((prev) => [response.data.data, ...prev]);
          setFormMode(null);
          setForm(EMPTY_FORM);
          loadAllDocuments();
        }
      } catch (error) {
        showError(error.response?.data?.message || 'فشل رفع المستند');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!editingDocument) return;
    try {
      setSaving(true);
      const updateData = { ...form };
      delete updateData.file;
      delete updateData.branch_id;
      let response;
      if (form.file) {
        const data = new FormData();
        Object.keys(updateData).forEach((key) => { if (updateData[key] !== null && updateData[key] !== '') data.append(key, updateData[key]); });
        data.append('file', form.file);
        response = await branchDocumentsAPI.updateWithFile(editingDocument.id, data);
      } else {
        response = await branchDocumentsAPI.update(editingDocument.id, updateData);
      }
      if (response.data.success) {
        showSuccess('تم تحديث المستند بنجاح');
        if (response.data.data) setAllDocuments((prev) => prev.map((d) => (d.id === response.data.data.id ? response.data.data : d)));
        setFormMode(null);
        setEditingDocument(null);
        setForm(EMPTY_FORM);
        loadAllDocuments();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل تحديث المستند');
    } finally {
      setSaving(false);
    }
  };

  const removeDocument = async (doc) => {
    const ok = await confirm({
      title: 'حذف المستند',
      message: `هل أنت متأكد من حذف المستند «${label(doc.document_type)}»؟`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (!ok) return;
    try {
      clearCache('/api/branch-documents');
      const response = await branchDocumentsAPI.delete(doc.id);
      if (response.data.success) {
        showSuccess('تم حذف المستند بنجاح');
        setAllDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        loadAllDocuments();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حذف المستند');
    }
  };

  const downloadDocument = async (doc) => {
    try {
      const response = await branchDocumentsAPI.download(doc.id);
      downloadFile(new Blob([response.data]), doc.file_name || 'document');
      showSuccess('تم تحميل المستند');
    } catch (error) {
      const message = error.response?.data?.message || 'فشل تحميل المستند';
      showError(message.includes('password') || message.includes('كلمة مرور') ? 'يرجى التحقق من كلمة مرور مستندات الفرع' : message);
    }
  };

  // ---- render ----------------------------------------------------------------------------------------------------------
  const initialLoading = loading && branches.length === 0;
  const statsLoading = initialLoading || (documentsLoading && allDocuments.length === 0);
  const formTypeOptions = (formMode === 'edit' ? Object.keys(DOCUMENT_TYPE_LABELS) : uploadableTypes).map((t) => ({ value: t, label: label(t) }));

  return (
    <Page>
      <PageHeader
        title="مستندات الفروع"
        subtitle={documentsLoading ? 'جاري تحديث المستندات…' : 'ما الذي رفعته الفروع وما الذي ينقصها'}
        actions={<Button variant="primary" icon="plus" onClick={() => openUpload()}>رفع مستند جديد</Button>}
      />

      {isMain && (
        <Card title="إنشاء ملف PDF" subtitle="دمج المستندات في ملف واحد جاهز للطباعة أو الإرسال">
          <div className="ui-form-stack">
            <Tabs
              value={pdfMode}
              onChange={setPdfMode}
              items={[{ id: 'type', label: 'حسب المستند', icon: 'file-text' }, { id: 'branch', label: 'حسب الفرع', icon: 'building' }]}
            />
            <div className="bm-pdf-row">
              {pdfMode === 'type' ? (
                <FormField label="نوع المستند">
                  <Select
                    value={pdfType}
                    onChange={(e) => setPdfType(e.target.value)}
                    options={allDocumentTypes.map((t) => ({ value: t, label: label(t) }))}
                    placeholder="اختر نوع المستند"
                  />
                </FormField>
              ) : (
                <FormField label="الفرع">
                  <Select
                    value={pdfBranch}
                    onChange={(e) => setPdfBranch(e.target.value)}
                    options={[...branches].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')).map((b) => ({ value: b.id, label: b.branch_name }))}
                    placeholder="اختر الفرع"
                  />
                </FormField>
              )}
              <Button variant="primary" icon="download" loading={pdfGenerating} disabled={pdfMode === 'type' ? !pdfType : !pdfBranch} onClick={generatePdf}>إنشاء التقرير</Button>
            </div>
            <p className="bm-hint">
              {pdfMode === 'type'
                ? (pdfType ? <>سيحتوي الملف على مستند <strong>{label(pdfType)}</strong> لـ <strong>جميع الفروع</strong>.</> : 'اختر نوع المستند للمتابعة.')
                : (pdfBranch ? <>سيحتوي الملف على <strong>جميع المستندات</strong> لفرع <strong>{branches.find((b) => String(b.id) === String(pdfBranch))?.branch_name}</strong>.</> : 'اختر الفرع للمتابعة.')}
            </p>
          </div>
        </Card>
      )}

      <div className="ui-grid-stats">
        <StatCard label="المستندات المطلوبة" value={stats.total} icon="file-text" tone="primary" loading={statsLoading} />
        <StatCard label="المستندات الموجودة" value={stats.existing} icon="check-circle" tone="success" loading={statsLoading} />
        <StatCard label="المستندات المفقودة" value={stats.missing} icon="alert" tone="warning" loading={statsLoading} />
        <StatCard label="نسبة الإكمال" value={`${stats.rate}%`} icon="chart" tone="primary" loading={statsLoading} />
      </div>

      <Card flush>
        <Toolbar>
          <SearchInput className="ui-grow" value={searchText} onChange={(e) => setSearchText(e.target.value)} onClear={() => setSearchText('')} placeholder="ابحث عن فرع أو نوع مستند…" />
          <Select
            aria-label="الفرع"
            className="bm-filter"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
            placeholder="جميع الفروع"
          />
          <Select
            aria-label="نوع المستند"
            className="bm-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={allDocumentTypes.map((t) => ({ value: t, label: label(t) }))}
            placeholder="جميع المستندات"
          />
          <Select
            aria-label="الحالة"
            className="bm-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: 'missing', label: 'المفقودة فقط' }, { value: 'existing', label: 'الموجودة فقط' }]}
            placeholder="جميع الحالات"
          />
          {hasFilters && <Button variant="ghost" icon="x" onClick={clearFilters}>إلغاء الفلاتر</Button>}
          {filtered.filteredTypes.length > 0 && (
            <Button variant="ghost" iconEnd={allExpanded ? 'chevron-up' : 'chevron-down'} onClick={() => setExpanded(allExpanded ? new Set() : new Set(filtered.filteredTypes))}>
              {allExpanded ? 'طي الكل' : 'توسيع الكل'}
            </Button>
          )}
        </Toolbar>

        {initialLoading ? (
          <div className="bm-loading"><Skeleton lines={4} height={18} /></div>
        ) : filtered.filteredTypes.length === 0 ? (
          <EmptyState
            icon="folder"
            title="لا توجد مستندات لعرضها"
            description={hasFilters ? 'جرّب تغيير الفلاتر أو مسحها.' : 'لا توجد مستندات مطلوبة للفروع المتاحة.'}
            action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>إلغاء الفلاتر</Button> : null}
          />
        ) : (
          <ul className="bm-types">
            {filtered.filteredTypes.map((type) => {
              const missing = filtered.filteredBranches.filter((b) => isMissing(b, type));
              const present = filtered.filteredBranches.filter((b) => isPresent(b, type));
              const open = expanded.has(type);
              return (
                <li key={type} className="bm-type">
                  <button type="button" className="bm-type-head" aria-expanded={open} onClick={() => toggleExpanded(type)}>
                    <Icon name={open ? 'chevron-down' : 'chevron-end'} size={18} />
                    <span className="bm-type-title">{label(type)}</span>
                    <span className="bm-type-badges">
                      <Badge tone="success"><bdi>{present.length}</bdi> موجود</Badge>
                      {missing.length > 0 && <Badge tone="warning"><bdi>{missing.length}</bdi> مفقود</Badge>}
                    </span>
                  </button>

                  {open && (
                    <div className="bm-type-body">
                      {missing.length > 0 && (
                        <section aria-label="مفقود">
                          <h4 className="bm-group bm-group-missing"><Icon name="alert" size={16} /> مفقود ({missing.length})</h4>
                          <ul className="bm-rows">
                            {missing.map((b) => (
                              <li key={b.id} className="bm-row">
                                <span className="bm-branch">{b.branch_name}</span>
                                <Button size="sm" variant="soft" icon="upload" onClick={() => openUpload(b.id, type)}>رفع</Button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {present.length > 0 && (
                        <section aria-label="موجود">
                          <h4 className="bm-group bm-group-ok"><Icon name="check-circle" size={16} /> موجود ({present.length})</h4>
                          <ul className="bm-rows">
                            {present.map((b) => {
                              const status = documentStatus[b.id][type];
                              const doc = status.documents[0];
                              const expired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                              return (
                                <li key={b.id} className="bm-row">
                                  <span className="bm-branch">{b.branch_name}</span>
                                  <span className="bm-meta">
                                    {doc.expiry_date && <Badge tone={expired ? 'danger' : 'neutral'}>ينتهي: {formatDate(doc.expiry_date)}</Badge>}
                                    {doc.uploaded_at && <span className="bm-date">رُفع {formatDate(doc.uploaded_at)}</span>}
                                    {status.count > 1 && <Badge tone="info"><bdi>{status.count}</bdi> مستندات</Badge>}
                                  </span>
                                  <span className="bm-actions">
                                    <IconButton icon="eye" label="عرض" onClick={() => setPreviewDocument(doc)} />
                                    <IconButton icon="download" label="تحميل" onClick={() => downloadDocument(doc)} />
                                    <IconButton icon="edit" label="تعديل" onClick={() => openEdit(doc)} />
                                    <IconButton icon="trash" label="حذف" className="bm-danger" onClick={() => removeDocument(doc)} />
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Upload / edit */}
      <Modal
        open={Boolean(formMode)}
        onClose={closeForm}
        title={formMode === 'edit' ? 'تعديل المستند' : 'رفع مستند جديد'}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="bm-doc-form" loading={saving}>{formMode === 'edit' ? 'تحديث' : 'رفع'}</Button>
          </>
        )}
      >
        <form id="bm-doc-form" onSubmit={submitForm} className="ui-form-stack" noValidate>
          {formMode === 'upload' && (
            <FormField label="الفرع" required>
              <Select
                value={form.branch_id}
                onChange={(e) => setForm((prev) => ({ ...prev, branch_id: e.target.value }))}
                options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                placeholder="اختر الفرع"
              />
            </FormField>
          )}
          <FormField label="نوع المستند" required>
            <Select
              value={form.document_type}
              onChange={(e) => setForm((prev) => ({ ...prev, document_type: e.target.value }))}
              options={formTypeOptions}
              placeholder="اختر نوع المستند"
              disabled={formMode === 'edit'}
            />
          </FormField>
          <FormField label="رقم المستند">
            <Input value={form.document_number} onChange={(e) => setForm((prev) => ({ ...prev, document_number: e.target.value }))} />
          </FormField>
          <div className="bm-form-grid">
            <UnifiedDatePicker
              label="تاريخ الإصدار"
              hijriValue={form.issue_date_hijri}
              gregorianValue={form.issue_date}
              onChange={(hijri, gregorian) => setForm((prev) => ({ ...prev, issue_date_hijri: hijri, issue_date: gregorian }))}
              dateType="general"
            />
            <UnifiedDatePicker
              label="تاريخ الانتهاء"
              hijriValue={form.expiry_date_hijri}
              gregorianValue={form.expiry_date}
              onChange={(hijri, gregorian) => setForm((prev) => ({ ...prev, expiry_date_hijri: hijri, expiry_date: gregorian }))}
              dateType="expiry_date"
            />
          </div>
          <FormField label="الوصف">
            <Textarea rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
          </FormField>
          <FormField label={formMode === 'edit' ? 'تغيير الملف (اختياري)' : 'الملف'} required={formMode !== 'edit'} hint="PDF أو JPG أو PNG">
            <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickFile} />
          </FormField>
          {form.file && <p className="bm-hint"><bdi>{form.file.name}</bdi> · <bdi>{(form.file.size / 1024 / 1024).toFixed(2)}</bdi> MB</p>}
        </form>
      </Modal>

      {/* Preview */}
      <Modal
        open={Boolean(previewDocument)}
        onClose={() => setPreviewDocument(null)}
        title={previewDocument ? label(previewDocument.document_type) : ''}
        size="xl"
        footer={previewDocument && (
          <>
            <Button variant="secondary" icon="download" onClick={() => downloadDocument(previewDocument)}>تحميل</Button>
            {previewDocument.file_path && <Button variant="secondary" icon="link" href={previewDocument.file_path} target="_blank" rel="noopener noreferrer">فتح في نافذة جديدة</Button>}
          </>
        )}
      >
        {previewDocument?.file_path && <iframe src={previewDocument.file_path} className="bm-preview" title="معاينة المستند" />}
      </Modal>
    </Page>
  );
}

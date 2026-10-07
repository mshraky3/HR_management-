/**
 * Branch documents: the licences and certificates a branch must keep on file.
 * One card per required document type (missing / present / expiring / expired) with upload,
 * replace, preview, download and delete. Separate from employee documents.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Page, PageHeader, Card, StatCard, Button, Badge, Icon, Modal, FormField, Input, Select, Textarea, Alert, EmptyState,
  Skeleton, RowActions, useConfirm,
} from '../ui';
import { branchDocumentsAPI, branchesAPI, setDocumentBranchMapping } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { RESTRICTED_DOCUMENT_TYPES } from '../utils/documentRestrictions';
import UnifiedDatePicker from '../components/UnifiedDatePicker.jsx';
import BankSelect from '../components/BankSelect.jsx';
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, fileTooLargeMessage } from '../utils/uploadLimits';
import './BranchDocuments.css';

const ALL_DOCUMENT_TYPES = [
  { value: 'license', label: 'الترخيص', requiresDefaultFields: true, branchType: null },
  { value: 'registration', label: 'السجل التجاري', requiresDefaultFields: true, branchType: null },
  { value: 'iban_file', label: 'ملف الآيبان', requiresDefaultFields: false, branchType: null },
  { value: 'civil_defense_certificate', label: 'شهادة الدفاع المدني', requiresDefaultFields: true, branchType: null },
  { value: 'municipality_certificate', label: 'شهادة بلدي', requiresDefaultFields: true, branchType: null },
  { value: 'insurance_statement', label: 'كشف التأمينات', requiresDefaultFields: true, branchType: null },
  { value: 'rental_contract', label: 'عقد الايجار', requiresDefaultFields: true, branchType: null },
  { value: 'operational_plan', label: 'الخطة التشغلية للمركز', requiresDefaultFields: true, branchType: 'healthcare_center' },
  { value: 'owner_civil_id_copy', label: 'نسخه من هوية الاحوال الشخصية لمالك المركز', requiresDefaultFields: true, branchType: 'healthcare_center' },
  { value: 'student_cadre_file', label: 'بيانات الطلاب', requiresDefaultFields: false, branchType: 'healthcare_center' },
];

// Shown above the form when one of these types is chosen
const TYPE_NOTES = {
  student_cadre_file: 'يجب أن يحتوي المستند على:\n- أرقام جوالات أولياء الأمور\n- المواصلات\n- الخدمات المقدمة لهم',
};

// Bank code = characters 5-6 of a Saudi IBAN (SA + 2 check digits + 2-digit bank code + 18 digits)
const IBAN_BANKS = [
  { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', alternativeCodes: [] },
  { code: '80', nameAr: 'مصرف الراجحي', alternativeCodes: ['82'] },
  { code: '05', nameAr: 'مصرف الإنماء', alternativeCodes: [] },
  { code: '20', nameAr: 'بنك الرياض', alternativeCodes: [] },
  { code: '50', nameAr: 'البنك السعودي الأول (ساب)', alternativeCodes: [] },
  { code: '15', nameAr: 'بنك البلاد', alternativeCodes: [] },
  { code: '30', nameAr: 'البنك العربي الوطني', alternativeCodes: [] },
  { code: '45', nameAr: 'البنك السعودي الفرنسي', alternativeCodes: [] },
  { code: '60', nameAr: 'بنك الجزيرة', alternativeCodes: [] },
  { code: '55', nameAr: 'البنك السعودي للاستثمار', alternativeCodes: [] },
  { code: '90', nameAr: 'بنك الخليج الدولي (ميم)', alternativeCodes: [] },
  { code: '95', nameAr: 'بنك الإمارات دبي الوطني', alternativeCodes: [] },
  { code: '76', nameAr: 'بنك مسقط', alternativeCodes: [] },
  { code: '31', nameAr: 'بنك الكويت الوطني', alternativeCodes: [] },
];

/** Returns an Arabic error message, or null when the IBAN is well formed and belongs to the chosen bank. */
function ibanProblem(ibanNumber, bankName) {
  if (!ibanNumber || !bankName) return 'رقم الآيبان واسم البنك مطلوبان لمستندات الآيبان';
  const clean = ibanNumber.replace(/\s/g, '').toUpperCase();
  if (clean.length !== 24 || !clean.startsWith('SA')) return 'صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX';
  const code = clean.substring(4, 6);
  const bank = IBAN_BANKS.find((b) => b.code === code || b.alternativeCodes.includes(code));
  if (!bank) return 'كود البنك في IBAN غير معروف';
  if (bank.nameAr !== bankName) return `IBAN لا يطابق البنك المختار. IBAN يخص: ${bank.nameAr}`;
  return null;
}

const EMPTY_FORM = {
  branch_id: '', document_type: '', description: '', document_number: '', issue_date: '', issue_date_hijri: '',
  expiry_date: '', expiry_date_hijri: '', iban_number: '', bank_name: '', file: null,
};

const requiresDates = (type) => {
  const def = ALL_DOCUMENT_TYPES.find((t) => t.value === type);
  return def?.requiresDefaultFields !== false && type !== 'iban_file';
};

const daysUntil = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

/** missing | expired | soon (<= 30 days) | ok */
function documentState(doc) {
  if (!doc) return 'missing';
  const days = daysUntil(doc.expiry_date);
  if (days !== null && days < 0) return 'expired';
  if (days !== null && days <= 30) return 'soon';
  return 'ok';
}

const STATE_META = {
  missing: { label: 'غير مرفوع', tone: 'danger', icon: 'alert' },
  expired: { label: 'منتهي', tone: 'danger', icon: 'x-circle' },
  soon: { label: 'ينتهي قريباً', tone: 'warning', icon: 'clock' },
  ok: { label: 'مرفوع', tone: 'success', icon: 'check-circle' },
};

export default function BranchDocuments() {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();
  const isMain = isMainManager();

  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadData, setUploadData] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState(null); // { document, url }

  const branchId = useMemo(() => {
    const fromUrl = parseInt(searchParams.get('branch_id') || '0', 10) || null;
    if (isMain) return fromUrl;
    return user?.branch_id || null;
  }, [searchParams, isMain, user]);

  const currentBranch = useMemo(() => branches.find((b) => b.id === branchId) || null, [branches, branchId]);
  const currentBranchType = currentBranch?.branch_type || null;

  // ---- loading ---------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const query = { is_active: true };
        if (!isMain && user.branch_id) query.id = user.branch_id;
        const response = await branchesAPI.getAll(query);
        if (response.data.success) setBranches(response.data.data || []);
      } catch (error) {
        console.error('Error loading branches:', error);
      } finally {
        setBranchesLoaded(true);
      }
    })();
  }, [user, isMain]);

  const loadDocuments = useCallback(async () => {
    if (!branchId) return;
    try {
      setLoading(true);
      const response = await branchDocumentsAPI.getAll({ branch_id: branchId });
      if (response.data.success) {
        const docs = response.data.data || [];
        setDocuments(docs);
        // The API interceptor needs a document -> branch mapping for downloads
        docs.forEach((doc) => { if (doc.id && doc.branch_id) setDocumentBranchMapping(doc.id, doc.branch_id); });
      } else {
        setDocuments([]);
      }
    } catch (error) {
      console.error('Error loading branch documents:', error);
      if (error.response && error.response.status >= 400) {
        showError(`فشل تحميل مستندات الفرع: ${error.response?.data?.message || error.message}`);
      }
      setDocuments([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ---- derived ---------------------------------------------------------------------------------------------------------
  const documentTypes = useMemo(() => ALL_DOCUMENT_TYPES.filter((t) => {
    if (t.branchType && currentBranchType !== t.branchType) return false;
    if (!isMain && RESTRICTED_DOCUMENT_TYPES.includes(t.value)) return false; // hidden from branch managers
    return true;
  }), [currentBranchType, isMain]);

  const cards = useMemo(() => {
    if (!currentBranchType) return [];
    const list = documentTypes.map((type) => {
      const accepted = type.value === 'insurance_statement' ? ['insurance_statement', 'insurance_print'] : [type.value];
      const document = documents.find((d) => accepted.includes(d.document_type) && d.is_active !== false && (!isMain || d.branch_id === branchId)) || null;
      return { ...type, document, state: documentState(document) };
    });
    // student data first, everything else in the listed order
    return [...list].sort((a, b) => (b.value === 'student_cadre_file') - (a.value === 'student_cadre_file'));
  }, [documentTypes, documents, currentBranchType, isMain, branchId]);

  const counts = useMemo(() => ({
    total: cards.length,
    ok: cards.filter((c) => c.state === 'ok').length,
    missing: cards.filter((c) => c.state === 'missing').length,
    attention: cards.filter((c) => c.state === 'expired' || c.state === 'soon').length,
  }), [cards]);

  // ---- upload ----------------------------------------------------------------------------------------------------------
  const openUpload = (documentType = '') => {
    if (isMain && !branchId) { showError('اختر الفرع أولاً قبل رفع المستند'); return; }
    if (!currentBranchType) { showError('نوع الفرع غير معروف. يرجى اختيار فرع صالح ثم إعادة المحاولة'); return; }
    setUploadData({ ...EMPTY_FORM, branch_id: branchId, document_type: documentType || searchParams.get('document_type') || '' });
    setUploadOpen(true);
  };

  const closeUpload = () => { setUploadOpen(false); setUploadData(EMPTY_FORM); };

  const pickFile = (setter) => (e) => {
    const file = e.target.files[0] || null;
    if (file && file.size > MAX_UPLOAD_BYTES) {
      showWarning(fileTooLargeMessage(file.name));
      e.target.value = '';
      return;
    }
    setter((prev) => ({ ...prev, file }));
  };

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.document_type) { showWarning('الرجاء اختيار نوع المستند'); return; }
    if (!uploadData.file) { showWarning('الرجاء اختيار ملف'); return; }
    if (uploadData.file.size > MAX_UPLOAD_BYTES) { showWarning(fileTooLargeMessage(uploadData.file.name)); return; }
    if (uploadData.document_type === 'iban_file') {
      const problem = ibanProblem(uploadData.iban_number, uploadData.bank_name);
      if (problem) { showWarning(problem); return; }
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('branch_id', uploadData.branch_id);
      formData.append('document_type', uploadData.document_type);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (requiresDates(uploadData.document_type)) {
        ['document_number', 'issue_date', 'issue_date_hijri', 'expiry_date', 'expiry_date_hijri'].forEach((k) => {
          if (uploadData[k]) formData.append(k, uploadData[k]);
        });
      }
      if (uploadData.document_type === 'iban_file') {
        if (uploadData.iban_number) formData.append('iban_number', uploadData.iban_number);
        if (uploadData.bank_name) formData.append('bank_name', uploadData.bank_name);
      }
      await branchDocumentsAPI.upload(formData);
      showSuccess('تم رفع المستند بنجاح');
      closeUpload();
      loadDocuments();
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع المستند');
    } finally {
      setUploading(false);
    }
  };

  // ---- edit ------------------------------------------------------------------------------------------------------------
  const openEdit = (doc) => {
    setEditing(doc);
    setEditData({
      ...EMPTY_FORM,
      description: doc.description || '',
      document_number: doc.document_number || '',
      issue_date: doc.issue_date ? doc.issue_date.split('T')[0] : '',
      issue_date_hijri: doc.issue_date_hijri || '',
      expiry_date: doc.expiry_date ? doc.expiry_date.split('T')[0] : '',
      expiry_date_hijri: doc.expiry_date_hijri || '',
      iban_number: doc.iban_number || '',
      bank_name: doc.bank_name || '',
    });
  };

  const closeEdit = () => { setEditing(null); setEditData(EMPTY_FORM); };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (editing.document_type === 'iban_file') {
      const problem = ibanProblem(editData.iban_number, editData.bank_name);
      if (problem) { showWarning(problem); return; }
    }
    try {
      setSaving(true);
      const withDates = requiresDates(editing.document_type);
      if (editData.file) {
        const formData = new FormData();
        formData.append('file', editData.file);
        if (editData.description) formData.append('description', editData.description);
        if (withDates) {
          ['document_number', 'issue_date', 'issue_date_hijri', 'expiry_date', 'expiry_date_hijri'].forEach((k) => {
            if (editData[k]) formData.append(k, editData[k]);
          });
        }
        if (editing.document_type === 'iban_file') {
          if (editData.iban_number) formData.append('iban_number', editData.iban_number);
          if (editData.bank_name) formData.append('bank_name', editData.bank_name);
        }
        await branchDocumentsAPI.updateWithFile(editing.id, formData);
      } else {
        const payload = { description: editData.description };
        if (withDates) {
          payload.document_number = editData.document_number || null;
          payload.issue_date = editData.issue_date || null;
          payload.issue_date_hijri = editData.issue_date_hijri || null;
          payload.expiry_date = editData.expiry_date || null;
          payload.expiry_date_hijri = editData.expiry_date_hijri || null;
        }
        if (editing.document_type === 'iban_file') {
          payload.iban_number = editData.iban_number || null;
          payload.bank_name = editData.bank_name || null;
        }
        await branchDocumentsAPI.update(editing.id, payload);
      }
      closeEdit();
      loadDocuments();
      showSuccess('تم تحديث المستند بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل تحديث المستند');
    } finally {
      setSaving(false);
    }
  };

  // ---- file actions ----------------------------------------------------------------------------------------------------
  const download = async (id, fileName) => {
    try {
      setDownloading(id);
      const response = await branchDocumentsAPI.download(id);
      let filename = fileName || `document_${id}`;
      const disposition = response.headers['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename="?(.+)"?/i);
        if (match) filename = decodeURIComponent(match[1].replace(/"/g, ''));
      }
      if (!(response.data instanceof Blob)) throw new Error('Invalid response format');
      downloadFile(response.data, filename);
    } catch (error) {
      showError(`فشل تحميل المستند: ${error.response?.data?.message || error.message || 'فشل تحميل المستند'}`);
    } finally {
      setDownloading(null);
    }
  };

  const openPreview = async (doc) => {
    if (!localStorage.getItem('token')) { showWarning('يرجى تسجيل الدخول مرة أخرى'); return; }
    try {
      setPreviewLoading(doc.id);
      const response = await branchDocumentsAPI.download(doc.id);
      if (!(response.data instanceof Blob)) throw new Error('Invalid response format');
      const url = URL.createObjectURL(response.data);
      if (doc.mime_type?.startsWith('image/')) {
        setPreview({ document: doc, url });
      } else {
        const win = window.open(url, '_blank');
        if (!win) showWarning('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
      }
    } catch (error) {
      showError(`فشل عرض المستند: ${error.response?.data?.message || error.message || ''}`.trim());
    } finally {
      setPreviewLoading(null);
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const verify = async (id) => {
    try {
      await branchDocumentsAPI.verify(id);
      showSuccess('تم التحقق من المستند');
      loadDocuments();
    } catch {
      showError('فشل التحقق من المستند');
    }
  };

  const remove = async (doc, label) => {
    const ok = await confirm({
      title: 'حذف المستند',
      message: `هل أنت متأكد من حذف «${label}»؟ سيصبح المستند غير مرفوع.`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (!ok) return;
    try {
      await branchDocumentsAPI.delete(doc.id);
      showSuccess('تم حذف المستند');
      loadDocuments();
    } catch {
      showError('فشل حذف المستند');
    }
  };

  // ---- render ----------------------------------------------------------------------------------------------------------
  if (isMain && !branchId) {
    return (
      <Page>
        <PageHeader title="مستندات الفروع" back="/branches-monitoring" />
        <Card>
          <EmptyState
            icon="folder"
            title="اختر فرعاً لعرض مستنداته"
            description="افتح صفحة متابعة مستندات الفروع واختر الفرع الذي تريد مراجعته."
            action={<Button variant="primary" to="/branches-monitoring">متابعة مستندات الفروع</Button>}
          />
        </Card>
      </Page>
    );
  }

  const initialLoading = !branchesLoaded || (loading && documents.length === 0);
  const typeNote = TYPE_NOTES[uploadData.document_type];

  return (
    <Page>
      <PageHeader
        title="مستندات الفرع"
        subtitle={currentBranch ? `${currentBranch.branch_name} · ${currentBranch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}` : undefined}
        back={isMain ? '/branches-monitoring' : undefined}
        actions={<Button variant="primary" icon="upload" onClick={() => openUpload()}>رفع مستند</Button>}
      />

      <div className="ui-grid-stats">
        <StatCard label="المستندات المطلوبة" value={counts.total} icon="folder" tone="primary" loading={initialLoading} />
        <StatCard label="مرفوعة" value={counts.ok} icon="check-circle" tone="success" loading={initialLoading} />
        <StatCard label="غير مرفوعة" value={counts.missing} icon="alert" tone="danger" loading={initialLoading} />
        <StatCard label="منتهية أو تنتهي قريباً" value={counts.attention} icon="clock" tone="warning" loading={initialLoading} />
      </div>

      {initialLoading ? (
        <div className="bd-grid">
          {[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton lines={3} height={16} /></Card>)}
        </div>
      ) : cards.length === 0 ? (
        <Card><EmptyState icon="folder" title="لا توجد مستندات مطلوبة لهذا النوع من الفروع" /></Card>
      ) : (
        <ul className="bd-grid">
          {cards.map((card) => {
            const doc = card.document;
            const meta = STATE_META[card.state];
            const canPreview = doc?.mime_type && (doc.mime_type.startsWith('image/') || doc.mime_type === 'application/pdf');
            const canDelete = doc && (isMain || user?.branch_id === doc.branch_id);
            return (
              <li key={card.value} className={`bd-card bd-${card.state}`}>
                <div className="bd-head">
                  <span className={`bd-icon ui-tone-${meta.tone}`}><Icon name={meta.icon} size={22} /></span>
                  <div className="bd-title">
                    <h3>{card.label}</h3>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                </div>

                {doc ? (
                  <dl className="bd-facts">
                    <div><dt>الملف</dt><dd title={doc.file_name}>{doc.file_name}</dd></div>
                    <div><dt>تاريخ الرفع</dt><dd>{formatDate(doc.uploaded_at)}</dd></div>
                    {(doc.expiry_date || doc.expiry_date_hijri) && (
                      <div>
                        <dt>تاريخ الانتهاء</dt>
                        <dd>
                          {doc.expiry_date && formatDate(doc.expiry_date)}
                          {doc.expiry_date && doc.expiry_date_hijri && ' · '}
                          {doc.expiry_date_hijri && <span>{doc.expiry_date_hijri} هـ</span>}
                        </dd>
                      </div>
                    )}
                    {isMain && (
                      <div><dt>التحقق</dt><dd>{doc.is_verified ? <Badge tone="success">تم التحقق</Badge> : <Badge tone="neutral">بانتظار التحقق</Badge>}</dd></div>
                    )}
                  </dl>
                ) : (
                  <p className="bd-empty">لم يتم رفع هذا المستند بعد.</p>
                )}

                <div className="bd-actions">
                  {doc ? (
                    <>
                      <Button size="sm" variant="soft" icon="edit" onClick={() => openEdit(doc)}>تحديث</Button>
                      {canPreview && (
                        <Button size="sm" variant="secondary" icon="eye" loading={previewLoading === doc.id} onClick={() => openPreview(doc)}>معاينة</Button>
                      )}
                      <Button size="sm" variant="secondary" icon="download" loading={downloading === doc.id} onClick={() => download(doc.id, doc.file_name)}>تحميل</Button>
                      <RowActions actions={[
                        { label: 'التحقق من المستند', icon: 'check-circle', hidden: !(isMain && !doc.is_verified), onClick: () => verify(doc.id) },
                        { label: 'حذف', icon: 'trash', danger: true, hidden: !canDelete, onClick: () => remove(doc, card.label) },
                      ]} />
                    </>
                  ) : (
                    <Button size="sm" variant="primary" icon="upload" onClick={() => openUpload(card.value)}>رفع المستند</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Upload */}
      <Modal
        open={uploadOpen}
        onClose={uploading ? () => {} : closeUpload}
        title="رفع مستند فرع"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeUpload} disabled={uploading}>إلغاء</Button>
            <Button variant="primary" type="submit" form="bd-upload-form" icon="upload" loading={uploading}>رفع</Button>
          </>
        )}
      >
        <form id="bd-upload-form" onSubmit={submitUpload} className="ui-form-stack" noValidate>
          {isMain ? (
            <FormField label="الفرع" required>
              <Select
                value={uploadData.branch_id}
                onChange={(e) => setUploadData({ ...uploadData, branch_id: e.target.value })}
                options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                placeholder="اختر الفرع"
              />
            </FormField>
          ) : (
            <FormField label="الفرع">
              <Input value={currentBranch?.branch_name || 'فرعك'} disabled readOnly />
            </FormField>
          )}

          <FormField label="نوع المستند" required>
            <Select
              value={uploadData.document_type}
              onChange={(e) => setUploadData({ ...uploadData, document_type: e.target.value })}
              options={documentTypes.map((t) => ({ value: t.value, label: t.label }))}
              placeholder="اختر النوع"
            />
          </FormField>
          {typeNote && <Alert tone="info" title="تنبيه"><span className="bd-note">{typeNote}</span></Alert>}

          <FormField label="الملف" required hint={`PDF أو JPG أو PNG · الحد الأقصى ${MAX_UPLOAD_MB} ميجابايت`}>
            <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickFile(setUploadData)} />
          </FormField>

          {requiresDates(uploadData.document_type) && uploadData.document_type && (
            <div className="bd-form-grid">
              <FormField label="رقم المستند">
                <Input value={uploadData.document_number} onChange={(e) => setUploadData({ ...uploadData, document_number: e.target.value })} placeholder="رقم المستند" />
              </FormField>
              <UnifiedDatePicker
                label="تاريخ الإصدار"
                hijriValue={uploadData.issue_date_hijri}
                gregorianValue={uploadData.issue_date}
                onChange={(hijri, gregorian) => setUploadData((prev) => ({ ...prev, issue_date_hijri: hijri, issue_date: gregorian }))}
                dateType="general"
              />
              <UnifiedDatePicker
                label="تاريخ الانتهاء"
                hijriValue={uploadData.expiry_date_hijri}
                gregorianValue={uploadData.expiry_date}
                onChange={(hijri, gregorian) => setUploadData((prev) => ({ ...prev, expiry_date_hijri: hijri, expiry_date: gregorian }))}
                dateType="expiry_date"
              />
            </div>
          )}

          {uploadData.document_type === 'iban_file' && (
            <BankSelect
              label="البنك"
              value={uploadData.bank_name}
              onChange={(value) => setUploadData((prev) => ({ ...prev, bank_name: value }))}
              ibanValue={uploadData.iban_number}
              onIbanChange={(value) => setUploadData((prev) => ({ ...prev, iban_number: value }))}
              required
            />
          )}

          <FormField label="الوصف">
            <Textarea rows={3} value={uploadData.description} onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })} />
          </FormField>
        </form>
      </Modal>

      {/* Edit / replace */}
      <Modal
        open={Boolean(editing)}
        onClose={saving ? () => {} : closeEdit}
        title="تعديل المستند"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="bd-edit-form" loading={saving}>حفظ</Button>
          </>
        )}
      >
        {editing && (
          <form id="bd-edit-form" onSubmit={submitEdit} className="ui-form-stack" noValidate>
            <FormField label="الملف الحالي">
              <Input value={editing.file_name} disabled readOnly />
            </FormField>
            <FormField label="رفع ملف جديد (اختياري)" hint="اترك الحقل فارغاً للإبقاء على الملف الحالي">
              <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickFile(setEditData)} />
            </FormField>

            {requiresDates(editing.document_type) && (
              <div className="bd-form-grid">
                <FormField label="رقم المستند">
                  <Input value={editData.document_number} onChange={(e) => setEditData({ ...editData, document_number: e.target.value })} placeholder="رقم المستند" />
                </FormField>
                <UnifiedDatePicker
                  label="تاريخ الإصدار"
                  hijriValue={editData.issue_date_hijri}
                  gregorianValue={editData.issue_date}
                  onChange={(hijri, gregorian) => setEditData((prev) => ({ ...prev, issue_date_hijri: hijri, issue_date: gregorian }))}
                  dateType="general"
                />
                <UnifiedDatePicker
                  label="تاريخ الانتهاء"
                  hijriValue={editData.expiry_date_hijri}
                  gregorianValue={editData.expiry_date}
                  onChange={(hijri, gregorian) => setEditData((prev) => ({ ...prev, expiry_date_hijri: hijri, expiry_date: gregorian }))}
                  dateType="expiry_date"
                />
              </div>
            )}

            {editing.document_type === 'iban_file' && (
              <BankSelect
                label="البنك"
                value={editData.bank_name}
                onChange={(value) => setEditData((prev) => ({ ...prev, bank_name: value }))}
                ibanValue={editData.iban_number}
                onIbanChange={(value) => setEditData((prev) => ({ ...prev, iban_number: value }))}
                required
              />
            )}

            <FormField label="الوصف">
              <Textarea rows={3} value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
            </FormField>
          </form>
        )}
      </Modal>

      {/* Image preview */}
      <Modal open={Boolean(preview)} onClose={closePreview} title={preview?.document.file_name} size="xl">
        {preview && <img className="bd-preview" src={preview.url} alt={preview.document.file_name} />}
      </Modal>
    </Page>
  );
}

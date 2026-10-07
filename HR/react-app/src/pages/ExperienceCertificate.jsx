/**
 * Certificates (head office): find an employee with one search box, review and edit the certificate data,
 * generate the PDF (experience certificate, salary letter, specialties letter), preview it, download it or send it
 * to the branch as a notification.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Page, PageHeader, Card, SearchInput, Select, FormField, Input, Button, Badge, Alert, Chip, ChipGroup, DataTable, Modal,
} from '../ui';
import { employeesAPI, notificationsAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useBranches } from '../hooks/useBranches';
import UnifiedDatePicker from '../components/UnifiedDatePicker.jsx';
import './ExperienceCertificate.css';

const CERTIFICATE_TYPES = [
  { value: 'experience', label: 'شهادة الخبرة', placeholder: 'شهادة خبرة' },
  { value: 'salary', label: 'تعريف الراتب', placeholder: 'خطاب تعريف راتب' },
  { value: 'specialties', label: 'تعريف هيئة التخصصات', placeholder: 'تعريف هيئة التخصصات' },
];

const SALARY_PARTS = [
  { key: 'basic_salary', label: 'الراتب الأساسي' },
  { key: 'housing_allowance', label: 'بدل السكن' },
  { key: 'transportation_allowance', label: 'بدل النقل' },
  { key: 'annual_leave_allowance', label: 'بدل الإجازة السنوية' },
  { key: 'end_of_service_allowance', label: 'بدل نهاية الخدمة' },
  { key: 'other_allowances', label: 'بدلات أخرى' },
];

const EMPTY_CERTIFICATE = {
  full_name: '', id_number: '', nationality: '', job_title: '',
  contract_start_date: '', contract_start_date_gregorian: '', contract_end_date: '', contract_end_date_gregorian: '',
  salary: '', basic_salary: '', housing_allowance: '', transportation_allowance: '', annual_leave_allowance: '',
  end_of_service_allowance: '', other_allowances: '',
  recipient: 'الي من يهمه الامر', employer: 'شركة الرعاية المتناهية', custom_title: '',
};

const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

/** Total of the six salary components ('' when there is none). */
const calcSalaryTotal = (data) => {
  const total = SALARY_PARTS.reduce((sum, p) => sum + (parseFloat(data[p.key]) || 0), 0);
  return total > 0 ? total.toString() : '';
};

export default function ExperienceCertificate() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { branches: rawBranches } = useBranches();
  const branches = useMemo(() => [...rawBranches].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')), [rawBranches]);

  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [certificateType, setCertificateType] = useState('experience');
  const [certificateData, setCertificateData] = useState(EMPTY_CERTIFICATE);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const timerRef = useRef(null);

  const term = search.trim();
  const hasQuery = term.length >= 2 || Boolean(branchId);
  const typeInfo = CERTIFICATE_TYPES.find((t) => t.value === certificateType);
  const typeName = certificateType === 'salary' ? 'تعريف الراتب' : 'شهادة الخبرة';

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

  // Fill the form from the chosen employee
  useEffect(() => {
    if (!selected) return;
    const str = (v) => (v ? String(v) : '');
    const data = {
      full_name: fullName(selected),
      id_number: selected.id_or_residency_number || '',
      nationality: selected.nationality || '',
      job_title: selected.job_title || selected.occupation || '',
      contract_start_date: selected.contract_start_date_hijri || '',
      contract_start_date_gregorian: selected.contract_start_date_gregorian || '',
      contract_end_date: selected.contract_end_date_hijri || '',
      contract_end_date_gregorian: selected.contract_end_date_gregorian || '',
      basic_salary: str(selected.base_salary),
      housing_allowance: str(selected.housing_allowance),
      transportation_allowance: str(selected.transportation_allowance),
      annual_leave_allowance: str(selected.annual_leave_allowance),
      end_of_service_allowance: str(selected.end_of_service_allowance),
      other_allowances: str(selected.other_allowances),
    };
    setCertificateData((prev) => ({
      ...EMPTY_CERTIFICATE, ...data, salary: calcSalaryTotal(data), recipient: prev.recipient || EMPTY_CERTIFICATE.recipient,
      employer: prev.employer || EMPTY_CERTIFICATE.employer, custom_title: prev.custom_title || '',
    }));
  }, [selected]);

  const set = (field) => (e) => setCertificateData((prev) => ({ ...prev, [field]: e.target.value }));
  const setSalaryPart = (field) => (e) => setCertificateData((prev) => {
    const next = { ...prev, [field]: e.target.value };
    next.salary = calcSalaryTotal(next);
    return next;
  });
  const setDate = (prefix) => (hijri, gregorian) => setCertificateData((prev) => ({ ...prev, [prefix]: hijri, [`${prefix}_gregorian`]: gregorian }));

  const missingFields = useMemo(() => {
    if (!selected) return [];
    const d = certificateData;
    const hasFourNames = selected.first_name && selected.second_name && selected.third_name && selected.fourth_name;
    const list = [];
    if (!hasFourNames && !d.full_name.trim()) list.push('الاسم الكامل');
    if (!d.id_number.trim()) list.push('رقم الهوية/الإقامة');
    if (!d.nationality.trim()) list.push('الجنسية');
    if (!d.job_title.trim()) list.push('المسمى الوظيفي');
    if (!d.contract_start_date_gregorian.trim()) list.push('تاريخ بداية العقد');
    if (!d.contract_end_date_gregorian.trim()) list.push('تاريخ نهاية العقد');
    return list;
  }, [selected, certificateData]);

  const clearSearch = () => { setSearch(''); setBranchId(''); setEmployees([]); setSelected(null); };

  const sendMissingDataNotification = async () => {
    if (!selected || missingFields.length === 0) return;
    try {
      setSending(true);
      await notificationsAPI.create({
        message: `يرجى إكمال بيانات الموظف ${fullName(selected)} لإصدار ${typeName}. البيانات المطلوبة: ${missingFields.join('، ')}`,
        importance_level: 2,
        branch_ids: [selected.branch_id],
        duration_days: 7,
      });
      showSuccess('تم إرسال الإشعار للفرع بنجاح');
    } catch (error) {
      console.error('Error sending notification:', error);
      showError(error.response?.data?.message || 'فشل إرسال الإشعار');
    } finally {
      setSending(false);
    }
  };

  const fileNameFor = () => `${certificateType === 'salary' ? 'تعريف_راتب' : 'شهادة_خبرة'}_${certificateData.full_name || (selected ? fullName(selected) : 'موظف')}.pdf`;

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const sendToBranch = async () => {
    if (!selected || !pdfBlob) return;
    try {
      setSending(true);
      const name = certificateData.full_name || fullName(selected);
      const formData = new FormData();
      formData.append('message', `تم إنشاء ${typeName} للموظف ${name}. المرفق: ${typeName}`);
      formData.append('importance_level', '2');
      formData.append('branch_ids', JSON.stringify([selected.branch_id]));
      formData.append('duration_days', '7');
      formData.append('file', pdfBlob, fileNameFor());
      await notificationsAPI.create(formData);
      showSuccess(`تم إرسال ${typeName} للفرع بنجاح`);
      closePreview();
    } catch (error) {
      console.error('Error sending certificate to branch:', error);
      showError(error.response?.data?.message || 'فشل إرسال الشهادة');
    } finally {
      setSending(false);
    }
  };

  const generate = async () => {
    if (!selected) { showWarning('الرجاء اختيار موظف'); return; }
    const d = certificateData;
    try {
      setGenerating(true);
      const response = await employeesAPI.generateCertificate({
        employee_id: selected.id,
        certificate_type: certificateType,
        certificate_data: {
          full_name: d.full_name,
          id_number: d.id_number,
          nationality: d.nationality,
          job_title: d.job_title,
          contract_start_date: d.contract_start_date_gregorian || d.contract_start_date,
          contract_end_date: d.contract_end_date_gregorian || d.contract_end_date,
          salary: d.salary,
          basic_salary: d.basic_salary,
          housing_allowance: d.housing_allowance,
          transportation_allowance: d.transportation_allowance,
          annual_leave_allowance: d.annual_leave_allowance,
          end_of_service_allowance: d.end_of_service_allowance,
          other_allowances: d.other_allowances,
          recipient: d.recipient,
          employer: d.employer,
          custom_title: d.custom_title || '',
        },
      }, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      setPdfBlob(blob);
      setPreviewUrl(window.URL.createObjectURL(blob));
      showSuccess('تم إنشاء الشهادة بنجاح');
    } catch (error) {
      console.error('Error generating certificate:', error);
      showError(error.response?.data?.message || error.message || 'فشل إنشاء الشهادة');
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

  const missing = (value) => (value ? undefined : 'هذا الحقل ناقص');

  if (!isMainManager()) return null;

  return (
    <Page>
      <PageHeader
        title="الشهادات والتعاريف"
        subtitle="ابحث عن موظف، راجع بياناته، ثم أنشئ الشهادة بصيغة PDF"
        actions={selected ? <Button variant="primary" icon="file-text" loading={generating} onClick={generate}>إنشاء الشهادة</Button> : null}
      />

      <Card
        title="البحث عن الموظف"
        subtitle="اكتب جزءاً من الاسم أو رقم الهوية أو رقم الموظف أو الجوال أو البريد في خانة واحدة"
        actions={(search || branchId) ? <Button size="sm" variant="ghost" icon="x" onClick={clearSearch}>مسح البحث</Button> : null}
      >
        <div className="ec-search">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو البريد…" />
          <FormField label="الفرع">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))} placeholder="جميع الفروع" />
          </FormField>
        </div>
        {term.length === 1 && !branchId && <p className="ec-hint">أدخل حرفين على الأقل</p>}
      </Card>

      {hasQuery && (
        <Card title="نتائج البحث" flush>
          <DataTable columns={columns} rows={employees} rowKey="id" loading={searching} onRowClick={setSelected} emptyIcon="search" emptyTitle="لا يوجد موظفون ينطبق عليهم البحث" />
        </Card>
      )}

      {selected && (
        <>
          <Card title="نوع الشهادة">
            <ChipGroup aria-label="نوع الشهادة">
              {CERTIFICATE_TYPES.map((t) => <Chip key={t.value} selected={certificateType === t.value} onClick={() => setCertificateType(t.value)}>{t.label}</Chip>)}
            </ChipGroup>
          </Card>

          <Card title={`بيانات الشهادة · ${fullName(selected)}`} subtitle="راجع البيانات وعدّلها قبل الإنشاء. الحقول الناقصة مميّزة.">
            <div className="ui-form-stack">
              {missingFields.length > 0 && (
                <Alert
                  tone="warning"
                  title="البيانات التالية ناقصة"
                  action={<Button size="sm" variant="secondary" icon="bell" loading={sending} onClick={sendMissingDataNotification}>إشعار الفرع لإكمالها</Button>}
                >
                  {missingFields.join('، ')}
                </Alert>
              )}

              <div className="ec-grid">
                <FormField label="عنوان الشهادة" className="ec-wide"><Input value={certificateData.custom_title} onChange={set('custom_title')} placeholder={typeInfo?.placeholder} /></FormField>
                <FormField label="الاسم الكامل" error={missing(certificateData.full_name)}><Input value={certificateData.full_name} onChange={set('full_name')} placeholder="أدخل الاسم الكامل" /></FormField>
                <FormField label="رقم الهوية/الإقامة" error={missing(certificateData.id_number)}><Input value={certificateData.id_number} onChange={set('id_number')} dir="ltr" placeholder="أدخل رقم الهوية/الإقامة" /></FormField>
                <FormField label="الجنسية" error={missing(certificateData.nationality)}><Input value={certificateData.nationality} onChange={set('nationality')} placeholder="أدخل الجنسية" /></FormField>
                <FormField label="المسمى الوظيفي" error={missing(certificateData.job_title)}><Input value={certificateData.job_title} onChange={set('job_title')} placeholder="أدخل المسمى الوظيفي" /></FormField>
                <FormField label="تاريخ بداية العقد" error={missing(certificateData.contract_start_date_gregorian)}>
                  <UnifiedDatePicker label="" hijriValue={certificateData.contract_start_date || ''} gregorianValue={certificateData.contract_start_date_gregorian || ''} onChange={setDate('contract_start_date')} dateType="general" />
                </FormField>
                <FormField label="تاريخ نهاية العقد" error={missing(certificateData.contract_end_date_gregorian)}>
                  <UnifiedDatePicker label="" hijriValue={certificateData.contract_end_date || ''} gregorianValue={certificateData.contract_end_date_gregorian || ''} onChange={setDate('contract_end_date')} dateType="general" />
                </FormField>
              </div>

              {certificateType === 'salary' && (
                <div className="ec-grid">
                  {SALARY_PARTS.map((p) => (
                    <FormField key={p.key} label={p.label}><Input type="number" min="0" value={certificateData[p.key]} onChange={setSalaryPart(p.key)} placeholder={`أدخل ${p.label}`} /></FormField>
                  ))}
                  <FormField label="الراتب الإجمالي" hint="يُحسب تلقائياً"><Input value={certificateData.salary} readOnly placeholder="يتم الحساب تلقائياً" /></FormField>
                  <FormField label="إلى"><Input value={certificateData.recipient} onChange={set('recipient')} placeholder="الي من يهمه الامر" /></FormField>
                  <FormField label="جهة العمل"><Input value={certificateData.employer} onChange={set('employer')} placeholder="شركة الرعاية المتناهية" /></FormField>
                </div>
              )}

              <div>
                <Button variant="primary" icon="file-text" loading={generating} onClick={generate}>إنشاء الشهادة</Button>
              </div>
            </div>
          </Card>
        </>
      )}

      <Modal
        open={Boolean(pdfBlob && previewUrl)}
        onClose={closePreview}
        title="معاينة الشهادة"
        size="xl"
        footer={(
          <>
            <Button variant="primary" icon="download" onClick={() => downloadFile(pdfBlob, fileNameFor())}>تحميل</Button>
            <Button variant="success" icon="mail" loading={sending} onClick={sendToBranch}>إرسال الشهادة للفرع</Button>
            <Button variant="secondary" onClick={closePreview}>إغلاق</Button>
          </>
        )}
      >
        {previewUrl && <iframe className="ec-preview" src={previewUrl} title="معاينة الشهادة" />}
      </Modal>
    </Page>
  );
}

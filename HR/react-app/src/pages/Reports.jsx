/**
 * Reports: build an employee report (pick branches, columns, filters and attached documents),
 * preview it, then export it as PDF or Excel.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Page, PageHeader, Card, Button, Badge, Chip, ChipGroup, Input, FormField, SearchInput, Modal, Alert, Skeleton, EmptyState,
  DataTable, Pagination, Icon, useConfirm,
} from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, reportsAPI, documentsAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import { DATA_COMPLETION_STATUS, getDocumentTypeLabel, DOCUMENT_TYPE_LABELS } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { translateValue } from '../utils/translations';
import './Reports.css';

const availableFields = [
  { value: 'employee_id_number', label: 'رقم الموظف' },
  { value: 'full_name', label: 'الاسم الكامل' },
  { value: 'first_name', label: 'الاسم الأول' },
  { value: 'second_name', label: 'الاسم الثاني' },
  { value: 'third_name', label: 'الاسم الثالث' },
  { value: 'fourth_name', label: 'الاسم الرابع' },
  { value: 'branch_id', label: 'الفرع' },
  { value: 'id_or_residency_number', label: 'رقم الهوية/الإقامة' },
  { value: 'id_type', label: 'نوع الهوية' },
  { value: 'id_expiry_date_hijri', label: 'تاريخ انتهاء الهوية (هجري)' },
  { value: 'id_expiry_date_gregorian', label: 'تاريخ انتهاء الهوية (ميلادي)' },
  { value: 'occupation', label: 'المهنة' },
  { value: 'job_title', label: 'المسمى الوظيفي' },
  { value: 'nationality', label: 'الجنسية' },
  { value: 'gender', label: 'الجنس' },
  { value: 'date_of_birth_hijri', label: 'تاريخ الميلاد (هجري)' },
  { value: 'date_of_birth_gregorian', label: 'تاريخ الميلاد (ميلادي)' },
  { value: 'age', label: 'العمر' },
  { value: 'phone_number', label: 'رقم الهاتف' },
  { value: 'email', label: 'البريد الإلكتروني' },
  { value: 'bank_iban', label: 'الآيبان' },
  { value: 'bank_name', label: 'اسم البنك' },
  { value: 'religion', label: 'الديانة' },
  { value: 'marital_status', label: 'الحالة الاجتماعية' },
  { value: 'educational_qualification', label: 'المؤهل التعليمي' },
  { value: 'specialization', label: 'التخصص' },
  { value: 'graduation_year', label: 'سنة التخرج' },
  { value: 'university_gpa', label: 'المعدل التراكمي' },
  { value: 'contract_type', label: 'نوع العقد' },
  { value: 'contract_start_date_hijri', label: 'تاريخ بداية العقد (هجري)' },
  { value: 'contract_start_date_gregorian', label: 'تاريخ بداية العقد (ميلادي)' },
  { value: 'contract_end_date_hijri', label: 'تاريخ نهاية العقد (هجري)' },
  { value: 'contract_end_date_gregorian', label: 'تاريخ نهاية العقد (ميلادي)' },
  { value: 'contract_days_remaining', label: 'الأيام المتبقية للعقد' },
  { value: 'national_address', label: 'العنوان الوطني' },
  { value: 'years_of_experience_in_same_institution', label: 'سنوات الخبرة في نفس المؤسسة' },
  { value: 'years_of_experience_in_company', label: 'سنوات الخبرة في الشركة' },
  { value: 'salary', label: 'الراتب' },
  { value: 'base_salary', label: 'الراتب الأساسي' },
  { value: 'housing_allowance', label: 'بدل السكن' },
  { value: 'transportation_allowance', label: 'بدل المواصلات' },
  { value: 'end_of_service_allowance', label: 'بدل نهاية الخدمة' },
  { value: 'annual_leave_allowance', label: 'بدل الإجازة السنوية' },
  { value: 'other_allowances', label: 'بدلات أخرى' },
  { value: 'total_salary', label: 'اجمالي الراتب' },
  { value: 'passport_number', label: 'رقم الجواز' },
  { value: 'passport_issue_date', label: 'تاريخ إصدار الجواز' },
  { value: 'passport_expiry_date', label: 'تاريخ انتهاء الجواز' },
  { value: 'passport_issue_place', label: 'مكان إصدار الجواز' },
  { value: 'residency_issue_date', label: 'تاريخ إصدار الإقامة' },
  { value: 'status', label: 'الحالة' },
  { value: 'data_completion_status', label: 'حالة إكمال البيانات' },
];
const FIELD_LABEL = Object.fromEntries(availableFields.map((f) => [f.value, f.label]));

// Contract-expiry filter buckets, computed from contract_end_date_gregorian (days remaining)
const CONTRACT_EXPIRY_OPTIONS = [
  { value: 'expired', label: 'منتهي' },
  { value: 'within_30', label: '0 - 30 يوم' },
  { value: 'within_60', label: '31 - 60 يوم' },
  { value: 'within_90', label: '61 - 90 يوم' },
  { value: 'over_90', label: 'أكثر من 90 يوم' },
];

const REPORT_TEMPLATES = {
  contactInfo: { title: 'تقرير بيانات التواصل', hint: 'الاسم، رقم الجوال، الإيميل، رقم الهوية/الإقامة', icon: 'phone', fields: ['full_name', 'phone_number', 'email', 'id_or_residency_number'] },
  bankAccounts: { title: 'تقرير الحسابات البنكية', hint: 'الاسم، رقم الآيبان، رقم الهوية، اسم البنك', icon: 'wallet', fields: ['full_name', 'bank_iban', 'id_or_residency_number', 'bank_name'] },
  jobs: { title: 'تقرير الوظائف', hint: 'الاسم، المهنة، المسمى الوظيفي، الجنسية', icon: 'users', fields: ['full_name', 'occupation', 'job_title', 'nationality'] },
};

const EMPTY_FILTERS = {
  nationality: [], job_title: [], gender: [], marital_status: [], educational_qualification: [],
  contract_type: [], data_completion_status: [], contract_expiry: [], min_age: '', max_age: '',
};

const EXPORT_CONFIRM_THRESHOLD = 500;

const matchesContractBucket = (daysRemaining, bucket) => {
  if (daysRemaining === null) return false;
  switch (bucket) {
    case 'expired': return daysRemaining < 0;
    case 'within_30': return daysRemaining >= 0 && daysRemaining <= 30;
    case 'within_60': return daysRemaining >= 31 && daysRemaining <= 60;
    case 'within_90': return daysRemaining >= 61 && daysRemaining <= 90;
    case 'over_90': return daysRemaining > 90;
    default: return false;
  }
};

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

// Days until the contract ends (from the Gregorian end date). Negative = expired.
const calculateDaysRemaining = (endDate) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - today) / (1000 * 60 * 60 * 24));
};

const fullNameOf = (emp) => {
  const names = [emp.first_name, emp.second_name, emp.third_name, emp.fourth_name].filter((n) => n && n.trim());
  return names.length > 0 ? names.join(' ') : emp.full_name || '';
};

const DATE_FIELDS = new Set([
  'date_of_birth_gregorian', 'id_expiry_date_gregorian', 'passport_issue_date', 'passport_expiry_date',
  'residency_issue_date', 'contract_start_date_gregorian', 'contract_end_date_gregorian',
]);
const TRANSLATED_FIELDS = new Set(['gender', 'id_type', 'marital_status', 'religion', 'status', 'data_completion_status']);

function displayValue(emp, field, branches) {
  const value = emp[field];
  if (field === 'full_name') return fullNameOf(emp) || '-';
  if (field === 'branch_id') return branches.find((b) => b.id === emp.branch_id)?.branch_name || emp.branch_id || '-';
  if (field === 'age') {
    const age = calculateAge(emp.date_of_birth_gregorian);
    return age !== null ? age.toString() : '-';
  }
  if (field === 'contract_days_remaining') {
    const d = calculateDaysRemaining(emp.contract_end_date_gregorian);
    if (d === null) return '-';
    if (d < 0) return 'منتهي';
    if (d === 0) return 'ينتهي اليوم';
    return `${d} يوم متبقي`;
  }
  if (field === 'total_salary') {
    if (emp.total_salary != null) return parseFloat(emp.total_salary).toFixed(2);
    const total = ['base_salary', 'housing_allowance', 'transportation_allowance', 'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances']
      .reduce((sum, k) => sum + (parseFloat(emp[k]) || 0), 0);
    return total > 0 ? total.toFixed(2) : '0.00';
  }
  if (DATE_FIELDS.has(field)) return value ? formatDate(value) : '-';
  if (TRANSLATED_FIELDS.has(field)) return translateValue(field, value || '-');
  return value ?? '-';
}

const Step = ({ n, children }) => (
  <span className="rp-step-title"><span className="rp-step" aria-hidden="true">{n}</span>{children}</span>
);

export default function Reports() {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMain = isMainManager();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Branch selection: head office picks many; a branch manager has one fixed branch.
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);
  const [selectAllBranches, setSelectAllBranches] = useState(false);
  const [currentBranchId, setCurrentBranchId] = useState(null);
  const [branchQuery, setBranchQuery] = useState('');

  const [selectedFields, setSelectedFields] = useState(['full_name', 'id_or_residency_number']);
  const [fieldQuery, setFieldQuery] = useState('');
  const [reportTitle, setReportTitle] = useState('التقارير');

  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);

  const [generating, setGenerating] = useState(null); // null | 'pdf' | 'excel'
  const [fileType, setFileType] = useState('pdf');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [missingDocumentsInfo, setMissingDocumentsInfo] = useState(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({
    nationalities: [], jobTitles: [], maritalStatuses: [], educationalQualifications: [], contractTypes: [],
  });

  const getCurrentBranchId = useCallback(() => (
    currentBranchId
    || (!isMain && user?.branch_id ? user.branch_id : null)
    || (isMain ? parseInt(searchParams.get('branch_id') || '0', 10) || null : null)
  ), [currentBranchId, isMain, user, searchParams]);

  const resolveBranchIds = () => (isMain
    ? (selectAllBranches ? branches.map((b) => b.id) : selectedBranchIds)
    : (selectedBranchId ? [selectedBranchId] : (user?.branch_id ? [user.branch_id] : [])));

  const hasBranchSelection = isMain ? (selectAllBranches || selectedBranchIds.length > 0) : Boolean(selectedBranchId);
  const hasMultipleBranches = isMain && (selectAllBranches || selectedBranchIds.length > 1);

  // ---- loading -------------------------------------------------------------------------------------------------------
  const loadBranches = async () => {
    try {
      const query = { is_active: true };
      if (!isMain && user?.branch_id) query.id = user.branch_id;
      const response = await branchesAPI.getAll(query);
      if (response.data.success) {
        setBranches(response.data.data || []);
        if (!isMain && user?.branch_id) {
          setCurrentBranchId(user.branch_id);
          setSelectedBranchId(user.branch_id); // a branch manager has exactly one branch: no picker needed
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      showError('فشل تحميل الفروع');
    } finally {
      setLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const query = { is_active: true };
      if (!isMain && user?.branch_id) {
        query.branch_id = user.branch_id;
      } else if (isMain && !selectAllBranches && selectedBranchIds.length > 0) {
        query.branch_id = selectedBranchIds.length === 1 ? selectedBranchIds[0] : selectedBranchIds;
      } else if (!isMain && selectedBranchId) {
        query.branch_id = selectedBranchId;
      }
      const response = await employeesAPI.getAll(query);
      if (response.data.success) {
        const list = response.data.data || [];
        const uniq = (key) => [...new Set(list.map((e) => e[key]).filter(Boolean))].sort();
        setFilterOptions({
          nationalities: uniq('nationality'),
          jobTitles: uniq('job_title'),
          maritalStatuses: uniq('marital_status'),
          educationalQualifications: uniq('educational_qualification'),
          contractTypes: uniq('contract_type'),
        });
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBranches(); }, [isMain, user]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFilterOptions(); }, [selectedBranchIds, selectAllBranches, selectedBranchId, isMain, user]);

  // Head office can arrive from another page with ?branch_id=
  useEffect(() => {
    if (isMain && branches.length > 0) {
      const fromUrl = searchParams.get('branch_id');
      if (fromUrl) {
        const branchId = parseInt(fromUrl, 10);
        setCurrentBranchId(branchId);
        setSelectedBranchIds([branchId]);
        setSelectedBranchId(branchId);
        setSelectAllBranches(false);
      } else {
        setCurrentBranchId(null);
        setSelectedBranchId(null);
        setSelectedBranchIds([]);
        setSelectAllBranches(false);
      }
    }
  }, [searchParams, isMain, branches]);

  // A multi-branch report always carries the branch column
  useEffect(() => {
    if (hasMultipleBranches && !selectedFields.includes('branch_id')) {
      setSelectedFields((prev) => [...prev, 'branch_id']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectAllBranches, selectedBranchIds]);

  // Choosing documents forces PDF (Excel cannot embed them)
  useEffect(() => {
    if (selectedDocuments.length > 0 && fileType === 'excel') setFileType('pdf');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocuments]);

  // ---- filters ---------------------------------------------------------------------------------------------------------
  const toggleFilter = (key, value) => setFilters((prev) => ({
    ...prev,
    [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
  }));
  const clearFilter = (key) => setFilters((prev) => ({ ...prev, [key]: [] }));
  const clearAgeFilter = () => setFilters((prev) => ({ ...prev, min_age: '', max_age: '' }));
  const activeFiltersCount = Object.values(filters).reduce((count, val) => {
    if (Array.isArray(val)) return count + val.length;
    return val !== '' && val !== null && val !== undefined ? count + 1 : count;
  }, 0);

  const filterByAge = (list) => {
    if (!filters.min_age && !filters.max_age) return list;
    const minAge = filters.min_age ? parseInt(filters.min_age, 10) : null;
    const maxAge = filters.max_age ? parseInt(filters.max_age, 10) : null;
    return list.filter((emp) => {
      const age = calculateAge(emp.date_of_birth_gregorian);
      if (age === null) return false;
      if (minAge !== null && age < minAge) return false;
      if (maxAge !== null && age > maxAge) return false;
      return true;
    });
  };

  const filterByContractExpiry = (list) => {
    const buckets = filters.contract_expiry;
    if (!buckets || buckets.length === 0) return list;
    return list.filter((emp) => {
      const days = calculateDaysRemaining(emp.contract_end_date_gregorian);
      return buckets.some((bucket) => matchesContractBucket(days, bucket));
    });
  };

  const filterGroups = [
    { key: 'nationality', label: 'الجنسية', options: filterOptions.nationalities.map((v) => ({ value: v, label: v })) },
    { key: 'job_title', label: 'المسمى الوظيفي', options: filterOptions.jobTitles.map((v) => ({ value: v, label: v })) },
    { key: 'gender', label: 'الجنس', options: [{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }] },
    { key: 'marital_status', label: 'الحالة الاجتماعية', options: filterOptions.maritalStatuses.map((v) => ({ value: v, label: translateValue('marital_status', v) })) },
    { key: 'educational_qualification', label: 'المؤهل التعليمي', options: filterOptions.educationalQualifications.map((v) => ({ value: v, label: v })) },
    { key: 'contract_type', label: 'نوع العقد', options: filterOptions.contractTypes.map((v) => ({ value: v, label: v })) },
    {
      key: 'data_completion_status', label: 'حالة إكمال البيانات',
      options: [{ value: DATA_COMPLETION_STATUS.COMPLETE, label: 'مكتمل' }, { value: DATA_COMPLETION_STATUS.INCOMPLETE, label: 'غير مكتمل' }],
    },
    { key: 'contract_expiry', label: 'انتهاء العقد', options: CONTRACT_EXPIRY_OPTIONS },
  ];

  // ---- fields / templates ----------------------------------------------------------------------------------------------
  const toggleField = (value) => setSelectedFields((prev) => (prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]));

  const applyTemplate = (key) => {
    const template = REPORT_TEMPLATES[key];
    setReportTitle(template.title);
    const fields = [...template.fields];
    if (hasMultipleBranches && !fields.includes('branch_id')) fields.push('branch_id');
    setSelectedFields(fields);
    showSuccess(`تم تطبيق ${template.title} بنجاح`);
  };

  // ---- preview ---------------------------------------------------------------------------------------------------------
  const loadPreview = async () => {
    const branchIds = resolveBranchIds();
    if (branchIds.length === 0) {
      showWarning('الرجاء اختيار فرع للعرض');
      return;
    }
    if (selectedFields.length === 0) {
      showWarning('اختر حقل واحد على الأقل');
      return;
    }
    try {
      setPreviewLoading(true);
      const branchParam = branchIds.length === 1 ? branchIds[0] : branchIds;

      const totalResponse = await employeesAPI.getAll({ branch_id: branchParam, is_active: true });
      if (totalResponse.data.success) setTotalEmployees(totalResponse.data.data?.length || 0);

      const queryParams = { branch_id: branchParam, is_active: true };
      ['nationality', 'job_title', 'gender', 'marital_status', 'educational_qualification', 'contract_type', 'data_completion_status'].forEach((key) => {
        if (filters[key].length > 0) queryParams[key] = filters[key].join(',');
      });

      const response = await employeesAPI.getAll(queryParams);
      if (response.data.success) {
        let list = response.data.data || [];
        list = filterByContractExpiry(filterByAge(list));
        list = list.sort((a, b) => fullNameOf(a).trim().toLowerCase().localeCompare(fullNameOf(b).trim().toLowerCase(), 'ar'));
        setEmployees(list);
        setPreviewPage(1);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      showError('فشل تحميل الموظفين');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Reload the preview whenever the branch selection or a filter changes
  useEffect(() => {
    if (hasBranchSelection) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedBranchIds, selectAllBranches, filters, isMain]);

  const copyCell = async (text) => {
    const value = String(text ?? '').trim();
    if (!value || value === '-') return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess('تم نسخ البيانات');
    } catch {
      showError('فشل نسخ البيانات');
    }
  };

  // ---- export ----------------------------------------------------------------------------------------------------------
  const checkMissingDocuments = async (list, docTypes) => {
    if (!docTypes || docTypes.length === 0) return null;
    const missingInfo = {};
    for (const employee of list) {
      try {
        const docsResponse = await documentsAPI.getByEmployeeId(employee.id);
        const have = (docsResponse.data.success ? docsResponse.data.data : []).map((d) => d.document_type);
        const missing = docTypes.filter((t) => !have.includes(t));
        if (missing.length > 0) missingInfo[employee.id] = { name: fullNameOf(employee), missing };
      } catch (error) {
        console.error(`Error checking documents for employee ${employee.id}:`, error);
      }
    }
    return Object.keys(missingInfo).length > 0 ? missingInfo : null;
  };

  const proceedGenerateReport = async (fileTypeToUse) => {
    if (!reportTitle.trim()) {
      showWarning('الرجاء إدخال عنوان التقرير');
      return;
    }
    const branchIds = isMain
      ? (selectAllBranches ? branches.map((b) => b.id) : selectedBranchIds)
      : [getCurrentBranchId() || selectedBranchId || user?.branch_id].filter(Boolean);
    if (branchIds.length === 0) {
      showWarning('الرجاء تحديد فرع واحد على الأقل');
      return;
    }

    try {
      setGenerating(fileTypeToUse);

      const cleanFilters = {};
      Object.keys(filters).forEach((key) => {
        const value = filters[key];
        if (Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && value !== undefined) cleanFilters[key] = value;
      });
      if (cleanFilters.min_age) cleanFilters.min_age = parseInt(cleanFilters.min_age, 10);
      if (cleanFilters.max_age) cleanFilters.max_age = parseInt(cleanFilters.max_age, 10);

      if (selectedDocuments.length > 0) {
        try {
          const employeesResponse = await employeesAPI.getAll({
            ...cleanFilters,
            branch_id: branchIds.length === 1 ? branchIds[0] : branchIds,
            is_active: true,
          });
          if (employeesResponse.data.success) {
            const list = filterByContractExpiry(filterByAge(employeesResponse.data.data || []));
            const missingInfo = await checkMissingDocuments(list, selectedDocuments);
            if (missingInfo) {
              setMissingDocumentsInfo(missingInfo);
              return;
            }
          }
        } catch (error) {
          console.error('Error checking missing documents:', error);
        }
      }

      // Documents can only be embedded in a PDF
      const finalFileType = selectedDocuments.length > 0 ? 'pdf' : fileTypeToUse;
      const response = await reportsAPI.generate({
        title: reportTitle,
        filters: cleanFilters,
        selectedFields,
        selectedDocuments: selectedDocuments.length > 0 ? selectedDocuments : undefined,
        branch_ids: branchIds,
        branch_id: !isMain ? getCurrentBranchId() : undefined,
        fileType: finalFileType,
      }, { responseType: 'blob' });

      const mimeType = finalFileType === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: mimeType });
      downloadFile(blob, `${reportTitle}.${finalFileType === 'excel' ? 'xlsx' : 'pdf'}`);
      showSuccess('تم إنشاء التقرير بنجاح');
    } catch (error) {
      console.error('Error generating report:', error);
      showError(error.response?.data?.message || 'فشل إنشاء التقرير');
    } finally {
      setGenerating(null);
    }
  };

  const startExport = async (type) => {
    setFileType(type);
    if (resolveBranchIds().length === 0) {
      showWarning('الرجاء اختيار فرع');
      return;
    }
    if (selectedFields.length === 0) {
      showWarning('الرجاء اختيار حقل واحد على الأقل');
      return;
    }
    if (type === 'excel' && selectedDocuments.length > 0) {
      showWarning('عند اختيار المستندات، يجب أن يكون التقرير بصيغة PDF فقط');
      return;
    }
    if (employees.length > EXPORT_CONFIRM_THRESHOLD) {
      const ok = await confirm({
        title: 'تأكيد التصدير',
        message: `عدد الموظفين في التقرير هو ${employees.length}. قد تستغرق العملية وقتاً طويلاً وقد تؤثر على أداء الخادم. هل تريد المتابعة؟`,
        confirmText: 'متابعة',
      });
      if (!ok) return;
    }
    await proceedGenerateReport(type);
  };

  const continueWithMissing = async () => {
    setMissingDocumentsInfo(null);
    await proceedGenerateReport(fileType);
  };

  // ---- derived view data -----------------------------------------------------------------------------------------------
  const branchSummary = (() => {
    if (!hasBranchSelection) return 'لم يتم الاختيار';
    if (isMain) {
      if (selectAllBranches) return 'كل الفروع';
      if (selectedBranchIds.length === 1) return branches.find((b) => b.id === selectedBranchIds[0])?.branch_name || 'فرع محدد';
      return `${selectedBranchIds.length} فروع محددة`;
    }
    return branches.find((b) => b.id === selectedBranchId)?.branch_name || 'فرع محدد';
  })();

  const visibleBranches = useMemo(() => {
    const q = branchQuery.trim().toLowerCase();
    return branches.filter((b) => !q || b.branch_name.toLowerCase().includes(q) || b.branch_location?.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  const visibleFields = useMemo(() => {
    const q = fieldQuery.trim();
    return q ? availableFields.filter((f) => f.label.includes(q)) : availableFields;
  }, [fieldQuery]);

  const completeCount = employees.filter((e) => e.data_completion_status === 'complete').length;

  const previewColumns = selectedFields.map((f) => ({
    key: f,
    header: FIELD_LABEL[f] || f,
    mobilePrimary: f === 'full_name',
    render: (emp) => {
      const value = displayValue(emp, f, branches);
      return (
        <button type="button" className="rp-cell" title="انقر للنسخ" onClick={() => copyCell(value)}>{value}</button>
      );
    },
  }));
  const previewRows = employees.slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize);

  const selectBranch = (id) => {
    setSelectedBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSelectAllBranches(false);
    setSearchParams({});
  };

  return (
    <Page>
      <PageHeader
        title="التقارير"
        subtitle={isMain ? 'اختر الفروع والحقول ثم صدّر التقرير بصيغة PDF أو Excel' : 'اختر الحقول ثم صدّر تقرير موظفي فرعك بصيغة PDF أو Excel'}
      />

      <section aria-labelledby="rp-templates">
        <h2 id="rp-templates" className="rp-section-title">ابدأ من نموذج جاهز</h2>
        <div className="rp-templates">
          {Object.entries(REPORT_TEMPLATES).map(([key, t]) => (
            <button key={key} type="button" className="rp-template" onClick={() => applyTemplate(key)}>
              <span className="rp-template-icon"><Icon name={t.icon} /></span>
              <span className="rp-template-text">
                <strong>{t.title}</strong>
                <span>{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="rp-layout">
        <div className="rp-steps">
          {isMain && (
            <Card
              title={<Step n="١">الفروع</Step>}
              subtitle="اختر فرعاً أو أكثر، أو كل الفروع"
              actions={(
                <>
                  <Button size="sm" variant="soft" onClick={() => { setSelectAllBranches(true); setSelectedBranchIds([]); setCurrentBranchId(null); setSelectedBranchId(null); setSearchParams({}); }}>
                    تحديد الكل
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectAllBranches(false); setSelectedBranchIds([]); setSearchParams({}); }}>
                    مسح
                  </Button>
                </>
              )}
            >
              <div className="ui-form-stack">
                <SearchInput value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} onClear={() => setBranchQuery('')} placeholder="ابحث عن فرع…" />
                {loading ? (
                  <Skeleton lines={2} height={36} />
                ) : visibleBranches.length === 0 ? (
                  <p className="rp-muted">لا توجد فروع مطابقة</p>
                ) : (
                  <ChipGroup aria-label="الفروع">
                    {visibleBranches.map((b) => (
                      <Chip key={b.id} selected={selectAllBranches || selectedBranchIds.includes(b.id)} onClick={() => selectBranch(b.id)}>{b.branch_name}</Chip>
                    ))}
                  </ChipGroup>
                )}
              </div>
            </Card>
          )}

          <Card
            title={<Step n={isMain ? '٢' : '١'}>الحقول</Step>}
            subtitle="تظهر الأعمدة في التقرير بنفس ترتيب اختيارك"
            actions={(
              <>
                <Badge tone="info"><bdi>{selectedFields.length}</bdi> محدد</Badge>
                <Button size="sm" variant="soft" onClick={() => setSelectedFields(availableFields.map((f) => f.value))}>تحديد الكل</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedFields([])}>مسح</Button>
              </>
            )}
          >
            <div className="ui-form-stack">
              <SearchInput value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} onClear={() => setFieldQuery('')} placeholder="ابحث عن حقل…" />
              {visibleFields.length === 0 ? (
                <p className="rp-muted">لا توجد حقول مطابقة</p>
              ) : (
                <ChipGroup aria-label="الحقول">
                  {visibleFields.map((f) => (
                    <Chip key={f.value} selected={selectedFields.includes(f.value)} onClick={() => toggleField(f.value)}>{f.label}</Chip>
                  ))}
                </ChipGroup>
              )}
            </div>
          </Card>

          <Card
            title={<Step n={isMain ? '٣' : '٢'}>الفلاتر</Step>}
            subtitle="اختياري: حصر التقرير في فئة معينة من الموظفين"
            actions={(
              <>
                {activeFiltersCount > 0 && <Badge tone="info"><bdi>{activeFiltersCount}</bdi> فلتر</Badge>}
                {activeFiltersCount > 0 && <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>مسح الكل</Button>}
                <Button size="sm" variant="secondary" iconEnd={filtersOpen ? 'chevron-up' : 'chevron-down'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
                  {filtersOpen ? 'إخفاء' : 'عرض الفلاتر'}
                </Button>
              </>
            )}
          >
            {filtersOpen ? (
              <div className="rp-filter-grid">
                {filterGroups.map((g) => (
                  <div key={g.key} className="rp-filter">
                    <div className="rp-filter-head">
                      <strong>{g.label}</strong>
                      {filters[g.key].length > 0 && <button type="button" className="rp-clear" onClick={() => clearFilter(g.key)}>مسح</button>}
                    </div>
                    {g.options.length === 0 ? (
                      <span className="rp-muted">لا توجد خيارات</span>
                    ) : (
                      <ChipGroup aria-label={g.label}>
                        {g.options.map((o) => (
                          <Chip key={o.value} selected={filters[g.key].includes(o.value)} onClick={() => toggleFilter(g.key, o.value)}>{o.label}</Chip>
                        ))}
                      </ChipGroup>
                    )}
                  </div>
                ))}
                <div className="rp-filter">
                  <div className="rp-filter-head">
                    <strong>العمر</strong>
                    {(filters.min_age || filters.max_age) && <button type="button" className="rp-clear" onClick={clearAgeFilter}>مسح</button>}
                  </div>
                  <div className="rp-age">
                    <FormField label="من">
                      <Input type="number" min="0" value={filters.min_age} onChange={(e) => setFilters({ ...filters, min_age: e.target.value })} placeholder="الحد الأدنى" />
                    </FormField>
                    <FormField label="إلى">
                      <Input type="number" min="0" value={filters.max_age} onChange={(e) => setFilters({ ...filters, max_age: e.target.value })} placeholder="الحد الأقصى" />
                    </FormField>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rp-muted">{activeFiltersCount > 0 ? `${activeFiltersCount} فلتر مفعّل` : 'لا توجد فلاتر: سيشمل التقرير جميع الموظفين النشطين'}</p>
            )}
          </Card>

          <Card
            title={<Step n={isMain ? '٤' : '٣'}>مستندات الموظفين</Step>}
            subtitle="اختياري: عند اختيار مستندات يُنشأ تقرير PDF لكل موظف مع مستنداته"
            actions={(
              <>
                {selectedDocuments.length > 0 && <Badge tone="info"><bdi>{selectedDocuments.length}</bdi> محدد</Badge>}
                <Button size="sm" variant="secondary" iconEnd={docsOpen ? 'chevron-up' : 'chevron-down'} aria-expanded={docsOpen} onClick={() => setDocsOpen((o) => !o)}>
                  {docsOpen ? 'إخفاء' : 'اختيار المستندات'}
                </Button>
              </>
            )}
          >
            {docsOpen ? (
              <div className="ui-form-stack">
                <div className="rp-inline-actions">
                  <Button size="sm" variant="soft" onClick={() => setSelectedDocuments(Object.keys(DOCUMENT_TYPE_LABELS))}>تحديد الكل</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDocuments([])}>مسح</Button>
                </div>
                <ChipGroup aria-label="المستندات">
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([type, label]) => (
                    <Chip
                      key={type}
                      selected={selectedDocuments.includes(type)}
                      onClick={() => setSelectedDocuments((prev) => (prev.includes(type) ? prev.filter((d) => d !== type) : [...prev, type]))}
                    >
                      {label}
                    </Chip>
                  ))}
                </ChipGroup>
              </div>
            ) : (
              <p className="rp-muted">{selectedDocuments.length > 0 ? `${selectedDocuments.length} نوع مستند محدد` : 'لم يتم اختيار مستندات'}</p>
            )}
          </Card>
        </div>

        <aside className="rp-summary" aria-label="ملخص التقرير">
          <Card title="ملخص التقرير">
            <div className="ui-form-stack">
              <FormField label="عنوان التقرير" required>
                <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="أدخل عنوان التقرير" />
              </FormField>

              <dl className="rp-facts">
                <div><dt>الفروع</dt><dd>{branchSummary}</dd></div>
                <div><dt>الموظفون</dt><dd><bdi>{employees.length}</bdi> من <bdi>{totalEmployees}</bdi></dd></div>
                <div><dt>مكتمل / غير مكتمل</dt><dd><bdi>{completeCount}</bdi> / <bdi>{employees.length - completeCount}</bdi></dd></div>
                <div><dt>الحقول</dt><dd><bdi>{selectedFields.length}</bdi></dd></div>
                <div><dt>الفلاتر</dt><dd><bdi>{activeFiltersCount}</bdi></dd></div>
                <div><dt>المستندات</dt><dd><bdi>{selectedDocuments.length}</bdi></dd></div>
              </dl>

              {!hasBranchSelection && <Alert tone="warning">اختر فرعاً واحداً على الأقل لعرض المعاينة والتصدير.</Alert>}
              {selectedDocuments.length > 0 && <Alert tone="info">مع المستندات يتوفر التصدير بصيغة PDF فقط.</Alert>}

              <div className="rp-actions">
                <Button variant="primary" icon="download" loading={generating === 'pdf'} disabled={Boolean(generating)} onClick={() => startExport('pdf')}>تصدير PDF</Button>
                <Button variant="secondary" icon="file-text" loading={generating === 'excel'} disabled={Boolean(generating) || selectedDocuments.length > 0} onClick={() => startExport('excel')}>تصدير Excel</Button>
                <Button variant="ghost" icon="refresh" loading={previewLoading} disabled={!hasBranchSelection} onClick={loadPreview}>تحديث المعاينة</Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <Card
        title="معاينة التقرير"
        subtitle="انقر على أي خلية لنسخ قيمتها"
        actions={employees.length > 0 && <Badge tone="neutral"><bdi>{employees.length}</bdi> موظف</Badge>}
        flush
      >
        {!hasBranchSelection ? (
          <EmptyState icon="file" title="اختر فرعاً لعرض المعاينة" description="ستظهر هنا بيانات الموظفين بحسب الحقول والفلاتر المحددة." />
        ) : selectedFields.length === 0 ? (
          <EmptyState icon="list-check" title="اختر حقلاً واحداً على الأقل" description="حدد الأعمدة التي تريدها في التقرير." />
        ) : (
          <DataTable
            columns={previewColumns}
            rows={previewRows}
            rowKey="id"
            loading={previewLoading}
            emptyIcon="users"
            emptyTitle="لا توجد بيانات للعرض"
            emptyDescription="لا يوجد موظفون يطابقون الفلاتر الحالية."
            footer={employees.length > previewPageSize ? (
              <Pagination
                page={previewPage}
                pageSize={previewPageSize}
                total={employees.length}
                onPageChange={setPreviewPage}
                onPageSizeChange={(n) => { setPreviewPageSize(n); setPreviewPage(1); }}
              />
            ) : null}
          />
        )}
      </Card>

      <Modal
        open={Boolean(generating)}
        onClose={() => {}}
        hideClose
        closeOnOverlay={false}
        size="sm"
        title="جاري إنشاء التقرير"
        description="قد يستغرق ذلك دقيقة للتقارير الكبيرة. لا تغلق الصفحة."
      >
        <div className="rp-generating" role="status">
          <span className="ui-spinner" style={{ width: 40, height: 40 }} />
          <span>{generating === 'excel' ? 'نجهّز ملف Excel…' : 'نجهّز ملف PDF…'}</span>
        </div>
      </Modal>

      <Modal
        open={Boolean(missingDocumentsInfo)}
        onClose={() => setMissingDocumentsInfo(null)}
        title="مستندات مفقودة"
        description="بعض الموظفين لا يمتلكون المستندات المختارة. سيُكتب «مستند غير متواجد» في التقرير مكان كل مستند مفقود."
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setMissingDocumentsInfo(null)}>إلغاء</Button>
            <Button variant="primary" onClick={continueWithMissing}>المتابعة مع المستندات المفقودة</Button>
          </>
        )}
      >
        {missingDocumentsInfo && (
          <ul className="rp-missing">
            {Object.entries(missingDocumentsInfo).map(([employeeId, info]) => (
              <li key={employeeId}>
                <strong>{info.name}</strong>
                <ChipGroup aria-label={`المستندات المفقودة لـ ${info.name}`}>
                  {info.missing.map((t) => <Badge key={t} tone="danger">{getDocumentTypeLabel(t)}</Badge>)}
                </ChipGroup>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </Page>
  );
}

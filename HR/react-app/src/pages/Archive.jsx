/**
 * Archive Page
 * View and manage archived employees and branch documents
 * Main Manager only
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  Page, PageHeader, Card, Tabs, Button, Badge, StatusBadge, FormField, Input, Select, Textarea, DataTable, Pagination,
  Modal, Alert, Skeleton, EmptyState, useConfirm,
} from '../ui';
import { archiveAPI, branchesAPI, documentsAPI, branchDocumentsAPI } from '../utils/api';
import { getDocumentTypeLabel, getBranchDocumentTypeLabel } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import './Archive.css';

const Archive = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState('employees'); // 'employees', 'documents', 'employee-documents', or 'branches'

  // Employees state
  const [archivedEmployees, setArchivedEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // Archived Branches state
  const [archivedBranches, setArchivedBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [reactivatingBranchId, setReactivatingBranchId] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', reason: '' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalEmployees, setTotalEmployees] = useState(0);

  // Branch Documents state
  const [archivedDocuments, setArchivedDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Employee Documents state
  const [archivedEmployeeDocuments, setArchivedEmployeeDocuments] = useState([]);
  const [loadingEmployeeDocuments, setLoadingEmployeeDocuments] = useState(true);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    // Employee document filters
    emp_doc_branch_id: '',
    emp_doc_document_type: '',
    emp_doc_employee_id: '',
    // Employee filters
    search_name: '',
    search_id: '',
    branch_id: '',
    status: '',
    academic_year: '',
    registration_date_from: '',
    registration_date_to: '',
    status_change_date_from: '',
    status_change_date_to: '',
    // Document filters
    doc_branch_id: '',
    doc_document_type: ''
  });

  const [branches, setBranches] = useState([]);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setBranches(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadArchivedBranches = async () => {
    try {
      setLoadingBranches(true);
      const response = await branchesAPI.getAll({ is_active: false });
      if (response.data.success) {
        setArchivedBranches(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading archived branches:', error);
      showError('فشل تحميل الفروع المؤرشفة');
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleReactivateBranch = async (branchId, branchName) => {
    const confirmMessage = `هل أنت متأكد من إعادة تفعيل الفرع "${branchName}"؟`;

    if (!await confirm({ message: confirmMessage })) {
      return;
    }

    try {
      setReactivatingBranchId(branchId);
      const response = await branchesAPI.update(branchId, { is_active: true });

      if (response.data.success) {
        showSuccess('تم إعادة تفعيل الفرع بنجاح');
        // Reload archived branches and active branches
        loadArchivedBranches();
        loadBranches();
      }
    } catch (error) {
      console.error('Error reactivating branch:', error);
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else {
        showError('فشل إعادة تفعيل الفرع');
      }
    } finally {
      setReactivatingBranchId(null);
    }
  };

  const loadArchivedEmployees = async (page = currentPage) => {
    try {
      setLoadingEmployees(true);
      const filterParams = {};

      // Add search filters (now server-side)
      if (filters.search_name) {
        filterParams.search_name = filters.search_name;
      }
      if (filters.search_id) {
        filterParams.search_id = filters.search_id;
      }
      if (filters.branch_id) {
        filterParams.branch_id = parseInt(filters.branch_id);
      }
      if (filters.status) {
        filterParams.status = filters.status;
      }
      if (filters.academic_year) {
        filterParams.academic_year = filters.academic_year;
      }
      if (filters.registration_date_from) {
        filterParams.registration_date_from = filters.registration_date_from;
      }
      if (filters.registration_date_to) {
        filterParams.registration_date_to = filters.registration_date_to;
      }
      if (filters.status_change_date_from) {
        filterParams.status_change_date_from = filters.status_change_date_from;
      }
      if (filters.status_change_date_to) {
        filterParams.status_change_date_to = filters.status_change_date_to;
      }

      // Add pagination
      filterParams.limit = itemsPerPage;
      filterParams.page = page;

      const response = await archiveAPI.getAll(filterParams);

      if (response.data.success) {
        setArchivedEmployees(response.data.data || []);
        setTotalEmployees(response.data.total || 0);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Error loading archived employees:', error);
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else {
        showError('فشل تحميل الموظفين المؤرشفين');
      }
    } finally {
      setLoadingEmployees(false);
    }
  };

  const loadArchivedDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const filterParams = {};

      if (filters.doc_branch_id) {
        filterParams.branch_id = parseInt(filters.doc_branch_id);
      }
      if (filters.doc_document_type) {
        filterParams.document_type = filters.doc_document_type;
      }

      const response = await archiveAPI.getArchivedBranchDocuments(filterParams);

      if (response.data.success) {
        setArchivedDocuments(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading archived documents:', error);
      showError('فشل تحميل المستندات المؤرشفة');
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadBranches();
    if (activeTab === 'employees') {
      loadArchivedEmployees();
    } else if (activeTab === 'documents') {
      loadArchivedDocuments();
    } else if (activeTab === 'employee-documents') {
      loadArchivedEmployeeDocuments();
    } else if (activeTab === 'branches') {
      loadArchivedBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager, activeTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (activeTab === 'employees') {
      setCurrentPage(1);
      loadArchivedEmployees(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search_name, filters.search_id, filters.branch_id, filters.status,
  filters.academic_year, filters.registration_date_from, filters.registration_date_to,
  filters.status_change_date_from, filters.status_change_date_to, itemsPerPage]);

  // Load page when currentPage changes (but not when filters change)
  useEffect(() => {
    if (activeTab === 'employees') {
      loadArchivedEmployees(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadArchivedDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.doc_branch_id, filters.doc_document_type]);

  const loadArchivedEmployeeDocuments = async () => {
    try {
      setLoadingEmployeeDocuments(true);
      const filterParams = {};

      if (filters.emp_doc_branch_id) {
        filterParams.branch_id = parseInt(filters.emp_doc_branch_id);
      }
      if (filters.emp_doc_document_type) {
        filterParams.document_type = filters.emp_doc_document_type;
      }
      if (filters.emp_doc_employee_id) {
        filterParams.employee_id = parseInt(filters.emp_doc_employee_id);
      }

      const response = await archiveAPI.getArchivedEmployeeDocuments(filterParams);

      if (response.data.success) {
        setArchivedEmployeeDocuments(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading archived employee documents:', error);
      showError('فشل تحميل المستندات المؤرشفة');
    } finally {
      setLoadingEmployeeDocuments(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'employee-documents') {
      loadArchivedEmployeeDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.emp_doc_branch_id, filters.emp_doc_document_type, filters.emp_doc_employee_id]);

  const handlePermanentDeleteDocument = async (documentId) => {
    if (!await confirm({ message: 'هل أنت متأكد من رغبتك في حذف هذا المستند نهائياً؟ لا يمكن التراجع عن هذا الإجراء.', tone: 'danger' })) {
      return;
    }

    try {
      setDeletingDocumentId(documentId);
      await archiveAPI.permanentDeleteEmployeeDocument(documentId);
      showSuccess('تم حذف المستند نهائياً');
      loadArchivedEmployeeDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else {
        showError('فشل حذف المستند');
      }
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handlePermanentDeleteEmployee = async (employeeId, employeeName) => {
    const confirmMessage = `هل أنت متأكد من رغبتك في حذف الموظف "${employeeName}" نهائياً؟\n\nسيتم حذف جميع بيانات الموظف ومستنداته بشكل دائم.\nلا يمكن التراجع عن هذا الإجراء.`;

    if (!await confirm({ message: confirmMessage })) {
      return;
    }

    try {
      await archiveAPI.permanentDelete(employeeId);
      showSuccess('تم حذف الموظف وبياناته ومستنداته نهائياً');
      // Reload archived employees list
      loadArchivedEmployees(currentPage);
      // Clear selected employee if it was the deleted one
      if (selectedEmployee === employeeId) {
        setSelectedEmployee(null);
        setEmployeeDetails(null);
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else {
        showError('فشل حذف الموظف');
      }
    }
  };

  const handleViewEmployee = async (employeeId) => {
    if (selectedEmployee === employeeId && employeeDetails) {
      setSelectedEmployee(null);
      setEmployeeDetails(null);
      return;
    }

    try {
      setLoadingDetails(true);
      setSelectedEmployee(employeeId);
      const response = await archiveAPI.getById(employeeId);

      if (response.data.success) {
        setEmployeeDetails(response.data.data);
      }
    } catch (error) {
      console.error('Error loading employee details:', error);
      showError('فشل تحميل تفاصيل الموظف');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRestoreEmployee = async (employeeId, employeeName) => {
    if (!await confirm({ message: `هل أنت متأكد من استعادة الموظف "${employeeName}" إلى حالة نشط؟` })) return;
    try {
      const response = await archiveAPI.restore(employeeId, {
        status: 'active',
        reason: 'تم الاستعادة من الأرشيف'
      });
      if (response.data.success) {
        showSuccess(response.data.message || 'تم استعادة الموظف بنجاح');
        loadArchivedEmployees(currentPage);
      }
    } catch (error) {
      console.error('Error restoring employee:', error);
      showError(error.response?.data?.message || 'فشل استعادة الموظف');
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusForm.status) {
      showWarning('يرجى اختيار حالة');
      return;
    }

    // Check if trying to restore (change to active/pending)
    const archivedStatuses = ['terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
    const currentStatus = employeeDetails?.status;
    const isRestore = archivedStatuses.includes(currentStatus) &&
      (statusForm.status === 'active' || statusForm.status === 'pending');

    if (isRestore) {
      // Check if the employee's branch is deleted — block restore client-side
      if (employeeDetails?.branch_is_active === false) {
        showError('لا يمكن استعادة موظف فرعه محذوف. يجب استعادة الفرع أولاً');
        return;
      }
      // Use restore endpoint
      try {
        setUpdatingStatus(true);
        const response = await archiveAPI.restore(selectedEmployee, {
          status: statusForm.status,
          reason: statusForm.reason || 'تم الاستعادة من الأرشيف'
        });

        if (response.data.success) {
          showSuccess(response.data.message || 'تم استعادة الموظف بنجاح');
          setShowStatusModal(false);
          setStatusForm({ status: '', reason: '' });
          setSelectedEmployee(null);
          setEmployeeDetails(null);
          loadArchivedEmployees(currentPage);
        }
      } catch (error) {
        console.error('Error restoring employee:', error);
        showError(error.response?.data?.message || 'فشل استعادة الموظف');
      } finally {
        setUpdatingStatus(false);
      }
    } else {
      // Regular status update
      try {
        setUpdatingStatus(true);
        const response = await archiveAPI.updateStatus(selectedEmployee, {
          status: statusForm.status,
          reason: statusForm.reason || null
        });

        if (response.data.success) {
          showSuccess('تم تحديث حالة الموظف بنجاح');
          setShowStatusModal(false);
          setStatusForm({ status: '', reason: '' });
          loadArchivedEmployees(currentPage);
          if (selectedEmployee) {
            handleViewEmployee(selectedEmployee); // Reload details
          }
        }
      } catch (error) {
        console.error('Error updating status:', error);
        showError(error.response?.data?.message || 'فشل تحديث الحالة');
      } finally {
        setUpdatingStatus(false);
      }
    }
  };

  const handleStatusUpdateClick = (employee) => {
    setSelectedEmployee(employee.id);
    setStatusForm({
      status: employee.status || '',
      reason: employee.status_change_reason || ''
    });
    setShowStatusModal(true);
  };


  const handleDownloadDocument = async (doc) => {
    try {
      const response = await documentsAPI.download(doc.id);
      const blob = await response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || 'document';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess('تم تحميل المستند بنجاح');
    } catch (error) {
      console.error('Error downloading document:', error);
      showError('فشل تحميل المستند');
    }
  };

  const handlePreviewDocument = async (doc) => {
    try {
      setPreviewDocument(doc);

      // Always proxy through backend download endpoint for authenticated blob access
      try {
        const downloadResponse = await documentsAPI.download(doc.id);
        if (downloadResponse.data instanceof Blob) {
          const url = window.URL.createObjectURL(downloadResponse.data);
          setPreviewUrl(url);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (previewError) {
        console.error('Error loading preview:', previewError);
        throw previewError;
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewUrl(null);
    }
  };

  const handleDownloadBranchDocument = async (doc) => {
    try {
      const response = await branchDocumentsAPI.download(doc.id);
      const blob = await response.data;
      downloadFile(blob, doc.file_name || 'document');
      showSuccess('تم تحميل المستند بنجاح');
    } catch (error) {
      console.error('Error downloading document:', error);
      showError('فشل تحميل المستند');
    }
  };

  const handlePreviewBranchDocument = async (doc) => {
    try {
      setPreviewDocument(doc);

      // Always proxy through backend download endpoint for authenticated blob access
      try {
        const downloadResponse = await branchDocumentsAPI.download(doc.id);
        if (downloadResponse.data instanceof Blob) {
          const url = window.URL.createObjectURL(downloadResponse.data);
          setPreviewUrl(url);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (previewError) {
        console.error('Error loading branch doc preview:', previewError);
        throw previewError;
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewUrl(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const filterParams = {};

      // Build filter params same as loadArchivedEmployees
      if (filters.search_name) filterParams.search_name = filters.search_name;
      if (filters.search_id) filterParams.search_id = filters.search_id;
      if (filters.branch_id) filterParams.branch_id = parseInt(filters.branch_id);
      if (filters.status) filterParams.status = filters.status;
      if (filters.academic_year) filterParams.academic_year = filters.academic_year;
      if (filters.registration_date_from) filterParams.registration_date_from = filters.registration_date_from;
      if (filters.registration_date_to) filterParams.registration_date_to = filters.registration_date_to;
      if (filters.status_change_date_from) filterParams.status_change_date_from = filters.status_change_date_from;
      if (filters.status_change_date_to) filterParams.status_change_date_to = filters.status_change_date_to;

      const response = await archiveAPI.export(filterParams, 'excel');

      // Create blob from arraybuffer
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      downloadFile(blob, `archived-employees-${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('تم تصدير البيانات بنجاح');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showError(error.response?.data?.message || 'فشل تصدير البيانات');
    }
  };


  const handleGenerateReport = async () => {
    try {
      // Use the same report generation as Reports page
      // Filter archived employees for the report
      const employeeIds = archivedEmployees.map(emp => emp.id);
      if (employeeIds.length === 0) {
        showWarning('لا توجد موظفين مؤرشفين لإنشاء تقرير');
        return;
      }

      // Navigate to reports page with archived employee filter
      navigate('/reports', {
        state: {
          archivedEmployeeIds: employeeIds,
          archiveMode: true
        }
      });
    } catch (error) {
      console.error('Error generating report:', error);
      showError('فشل إنشاء التقرير');
    }
  };

  const statusLabels = {
    active: 'نشط',
    pending: 'قيد الانتظار',
    terminated_article_80: 'إنهاء المادة 80',
    terminated_article_77: 'إنهاء المادة 77',
    resigned: 'استقالة',
    contract_ended: 'انتهاء العقد',
    non_renewal: 'عدم التجديد',
    other: 'محذوف'
  };

  const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');
  const dateOrDash = (v) => (v ? formatDate(v) : '—');
  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const branchOptions = branches.map((b) => ({ value: String(b.id), label: b.branch_name }));
  const typeOptions = (docs, labelOf) => [...new Set(docs.map((d) => d.document_type))].map((t) => ({ value: t, label: labelOf(t) || t }));
  const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

  const closePreview = () => {
    setPreviewDocument(null);
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };
  const closeStatusModal = () => {
    if (updatingStatus) return;
    setShowStatusModal(false);
    setStatusForm({ status: '', reason: '' });
  };

  if (!isMainManager()) {
    return (
      <Page>
        <PageHeader title="غير مصرح" />
        <Alert tone="warning">هذه الصفحة متاحة فقط للمدير الرئيسي</Alert>
      </Page>
    );
  }

  const resetFilters = () => {
    setFilters((prev) => ({
      ...prev,
      search_name: '', search_id: '', branch_id: '', status: '', academic_year: '',
      registration_date_from: '', registration_date_to: '', status_change_date_from: '', status_change_date_to: '',
    }));
    setCurrentPage(1);
  };

  const employeeColumns = [
    { key: 'num', header: 'رقم الموظف', mobileHidden: true, render: (e) => <bdi>{e.employee_id_number || '—'}</bdi> },
    { key: 'name', header: 'الاسم', mobilePrimary: true, render: (e) => <strong>{fullName(e)}</strong> },
    { key: 'branch', header: 'الفرع', render: (e) => e.branch_name || '—' },
    { key: 'status', header: 'الحالة', render: (e) => <StatusBadge status={e.status} dot={false} /> },
    { key: 'reason', header: 'السبب', mobileHidden: true, render: (e) => e.status_change_reason || '—' },
    { key: 'created', header: 'تاريخ التسجيل', mobileHidden: true, render: (e) => dateOrDash(e.created_at) },
    { key: 'changed', header: 'تاريخ تغيير الحالة', render: (e) => dateOrDash(e.status_changed_at) },
    {
      key: 'actions', header: '', align: 'end', width: '1%',
      render: (e) => (
        <div className="ar-actions">
          <Button size="sm" variant="success" icon="restore" disabled={e.branch_is_active === false} title={e.branch_is_active === false ? 'يجب استعادة الفرع أولاً' : 'استعادة الموظف'} onClick={() => handleRestoreEmployee(e.id, fullName(e))}>استعادة</Button>
          <Button size="sm" variant="soft" icon="eye" onClick={() => handleViewEmployee(e.id)}>{selectedEmployee === e.id ? 'إخفاء' : 'عرض'}</Button>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => handleStatusUpdateClick(e)}>تعديل الحالة</Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => handlePermanentDeleteEmployee(e.id, fullName(e))}>حذف نهائي</Button>
        </div>
      ),
    },
  ];

  const branchColumns = [
    { key: 'name', header: 'اسم الفرع', mobilePrimary: true, render: (b) => <strong>{b.branch_name}</strong> },
    { key: 'type', header: 'نوع الفرع', render: (b) => <Badge tone="info">{b.branch_type === 'boys' ? 'بنين' : b.branch_type === 'girls' ? 'بنات' : b.branch_type}</Badge> },
    { key: 'loc', header: 'الموقع', mobileHidden: true, render: (b) => b.branch_location || '—' },
    { key: 'phone', header: 'رقم الجوال', mobileHidden: true, render: (b) => <bdi>{b.phone_number || '—'}</bdi> },
    { key: 'email', header: 'البريد الإلكتروني', mobileHidden: true, render: (b) => b.email || '—' },
    { key: 'count', header: 'عدد الموظفين', align: 'center', render: (b) => b.number_of_employees ?? '—' },
    { key: 'created', header: 'تاريخ الإنشاء', mobileHidden: true, render: (b) => dateOrDash(b.created_at) },
    { key: 'stopped', header: 'تاريخ الإيقاف', render: (b) => dateOrDash(b.updated_at) },
    {
      key: 'actions', header: '', align: 'end',
      render: (b) => <Button size="sm" variant="success" icon="restore" loading={reactivatingBranchId === b.id} onClick={() => handleReactivateBranch(b.id, b.branch_name)}>إعادة تفعيل</Button>,
    },
  ];

  const employeeDocColumns = [
    { key: 'emp', header: 'الموظف', mobilePrimary: true, render: (d) => <strong>{fullName(d)}</strong> },
    { key: 'num', header: 'رقم الموظف', mobileHidden: true, render: (d) => <bdi>{d.employee_id_number || '—'}</bdi> },
    { key: 'branch', header: 'الفرع', render: (d) => d.branch_name || '—' },
    { key: 'type', header: 'نوع المستند', render: (d) => getDocumentTypeLabel(d.document_type) || d.document_type },
    { key: 'file', header: 'اسم الملف', mobileHidden: true, render: (d) => <bdi>{d.file_name}</bdi> },
    { key: 'up', header: 'تاريخ الرفع', mobileHidden: true, render: (d) => dateOrDash(d.uploaded_at) },
    { key: 'arch', header: 'تاريخ الأرشفة', mobileHidden: true, render: (d) => dateOrDash(d.updated_at) },
    {
      key: 'actions', header: '', align: 'end',
      render: (d) => (
        <div className="ar-actions">
          <Button size="sm" variant="soft" icon="eye" disabled={!d.file_path} onClick={() => d.file_path && window.open(d.file_path, '_blank')}>عرض</Button>
          <Button size="sm" variant="danger" icon="trash" loading={deletingDocumentId === d.id} onClick={() => handlePermanentDeleteDocument(d.id)}>حذف نهائي</Button>
        </div>
      ),
    },
  ];

  const isRestoreChange = Boolean(employeeDetails) && ['terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'].includes(employeeDetails.status)
    && (statusForm.status === 'active' || statusForm.status === 'pending');

  return (
    <Page>
      <PageHeader
        title="الأرشيف"
        subtitle="الموظفون والفروع والمستندات المؤرشفة"
        actions={activeTab === 'employees' ? (
          <>
            {totalEmployees > 0 && <Button variant="primary" icon="download" disabled={loadingEmployees} onClick={handleExportExcel}>تصدير Excel</Button>}
            {archivedEmployees.length > 0 && <Button variant="secondary" icon="file-text" onClick={handleGenerateReport}>إنشاء تقرير</Button>}
          </>
        ) : null}
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="أقسام الأرشيف"
        items={[
          { id: 'employees', label: 'الموظفون', icon: 'users', count: totalEmployees || archivedEmployees.length },
          { id: 'branches', label: 'الفروع', icon: 'building', count: archivedBranches.length },
          { id: 'documents', label: 'مستندات الفروع', icon: 'folder', count: archivedDocuments.length },
          { id: 'employee-documents', label: 'مستندات الموظفين', icon: 'file', count: archivedEmployeeDocuments.length },
        ]}
      />

      {activeTab === 'employees' && (
        <>
          <Card title="البحث والفلترة" actions={<Button size="sm" variant="ghost" icon="refresh" onClick={resetFilters}>إعادة تعيين</Button>}>
            <div className="ar-filters">
              <FormField label="الاسم"><Input value={filters.search_name} onChange={setFilter('search_name')} placeholder="ابحث بالاسم…" /></FormField>
              <FormField label="رقم الهوية/الموظف"><Input value={filters.search_id} onChange={setFilter('search_id')} placeholder="ابحث بالرقم…" /></FormField>
              <FormField label="الفرع"><Select value={filters.branch_id} onChange={setFilter('branch_id')} options={branchOptions} placeholder="الكل" /></FormField>
              <FormField label="الحالة"><Select value={filters.status} onChange={setFilter('status')} options={statusOptions} placeholder="الكل" /></FormField>
              <FormField label="السنة الدراسية"><Input value={filters.academic_year} onChange={setFilter('academic_year')} placeholder="مثال: 2025/2026" /></FormField>
              <FormField label="تاريخ التسجيل من"><Input type="date" value={filters.registration_date_from} onChange={setFilter('registration_date_from')} /></FormField>
              <FormField label="تاريخ التسجيل إلى"><Input type="date" value={filters.registration_date_to} onChange={setFilter('registration_date_to')} /></FormField>
              <FormField label="تاريخ تغيير الحالة من"><Input type="date" value={filters.status_change_date_from} onChange={setFilter('status_change_date_from')} /></FormField>
              <FormField label="تاريخ تغيير الحالة إلى"><Input type="date" value={filters.status_change_date_to} onChange={setFilter('status_change_date_to')} /></FormField>
            </div>
          </Card>

          <Card flush>
            <DataTable columns={employeeColumns} rows={archivedEmployees} rowKey="id" loading={loadingEmployees} emptyIcon="archive" emptyTitle="لا يوجد موظفون مؤرشفون" />
            <Pagination
              page={currentPage}
              pageSize={itemsPerPage}
              total={totalEmployees}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
              pageSizeOptions={[25, 50, 100, 200]}
            />
          </Card>

          {selectedEmployee && (
            <Card title="تفاصيل الموظف" actions={<Button size="sm" variant="ghost" icon="x" onClick={() => { setSelectedEmployee(null); setEmployeeDetails(null); }}>إغلاق</Button>}>
              {loadingDetails ? <Skeleton lines={4} height={16} /> : employeeDetails ? (
                <div className="ui-form-stack">
                  <dl className="ar-details">
                    <div><dt>الاسم</dt><dd>{fullName(employeeDetails)}</dd></div>
                    <div><dt>رقم الموظف</dt><dd><bdi>{employeeDetails.employee_id_number || '—'}</bdi></dd></div>
                    <div><dt>رقم الهوية/الإقامة</dt><dd><bdi>{employeeDetails.id_or_residency_number || '—'}</bdi></dd></div>
                    <div><dt>الفرع</dt><dd>{employeeDetails.branch_name || '—'}</dd></div>
                    <div><dt>الحالة</dt><dd>{statusLabels[employeeDetails.status] || employeeDetails.status}</dd></div>
                    <div><dt>سبب تغيير الحالة</dt><dd>{employeeDetails.status_change_reason || '—'}</dd></div>
                    <div><dt>تاريخ تغيير الحالة</dt><dd>{dateOrDash(employeeDetails.status_changed_at)}</dd></div>
                  </dl>
                  {employeeDetails.documents?.length > 0 && (
                    <div className="ui-form-stack">
                      <strong>المستندات (<bdi>{employeeDetails.documents.length}</bdi>)</strong>
                      <div className="ar-docs">
                        {employeeDetails.documents.map((doc) => (
                          <div key={doc.id} className="ar-doc">
                            <div className="ar-doc-info">
                              <strong>{getDocumentTypeLabel(doc.document_type) || doc.document_type}</strong>
                              <span className="ar-muted"><bdi>{doc.file_name}</bdi></span>
                              <span className="ar-muted">{dateOrDash(doc.uploaded_at)}</span>
                            </div>
                            <div className="ar-actions">
                              <Button size="sm" variant="soft" icon="eye" onClick={() => handlePreviewDocument(doc)}>عرض</Button>
                              <Button size="sm" variant="secondary" icon="download" onClick={() => handleDownloadDocument(doc)}>تحميل</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : <Alert tone="danger">فشل تحميل التفاصيل</Alert>}
            </Card>
          )}
        </>
      )}

      {activeTab === 'documents' && (
        <>
          <Card title="البحث والفلترة">
            <div className="ar-filters">
              <FormField label="الفرع"><Select value={filters.doc_branch_id} onChange={setFilter('doc_branch_id')} options={branchOptions} placeholder="الكل" /></FormField>
              <FormField label="نوع المستند"><Select value={filters.doc_document_type} onChange={setFilter('doc_document_type')} options={typeOptions(archivedDocuments, getBranchDocumentTypeLabel)} placeholder="الكل" /></FormField>
            </div>
          </Card>
          {loadingDocuments ? <Card><Skeleton lines={4} height={16} /></Card> : archivedDocuments.length === 0 ? (
            <Card><EmptyState icon="folder" title="لا توجد مستندات مؤرشفة" /></Card>
          ) : (
            <div className="ar-docs">
              {archivedDocuments.map((doc) => (
                <Card key={doc.id}>
                  <div className="ar-doc-info">
                    <strong>{getBranchDocumentTypeLabel(doc.document_type) || doc.document_type}</strong>
                    <span className="ar-muted"><bdi>{doc.file_name}</bdi></span>
                    <span className="ar-muted">{doc.branch_name}</span>
                    <span className="ar-muted">{dateOrDash(doc.uploaded_at)}{doc.version ? ` · الإصدار: ${doc.version}` : ''}</span>
                  </div>
                  <div className="ar-actions">
                    <Button size="sm" variant="soft" icon="eye" onClick={() => handlePreviewBranchDocument(doc)}>عرض</Button>
                    <Button size="sm" variant="secondary" icon="download" onClick={() => handleDownloadBranchDocument(doc)}>تحميل</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'employee-documents' && (
        <>
          <Card title="البحث والفلترة">
            <div className="ar-filters">
              <FormField label="الفرع"><Select value={filters.emp_doc_branch_id} onChange={setFilter('emp_doc_branch_id')} options={branchOptions} placeholder="الكل" /></FormField>
              <FormField label="نوع المستند"><Select value={filters.emp_doc_document_type} onChange={setFilter('emp_doc_document_type')} options={typeOptions(archivedEmployeeDocuments, getDocumentTypeLabel)} placeholder="الكل" /></FormField>
              <FormField label="رقم الموظف"><Input value={filters.emp_doc_employee_id} onChange={setFilter('emp_doc_employee_id')} placeholder="ابحث برقم الموظف…" /></FormField>
            </div>
          </Card>
          <Card flush>
            <DataTable columns={employeeDocColumns} rows={archivedEmployeeDocuments} rowKey="id" loading={loadingEmployeeDocuments} emptyIcon="file" emptyTitle="لا توجد مستندات مؤرشفة" />
          </Card>
        </>
      )}

      {activeTab === 'branches' && (
        <>
          <Alert tone="info">الفروع المؤرشفة هي الفروع التي تم إيقافها. يمكنك إعادة تفعيلها لاستعادة جميع بياناتها وموظفيها.</Alert>
          <Card flush>
            <DataTable columns={branchColumns} rows={archivedBranches} rowKey="id" loading={loadingBranches} emptyIcon="building" emptyTitle="لا توجد فروع مؤرشفة" />
          </Card>
        </>
      )}

      <Modal
        open={showStatusModal}
        onClose={closeStatusModal}
        title="تعديل حالة الموظف"
        footer={(
          <>
            <Button variant="primary" loading={updatingStatus} disabled={!statusForm.status} onClick={handleUpdateStatus}>حفظ</Button>
            <Button variant="secondary" disabled={updatingStatus} onClick={closeStatusModal}>إلغاء</Button>
          </>
        )}
      >
        <div className="ui-form-stack">
          {employeeDetails && (
            <Alert tone="info">
              <strong>الموظف:</strong> {fullName(employeeDetails)} · <strong>الحالة الحالية:</strong> {statusLabels[employeeDetails.status] || employeeDetails.status}
            </Alert>
          )}
          <FormField label="الحالة الجديدة" required>
            <Select value={statusForm.status} onChange={(e) => setStatusForm((prev) => ({ ...prev, status: e.target.value }))} options={statusOptions} placeholder="اختر الحالة" disabled={updatingStatus} />
          </FormField>
          {isRestoreChange && <Alert tone="info">سيتم استعادة الموظف من الأرشيف</Alert>}
          <FormField label="السبب (اختياري)">
            <Textarea rows={3} value={statusForm.reason} onChange={(e) => setStatusForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="اكتب سبب تغيير الحالة…" disabled={updatingStatus} />
          </FormField>
        </div>
      </Modal>

      <Modal open={Boolean(previewDocument && previewUrl)} onClose={closePreview} title={previewDocument?.file_name || ''} size="xl">
        {previewDocument && previewUrl && (previewDocument.mime_type?.startsWith('image/')
          ? <img className="ar-preview" src={previewUrl} alt={previewDocument.file_name} />
          : <iframe className="ar-preview" src={previewUrl} title={previewDocument.file_name} />)}
      </Modal>
    </Page>
  );
};

export default Archive;

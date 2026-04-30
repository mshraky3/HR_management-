/**
 * Archive Page
 * View and manage archived employees and branch documents
 * Main Manager only
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { archiveAPI, branchesAPI, documentsAPI, branchDocumentsAPI } from '../utils/api';
import { getDocumentTypeLabel, getBranchDocumentTypeLabel } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import './Archive.css';

const Archive = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

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

    if (!confirm(confirmMessage)) {
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
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المستند نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) {
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

    if (!confirm(confirmMessage)) {
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
    if (!confirm(`هل أنت متأكد من استعادة الموظف "${employeeName}" إلى حالة نشط؟`)) return;
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

  const handleConfirmAction = async () => {
    if (confirmAction) {
      await confirmAction();
      setShowConfirmModal(false);
      setConfirmAction(null);
    }
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

  const statusColors = {
    active: '#4caf50',
    pending: '#ff9800',
    terminated_article_80: '#f44336',
    terminated_article_77: '#e91e63',
    resigned: '#ff9800',
    contract_ended: '#9c27b0',
    non_renewal: '#607d8b',
    other: '#795548'
  };

  if (!isMainManager()) {
    return (
      <div className="archive-page">
        <h1>غير مصرح</h1>
        <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
      </div>
    );
  }

  return (
    <div className="archive-page">
      <div className="page-header">
        <h1>الأرشيف</h1>
        {activeTab === 'employees' && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {totalEmployees > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleExportExcel}
                disabled={loadingEmployees}
              >
                {loadingEmployees ? 'جاري التحميل...' : 'تصدير Excel'}
              </button>
            )}
            {archivedEmployees.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleGenerateReport}
              >
                إنشاء تقرير
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="archive-tabs">
        <button
          className={`tab-button ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          الموظفين المؤرشفين ({archivedEmployees.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'branches' ? 'active' : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          الفروع المؤرشفة ({archivedBranches.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          مستندات الفروع المؤرشفة ({archivedDocuments.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'employee-documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('employee-documents')}
        >
          مستندات الموظفين المؤرشفة ({archivedEmployeeDocuments.length})
        </button>
      </div>

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="archive-content">
          {/* Search and Filters */}
          <div className="archive-filters">
            <h3>البحث والفلترة</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>البحث بالاسم</label>
                <input
                  type="text"
                  value={filters.search_name}
                  onChange={(e) => setFilters(prev => ({ ...prev, search_name: e.target.value }))}
                  placeholder="ابحث بالاسم..."
                />
              </div>
              <div className="filter-group">
                <label>البحث برقم الهوية/الموظف</label>
                <input
                  type="text"
                  value={filters.search_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, search_id: e.target.value }))}
                  placeholder="ابحث برقم الهوية..."
                />
              </div>
              <div className="filter-group">
                <label>الفرع</label>
                <select
                  value={filters.branch_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, branch_id: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>الحالة</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>السنة الدراسية</label>
                <input
                  type="text"
                  value={filters.academic_year}
                  onChange={(e) => setFilters(prev => ({ ...prev, academic_year: e.target.value }))}
                  placeholder="مثال: 2025/2026"
                />
              </div>
              <div className="filter-group">
                <label>تاريخ التسجيل من</label>
                <input
                  type="date"
                  value={filters.registration_date_from}
                  onChange={(e) => setFilters(prev => ({ ...prev, registration_date_from: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>تاريخ التسجيل إلى</label>
                <input
                  type="date"
                  value={filters.registration_date_to}
                  onChange={(e) => setFilters(prev => ({ ...prev, registration_date_to: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>تاريخ تغيير الحالة من</label>
                <input
                  type="date"
                  value={filters.status_change_date_from}
                  onChange={(e) => setFilters(prev => ({ ...prev, status_change_date_from: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>تاريخ تغيير الحالة إلى</label>
                <input
                  type="date"
                  value={filters.status_change_date_to}
                  onChange={(e) => setFilters(prev => ({ ...prev, status_change_date_to: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setFilters({
                    emp_doc_branch_id: '',
                    emp_doc_document_type: '',
                    emp_doc_employee_id: '',
                    search_name: '',
                    search_id: '',
                    branch_id: '',
                    status: '',
                    academic_year: '',
                    registration_date_from: '',
                    registration_date_to: '',
                    status_change_date_from: '',
                    status_change_date_to: '',
                    doc_branch_id: '',
                    doc_document_type: ''
                  });
                  setCurrentPage(1);
                }}
              >
                إعادة تعيين الفلاتر
              </button>
            </div>
          </div>

          {/* Employees List */}
          {loadingEmployees ? (
            <div className="loading">جاري التحميل...</div>
          ) : archivedEmployees.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد موظفين مؤرشفين</p>
            </div>
          ) : (
            <div className="archive-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>رقم الموظف</th>
                    <th>الاسم</th>
                    <th>الفرع</th>
                    <th>الحالة</th>
                    <th>السبب</th>
                    <th>تاريخ التسجيل</th>
                    <th>تاريخ تغيير الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedEmployees.map(employee => (
                    <tr key={employee.id}>
                      <td>{employee.employee_id_number || '-'}</td>
                      <td>
                        {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                      </td>
                      <td>{employee.branch_name || '-'}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ backgroundColor: statusColors[employee.status] || '#999' }}
                        >
                          {statusLabels[employee.status] || employee.status}
                        </span>
                      </td>
                      <td>{employee.status_change_reason || '-'}</td>
                      <td>
                        {employee.created_at
                          ? formatDate(employee.created_at)
                          : '-'}
                      </td>
                      <td>
                        {employee.status_changed_at
                          ? formatDate(employee.status_changed_at)
                          : '-'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleRestoreEmployee(
                              employee.id,
                              `${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}`
                            )}
                            style={{
                              backgroundColor: employee.branch_is_active === false ? '#9e9e9e' : '#4caf50',
                              color: 'white',
                              border: 'none',
                              cursor: employee.branch_is_active === false ? 'not-allowed' : 'pointer'
                            }}
                            disabled={employee.branch_is_active === false}
                            title={employee.branch_is_active === false ? 'يجب استعادة الفرع أولاً' : 'استعادة الموظف'}
                          >
                            استعادة
                          </button>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleViewEmployee(employee.id)}
                          >
                            {selectedEmployee === employee.id ? 'إخفاء' : 'عرض'}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleStatusUpdateClick(employee)}
                          >
                            تعديل الحالة
                          </button>
                          <button
                            className="btn btn-sm btn-delete"
                            onClick={() => handlePermanentDeleteEmployee(
                              employee.id,
                              `${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}`
                            )}
                          >
                            حذف نهائي
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalEmployees > itemsPerPage && (
                <div className="pagination" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div className="pagination-info" style={{ color: '#666', fontSize: '14px' }}>
                    عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalEmployees)} من {totalEmployees}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(parseInt(e.target.value, 10));
                        setCurrentPage(1);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                    >
                      <option value={25}>25 لكل صفحة</option>
                      <option value={50}>50 لكل صفحة</option>
                      <option value={100}>100 لكل صفحة</option>
                      <option value={200}>200 لكل صفحة</option>
                    </select>

                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="btn btn-secondary btn-sm"
                    >
                      الأولى
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="btn btn-secondary btn-sm"
                    >
                      السابقة
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, Math.ceil(totalEmployees / itemsPerPage)) }, (_, i) => {
                      const totalPages = Math.ceil(totalEmployees / itemsPerPage);
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`btn btn-sm ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalEmployees / itemsPerPage), prev + 1))}
                      disabled={currentPage >= Math.ceil(totalEmployees / itemsPerPage)}
                      className="btn btn-secondary btn-sm"
                    >
                      التالية
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.ceil(totalEmployees / itemsPerPage))}
                      disabled={currentPage >= Math.ceil(totalEmployees / itemsPerPage)}
                      className="btn btn-secondary btn-sm"
                    >
                      الأخيرة
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Employee Details */}
          {selectedEmployee && (
            <div className="employee-details-section">
              {loadingDetails ? (
                <div className="loading">جاري تحميل التفاصيل...</div>
              ) : employeeDetails ? (
                <div className="details-content">
                  <h3>تفاصيل الموظف</h3>
                  <div className="employee-info-grid">
                    <div><strong>الاسم:</strong> {employeeDetails.first_name} {employeeDetails.second_name} {employeeDetails.third_name} {employeeDetails.fourth_name}</div>
                    <div><strong>رقم الموظف:</strong> {employeeDetails.employee_id_number || '-'}</div>
                    <div><strong>رقم الهوية/الإقامة:</strong> {employeeDetails.id_or_residency_number || '-'}</div>
                    <div><strong>الفرع:</strong> {employeeDetails.branch_name || '-'}</div>
                    <div><strong>الحالة:</strong> {statusLabels[employeeDetails.status] || employeeDetails.status}</div>
                    <div><strong>سبب تغيير الحالة:</strong> {employeeDetails.status_change_reason || '-'}</div>
                    <div><strong>تاريخ تغيير الحالة:</strong> {employeeDetails.status_changed_at ? formatDate(employeeDetails.status_changed_at) : '-'}</div>
                  </div>

                  {/* Documents */}
                  {employeeDetails.documents && employeeDetails.documents.length > 0 && (
                    <div className="documents-section">
                      <h4>المستندات ({employeeDetails.documents.length})</h4>
                      <div className="documents-grid">
                        {employeeDetails.documents.map(doc => (
                          <div key={doc.id} className="document-card">
                            <div className="document-info">
                              <strong>{getDocumentTypeLabel(doc.document_type) || doc.document_type}</strong>
                              <span className="document-name">{doc.file_name}</span>
                              <span className="document-date">
                                {formatDate(doc.uploaded_at)}
                              </span>
                            </div>
                            <div className="document-actions">
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handlePreviewDocument(doc)}
                              >
                                عرض
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleDownloadDocument(doc)}
                              >
                                تحميل
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="error">فشل تحميل التفاصيل</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="archive-content">
          {/* Document Filters */}
          <div className="archive-filters">
            <h3>البحث والفلترة</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>الفرع</label>
                <select
                  value={filters.doc_branch_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, doc_branch_id: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>نوع المستند</label>
                <select
                  value={filters.doc_document_type}
                  onChange={(e) => setFilters(prev => ({ ...prev, doc_document_type: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {archivedDocuments
                    .reduce((types, doc) => {
                      if (!types.includes(doc.document_type)) {
                        types.push(doc.document_type);
                      }
                      return types;
                    }, [])
                    .map(type => (
                      <option key={type} value={type}>
                        {getBranchDocumentTypeLabel(type) || type}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Documents List */}
          {loadingDocuments ? (
            <div className="loading">جاري التحميل...</div>
          ) : archivedDocuments.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد مستندات مؤرشفة</p>
            </div>
          ) : (
            <div className="documents-grid">
              {archivedDocuments.map(doc => (
                <div key={doc.id} className="document-card">
                  <div className="document-info">
                    <strong>{getBranchDocumentTypeLabel(doc.document_type) || doc.document_type}</strong>
                    <span className="document-name">{doc.file_name}</span>
                    <span className="document-branch">{doc.branch_name}</span>
                    <span className="document-date">
                      {formatDate(doc.uploaded_at)}
                    </span>
                    {doc.version && <span className="document-version">الإصدار: {doc.version}</span>}
                  </div>
                  <div className="document-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handlePreviewBranchDocument(doc)}
                    >
                      عرض
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDownloadBranchDocument(doc)}
                    >
                      تحميل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Employee Documents Tab */}
      {activeTab === 'employee-documents' && (
        <div className="archive-content">
          {/* Employee Document Filters */}
          <div className="archive-filters">
            <h3>البحث والفلترة</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>الفرع</label>
                <select
                  value={filters.emp_doc_branch_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, emp_doc_branch_id: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>نوع المستند</label>
                <select
                  value={filters.emp_doc_document_type}
                  onChange={(e) => setFilters(prev => ({ ...prev, emp_doc_document_type: e.target.value }))}
                >
                  <option value="">الكل</option>
                  {archivedEmployeeDocuments
                    .reduce((types, doc) => {
                      if (!types.includes(doc.document_type)) {
                        types.push(doc.document_type);
                      }
                      return types;
                    }, [])
                    .map(type => (
                      <option key={type} value={type}>
                        {getDocumentTypeLabel(type) || type}
                      </option>
                    ))}
                </select>
              </div>
              <div className="filter-group">
                <label>رقم الموظف</label>
                <input
                  type="text"
                  value={filters.emp_doc_employee_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, emp_doc_employee_id: e.target.value }))}
                  placeholder="ابحث برقم الموظف..."
                />
              </div>
            </div>
          </div>

          {/* Employee Documents List */}
          {loadingEmployeeDocuments ? (
            <div className="loading">جاري التحميل...</div>
          ) : archivedEmployeeDocuments.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد مستندات مؤرشفة</p>
            </div>
          ) : (
            <div className="documents-table-container">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>رقم الموظف</th>
                    <th>الفرع</th>
                    <th>نوع المستند</th>
                    <th>اسم الملف</th>
                    <th>تاريخ الرفع</th>
                    <th>تاريخ الأرشفة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedEmployeeDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        {doc.first_name} {doc.second_name} {doc.third_name} {doc.fourth_name}
                      </td>
                      <td>{doc.employee_id_number || '-'}</td>
                      <td>{doc.branch_name || '-'}</td>
                      <td>{getDocumentTypeLabel(doc.document_type) || doc.document_type}</td>
                      <td>{doc.file_name}</td>
                      <td>
                        {doc.uploaded_at
                          ? formatDate(doc.uploaded_at)
                          : '-'}
                      </td>
                      <td>
                        {doc.updated_at
                          ? formatDate(doc.updated_at)
                          : '-'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              const url = doc.file_path;
                              if (url) {
                                window.open(url, '_blank');
                              }
                            }}
                          >
                            عرض
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handlePermanentDeleteDocument(doc.id)}
                            disabled={deletingDocumentId === doc.id}
                          >
                            {deletingDocumentId === doc.id ? 'جاري الحذف...' : 'حذف نهائي'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Branches Tab */}
      {activeTab === 'branches' && (
        <div className="archive-content">
          <div className="archive-info-box">
            <p>الفروع المؤرشفة هي الفروع التي تم إيقافها. يمكنك إعادة تفعيلها لاستعادة جميع بياناتها وموظفيها.</p>
          </div>

          {/* Branches List */}
          {loadingBranches ? (
            <div className="loading">جاري التحميل...</div>
          ) : archivedBranches.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد فروع مؤرشفة</p>
            </div>
          ) : (
            <div className="archive-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الفرع</th>
                    <th>نوع الفرع</th>
                    <th>الموقع</th>
                    <th>رقم الجوال</th>
                    <th>البريد الإلكتروني</th>
                    <th>عدد الموظفين</th>
                    <th>تاريخ الإنشاء</th>
                    <th>تاريخ الإيقاف</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedBranches.map((branch, index) => (
                    <tr key={branch.id}>
                      <td>{index + 1}</td>
                      <td>{branch.branch_name}</td>
                      <td>
                        <span className={`branch-type-badge ${branch.branch_type}`}>
                          {branch.branch_type === 'boys' ? 'بنين' : branch.branch_type === 'girls' ? 'بنات' : branch.branch_type}
                        </span>
                      </td>
                      <td>{branch.branch_location || '-'}</td>
                      <td dir="ltr">{branch.phone_number || '-'}</td>
                      <td>{branch.email || '-'}</td>
                      <td>{branch.number_of_employees ?? '-'}</td>
                      <td>
                        {branch.created_at
                          ? formatDate(branch.created_at)
                          : '-'}
                      </td>
                      <td>
                        {branch.updated_at
                          ? formatDate(branch.updated_at)
                          : '-'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleReactivateBranch(branch.id, branch.branch_name)}
                            disabled={reactivatingBranchId === branch.id}
                          >
                            {reactivatingBranchId === branch.id ? 'جاري التفعيل...' : 'إعادة تفعيل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => {
          if (!updatingStatus) {
            setShowStatusModal(false);
            setStatusForm({ status: '', reason: '' });
          }
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>تعديل حالة الموظف</h3>
            {employeeDetails && (
              <div style={{ marginBottom: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '14px' }}>
                <strong>الموظف:</strong> {employeeDetails.first_name} {employeeDetails.second_name} {employeeDetails.third_name} {employeeDetails.fourth_name}
                <br />
                <strong>الحالة الحالية:</strong> {statusLabels[employeeDetails.status] || employeeDetails.status}
              </div>
            )}
            <div className="form-group">
              <label>الحالة الجديدة *</label>
              <select
                value={statusForm.status}
                onChange={(e) => setStatusForm(prev => ({ ...prev, status: e.target.value }))}
                required
                disabled={updatingStatus}
              >
                <option value="">اختر الحالة</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {employeeDetails && (() => {
                const archivedStatuses = ['terminated_article_80', 'terminated_article_77', 'resigned', 'contract_ended', 'non_renewal', 'other'];
                const isRestore = archivedStatuses.includes(employeeDetails.status) &&
                  (statusForm.status === 'active' || statusForm.status === 'pending');
                if (isRestore) {
                  return (
                    <div style={{ marginTop: '8px', padding: '8px', background: '#e3f2fd', borderRadius: '4px', fontSize: '12px', color: '#1976d2' }}>
                      ⓘ سيتم استعادة الموظف من الأرشيف
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="form-group">
              <label>السبب (اختياري)</label>
              <textarea
                value={statusForm.reason}
                onChange={(e) => setStatusForm(prev => ({ ...prev, reason: e.target.value }))}
                rows="3"
                placeholder="اكتب سبب تغيير الحالة..."
                disabled={updatingStatus}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleUpdateStatus}
                disabled={updatingStatus || !statusForm.status}
              >
                {updatingStatus ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (!updatingStatus) {
                    setShowStatusModal(false);
                    setStatusForm({ status: '', reason: '' });
                  }
                }}
                disabled={updatingStatus}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>تأكيد الإجراء</h3>
            <p>هل أنت متأكد من تنفيذ هذا الإجراء؟</p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleConfirmAction}
              >
                تأكيد
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmAction(null);
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocument && previewUrl && (
        <div className="modal-overlay" onClick={() => {
          setPreviewDocument(null);
          if (previewUrl) {
            window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{previewDocument.file_name}</h3>
              <button
                className="close-button"
                onClick={() => {
                  setPreviewDocument(null);
                  if (previewUrl) {
                    window.URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
              >
                ×
              </button>
            </div>
            <div className="preview-content">
              {previewDocument.mime_type?.startsWith('image/') ? (
                <img src={previewUrl} alt={previewDocument.file_name} />
              ) : (
                <iframe src={previewUrl} title={previewDocument.file_name} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Archive;


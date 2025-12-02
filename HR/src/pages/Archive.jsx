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
import { getDocumentTypeLabel } from '../utils/employeeConstants';
import './Archive.css';

const Archive = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' or 'documents'
  
  // Employees state
  const [archivedEmployees, setArchivedEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', reason: '' });
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  // Documents state
  const [archivedDocuments, setArchivedDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
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

  const loadArchivedEmployees = async () => {
    try {
      setLoadingEmployees(true);
      const filterParams = {};
      
      // Add search filters
      if (filters.search_name) {
        // We'll need to filter client-side for name search
      }
      if (filters.search_id) {
        // We'll need to filter client-side for ID search
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
      
      const response = await archiveAPI.getAll(filterParams);
      
      if (response.data.success) {
        let employees = response.data.data || [];
        
        // Client-side filtering for name and ID
        if (filters.search_name) {
          const searchTerm = filters.search_name.toLowerCase();
          employees = employees.filter(emp => 
            `${emp.first_name} ${emp.second_name} ${emp.third_name} ${emp.fourth_name}`
              .toLowerCase().includes(searchTerm)
          );
        }
        
        if (filters.search_id) {
          const searchTerm = filters.search_id.toLowerCase();
          employees = employees.filter(emp => 
            (emp.id_or_residency_number || '').toLowerCase().includes(searchTerm) ||
            (emp.employee_id_number || '').toLowerCase().includes(searchTerm)
          );
        }
        
        setArchivedEmployees(employees);
      }
    } catch (error) {
      console.error('Error loading archived employees:', error);
      showError('فشل تحميل الموظفين المؤرشفين');
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
    } else {
      loadArchivedDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager, activeTab]);

  useEffect(() => {
    if (activeTab === 'employees') {
      loadArchivedEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search_name, filters.search_id, filters.branch_id, filters.status, 
      filters.academic_year, filters.registration_date_from, filters.registration_date_to,
      filters.status_change_date_from, filters.status_change_date_to]);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadArchivedDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.doc_branch_id, filters.doc_document_type]);

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

  const handleUpdateStatus = async () => {
    if (!statusForm.status) {
      showWarning('يرجى اختيار حالة');
      return;
    }

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
        loadArchivedEmployees();
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
      const response = await documentsAPI.preview(doc.id);
      const blob = await response.data;
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
    }
  };

  const handleDownloadBranchDocument = async (doc) => {
    try {
      const response = await branchDocumentsAPI.download(doc.id);
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

  const handlePreviewBranchDocument = async (doc) => {
    try {
      setPreviewDocument(doc);
      const response = await branchDocumentsAPI.preview(doc.id);
      const blob = await response.data;
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
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
    terminated_article_80: 'إنهاء المادة 80',
    terminated_article_77: 'إنهاء المادة 77',
    resigned: 'استقالة',
    contract_ended: 'انتهاء العقد',
    non_renewal: 'عدم التجديد',
    other: 'أخرى'
  };

  const statusColors = {
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
        {activeTab === 'employees' && archivedEmployees.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={handleGenerateReport}
          >
            إنشاء تقرير
          </button>
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
          className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          مستندات الفروع المؤرشفة ({archivedDocuments.length})
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
                  placeholder="مثال: 1445-1446"
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
            <button
              className="btn btn-secondary"
              onClick={() => {
                setFilters({
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
              }}
            >
              إعادة تعيين الفلاتر
            </button>
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
                      <td>
                        {employee.created_at
                          ? new Date(employee.created_at).toLocaleDateString('ar-SA')
                          : '-'}
                      </td>
                      <td>
                        {employee.status_changed_at
                          ? new Date(employee.status_changed_at).toLocaleDateString('ar-SA')
                          : '-'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleViewEmployee(employee.id)}
                          >
                            {selectedEmployee === employee.id ? 'إخفاء' : 'عرض'}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setSelectedEmployee(employee.id);
                              setStatusForm({
                                status: employee.status || '',
                                reason: employee.status_change_reason || ''
                              });
                              setShowStatusModal(true);
                            }}
                          >
                            تعديل الحالة
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <div><strong>تاريخ تغيير الحالة:</strong> {employeeDetails.status_changed_at ? new Date(employeeDetails.status_changed_at).toLocaleDateString('ar-SA') : '-'}</div>
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
                                {new Date(doc.uploaded_at).toLocaleDateString('ar-SA')}
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
                        {getDocumentTypeLabel(type) || type}
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
                    <strong>{getDocumentTypeLabel(doc.document_type) || doc.document_type}</strong>
                    <span className="document-name">{doc.file_name}</span>
                    <span className="document-branch">{doc.branch_name}</span>
                    <span className="document-date">
                      {new Date(doc.uploaded_at).toLocaleDateString('ar-SA')}
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

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>تعديل حالة الموظف</h3>
            <div className="form-group">
              <label>الحالة *</label>
              <select
                value={statusForm.status}
                onChange={(e) => setStatusForm(prev => ({ ...prev, status: e.target.value }))}
                required
              >
                <option value="">اختر الحالة</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>السبب (اختياري)</label>
              <textarea
                value={statusForm.reason}
                onChange={(e) => setStatusForm(prev => ({ ...prev, reason: e.target.value }))}
                rows="3"
                placeholder="اكتب سبب تغيير الحالة..."
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleUpdateStatus}
                disabled={updatingStatus}
              >
                {updatingStatus ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowStatusModal(false);
                  setStatusForm({ status: '', reason: '' });
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


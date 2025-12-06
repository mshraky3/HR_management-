/**
 * Employee Details Page
 * Display all employee information and documents
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeesAPI, documentsAPI, branchesAPI, setBranchDocumentsPassword } from '../utils/api';
import { getDocumentTypeLabel } from '../utils/employeeConstants';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './EmployeeDetails.css';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isBranchManager, isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [missingData, setMissingData] = useState(null);
  const [processingRenewal, setProcessingRenewal] = useState(false);
  const [showNonRenewalForm, setShowNonRenewalForm] = useState(false);
  const [nonRenewalData, setNonRenewalData] = useState({ status: '', reason: '' });
  const [generatingFile, setGeneratingFile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    loadEmployeeData();
  }, [id]);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      const [employeeResponse, documentsResponse, branchesResponse] = await Promise.all([
        employeesAPI.getById(id),
        employeesAPI.getDocuments(id),
        branchesAPI.getAll({ is_active: true })
      ]);

      if (employeeResponse.data.success) {
        setEmployee(employeeResponse.data.data);
        
        // Load missing data for display (but use data_completion_status from DB as source of truth)
        try {
          const missingDataResponse = await employeesAPI.getMissingData(id);
          if (missingDataResponse.data.success) {
            setMissingData(missingDataResponse.data.data);
            
            // IMPORTANT: Always update DB status to match actual calculation
            // This ensures consistency across all pages (Dashboard, Employees list, Details)
            try {
              await employeesAPI.updateCompletionStatus(id);
              // Reload employee to get updated status from DB
              const updatedResponse = await employeesAPI.getById(id);
              if (updatedResponse.data.success) {
                setEmployee(updatedResponse.data.data);
              }
            } catch (updateError) {
              // Silently handle - status will be updated on next page load
            }
          } else {
            setMissingData({
              isComplete: employeeResponse.data.data.data_completion_status === 'complete',
              missingFields: []
            });
          }
        } catch (error) {
          // Fallback: use DB status
          setMissingData({
            isComplete: employeeResponse.data.data.data_completion_status === 'complete',
            missingFields: []
          });
        }
      }

      if (documentsResponse.data.success) {
        setDocuments(documentsResponse.data.data || []);
      }

      if (branchesResponse.data.success) {
        setBranches(branchesResponse.data.data || []);
      }
    } catch (error) {
      console.error('Error loading employee data:', error);
      showError('فشل تحميل بيانات الموظف');
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (document) => {
    try {
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        showWarning('يرجى تسجيل الدخول مرة أخرى');
        navigate('/login');
        return;
      }

      setPreviewLoading(document.id);
      setPreviewDocument(document);
      // Check if it's an image
      if (document.mime_type && document.mime_type.startsWith('image/')) {
        // If file_path is a URL (Blob Storage), use it directly
        if (document.file_path && 
            (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))) {
          setPreviewUrl(document.file_path);
          setPreviewLoading(null);
          return;
        }
        
        // For images, use download endpoint with blob URL
        try {
          const response = await documentsAPI.download(document.id);
          // response.data is already a blob when responseType is 'blob'
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            setPreviewUrl(blobUrl);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (error) {
          console.error('Error loading image:', error);
          const errorMsg = error.response?.data?.message || error.message || 'فشل تحميل الصورة';
          showError(`فشل تحميل الصورة للمعاينة: ${errorMsg}`);
          setPreviewDocument(null);
          setPreviewUrl(null);
        } finally {
          setPreviewLoading(null);
        }
      } else if (document.mime_type === 'application/pdf') {
        // For PDFs, download as blob and open in new tab
        try {
          const response = await documentsAPI.download(document.id);
          // response.data is already a blob when responseType is 'blob'
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            const newWindow = window.open(blobUrl, '_blank');
            if (!newWindow) {
              showWarning('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
            }
          } else {
            throw new Error('Invalid response format');
          }
          setPreviewDocument(null);
        } catch (error) {
          console.error('Error opening PDF:', error);
          const errorMsg = error.response?.data?.message || error.message || 'فشل فتح ملف PDF';
          showError(`فشل فتح ملف PDF: ${errorMsg}`);
          setPreviewDocument(null);
        } finally {
          setPreviewLoading(null);
        }
      } else {
        // For other types, try download
        handleDownload(document.id);
        setPreviewDocument(null);
        setPreviewLoading(null);
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewUrl(null);
      setPreviewLoading(null);
    }
  };

  const handleDownload = async (documentId) => {
    try {
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        showWarning('يرجى تسجيل الدخول مرة أخرى');
        navigate('/login');
        return;
      }

      setDownloading(documentId);
      const response = await documentsAPI.download(documentId);
      
      // Get filename from response headers
      const contentDisposition = response.headers['content-disposition'];
      let filename = `document_${documentId}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
        }
      }
      
      // response.data is already a blob when responseType is 'blob'
      if (response.data instanceof Blob) {
        const blobUrl = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      const errorMsg = error.response?.data?.message || error.message || 'فشل تحميل المستند';
      showError(`فشل تحميل المستند: ${errorMsg}`);
    } finally {
      setDownloading(null);
    }
  };

  const closePreview = () => {
    setPreviewDocument(null);
    setPreviewLoading(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleGenerateFile = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // For branch managers, show password modal
    if (isBranchManager() && !isMainManager()) {
      setShowPasswordModal(true);
      setPassword('');
      setPasswordError('');
      return;
    }
    
    // For main managers, generate directly
    await generateFilePDF();
  };

  const generateFilePDF = async (providedPassword = null) => {
    try {
      setGeneratingFile(true);
      
      // Set password if provided (for branch managers)
      if (providedPassword && isBranchManager() && !isMainManager() && user?.branch_id) {
        setBranchDocumentsPassword(user.branch_id, providedPassword);
      }
      
      // Get branch_id from employee or user
      const branchId = employee?.branch_id || user?.branch_id;
      
      const response = await employeesAPI.generateSingleEmployeeFile(id, {
        responseType: 'blob',
        branch_id: branchId
      });
      
      // Create blob URL and download
      const blob = response.data instanceof Blob 
        ? response.data 
        : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `ملف_موظف_${employee?.first_name}_${employee?.second_name}_${employee?.third_name}_${employee?.fourth_name}.pdf`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showSuccess('تم إنشاء ملف الموظف بنجاح');
      setShowPasswordModal(false);
      setPassword('');
      
    } catch (error) {
      console.error('Error generating file:', error);
      const errorMessage = error.response?.data?.message || error.message || 'فشل إنشاء الملف';
      
      // If password error, show in modal
      if (error.response?.status === 401 && isBranchManager() && !isMainManager()) {
        setPasswordError('كلمة المرور غير صحيحة');
      } else {
        showError(errorMessage);
        setShowPasswordModal(false);
      }
    } finally {
      setGeneratingFile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('الرجاء إدخال كلمة المرور');
      return;
    }
    await generateFilePDF(password);
  };

  if (loading) {
    return <div className="loading">جاري تحميل بيانات الموظف...</div>;
  }

  if (!employee) {
    return (
      <div className="table-page">
        <div className="empty-state">
          <p>الموظف غير موجود</p>
          <button onClick={() => navigate('/employees')} className="btn btn-primary btn-md">
            العودة للقائمة
          </button>
        </div>
      </div>
    );
  }

  const getInitials = (firstName, secondName) => {
    const first = firstName?.charAt(0) || '';
    const second = secondName?.charAt(0) || '';
    return (first + second).toUpperCase() || '👤';
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      'active': 'badge-success',
      'pending': 'badge-warning',
      'terminated_article_80': 'badge-danger',
      'terminated_article_77': 'badge-danger',
      'resigned': 'badge-danger',
      'contract_ended': 'badge-secondary',
      'non_renewal': 'badge-secondary',
      'other': 'badge-secondary'
    };
    return statusMap[status] || 'badge-secondary';
  };

  const getStatusLabel = (status) => {
    const statusLabels = {
      'active': 'نشط',
      'pending': 'قيد الانتظار',
      'terminated_article_80': 'فصل حسب المادة 80',
      'terminated_article_77': 'فصل حسب المادة 77',
      'resigned': 'استقال',
      'contract_ended': 'انتهى العقد',
      'non_renewal': 'عدم التجديد',
      'other': 'أخرى'
    };
    return statusLabels[status] || status;
  };

  return (
    <div className="employee-details-page">
      <div className="employee-details-header">
        <h1>تفاصيل الموظف</h1>
        <button onClick={() => navigate('/employees')} className="btn btn-secondary btn-md">
          ← العودة للقائمة
        </button>
      </div>

      {/* Employee Profile Card */}
      <div className="employee-profile-card">
        <div className="employee-profile-header">
          <div className="employee-avatar">
            {getInitials(employee.first_name, employee.second_name)}
          </div>
          <div className="employee-name-section">
            <h2>
              {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
            </h2>
            <div className="employee-id">رقم الموظف: {employee.employee_id_number}</div>
            <span className={`employee-status-badge ${getStatusBadgeClass(employee.status || 'active')}`}>
              {getStatusLabel(employee.status || 'active')}
            </span>
          </div>
        </div>
        {/* Missing Data Alert */}
        {employee.data_completion_status === 'incomplete' && (
          <div className="alert-card alert-warning">
            <h2>
              <span style={{ fontSize: '24px', marginLeft: '8px' }}>⚠️</span>
              البيانات الناقصة
            </h2>
            <p>
              هذا الموظف يحتاج إلى إكمال البيانات التالية:
            </p>
            {missingData.missingFields && missingData.missingFields.length > 0 ? (
              <ul>
                {missingData.missingFields.map((field, index) => (
                  <li key={index}>
                    {field}
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <p style={{ fontStyle: 'italic', marginBottom: '10px' }}>
                  جاري تحميل قائمة البيانات الناقصة...
                </p>
                <p style={{ fontSize: '13px' }}>
                  قد تشمل البيانات الناقصة: المعلومات الشخصية، المستندات المطلوبة، أو البيانات الخاصة بالمهنة أو نوع الفرع.
                </p>
              </div>
            )}
            <div style={{ marginTop: '15px' }}>
              <button
                onClick={() => navigate(`/employees`, { state: { editEmployeeId: id } })}
                className="btn btn-warning btn-md"
              >
                إكمال البيانات الآن
              </button>
            </div>
          </div>
        )}

        {/* Data Completion Status */}
        {employee.data_completion_status && (
          <div className={`status-completion-box ${employee.data_completion_status === 'complete' ? 'complete' : 'incomplete'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>
                {employee.data_completion_status === 'complete' ? '✓' : '⚠️'}
              </span>
              <strong>
                حالة البيانات: {employee.data_completion_status === 'complete' ? 'مكتملة' : 'غير مكتملة'}
              </strong>
            </div>
            {employee.data_completion_status === 'incomplete' && (
              <button
                onClick={() => navigate(`/employees`, { state: { editEmployeeId: id } })}
                className="btn btn-warning btn-sm"
              >
                إكمال البيانات
              </button>
            )}
          </div>
        )}

        {/* Pending Employee Renewal/Non-Renewal Section - Only for branch managers */}
        {isBranchManager() && employee.status === 'pending' && (
            <div className="renewal-section">
              <h2>
                <img src="https://img.icons8.com/material-rounded/24/dots-loading.png" alt="تحميل" className="icon-lg" style={{ width: '24px', height: '24px' }} />
                قرار التجديد - نهاية السنة الدراسية
              </h2>
              <p>
                هذا الموظف في حالة انتظار قرار التجديد. يجب تحديث المستندات المطلوبة ثم اختيار أحد الخيارات:
              </p>
              
              {!showNonRenewalForm ? (
                <div className="renewal-actions">
                  <button
                    onClick={async () => {
                      if (processingRenewal) return;
                      setProcessingRenewal(true);
                      try {
                        await employeesAPI.renew(id);
                        showSuccess('تم تجديد العقد بنجاح');
                        loadEmployeeData();
                      } catch (error) {
                        console.error('Error renewing employee:', error);
                        const errorMsg = error.response?.data?.message || 'فشل تجديد العقد';
                        if (error.response?.data?.missing_documents) {
                          showError(`${errorMsg}\n\nالمستندات المطلوبة:\n${error.response.data.required_documents.join('\n')}\n\nيرجى تحديث هذه المستندات أولاً.`);
                        } else {
                          showError(errorMsg);
                        }
                      } finally {
                        setProcessingRenewal(false);
                      }
                    }}
                    disabled={processingRenewal}
                    className="btn btn-success btn-md"
                  >
                    {processingRenewal ? 'جاري المعالجة...' : (
                      <>
                        <img src="https://img.icons8.com/material-rounded/24/check-mark.png" alt="نجاح" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }} />
                        تجديد العقد
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowNonRenewalForm(true);
                      setNonRenewalData({ status: '', reason: '' });
                    }}
                    className="btn btn-danger btn-md"
                  >
                    ❌ عدم التجديد
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '15px' }}>
                  <div className="alert-form-group">
                    <label>
                      سبب عدم التجديد *
                    </label>
                    <select
                      value={nonRenewalData.status}
                      onChange={(e) => setNonRenewalData(prev => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="">اختر السبب</option>
                      <option value="non_renewal">عدم تجديد العقد</option>
                      <option value="terminated_article_80">فصل حسب المادة 80</option>
                      <option value="terminated_article_77">فصل حسب المادة 77</option>
                      <option value="resigned">استقالة</option>
                      <option value="contract_ended">انتهاء العقد</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                  <div className="alert-form-group">
                    <label>
                      تفاصيل إضافية (اختياري)
                    </label>
                    <textarea
                      value={nonRenewalData.reason}
                      onChange={(e) => setNonRenewalData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="أضف تفاصيل إضافية عن سبب عدم التجديد..."
                      rows="3"
                    />
                  </div>
                  <div className="alert-form-actions">
                    <button
                      onClick={async () => {
                        if (!nonRenewalData.status) {
                          showWarning('يرجى اختيار سبب عدم التجديد');
                          return;
                        }
                        try {
                          await employeesAPI.nonRenewal(id, nonRenewalData);
                          showSuccess('تم نقل الموظف إلى الأرشيف بنجاح');
                          setShowNonRenewalForm(false);
                          setNonRenewalData({ status: '', reason: '' });
                          loadEmployeeData();
                        } catch (error) {
                          console.error('Error processing non-renewal:', error);
                          showError(error.response?.data?.message || 'فشل معالجة عدم التجديد');
                        }
                      }}
                      className="btn btn-danger btn-md"
                    >
                      تأكيد عدم التجديد
                    </button>
                    <button
                      onClick={() => {
                        setShowNonRenewalForm(false);
                        setNonRenewalData({ status: '', reason: '' });
                      }}
                      className="btn btn-secondary btn-md"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
              
              <div className="renewal-note">
                <p>
                  <strong>ملاحظة:</strong> لتجديد العقد، يجب تحديث المستندات التالية:
                </p>
                <ul>
                  <li>عقد العمل (employment_contract)</li>
                  <li>خطاب بدء العمل (employment_letter)</li>
                  {employee.gender === 'female' && (
                    <li>الفحص الطبي (medical_examination) - مطلوب للإناث</li>
                  )}
                </ul>
                <p style={{ margin: '10px 0 0 0', fontSize: '12px', fontStyle: 'italic' }}>
                  يجب أن تكون المستندات محدثة (تم رفعها خلال آخر 90 يوم)
                </p>
              </div>
            </div>
          )}

        {/* Basic Information */}
        <div className="info-cards-grid">
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-card-icon">📋</div>
              <h3 className="info-card-title">المعلومات الأساسية</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-item-label">المهنة</span>
                <span className="info-item-value">{employee.occupation || '-'}</span>
              </div>
              <div className="info-item">
                <span className="info-item-label">الجنسية</span>
                <span className="info-item-value">{employee.nationality || '-'}</span>
              </div>
              <div className="info-item">
                <span className="info-item-label">الفرع</span>
                <span className="info-item-value">{branches.find(b => b.id === employee.branch_id)?.branch_name || employee.branch_id || '-'}</span>
              </div>
              <div className="info-item">
                <span className="info-item-label">الجنس</span>
                <span className="info-item-value">{employee.gender === 'male' ? 'ذكر' : employee.gender === 'female' ? 'أنثى' : '-'}</span>
              </div>
              <div className="info-item">
                <span className="info-item-label">نوع الهوية</span>
                <span className="info-item-value">{employee.id_type === 'citizen' ? 'مواطن' : employee.id_type === 'resident' ? 'مقيم' : '-'}</span>
              </div>
              <div className="info-item">
                <span className="info-item-label">رقم الهوية/الإقامة</span>
                <span className="info-item-value">{employee.id_or_residency_number || '-'}</span>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-card-icon">👤</div>
              <h3 className="info-card-title">المعلومات الشخصية</h3>
            </div>
            <div className="info-grid">
              {employee.date_of_birth_hijri && (
                <div className="info-item">
                  <span className="info-item-label">تاريخ الميلاد (هجري)</span>
                  <span className="info-item-value">{employee.date_of_birth_hijri}</span>
                </div>
              )}
              {employee.date_of_birth_gregorian && (
                <div className="info-item">
                  <span className="info-item-label">تاريخ الميلاد (ميلادي)</span>
                  <span className="info-item-value">{new Date(employee.date_of_birth_gregorian).toLocaleDateString('ar-SA')}</span>
                </div>
              )}
              {employee.id_expiry_date_hijri && (
                <div className="info-item">
                  <span className="info-item-label">انتهاء الهوية (هجري)</span>
                  <span className="info-item-value">{employee.id_expiry_date_hijri}</span>
                </div>
              )}
              {employee.id_expiry_date_gregorian && (
                <div className="info-item">
                  <span className="info-item-label">انتهاء الهوية (ميلادي)</span>
                  <span className="info-item-value">{new Date(employee.id_expiry_date_gregorian).toLocaleDateString('ar-SA')}</span>
                </div>
              )}
              {employee.religion && (
                <div className="info-item">
                  <span className="info-item-label">الدين</span>
                  <span className="info-item-value">{employee.religion}</span>
                </div>
              )}
              {employee.marital_status && (
                <div className="info-item">
                  <span className="info-item-label">الحالة الاجتماعية</span>
                  <span className="info-item-value">{employee.marital_status}</span>
                </div>
              )}
              {employee.educational_qualification && (
                <div className="info-item">
                  <span className="info-item-label">المؤهل التعليمي</span>
                  <span className="info-item-value">{employee.educational_qualification}</span>
                </div>
              )}
              {employee.specialization && (
                <div className="info-item">
                  <span className="info-item-label">التخصص</span>
                  <span className="info-item-value">{employee.specialization}</span>
                </div>
              )}
              {employee.national_address && (
                <div className="info-item">
                  <span className="info-item-label">العنوان الوطني</span>
                  <span className="info-item-value">{employee.national_address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-card-icon">📞</div>
              <h3 className="info-card-title">معلومات الاتصال</h3>
            </div>
            <div className="info-grid">
              {employee.email && (
                <div className="info-item">
                  <span className="info-item-label">البريد الإلكتروني</span>
                  <span className="info-item-value">{employee.email}</span>
                </div>
              )}
              {employee.phone_number && (
                <div className="info-item">
                  <span className="info-item-label">رقم الهاتف</span>
                  <span className="info-item-value">{employee.phone_number}</span>
                </div>
              )}
            </div>
          </div>

          {/* Work Information */}
          {(employee.contract_type || (employee.years_of_experience_in_same_institution !== undefined && employee.years_of_experience_in_same_institution !== null) || employee.job_title) && (
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon">💼</div>
                <h3 className="info-card-title">معلومات العمل</h3>
              </div>
              <div className="info-grid">
                {employee.job_title && (
                  <div className="info-item">
                    <span className="info-item-label">المسمى الوظيفي</span>
                    <span className="info-item-value">{employee.job_title}</span>
                  </div>
                )}
                {employee.contract_type && (
                  <div className="info-item">
                    <span className="info-item-label">نوع العقد</span>
                    <span className="info-item-value">{employee.contract_type}</span>
                  </div>
                )}
                {(employee.years_of_experience_in_same_institution !== undefined && employee.years_of_experience_in_same_institution !== null) && (
                  <div className="info-item">
                    <span className="info-item-label">سنوات الخبرة في نفس المؤسسة</span>
                    <span className="info-item-value">{employee.years_of_experience_in_same_institution} سنة</span>
                  </div>
                )}
                {(employee.years_of_experience_in_company !== undefined && employee.years_of_experience_in_company !== null) && (
                  <div className="info-item">
                    <span className="info-item-label">سنوات الخبرة في الشركة</span>
                    <span className="info-item-value">{employee.years_of_experience_in_company} سنة</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Information */}
          {(employee.bank_name || employee.bank_iban) && (
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon">🏦</div>
                <h3 className="info-card-title">المعلومات المالية</h3>
              </div>
              <div className="info-grid">
                {employee.bank_name && (
                  <div className="info-item">
                    <span className="info-item-label">البنك</span>
                    <span className="info-item-value">{employee.bank_name}</span>
                  </div>
                )}
                {employee.bank_iban && (
                  <div className="info-item">
                    <span className="info-item-label">رقم الآيبان</span>
                    <span className="info-item-value">{employee.bank_iban}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Salary Information */}
        {(
          (employee.base_salary || 0) !== 0 || 
          (employee.housing_allowance || 0) !== 0 || 
          (employee.transportation_allowance || 0) !== 0 || 
          (employee.end_of_service_allowance || 0) !== 0 || 
          (employee.annual_leave_allowance || 0) !== 0 || 
          (employee.other_allowances || 0) !== 0 || 
          (employee.deductions || 0) !== 0
        ) && (
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-card-icon">💰</div>
              <h3 className="info-card-title">الراتب والبدلات</h3>
            </div>
            <div className="salary-box">
              <div className="salary-item">
                <strong>الراتب الأساسي:</strong> {(employee.base_salary || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item">
                <strong>بدل السكن:</strong> {(employee.housing_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item">
                <strong>بدل النقل:</strong> {(employee.transportation_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item">
                <strong>بدل نهاية الخدمة:</strong> {(employee.end_of_service_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item">
                <strong>بدل الإجازة السنوية:</strong> {(employee.annual_leave_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item">
                <strong>بدلات أخرى:</strong> {(employee.other_allowances || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-item" style={{ color: employee.deductions > 0 ? 'var(--danger)' : 'inherit' }}>
                <strong>الاستقطاعات (خصومات، سلف، إلخ):</strong> {(employee.deductions || 0) > 0 ? '-' : ''}{(employee.deductions || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div className="salary-total">
                <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>
                  <strong>إجمالي الراتب والبدلات:</strong> {
                    (parseFloat(employee.base_salary || 0) +
                     parseFloat(employee.housing_allowance || 0) +
                     parseFloat(employee.transportation_allowance || 0) +
                     parseFloat(employee.end_of_service_allowance || 0) +
                     parseFloat(employee.annual_leave_allowance || 0) +
                     parseFloat(employee.other_allowances || 0)).toLocaleString('ar-SA')
                  } ريال
                </div>
                {(employee.deductions || 0) > 0 && (
                  <div style={{ fontWeight: 'bold', color: 'var(--danger)', marginBottom: '5px' }}>
                    <strong>الاستقطاعات:</strong> -{parseFloat(employee.deductions || 0).toLocaleString('ar-SA')} ريال
                  </div>
                )}
                <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '1.1em', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid var(--border)' }}>
                  <strong>صافي الراتب:</strong> {
                    (parseFloat(employee.base_salary || 0) +
                     parseFloat(employee.housing_allowance || 0) +
                     parseFloat(employee.transportation_allowance || 0) +
                     parseFloat(employee.end_of_service_allowance || 0) +
                     parseFloat(employee.annual_leave_allowance || 0) +
                     parseFloat(employee.other_allowances || 0) -
                     parseFloat(employee.deductions || 0)).toLocaleString('ar-SA')
                  } ريال
                </div>
              </div>
            </div>
          </div>
        )}
        {employee.salary && !employee.base_salary && (
          <div style={{ marginTop: '10px', padding: '10px', background: '#fff3cd', borderRadius: '5px', fontSize: '0.9em' }}>
            <strong>الراتب (قديم):</strong> {employee.salary.toLocaleString('ar-SA')} ريال
            <div style={{ fontSize: '0.85em', color: '#856404', marginTop: '5px' }}>
              ملاحظة: هذا الحقل للتوافق مع البيانات القديمة فقط
            </div>
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div className="documents-section">
          <h2 className="section-header">
            المستندات المرفوعة ({documents.length})
          </h2>
          {documents.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد مستندات مرفوعة</p>
            </div>
          ) : (
            <div className="documents-grid">
              {documents.map((doc) => (
                <div key={doc.id} className="document-card">
                  <div className="document-card-header">
                    <div className="document-type-icon">📄</div>
                    <h3 className="document-card-title">{getDocumentTypeLabel(doc.document_type)}</h3>
                  </div>
                  <div className="document-card-body">
                    <div className="document-info-item">
                      <span className="document-info-label">اسم الملف</span>
                      <span className="document-info-value">{doc.file_name || '-'}</span>
                    </div>
                    <div className="document-info-item">
                      <span className="document-info-label">الحجم</span>
                      <span className="document-info-value">{doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'غير محدد'}</span>
                    </div>
                    <div className="document-info-item">
                      <span className="document-info-label">تاريخ الرفع</span>
                      <span className="document-info-value">{new Date(doc.uploaded_at).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                    </div>
                    <div className="document-info-item">
                      <span className="document-info-label">الحالة</span>
                      <span className={`badge ${doc.is_verified ? 'badge-success' : 'badge-warning'}`}>
                        {doc.is_verified ? 'متحقق منه' : 'غير متحقق'}
                      </span>
                    </div>
                    {doc.expiry_date && (
                      <div className="document-info-item">
                        <span className="document-info-label">تاريخ الانتهاء</span>
                        <span className="document-info-value">{new Date(doc.expiry_date).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                      </div>
                    )}
                  </div>
                  <div className="document-card-actions">
                    {doc.mime_type && doc.mime_type.startsWith('image/') && (
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={previewLoading === doc.id}
                        className="btn btn-success btn-sm"
                      >
                        {previewLoading === doc.id ? (
                          <>
                            <span className="spinner"></span>
                            جاري التحميل...
                          </>
                        ) : (
                          <>👁️ معاينة</>
                        )}
                      </button>
                    )}
                    {doc.mime_type && doc.mime_type === 'application/pdf' && (
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={previewLoading === doc.id}
                        className="btn btn-warning btn-sm"
                      >
                        {previewLoading === doc.id ? (
                          <>
                            <span className="spinner"></span>
                            جاري التحميل...
                          </>
                        ) : (
                          <>📄 فتح PDF</>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(doc.id)}
                      disabled={downloading === doc.id}
                      className="btn btn-primary btn-sm"
                    >
                      {downloading === doc.id ? (
                        <>
                          <span className="spinner"></span>
                          جاري التحميل...
                        </>
                      ) : (
                        <>⬇️ تحميل</>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
        
      {/* Generate File Section */}
      <div className="generate-file-section">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleGenerateFile(e);
            }}
            disabled={generatingFile || !employee}
            className="btn btn-primary btn-lg generate-file-button"
          >
            {generatingFile ? (
              <>
                <span className="spinner"></span>
                جاري إنشاء الملف...
              </>
            ) : (
              <>
                📄 إنشاء ملف الموظف (PDF)
              </>
            )}
          </button>
        </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="password-modal"
          onClick={() => {
            if (!generatingFile) {
              setShowPasswordModal(false);
              setPassword('');
              setPasswordError('');
            }
          }}
        >
          <div className="password-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>إدخال كلمة المرور</h2>
            <p>يرجى إدخال كلمة مرور مستندات الفرع لإنشاء ملف الموظف</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="password-input-group">
                <label>كلمة المرور</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  disabled={generatingFile}
                  style={{
                    border: passwordError ? '2px solid var(--danger)' : '2px solid var(--border)'
                  }}
                  autoFocus
                />
                {passwordError && (
                  <div className="password-error">{passwordError}</div>
                )}
              </div>
              <div className="password-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword('');
                    setPasswordError('');
                  }}
                  disabled={generatingFile}
                  className="btn btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={generatingFile || !password.trim()}
                  className="btn btn-primary"
                >
                  {generatingFile ? (
                    <>
                      <span className="spinner"></span>
                      جاري المعالجة...
                    </>
                  ) : (
                    'إنشاء الملف'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewDocument && previewUrl && previewDocument.mime_type && previewDocument.mime_type.startsWith('image/') && (
        <div className="image-preview-modal" onClick={closePreview}>
          <div className="image-preview-content">
            <button
              onClick={closePreview}
              className="image-preview-close"
            >
              ×
            </button>
            <img
              src={previewUrl}
              alt={previewDocument.file_name}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDetails;


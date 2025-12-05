/**
 * Employee Details Page
 * Display all employee information and documents
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeesAPI, documentsAPI, branchesAPI } from '../utils/api';
import { getDocumentTypeLabel } from '../utils/employeeConstants';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './TablePage.css';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isBranchManager } = useAuth();
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

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>تفاصيل الموظف</h1>
        <button onClick={() => navigate('/employees')} className="btn btn-secondary btn-md">
          العودة للقائمة
        </button>
      </div>

      <div className="card">
        {/* Missing Data Alert */}
        {/* Use data_completion_status from DB as source of truth, but show missing fields from calculation */}
        {employee.data_completion_status === 'incomplete' && (
          <div className="alert alert-warning">
            <h2>
              <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" className="icon-lg" style={{ width: '24px', height: '24px' }} />
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
        {/* Use data_completion_status from DB as single source of truth */}
        {employee.data_completion_status && (
          <div className={`status-completion-box ${employee.data_completion_status === 'complete' ? 'complete' : 'incomplete'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="icon-md">
                {employee.data_completion_status === 'complete' ? (
                  <img src="https://img.icons8.com/material-rounded/24/check-mark.png" alt="نجاح" style={{ width: '24px', height: '24px' }} />
                ) : (
                  <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '24px', height: '24px' }} />
                )}
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
        <h2 className="section-header">
          المعلومات الأساسية
        </h2>
        <div className="info-grid">
          <div>
            <strong>رقم الموظف:</strong> {employee.employee_id_number}
          </div>
          <div>
            <strong>الاسم الكامل:</strong> {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
          </div>
          <div>
            <strong>المهنة:</strong> {employee.occupation}
          </div>
          <div>
            <strong>الجنسية:</strong> {employee.nationality}
          </div>
          <div>
            <strong>الفرع:</strong> {branches.find(b => b.id === employee.branch_id)?.branch_name || employee.branch_id}
          </div>
          <div>
            <strong>الجنس:</strong> {employee.gender === 'male' ? 'ذكر' : 'أنثى'}
          </div>
          <div>
            <strong>نوع الهوية:</strong> {employee.id_type === 'citizen' ? 'مواطن' : 'مقيم'}
          </div>
          <div>
            <strong>رقم الهوية/الإقامة:</strong> {employee.id_or_residency_number}
          </div>
          <div className="info-item">
            <strong>الحالة:</strong> 
            {(() => {
              const status = employee.status || 'active';
              const statusLabels = {
                'active': { text: 'نشط', class: 'badge-success' },
                'pending': { text: 'قيد الانتظار', class: 'badge-warning' },
                'terminated_article_80': { text: 'فصل حسب المادة 80', class: 'badge-danger' },
                'terminated_article_77': { text: 'فصل حسب المادة 77', class: 'badge-danger' },
                'resigned': { text: 'استقال', class: 'badge-danger' },
                'contract_ended': { text: 'انتهى العقد', class: 'badge-secondary' },
                'non_renewal': { text: 'عدم التجديد', class: 'badge-secondary' },
                'other': { text: 'أخرى', class: 'badge-secondary' }
              };
              const statusInfo = statusLabels[status] || { text: status, class: 'badge-secondary' };
              return (
                <span className={`badge ${statusInfo.class}`} style={{ marginRight: '10px' }}>
                  {statusInfo.text}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Personal Information */}
        <h2 className="section-header">
          المعلومات الشخصية
        </h2>
        <div className="info-grid">
          {employee.date_of_birth_hijri && (
            <div>
              <strong>تاريخ الميلاد (هجري):</strong> {employee.date_of_birth_hijri}
            </div>
          )}
          {employee.date_of_birth_gregorian && (
            <div>
              <strong>تاريخ الميلاد (ميلادي):</strong> {employee.date_of_birth_gregorian}
            </div>
          )}
          {employee.id_expiry_date_hijri && (
            <div>
              <strong>انتهاء الهوية (هجري):</strong> {employee.id_expiry_date_hijri}
            </div>
          )}
          {employee.id_expiry_date_gregorian && (
            <div>
              <strong>انتهاء الهوية (ميلادي):</strong> {employee.id_expiry_date_gregorian}
            </div>
          )}
          {employee.religion && (
            <div>
              <strong>الدين:</strong> {employee.religion}
            </div>
          )}
          {employee.marital_status && (
            <div>
              <strong>الحالة الاجتماعية:</strong> {employee.marital_status}
            </div>
          )}
          {employee.educational_qualification && (
            <div>
              <strong>المؤهل التعليمي:</strong> {employee.educational_qualification}
            </div>
          )}
          {employee.specialization && (
            <div>
              <strong>التخصص:</strong> {employee.specialization}
            </div>
          )}
        </div>

        {/* Contact Information */}
        <h2 className="section-header">
          معلومات الاتصال
        </h2>
        <div className="info-grid">
          {employee.email && (
            <div>
              <strong>البريد الإلكتروني:</strong> {employee.email}
            </div>
          )}
          {employee.phone_number && (
            <div>
              <strong>رقم الهاتف:</strong> {employee.phone_number}
            </div>
          )}
          {employee.national_address && (
            <div>
              <strong>العنوان الوطني الموحد (المختصر):</strong> {employee.national_address}
            </div>
          )}
          {employee.bank_name && (
            <div>
              <strong>البنك:</strong> {employee.bank_name}
            </div>
          )}
          {employee.bank_iban && (
            <div>
              <strong>رقم الآيبان:</strong> {employee.bank_iban}
            </div>
          )}
          {employee.contract_type && (
            <div>
              <strong>نوع العقد:</strong> {employee.contract_type}
            </div>
          )}
          {(employee.years_of_experience_in_same_institution !== undefined && employee.years_of_experience_in_same_institution !== null) && (
            <div>
              <strong>عدد سنين الخبرة داخل المؤسسة نفسها:</strong> {employee.years_of_experience_in_same_institution} سنة
            </div>
          )}
          {(
            (employee.base_salary || 0) !== 0 || 
            (employee.housing_allowance || 0) !== 0 || 
            (employee.transportation_allowance || 0) !== 0 || 
            (employee.end_of_service_allowance || 0) !== 0 || 
            (employee.annual_leave_allowance || 0) !== 0 || 
            (employee.other_allowances || 0) !== 0 || 
            (employee.deductions || 0) !== 0
          ) && (
            <div className="salary-box">
              <h3>الراتب والبدلات والاستقطاعات</h3>
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
        <h2 className="section-header">
          المستندات المرفوعة ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <div className="empty-state">
            لا توجد مستندات مرفوعة
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '20px',
                backgroundColor: '#f9f9f9',
                transition: 'box-shadow 0.3s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ marginBottom: '15px' }}>
                  <strong style={{ fontSize: '16px', color: '#333' }}>{getDocumentTypeLabel(doc.document_type)}</strong>
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>اسم الملف:</strong> {doc.file_name}
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>الحجم:</strong> {doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'غير محدد'}
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>تاريخ الرفع:</strong> {new Date(doc.uploaded_at).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <strong>الحالة:</strong> 
                  <span className={`badge ${doc.is_verified ? 'badge-success' : 'badge-warning'}`} style={{ marginRight: '10px' }}>
                    {doc.is_verified ? 'متحقق منه' : 'غير متحقق'}
                  </span>
                </div>
                {doc.expiry_date && (
                  <div style={{ marginBottom: '15px', color: '#666' }}>
                    <strong>تاريخ الانتهاء:</strong> {new Date(doc.expiry_date).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                  {doc.mime_type && doc.mime_type.startsWith('image/') && (
                    <button
                      onClick={() => handlePreview(doc)}
                      disabled={previewLoading === doc.id}
                      className="btn btn-success btn-sm"
                    >
                      {previewLoading === doc.id ? (
                        <>
                          <span className="spinner" style={{ display: 'inline-block', marginLeft: '5px', width: '12px', height: '12px' }}></span>
                          جاري التحميل...
                        </>
                      ) : (
                        <>
                          <img src="https://img.icons8.com/?size=24&id=85028&format=png&color=000000" alt="معاينة" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }} />
                          عرض الصورة
                        </>
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
                          <span className="spinner" style={{ display: 'inline-block', marginLeft: '5px', width: '12px', height: '12px' }}></span>
                          جاري التحميل...
                        </>
                      ) : (
                        '📄 فتح PDF'
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
                        <span className="spinner" style={{ display: 'inline-block', marginLeft: '5px', width: '12px', height: '12px' }}></span>
                        جاري التحميل...
                      </>
                    ) : (
                      <><img src="https://img.icons8.com/material-rounded/24/download--v1.png" alt="تحميل" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }} /> تحميل</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewDocument && previewUrl && previewDocument.mime_type && previewDocument.mime_type.startsWith('image/') && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
        onClick={closePreview}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button
              onClick={closePreview}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '32px',
                cursor: 'pointer',
                zIndex: 2001
              }}
            >
              ×
            </button>
            <img
              src={previewUrl}
              alt={previewDocument.file_name}
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDetails;


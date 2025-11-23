/**
 * Employee Details Page
 * Display all employee information and documents
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeesAPI, documentsAPI } from '../utils/api';
import { API_URL } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isMainManager, user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);

  useEffect(() => {
    loadEmployeeData();
  }, [id]);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      const [employeeResponse, documentsResponse] = await Promise.all([
        employeesAPI.getById(id),
        employeesAPI.getDocuments(id)
      ]);

      if (employeeResponse.data.success) {
        setEmployee(employeeResponse.data.data);
      }

      if (documentsResponse.data.success) {
        setDocuments(documentsResponse.data.data || []);
      }
    } catch (error) {
      console.error('Error loading employee data:', error);
      alert('فشل تحميل بيانات الموظف');
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
        alert('يرجى تسجيل الدخول مرة أخرى');
        navigate('/login');
        return;
      }

      setPreviewLoading(document.id);
      setPreviewDocument(document);
      // Check if it's an image
      if (document.mime_type && document.mime_type.startsWith('image/')) {
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
          alert(`فشل تحميل الصورة للمعاينة: ${errorMsg}`);
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
              alert('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
            }
          } else {
            throw new Error('Invalid response format');
          }
          setPreviewDocument(null);
        } catch (error) {
          console.error('Error opening PDF:', error);
          const errorMsg = error.response?.data?.message || error.message || 'فشل فتح ملف PDF';
          alert(`فشل فتح ملف PDF: ${errorMsg}`);
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
      alert('فشل عرض المستند');
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
        alert('يرجى تسجيل الدخول مرة أخرى');
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
      alert(`فشل تحميل المستند: ${errorMsg}`);
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
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>الموظف غير موجود</p>
          <button onClick={() => navigate('/employees')} className="btn-primary">
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
        <button onClick={() => navigate('/employees')} className="btn-secondary">
          العودة للقائمة
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', marginTop: '20px' }}>
        {/* Basic Information */}
        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333', borderBottom: '2px solid #2196F3', paddingBottom: '10px' }}>
          المعلومات الأساسية
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
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
            <strong>الفرع:</strong> {employee.branch_id}
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
          <div>
            <strong>الحالة:</strong> 
            <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: '10px' }}>
              {employee.is_active ? 'نشط' : 'غير نشط'}
            </span>
          </div>
        </div>

        {/* Personal Information */}
        <h2 style={{ marginTop: '30px', marginBottom: '20px', color: '#333', borderBottom: '2px solid #2196F3', paddingBottom: '10px' }}>
          المعلومات الشخصية
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
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
        <h2 style={{ marginTop: '30px', marginBottom: '20px', color: '#333', borderBottom: '2px solid #2196F3', paddingBottom: '10px' }}>
          معلومات الاتصال
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
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
            <div style={{ marginTop: '15px', padding: '15px', background: '#f9f9f9', borderRadius: '5px' }}>
              <h3 style={{ marginBottom: '10px', color: '#2196F3' }}>الراتب والبدلات والاستقطاعات</h3>
              <div style={{ marginBottom: '8px' }}>
                <strong>الراتب الأساسي:</strong> {(employee.base_salary || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>بدل السكن:</strong> {(employee.housing_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>بدل النقل:</strong> {(employee.transportation_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>بدل نهاية الخدمة:</strong> {(employee.end_of_service_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>بدل الإجازة السنوية:</strong> {(employee.annual_leave_allowance || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>بدلات أخرى:</strong> {(employee.other_allowances || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginBottom: '8px', color: employee.deductions > 0 ? '#d32f2f' : 'inherit' }}>
                <strong>الاستقطاعات (خصومات، سلف، إلخ):</strong> {(employee.deductions || 0) > 0 ? '-' : ''}{(employee.deductions || 0).toLocaleString('ar-SA')} ريال
              </div>
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                <div style={{ fontWeight: 'bold', color: '#2196F3', marginBottom: '5px' }}>
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
                  <div style={{ fontWeight: 'bold', color: '#d32f2f', marginBottom: '5px' }}>
                    <strong>الاستقطاعات:</strong> -{parseFloat(employee.deductions || 0).toLocaleString('ar-SA')} ريال
                  </div>
                )}
                <div style={{ fontWeight: 'bold', color: '#2e7d32', fontSize: '1.1em', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #ddd' }}>
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
        <h2 style={{ marginTop: '30px', marginBottom: '20px', color: '#333', borderBottom: '2px solid #2196F3', paddingBottom: '10px' }}>
          المستندات المرفوعة ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
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
                  <strong style={{ fontSize: '16px', color: '#333' }}>{doc.document_type}</strong>
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>اسم الملف:</strong> {doc.file_name}
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>الحجم:</strong> {doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'غير محدد'}
                </div>
                <div style={{ marginBottom: '10px', color: '#666' }}>
                  <strong>تاريخ الرفع:</strong> {new Date(doc.uploaded_at).toLocaleDateString('ar-SA')}
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <strong>الحالة:</strong> 
                  <span className={`badge ${doc.is_verified ? 'badge-success' : 'badge-warning'}`} style={{ marginRight: '10px' }}>
                    {doc.is_verified ? 'متحقق منه' : 'غير متحقق'}
                  </span>
                </div>
                {doc.expiry_date && (
                  <div style={{ marginBottom: '15px', color: '#666' }}>
                    <strong>تاريخ الانتهاء:</strong> {new Date(doc.expiry_date).toLocaleDateString('ar-SA')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                  {doc.mime_type && doc.mime_type.startsWith('image/') && (
                    <button
                      onClick={() => handlePreview(doc)}
                      disabled={previewLoading === doc.id}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: previewLoading === doc.id ? '#ccc' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: previewLoading === doc.id ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        opacity: previewLoading === doc.id ? 0.7 : 1
                      }}
                    >
                      {previewLoading === doc.id ? (
                        <>
                          <span className="spinner" style={{ display: 'inline-block', marginLeft: '5px', width: '12px', height: '12px' }}></span>
                          جاري التحميل...
                        </>
                      ) : (
                        '👁️ عرض الصورة'
                      )}
                    </button>
                  )}
                  {doc.mime_type && doc.mime_type === 'application/pdf' && (
                    <button
                      onClick={() => handlePreview(doc)}
                      disabled={previewLoading === doc.id}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: previewLoading === doc.id ? '#ccc' : '#FF9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: previewLoading === doc.id ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        opacity: previewLoading === doc.id ? 0.7 : 1
                      }}
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
                    style={{
                      padding: '8px 16px',
                      backgroundColor: downloading === doc.id ? '#ccc' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: downloading === doc.id ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      opacity: downloading === doc.id ? 0.7 : 1
                    }}
                  >
                    {downloading === doc.id ? (
                      <>
                        <span className="spinner" style={{ display: 'inline-block', marginLeft: '5px', width: '12px', height: '12px' }}></span>
                        جاري التحميل...
                      </>
                    ) : (
                      '⬇️ تحميل'
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


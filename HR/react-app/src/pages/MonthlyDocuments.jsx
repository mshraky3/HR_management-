/**
 * Monthly Documents Page
 * Special page for managing payroll and attendance documents
 * Separate from other branch documents for easier management
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { branchDocumentsAPI, branchesAPI, setDocumentBranchMapping, setBranchDocumentsPassword } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './TablePage.css';
import './MonthlyDocuments.css';

const MonthlyDocuments = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadData, setUploadData] = useState({
    branch_id: '',
    document_type: 'payroll_file',
    description: '',
    file: null,
  });

  const monthlyDocumentTypes = [
    { value: 'payroll_file', label: 'ملف مسيرات الرواتب' },
    { value: 'attendance_file', label: 'ملف الحضور و الانصراف' }
  ];

  // Helper function to format date in Gregorian calendar only
  const formatGregorianDate = (date) => {
    const d = new Date(date);
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Helper to get last day of month
  const getLastDayOfMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to get next upload date (last day of current month)
  const getNextUploadDate = () => {
    const now = new Date();
    const lastDay = getLastDayOfMonth(now);
    return new Date(now.getFullYear(), now.getMonth(), lastDay);
  };

  // Helper to check if document was uploaded for current month
  const isUploadedForCurrentMonth = (uploadDate) => {
    const now = new Date();
    return uploadDate.getFullYear() === now.getFullYear() &&
           uploadDate.getMonth() === now.getMonth();
  };

  // Get document status for a branch and document type
  const getDocumentStatus = useCallback((branchId, docType) => {
    const branchDocs = allDocuments.filter(
      doc => doc.branch_id === branchId && 
             doc.document_type === docType && 
             doc.is_active !== false
    );

    if (branchDocs.length === 0) {
      const now = new Date();
      const lastDay = getLastDayOfMonth(now);
      const daysUntilDeadline = lastDay - now.getDate();
      return {
        status: 'missing',
        message: 'لم يتم رفع المستند',
        lastUpload: null,
        daysUntilDeadline: daysUntilDeadline,
        deadlineDate: new Date(now.getFullYear(), now.getMonth(), lastDay)
      };
    }

    const mostRecent = branchDocs.reduce((latest, doc) => {
      const docDate = new Date(doc.uploaded_at);
      const latestDate = latest ? new Date(latest.uploaded_at) : new Date(0);
      return docDate > latestDate ? doc : latest;
    });

    const uploadDate = new Date(mostRecent.uploaded_at);
    const uploadedForCurrentMonth = isUploadedForCurrentMonth(uploadDate);
    const now = new Date();
    const lastDay = getLastDayOfMonth(now);
    const daysUntilDeadline = lastDay - now.getDate();

    if (uploadedForCurrentMonth) {
      return {
        status: 'uploaded',
        message: 'تم الرفع لهذا الشهر',
        lastUpload: uploadDate,
        document: mostRecent,
        daysUntilDeadline: null,
        deadlineDate: null
      };
    } else {
      return {
        status: 'pending',
        message: 'لم يتم الرفع لهذا الشهر',
        lastUpload: uploadDate,
        document: mostRecent,
        daysUntilDeadline: daysUntilDeadline,
        deadlineDate: new Date(now.getFullYear(), now.getMonth(), lastDay)
      };
    }
  }, [allDocuments]);

  const loadBranches = async () => {
    try {
      const filters = { is_active: true };
      
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }
      
      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        setBranches(response.data.data);
        if (!isMainManager() && user?.branch_id) {
          setUploadData(prev => ({ ...prev, branch_id: user.branch_id }));
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      
      let branchId = null;
      const branchIdFromUrl = searchParams.get('branch_id');
      if (branchIdFromUrl) {
        branchId = parseInt(branchIdFromUrl);
        filters.branch_id = branchId;
      } else if (!isMainManager() && user?.branch_id) {
        branchId = user.branch_id;
        filters.branch_id = branchId;
      }
      
      // For monthly documents, automatically get password from localStorage if available
      // This allows seamless access without prompting for password
      if (!isMainManager() && branchId) {
        try {
          // Try to get stored password from localStorage (if user entered it before in BranchDocuments page)
          const storedPassword = localStorage.getItem(`branch_documents_password_${branchId}`);
          if (storedPassword) {
            setBranchDocumentsPassword(branchId, storedPassword);
          } else {
            // If no stored password, try to get it from the in-memory storage
            // This happens if user already verified password in BranchDocuments page
            // The password might be in memory from previous page visit
          }
        } catch (error) {
          console.error('Error setting password:', error);
        }
      }
      
      // Filter only monthly documents
      const response = await branchDocumentsAPI.getAll(filters);
      if (response.data.success) {
        const docs = response.data.data || [];
        // Filter only payroll and attendance documents
        const monthlyDocs = docs.filter(doc => 
          doc.document_type === 'payroll_file' || doc.document_type === 'attendance_file'
        );
        setAllDocuments(monthlyDocs);
        docs.forEach(doc => {
          if (doc.id && doc.branch_id) {
            setDocumentBranchMapping(doc.id, doc.branch_id);
          }
        });
      } else {
        setAllDocuments([]);
      }
    } catch (error) {
      console.error('Error loading monthly documents:', error);
      // If 401 error and password is missing, don't show error - password will be handled by interceptor
      if (error.response && error.response.status === 401) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes('password') || errorMessage.includes('Password')) {
          // Password required - this is expected, don't show error
          // The password should be added automatically from BranchDocuments page
          setAllDocuments([]);
          return;
        }
      }
      if (error.response && error.response.status >= 400) {
        showError('فشل تحميل المستندات الشهرية: ' + (error.response?.data?.message || error.message));
      }
      setAllDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, isMainManager, user, showError]);

  useEffect(() => {
    if (user) {
      loadBranches();
      loadDocuments();
    }
  }, [user, loadDocuments]);

  useEffect(() => {
    const branchId = searchParams.get('branch_id');
    const docType = searchParams.get('document_type');
    
    if (branchId) {
      setUploadData(prev => ({ ...prev, branch_id: branchId }));
    }
    
    if (docType && (docType === 'payroll_file' || docType === 'attendance_file')) {
      setUploadData(prev => ({ ...prev, document_type: docType }));
    }
  }, [searchParams]);

  // Filter documents based on document type
  useEffect(() => {
    const docType = searchParams.get('document_type');
    if (docType && (docType === 'payroll_file' || docType === 'attendance_file')) {
      const filtered = allDocuments.filter(doc => doc.document_type === docType);
      setDocuments(filtered);
    } else {
      setDocuments(allDocuments);
    }
  }, [searchParams, allDocuments]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        showWarning(`حجم الملف كبير جداً. الحد الأقصى هو 10 ميجابايت.`);
        e.target.value = '';
        return;
      }
    }
    setUploadData({ ...uploadData, file });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      showWarning('الرجاء اختيار ملف');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('branch_id', uploadData.branch_id);
      formData.append('document_type', uploadData.document_type);
      if (uploadData.description) formData.append('description', uploadData.description);

      await branchDocumentsAPI.upload(formData);
      setShowUploadForm(false);
      setUploadData({
        branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
        document_type: 'payroll_file',
        description: '',
        file: null,
      });
      loadDocuments();
      showSuccess('تم رفع المستند بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع المستند');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (document) => {
    try {
      setPreviewLoading(document.id);
      setPreviewDocument(document);
      
      if (document.mime_type && document.mime_type.startsWith('image/')) {
        try {
          const response = await branchDocumentsAPI.download(document.id);
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            setPreviewUrl(blobUrl);
          }
        } catch (error) {
          showError('فشل تحميل الصورة للمعاينة');
          setPreviewDocument(null);
        } finally {
          setPreviewLoading(null);
        }
      } else if (document.mime_type === 'application/pdf') {
        try {
          const response = await branchDocumentsAPI.download(document.id);
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            const newWindow = window.open(blobUrl, '_blank');
            if (!newWindow) {
              showWarning('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
            }
          }
          setPreviewDocument(null);
        } catch (error) {
          showError('فشل فتح ملف PDF');
          setPreviewDocument(null);
        } finally {
          setPreviewLoading(null);
        }
      } else {
        handleDownload(document.id, document.file_name);
        setPreviewDocument(null);
      }
    } catch (error) {
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewLoading(null);
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

  const handleDownload = async (id, fileName) => {
    try {
      setDownloading(id);
      const response = await branchDocumentsAPI.download(id);
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = fileName || `document_${id}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
        }
      }
      
      if (response.data instanceof Blob) {
        const blobUrl = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      showError('فشل تحميل المستند');
    } finally {
      setDownloading(null);
    }
  };

  const handleOpenUploadForm = () => {
    const branchIdFromUrl = searchParams.get('branch_id');
    let branchId = '';
    if (branchIdFromUrl) {
      branchId = branchIdFromUrl;
    } else if (!isMainManager() && user?.branch_id) {
      branchId = user.branch_id;
    }
    
    const docType = searchParams.get('document_type') || 'payroll_file';
    
    setUploadData({
      branch_id: branchId,
      document_type: docType,
      description: '',
      file: null,
    });
    setShowUploadForm(true);
  };

  // For main managers: show message if no branch selected
  if (isMainManager() && !searchParams.get('branch_id') && branches.length > 0) {
    return (
      <div className="table-page">
        <div className="page-header">
          <h1>المستندات الشهرية</h1>
        </div>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          الرجاء اختيار فرع لعرض مستنداته الشهرية
        </div>
      </div>
    );
  }

  if (loading || (branches.length === 0 && user)) {
    return <div className="loading">جاري التحميل...</div>;
  }

  // Get branches to display
  const branchesToDisplay = isMainManager() 
    ? branches.filter(b => b.id === parseInt(searchParams.get('branch_id') || '0'))
    : branches.filter(b => b.id === user?.branch_id);

  // Get alerts for current branch
  const getAlerts = () => {
    const alerts = [];
    branchesToDisplay.forEach(branch => {
      monthlyDocumentTypes.forEach(docType => {
        const status = getDocumentStatus(branch.id, docType.value);
        if (status.status !== 'uploaded') {
          alerts.push({
            branchId: branch.id,
            branchName: branch.branch_name,
            documentType: docType.value,
            documentLabel: docType.label,
            status: status
          });
        }
      });
    });
    return alerts;
  };

  const alerts = getAlerts();

  return (
    <div className="table-page monthly-documents-page">
      <div className="page-header">
        <h1>المستندات الشهرية</h1>
        <button onClick={handleOpenUploadForm} className="btn-primary">
          رفع مستند شهري
        </button>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="monthly-alerts-section">
          <h2>تنبيهات المستندات الشهرية</h2>
          <div className="alerts-list">
            {alerts.map((alert, index) => {
              const status = alert.status;
              const deadlineDate = status.deadlineDate;
              return (
                <div key={`${alert.branchId}-${alert.documentType}-${index}`} className={`alert-item alert-${status.status}`}>
                  <div className="alert-content">
                    <h3>{alert.documentLabel}</h3>
                    {isMainManager() && <p className="branch-name">{alert.branchName}</p>}
                    <p className="alert-message">{status.message}</p>
                    {status.lastUpload && (
                      <p className="last-upload">
                        آخر رفع: {formatGregorianDate(status.lastUpload)}
                      </p>
                    )}
                    {deadlineDate && (
                      <p className="deadline">
                        الموعد النهائي: {formatGregorianDate(deadlineDate)}
                        {status.daysUntilDeadline !== null && (
                          <span className={`days-left ${status.daysUntilDeadline <= 3 ? 'urgent' : ''}`}>
                            {status.daysUntilDeadline > 0 
                              ? ` (متبقي ${status.daysUntilDeadline} يوم)` 
                              : ' (اليوم هو الموعد النهائي)'}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="alert-action">
                    <button 
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set('branch_id', alert.branchId);
                        newParams.set('document_type', alert.documentType);
                        setSearchParams(newParams);
                        handleOpenUploadForm();
                      }}
                      className={`btn-alert ${status.status === 'missing' || (status.daysUntilDeadline !== null && status.daysUntilDeadline <= 3) ? 'btn-urgent' : ''}`}
                    >
                      رفع المستند
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {isMainManager() && <th>الفرع</th>}
              <th>نوع المستند</th>
              <th>اسم الملف</th>
              <th>تاريخ الرفع</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={isMainManager() ? "6" : "5"} style={{ textAlign: 'center' }}>
                  لا توجد مستندات شهرية
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const docType = monthlyDocumentTypes.find(dt => dt.value === doc.document_type);
                const branch = branches.find(b => b.id === doc.branch_id);
                const status = getDocumentStatus(doc.branch_id, doc.document_type);
                return (
                  <tr key={doc.id}>
                    {isMainManager() && <td>{branch ? branch.branch_name : doc.branch_id}</td>}
                    <td>{docType?.label || doc.document_type}</td>
                    <td>{doc.file_name}</td>
                    <td>{formatGregorianDate(doc.uploaded_at)}</td>
                    <td>
                      <span className={`badge ${status.status === 'uploaded' ? 'badge-success' : 'badge-warning'}`}>
                        {status.status === 'uploaded' ? 'تم الرفع' : 'قديم'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {doc.mime_type && (doc.mime_type.startsWith('image/') || doc.mime_type === 'application/pdf') && (
                          <button 
                            onClick={() => handlePreview(doc)} 
                            className="btn-sm" 
                            style={{ background: '#4CAF50', color: 'white' }}
                            disabled={previewLoading === doc.id}
                          >
                            {previewLoading === doc.id ? 'جاري...' : 'معاينة'}
                          </button>
                        )}
                        <button 
                          onClick={() => handleDownload(doc.id, doc.file_name)} 
                          className="btn-sm btn-edit"
                          disabled={downloading === doc.id}
                        >
                          {downloading === doc.id ? 'جاري...' : 'تحميل'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Upload Form Modal */}
      {showUploadForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>رفع مستند شهري</h2>
            <form onSubmit={handleUpload}>
              {isMainManager() && (
                <div className="form-group">
                  <label>الفرع *</label>
                  <select
                    value={uploadData.branch_id}
                    onChange={(e) => setUploadData({ ...uploadData, branch_id: e.target.value })}
                    required
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!isMainManager() && user?.branch_id && (
                <div className="form-group">
                  <label>الفرع</label>
                  <input
                    type="text"
                    value={branches.find(b => b.id === user.branch_id)?.branch_name || 'فرعك'}
                    disabled
                    style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                  />
                </div>
              )}
              <div className="form-group">
                <label>نوع المستند *</label>
                <select
                  value={uploadData.document_type}
                  onChange={(e) => setUploadData({ ...uploadData, document_type: e.target.value })}
                  required
                >
                  {monthlyDocumentTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>الملف * (PDF, JPG, PNG - الحد الأقصى 10 ميجابايت)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>الوصف (اختياري)</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  rows="3"
                  placeholder="ملاحظات إضافية..."
                />
              </div>
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={uploading}
                >
                  {uploading ? 'جاري الرفع...' : 'رفع'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowUploadForm(false);
                    setUploadData({
                      branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
                      document_type: 'payroll_file',
                      description: '',
                      file: null,
                    });
                  }} 
                  className="btn-secondary"
                  disabled={uploading}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default MonthlyDocuments;

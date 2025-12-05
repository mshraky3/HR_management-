/**
 * Monthly Documents Page
 * Special page for managing payroll and attendance documents
 * Beautiful card-based design showing branches with status indicators
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { branchDocumentsAPI, branchesAPI, setDocumentBranchMapping, setBranchDocumentsPassword } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './TablePage.css';
import './MonthlyDocuments.css';

const MonthlyDocuments = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allDocuments, setAllDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadData, setUploadData] = useState({
    branch_id: '',
    document_type: 'payroll_file',
    description: '',
    file: null,
  });

  const monthlyDocumentTypes = [
    { value: 'payroll_file', label: 'ملف مسيرات الرواتب', icon: 'https://img.icons8.com/?size=100&id=47743&format=png&color=000000' },
    { value: 'attendance_file', label: 'ملف الحضور و الانصراف', icon: 'https://img.icons8.com/?size=100&id=47743&format=png&color=000000' }
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
        deadlineDate: new Date(now.getFullYear(), now.getMonth(), lastDay),
        document: null
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

  // Get branch status summary
  const getBranchStatus = useCallback((branchId) => {
    const statuses = monthlyDocumentTypes.map(docType => ({
      type: docType.value,
      label: docType.label,
      icon: docType.icon,
      ...getDocumentStatus(branchId, docType.value)
    }));

    const allUploaded = statuses.every(s => s.status === 'uploaded');
    const hasMissing = statuses.some(s => s.status === 'missing');
    const hasPending = statuses.some(s => s.status === 'pending' && !hasMissing);

    let overallStatus = 'uploaded';
    if (hasMissing) {
      overallStatus = 'missing';
    } else if (hasPending) {
      overallStatus = 'pending';
    }

    return {
      overallStatus,
      statuses,
      allUploaded
    };
  }, [getDocumentStatus, monthlyDocumentTypes]);

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
      if (!isMainManager() && branchId) {
        try {
          const storedPassword = localStorage.getItem(`branch_documents_password_${branchId}`);
          if (storedPassword) {
            setBranchDocumentsPassword(branchId, storedPassword);
          }
        } catch (error) {
          console.error('Error setting password:', error);
        }
      }
      
      // Load all monthly documents for main managers
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
      if (error.response && error.response.status === 401) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes('password') || errorMessage.includes('Password')) {
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
    if (branchId) {
      const branch = branches.find(b => b.id === parseInt(branchId));
      setSelectedBranch(branch || null);
      if (branch) {
        setUploadData(prev => ({ ...prev, branch_id: branchId }));
      }
    } else {
      setSelectedBranch(null);
    }
  }, [searchParams, branches]);

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

  const handleBranchClick = (branch) => {
    const newParams = new URLSearchParams();
    newParams.set('branch_id', branch.id);
    setSearchParams(newParams);
    setSelectedBranch(branch);
  };

  const handleBackToBranches = () => {
    const newParams = new URLSearchParams();
    setSearchParams(newParams);
    setSelectedBranch(null);
  };

  const handleOpenUploadForm = (branchId = null, docType = null) => {
    const finalBranchId = branchId || searchParams.get('branch_id') || (!isMainManager() && user?.branch_id ? user.branch_id : '');
    const finalDocType = docType || searchParams.get('document_type') || 'payroll_file';
    
    setUploadData({
      branch_id: finalBranchId,
      document_type: finalDocType,
      description: '',
      file: null,
    });
    setShowUploadForm(true);
  };

  if (loading || (branches.length === 0 && user)) {
    return <div className="loading">جاري التحميل...</div>;
  }

  // Get branches to display
  const branchesToDisplay = isMainManager() 
    ? branches
    : branches.filter(b => b.id === user?.branch_id);

  // Group branches by type
  const schools = branchesToDisplay.filter(b => b.branch_type === 'school');
  const healthcareCenters = branchesToDisplay.filter(b => b.branch_type === 'healthcare_center');

  // If branch is selected, show branch details
  if (selectedBranch) {
    const branchStatus = getBranchStatus(selectedBranch.id);
    const branchDocuments = allDocuments.filter(doc => doc.branch_id === selectedBranch.id);

    return (
      <div className="table-page monthly-documents-page">
        <div className="page-header">
          <button onClick={handleBackToBranches} className="btn-back">
            ← العودة للفروع
          </button>
          <h1>{selectedBranch.branch_name}</h1>
          <button onClick={() => handleOpenUploadForm(selectedBranch.id)} className="btn-primary">
            رفع مستند شهري
          </button>
        </div>

        <div className="branch-documents-view">
          {monthlyDocumentTypes.map(docType => {
            const status = branchStatus.statuses.find(s => s.type === docType.value);
            const documents = branchDocuments.filter(doc => doc.document_type === docType.value);
            
            return (
              <div key={docType.value} className={`document-type-card status-${status.status}`}>
                <div className="document-type-header">
                  <div className="document-type-info">
                    <img src={docType.icon} alt={docType.label} className="document-icon" style={{ width: '24px', height: '24px' }} />
                    <div>
                      <h3>{docType.label}</h3>
                      <div className={`status-badge status-${status.status}`}>
                        {status.status === 'uploaded' && '✓ تم الرفع'}
                        {status.status === 'pending' && (
                          <>
                            <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '4px' }} />
                            لم يتم الرفع لهذا الشهر
                          </>
                        )}
                        {status.status === 'missing' && '✗ لم يتم رفع المستند'}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleOpenUploadForm(selectedBranch.id, docType.value)}
                    className="btn-upload-small"
                  >
                    رفع مستند
                  </button>
                </div>

                {status.lastUpload && (
                  <p className="last-upload-info">
                    آخر رفع: {formatGregorianDate(status.lastUpload)}
                  </p>
                )}

                {status.deadlineDate && (
                  <p className="deadline-info">
                    الموعد النهائي: {formatGregorianDate(status.deadlineDate)}
                    {status.daysUntilDeadline !== null && (
                      <span className={status.daysUntilDeadline <= 3 ? 'urgent' : ''}>
                        {status.daysUntilDeadline > 0 
                          ? ` (متبقي ${status.daysUntilDeadline} يوم)` 
                          : ' (اليوم هو الموعد النهائي)'}
                      </span>
                    )}
                  </p>
                )}

                {documents.length > 0 ? (
                  <div className="documents-list">
                    {documents.map((doc) => {
                      const isCurrentMonth = isUploadedForCurrentMonth(new Date(doc.uploaded_at));
                      return (
                        <div key={doc.id} className={`document-item ${isCurrentMonth ? 'current-month' : ''}`}>
                          <div className="document-info">
                            <span className="document-name">{doc.file_name}</span>
                            <span className="document-date">{formatGregorianDate(doc.uploaded_at)}</span>
                          </div>
                          <div className="document-actions">
                            {doc.mime_type && (doc.mime_type.startsWith('image/') || doc.mime_type === 'application/pdf') && (
                              <button 
                                onClick={() => handlePreview(doc)} 
                                className="btn-icon"
                                disabled={previewLoading === doc.id}
                                title="معاينة"
                              >
                                {previewLoading === doc.id ? (
                                  <img src="https://img.icons8.com/material-rounded/24/dots-loading.png" alt="تحميل" style={{ width: '20px', height: '20px' }} />
                                ) : (
                                  <img src="https://img.icons8.com/?size=24&id=85028&format=png&color=000000" alt="معاينة" style={{ width: '20px', height: '20px' }} />
                                )}
                              </button>
                            )}
                            <button 
                              onClick={() => handleDownload(doc.id, doc.file_name)} 
                              className="btn-icon"
                              disabled={downloading === doc.id}
                              title="تحميل"
                            >
                              {downloading === doc.id ? (
                                <img src="https://img.icons8.com/material-rounded/24/dots-loading.png" alt="تحميل" style={{ width: '20px', height: '20px' }} />
                              ) : (
                                <img src="https://img.icons8.com/material-rounded/24/download--v1.png" alt="تحميل" style={{ width: '20px', height: '20px' }} />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="no-documents">
                    <p>لا توجد مستندات مرفوعة</p>
                  </div>
                )}
              </div>
            );
          })}
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
          <div className="preview-modal" onClick={closePreview}>
            <div className="preview-content" onClick={(e) => e.stopPropagation()}>
              <button onClick={closePreview} className="preview-close">×</button>
              <img src={previewUrl} alt={previewDocument.file_name} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main view: Show branches as cards grouped by type
  return (
    <div className="table-page monthly-documents-page">
      <div className="page-header">
        <h1>المستندات الشهرية</h1>
        {!isMainManager() && (
          <button onClick={() => handleOpenUploadForm()} className="btn-primary">
            رفع مستند شهري
          </button>
        )}
      </div>

      {/* Schools Section */}
      {schools.length > 0 && (
        <div className="branches-section">
          <h2 className="section-title">
            <img src="https://img.icons8.com/material-rounded/24/school.png" alt="مدرسة" className="section-icon" style={{ width: '24px', height: '24px' }} />
            المدارس
          </h2>
          <div className="branches-grid">
            {schools.map(branch => {
              const branchStatus = getBranchStatus(branch.id);
              return (
                <div 
                  key={branch.id} 
                  className={`branch-card status-${branchStatus.overallStatus}`}
                  onClick={() => handleBranchClick(branch)}
                >
                  <div className="branch-card-header">
                    <h2>{branch.branch_name}</h2>
                    <div className={`status-indicator status-${branchStatus.overallStatus}`}>
                      {branchStatus.overallStatus === 'uploaded' && '✓'}
                      {branchStatus.overallStatus === 'pending' && (
                        <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '16px', height: '16px' }} />
                      )}
                      {branchStatus.overallStatus === 'missing' && '✗'}
                    </div>
                  </div>
                  
                  <div className="branch-card-body">
                    {monthlyDocumentTypes.map(docType => {
                      const status = branchStatus.statuses.find(s => s.type === docType.value);
                      return (
                        <div key={docType.value} className="document-status-item">
                          <img src={docType.icon} alt={docType.label} className="doc-icon" style={{ width: '20px', height: '20px' }} />
                          <span className="doc-label">{docType.label}</span>
                          <span className={`doc-status status-${status.status}`}>
                            {status.status === 'uploaded' && '✓'}
                            {status.status === 'pending' && (
                              <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '16px', height: '16px' }} />
                            )}
                            {status.status === 'missing' && '✗'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="branch-card-footer">
                    <span className="click-hint">اضغط لعرض التفاصيل</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Healthcare Centers Section */}
      {healthcareCenters.length > 0 && (
        <div className="branches-section">
          <h2 className="section-title">
            <img src="https://img.icons8.com/material-rounded/24/hospital.png" alt="مستشفى" className="section-icon" style={{ width: '24px', height: '24px' }} />
            مراكز الرعاية النهارية
          </h2>
          <div className="branches-grid">
            {healthcareCenters.map(branch => {
              const branchStatus = getBranchStatus(branch.id);
              return (
                <div 
                  key={branch.id} 
                  className={`branch-card status-${branchStatus.overallStatus}`}
                  onClick={() => handleBranchClick(branch)}
                >
                  <div className="branch-card-header">
                    <h2>{branch.branch_name}</h2>
                    <div className={`status-indicator status-${branchStatus.overallStatus}`}>
                      {branchStatus.overallStatus === 'uploaded' && '✓'}
                      {branchStatus.overallStatus === 'pending' && (
                        <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '16px', height: '16px' }} />
                      )}
                      {branchStatus.overallStatus === 'missing' && '✗'}
                    </div>
                  </div>
                  
                  <div className="branch-card-body">
                    {monthlyDocumentTypes.map(docType => {
                      const status = branchStatus.statuses.find(s => s.type === docType.value);
                      return (
                        <div key={docType.value} className="document-status-item">
                          <img src={docType.icon} alt={docType.label} className="doc-icon" style={{ width: '20px', height: '20px' }} />
                          <span className="doc-label">{docType.label}</span>
                          <span className={`doc-status status-${status.status}`}>
                            {status.status === 'uploaded' && '✓'}
                            {status.status === 'pending' && (
                              <img src="https://img.icons8.com/material-rounded/24/brake-warning.png" alt="تحذير" style={{ width: '16px', height: '16px' }} />
                            )}
                            {status.status === 'missing' && '✗'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="branch-card-footer">
                    <span className="click-hint">اضغط لعرض التفاصيل</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload Form Modal for branch managers */}
      {showUploadForm && !isMainManager() && (
        <div className="modal">
          <div className="modal-content">
            <h2>رفع مستند شهري</h2>
            <form onSubmit={handleUpload}>
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
                      branch_id: user?.branch_id || '',
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
        <div className="preview-modal" onClick={closePreview}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <button onClick={closePreview} className="preview-close">×</button>
            <img src={previewUrl} alt={previewDocument.file_name} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyDocuments;

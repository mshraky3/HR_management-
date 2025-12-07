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
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [printData, setPrintData] = useState({
    document_type: 'payroll_file',
    branch_ids: []
  });
  const [generatingReport, setGeneratingReport] = useState(false);

  const monthlyDocumentTypes = [
    { value: 'payroll_file', label: 'ملف مسيرات الرواتب', icon: 'https://img.icons8.com/?size=100&id=47743&format=png&color=000000' },
    { value: 'attendance_file', label: 'ملف الحضور و الانصراف', icon: 'https://img.icons8.com/?size=100&id=47743&format=png&color=000000' },
    { value: 'salary_deposit_file', label: 'ملف ايداع الرواتب (التحويلات البنكية)', icon: 'https://img.icons8.com/?size=100&id=47743&format=png&color=000000' }
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
        // Filter only monthly documents
        const monthlyDocs = docs.filter(doc => 
          doc.document_type === 'payroll_file' || 
          doc.document_type === 'attendance_file' || 
          doc.document_type === 'salary_deposit_file'
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

  const handlePrintPayrolls = () => {
    setPrintData({
      document_type: 'payroll_file',
      branch_ids: []
    });
    setShowPrintForm(true);
  };

  const handlePrintFormChange = (field, value) => {
    setPrintData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleToggleBranch = (branchId) => {
    setPrintData(prev => {
      const branchIds = prev.branch_ids || [];
      if (branchIds.includes(branchId)) {
        return {
          ...prev,
          branch_ids: branchIds.filter(id => id !== branchId)
        };
      } else {
        return {
          ...prev,
          branch_ids: [...branchIds, branchId]
        };
      }
    });
  };

  const handleSelectAllBranches = () => {
    setPrintData(prev => ({
      ...prev,
      branch_ids: branches.map(b => b.id)
    }));
  };

  const handleDeselectAllBranches = () => {
    setPrintData(prev => ({
      ...prev,
      branch_ids: []
    }));
  };

  const handleGenerateReport = async () => {
    if (!printData.document_type) {
      showWarning('الرجاء اختيار نوع المستند');
      return;
    }

    if (!printData.branch_ids || printData.branch_ids.length === 0) {
      showWarning('الرجاء اختيار فرع واحد على الأقل');
      return;
    }

    try {
      setGeneratingReport(true);
      const response = await branchDocumentsAPI.generatePayrollReport({
        document_type: printData.document_type,
        branch_ids: printData.branch_ids
      });

      // Get filename from response headers
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'تقرير_المسيرات.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
        }
      }

      // Create blob and download
      // response.data is already a blob when responseType is 'blob'
      const blob = response.data instanceof Blob 
        ? response.data 
        : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showSuccess('تم إنشاء التقرير بنجاح');
      setShowPrintForm(false);
    } catch (error) {
      console.error('Error generating report:', error);
      showError('فشل إنشاء التقرير: ' + (error.response?.data?.message || error.message));
    } finally {
      setGeneratingReport(false);
    }
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

  // If branch is selected, show branch details with card design
  if (selectedBranch) {
    const branchStatus = getBranchStatus(selectedBranch.id);
    const branchDocuments = allDocuments.filter(doc => doc.branch_id === selectedBranch.id);

    // Get current month document for each type
    const getCurrentMonthDocument = (docType) => {
      const docs = branchDocuments.filter(doc => doc.document_type === docType.value);
      const currentMonthDoc = docs.find(doc => 
        isUploadedForCurrentMonth(new Date(doc.uploaded_at))
      );
      return currentMonthDoc || null;
    };

    return (
      <div className="table-page monthly-documents-page">
        <div className="page-header">
          <button onClick={handleBackToBranches} className="btn-back">
            ← العودة للفروع
          </button>
          <h1>{selectedBranch.branch_name}</h1>
        </div>

        {/* Branch Info */}
        <div className="branch-info-card" style={{
          background: 'var(--bg)',
          padding: '1rem 1.5rem',
          borderRadius: 'var(--radius-xl)',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-light)'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)' }}>
            {selectedBranch.branch_name}
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            نوع الفرع: {selectedBranch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}
          </p>
        </div>

        {/* Document Cards Grid */}
        <div className="document-cards-container">
          <h2 style={{ 
            marginBottom: '1.5rem', 
            fontSize: '1.5rem', 
            color: 'var(--text)',
            fontWeight: 600
          }}>
            المستندات الشهرية
          </h2>
          <div className="document-cards-grid">
            {monthlyDocumentTypes.map((docType) => {
            const status = branchStatus.statuses.find(s => s.type === docType.value);
              const currentDoc = getCurrentMonthDocument(docType);
              const exists = status.status === 'uploaded';
            
            return (
                <div 
                  key={docType.value} 
                  className={`document-card ${exists ? 'document-exists' : 'document-missing'}`}
                >
                  <div className="document-card-header">
                    <div className="document-card-icon">
                      {exists ? (
                        <span className="status-icon exists">✓</span>
                      ) : (
                        <span className="status-icon missing">✗</span>
                        )}
                      </div>
                    <h3 className="document-card-title">{docType.label}</h3>
                    </div>
                  
                  <div className="document-card-body">
                    {exists && currentDoc ? (
                      <div className="document-info">
                        <div className="document-info-item">
                          <span className="info-label">اسم الملف:</span>
                          <span className="info-value">{currentDoc.file_name}</span>
                  </div>
                        <div className="document-info-item">
                          <span className="info-label">تاريخ الرفع:</span>
                          <span className="info-value">
                            {formatGregorianDate(currentDoc.uploaded_at)}
                          </span>
                </div>
                        <div className="document-info-item">
                          <span className="info-label">الحالة:</span>
                          <span className="verification-badge verified">
                            ✓ تم الرفع لهذا الشهر
                          </span>
                        </div>
                      </div>
                    ) : status.status === 'pending' && status.lastUpload ? (
                      <div className="document-info">
                        <div className="document-info-item">
                          <span className="info-label">آخر رفع:</span>
                          <span className="info-value">{formatGregorianDate(status.lastUpload)}</span>
                        </div>
                        <div className="document-info-item">
                          <span className="info-label">الحالة:</span>
                          <span className="verification-badge not-verified">
                            ⚠ لم يتم الرفع لهذا الشهر
                          </span>
                        </div>
                        {status.deadlineDate && (
                          <div className="document-info-item">
                            <span className="info-label">الموعد النهائي:</span>
                            <span className={`info-value ${status.daysUntilDeadline <= 3 ? 'urgent' : ''}`}>
                              {formatGregorianDate(status.deadlineDate)}
                              {status.daysUntilDeadline !== null && (
                                <span style={{ marginRight: '5px' }}>
                                  {status.daysUntilDeadline > 0 
                                    ? ` (متبقي ${status.daysUntilDeadline} يوم)` 
                                    : ' (اليوم هو الموعد النهائي)'}
                                </span>
                )}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="document-missing-message">
                        <p>المستند غير موجود</p>
                {status.deadlineDate && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
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
                          </div>
                    )}
                  </div>

                  <div className="document-card-actions">
                    {exists && currentDoc ? (
                      <>
                        {currentDoc.mime_type && (currentDoc.mime_type.startsWith('image/') || currentDoc.mime_type === 'application/pdf') && (
                              <button 
                            onClick={() => handlePreview(currentDoc)}
                            className="btn-card btn-preview"
                            disabled={previewLoading === currentDoc.id}
                              >
                            {previewLoading === currentDoc.id ? (
                              <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', marginLeft: '5px' }}></span>
                                ) : (
                              <img src="https://img.icons8.com/?size=24&id=85028&format=png&color=000000" alt="معاينة" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                                )}
                            معاينة
                              </button>
                            )}
                            <button 
                          onClick={() => handleDownload(currentDoc.id, currentDoc.file_name)}
                          className="btn-card btn-download"
                          disabled={downloading === currentDoc.id}
                            >
                          {downloading === currentDoc.id ? (
                            <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', marginLeft: '5px' }}></span>
                              ) : (
                            <img src="https://img.icons8.com/material-rounded/24/download--v1.png" alt="تحميل" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                              )}
                          تحميل
                            </button>
                        <button
                          onClick={() => handleOpenUploadForm(selectedBranch.id, docType.value)}
                          className="btn-card btn-update"
                        >
                          <img src="https://img.icons8.com/material-rounded/24/edit.png" alt="تحديث" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                          تحديث
                        </button>
                      </>
                ) : (
                      <button
                        onClick={() => handleOpenUploadForm(selectedBranch.id, docType.value)}
                        className="btn-card btn-upload"
                      >
                        <img src="https://img.icons8.com/material-rounded/24/upload.png" alt="رفع" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                        رفع المستند
                      </button>
                    )}
                  </div>
              </div>
            );
          })}
          </div>
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
        <div style={{ display: 'flex', gap: '10px' }}>
          {isMainManager() && (
            <button onClick={handlePrintPayrolls} className="btn-primary">
              طباعة المسيرات
            </button>
          )}
          {!isMainManager() && (
            <button onClick={() => handleOpenUploadForm()} className="btn-primary">
              رفع مستند شهري
            </button>
          )}
        </div>
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
                        <span style={{ fontSize: '16px' }}>⚠️</span>
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
                              <span style={{ fontSize: '16px' }}>⚠️</span>
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
                        <span style={{ fontSize: '16px' }}>⚠️</span>
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
                              <span style={{ fontSize: '16px' }}>⚠️</span>
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

      {/* Print Payrolls Form Modal */}
      {showPrintForm && isMainManager() && (
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2>طباعة المسيرات</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleGenerateReport(); }}>
              <div className="form-group">
                <label>نوع المستند *</label>
                <select
                  value={printData.document_type}
                  onChange={(e) => handlePrintFormChange('document_type', e.target.value)}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label>اختر الفروع *</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllBranches}
                      style={{
                        padding: '4px 12px',
                        fontSize: '0.85rem',
                        backgroundColor: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllBranches}
                      style={{
                        padding: '4px 12px',
                        fontSize: '0.85rem',
                        backgroundColor: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>
                <div style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  padding: '10px'
                }}>
                  {branches.map(branch => (
                    <label 
                      key={branch.id} 
                      style={{ 
                        display: 'block', 
                        padding: '6px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        marginBottom: '3px',
                        backgroundColor: printData.branch_ids?.includes(branch.id) ? '#e3f2fd' : 'transparent',
                        fontSize: '0.85rem'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={printData.branch_ids?.includes(branch.id) || false}
                        onChange={() => handleToggleBranch(branch.id)}
                        style={{ marginLeft: '8px' }}
                      />
                      {branch.branch_name}
                    </label>
                  ))}
                </div>
                {printData.branch_ids && printData.branch_ids.length > 0 && (
                  <p style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666' }}>
                    تم اختيار {printData.branch_ids.length} فرع
                  </p>
                )}
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={generatingReport || !printData.branch_ids || printData.branch_ids.length === 0}
                >
                  {generatingReport ? 'جاري إنشاء التقرير...' : 'إنشاء التقرير'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowPrintForm(false);
                    setPrintData({
                      document_type: 'payroll_file',
                      branch_ids: []
                    });
                  }} 
                  className="btn-secondary"
                  disabled={generatingReport}
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

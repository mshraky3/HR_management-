/**
 * Branch Documents Page
 * Manage branch-level documents (licenses, permits, insurance, etc.)
 * Completely separate from employee documents
 */

import { useState, useEffect } from 'react';
import { branchDocumentsAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const BranchDocuments = () => {
  const { isMainManager, user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadData, setUploadData] = useState({
    branch_id: '',
    document_type: '',
    description: '',
    expiry_date: '',
    file: null,
  });
  const [editData, setEditData] = useState({
    description: '',
    expiry_date: '',
    file: null,
  });

  useEffect(() => {
    if (user) {
      loadBranches();
      loadDocuments();
    }
  }, [user]);

  const loadBranches = async () => {
    try {
      const filters = { is_active: true };
      
      // Branch managers only see their branch
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }
      
      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        setBranches(response.data.data);
        // Auto-set branch_id for branch managers
        if (!isMainManager() && user?.branch_id) {
          setUploadData(prev => ({ ...prev, branch_id: user.branch_id }));
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      // Don't show alert for branch loading errors
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const filters = {};
      
      // Branch managers only see their branch documents
      if (!isMainManager() && user?.branch_id) {
        filters.branch_id = user.branch_id;
      }
      
      const response = await branchDocumentsAPI.getAll(filters);
      if (response.data.success) {
        setDocuments(response.data.data || []);
      } else {
        // If API returns success: false, just set empty array, don't show alert
        setDocuments([]);
      }
    } catch (error) {
      console.error('Error loading branch documents:', error);
      // Only show alert if it's a real error (not just empty results)
      // Check if it's a network error or server error (status >= 400)
      if (error.response && error.response.status >= 400) {
        alert('فشل تحميل مستندات الفرع: ' + (error.response?.data?.message || error.message));
      }
      // Otherwise, just set empty array (might be no documents yet)
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    setUploadData({ ...uploadData, file: e.target.files[0] });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      alert('الرجاء اختيار ملف');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('branch_id', uploadData.branch_id);
      formData.append('document_type', uploadData.document_type);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (uploadData.expiry_date) formData.append('expiry_date', uploadData.expiry_date);

      await branchDocumentsAPI.upload(formData);
      setShowUploadForm(false);
      setUploadData({
        branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
        document_type: '',
        description: '',
        expiry_date: '',
        file: null,
      });
      loadDocuments();
    } catch (error) {
      alert(error.response?.data?.message || 'فشل رفع المستند');
    }
  };

  const handlePreview = async (document) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('يرجى تسجيل الدخول مرة أخرى');
        return;
      }

      setPreviewDocument(document);
      // Check if it's an image
      if (document.mime_type && document.mime_type.startsWith('image/')) {
        try {
          const response = await branchDocumentsAPI.download(document.id);
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
        }
      } else if (document.mime_type === 'application/pdf') {
        try {
          const response = await branchDocumentsAPI.download(document.id);
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
        }
      } else {
        handleDownload(document.id, document.file_name);
        setPreviewDocument(null);
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      alert('فشل عرض المستند');
      setPreviewDocument(null);
    }
  };

  const closePreview = () => {
    setPreviewDocument(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleDownload = async (id, fileName) => {
    try {
      const response = await branchDocumentsAPI.download(id);
      
      // Get filename from response headers
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
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      const errorMsg = error.response?.data?.message || error.message || 'فشل تحميل المستند';
      alert(`فشل تحميل المستند: ${errorMsg}`);
    }
  };

  const handleEdit = (document) => {
    setEditingDocument(document);
    setEditData({
      description: document.description || '',
      expiry_date: document.expiry_date ? document.expiry_date.split('T')[0] : '',
      file: null,
    });
    setShowEditForm(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      if (editData.file) {
        // If file is provided, upload new file
        const formData = new FormData();
        formData.append('file', editData.file);
        if (editData.description) formData.append('description', editData.description);
        if (editData.expiry_date) formData.append('expiry_date', editData.expiry_date);
        
        // Use PUT with FormData to replace the file
        await branchDocumentsAPI.updateWithFile(editingDocument.id, formData);
      } else {
        // Just update metadata
        await branchDocumentsAPI.update(editingDocument.id, {
          description: editData.description,
          expiry_date: editData.expiry_date || null
        });
      }
      
      setShowEditForm(false);
      setEditingDocument(null);
      setEditData({ description: '', expiry_date: '', file: null });
      loadDocuments();
      alert('تم تحديث المستند بنجاح');
    } catch (error) {
      alert(error.response?.data?.message || 'فشل تحديث المستند');
    }
  };

  const handleFileChangeEdit = (e) => {
    setEditData({ ...editData, file: e.target.files[0] || null });
  };

  const handleVerify = async (id) => {
    try {
      await branchDocumentsAPI.verify(id);
      loadDocuments();
    } catch (error) {
      alert('فشل التحقق من المستند');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المستند؟')) return;
    try {
      await branchDocumentsAPI.delete(id);
      loadDocuments();
    } catch (error) {
      alert('فشل حذف المستند');
    }
  };

  const branchDocumentTypes = [
    { value: 'license', label: 'الترخيص' },
    { value: 'permit', label: 'التصريح' },
    { value: 'insurance', label: 'التأمين' },
    { value: 'contract', label: 'العقد' },
    { value: 'certification', label: 'الشهادة' },
    { value: 'registration', label: 'السجل التجاري' },
    { value: 'other', label: 'أخرى' },
  ];

  if (loading) {
    return <div className="loading">جاري تحميل مستندات الفرع...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'مستندات الفروع' : 'مستندات الفرع'}</h1>
        <button onClick={() => setShowUploadForm(true)} className="btn-primary">
          رفع مستند فرع
        </button>
      </div>

      {showUploadForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>رفع مستند فرع</h2>
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
                  <option value="">اختر النوع</option>
                  {branchDocumentTypes.map(type => (
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
                <label>الوصف</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>تاريخ الانتهاء</label>
                <input
                  type="date"
                  value={uploadData.expiry_date}
                  onChange={(e) => setUploadData({ ...uploadData, expiry_date: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">رفع</button>
                <button type="button" onClick={() => {
                  setShowUploadForm(false);
                  setUploadData({
                    branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
                    document_type: '',
                    description: '',
                    expiry_date: '',
                    file: null,
                  });
                }} className="btn-secondary">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {isMainManager() && <th>الفرع</th>}
              <th>نوع المستند</th>
              <th>اسم الملف</th>
              <th>تاريخ الرفع</th>
              <th>تاريخ الانتهاء</th>
              <th>تم التحقق</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={isMainManager() ? "7" : "6"} style={{ textAlign: 'center' }}>لا توجد مستندات فرع</td>
              </tr>
            ) : (
              documents.map((doc) => {
                const docType = branchDocumentTypes.find(dt => dt.value === doc.document_type);
                const branch = branches.find(b => b.id === doc.branch_id);
                return (
                  <tr key={doc.id}>
                    {isMainManager() && <td>{branch ? branch.branch_name : doc.branch_id}</td>}
                    <td>{docType ? docType.label : doc.document_type}</td>
                    <td>{doc.file_name}</td>
                    <td>{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                    <td>{doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString('en-GB') : '-'}</td>
                    <td>
                      <span className={`badge ${doc.is_verified ? 'badge-success' : 'badge-danger'}`}>
                        {doc.is_verified ? 'نعم' : 'لا'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {doc.mime_type && (doc.mime_type.startsWith('image/') || doc.mime_type === 'application/pdf') && (
                          <button 
                            onClick={() => handlePreview(doc)} 
                            className="btn-sm" 
                            style={{ background: '#4CAF50', color: 'white' }}
                          >
                            👁️ معاينة
                          </button>
                        )}
                        <button onClick={() => handleDownload(doc.id, doc.file_name)} className="btn-sm btn-edit">
                          ⬇️ تحميل
                        </button>
                        {/* Branch managers can edit/delete their own branch documents, main managers can edit/delete all */}
                        {(isMainManager() || (user?.branch_id === doc.branch_id)) && (
                          <>
                            <button onClick={() => handleEdit(doc)} className="btn-sm" style={{ background: '#2196F3', color: 'white' }}>
                              ✏️ تعديل
                            </button>
                            <button onClick={() => handleDelete(doc.id)} className="btn-sm btn-delete">🗑️ حذف</button>
                          </>
                        )}
                        {/* Only main manager can verify */}
                        {isMainManager() && !doc.is_verified && (
                          <button onClick={() => handleVerify(doc.id)} className="btn-sm" style={{ background: '#27ae60', color: 'white' }}>
                            ✓ التحقق
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Document Modal */}
      {showEditForm && editingDocument && (
        <div className="modal">
          <div className="modal-content">
            <h2>تعديل المستند</h2>
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label>الملف الحالي</label>
                <input
                  type="text"
                  value={editingDocument.file_name}
                  disabled
                  style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group">
                <label>رفع ملف جديد (اختياري)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChangeEdit}
                />
                {editData.file && (
                  <span className="file-name" style={{fontSize: '12px', color: '#4CAF50', display: 'block', marginTop: '5px'}}>
                    ✓ {editData.file.name}
                  </span>
                )}
                {editingDocument.document_type === 'license' && editData.file && (
                  <span style={{fontSize: '11px', color: '#ff9800', display: 'block', marginTop: '5px'}}>
                    ⚠️ سيتم إخفاء المستندات القديمة من نوع "ترخيص" تلقائياً
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>الوصف</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>تاريخ الانتهاء</label>
                <input
                  type="date"
                  value={editData.expiry_date}
                  onChange={(e) => setEditData({ ...editData, expiry_date: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">حفظ</button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingDocument(null);
                    setEditData({ description: '', expiry_date: '', file: null });
                  }} 
                  className="btn-secondary"
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

export default BranchDocuments;


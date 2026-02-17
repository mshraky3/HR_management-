import { getDocumentTypeLabel } from '../../../utils/employeeConstants';
import { formatDate } from '../../../utils/dateConverters';

const DocumentsSection = ({ documents, onPreview, onDownload, previewLoading, downloading }) => (
  <div className="documents-section">
    <h2 className="section-header">المستندات المرفوعة ({documents.length})</h2>
    {documents.length === 0 ? (
      <div className="empty-state">
        <p>لا توجد مستندات مرفوعة</p>
      </div>
    ) : (
      <div className="documents-grid">
        {documents.map((doc) => (
          <div key={doc.id} className="document-card">
            <div className="document-card-header">
              <div className="document-type-icon">
                <img
                  src="https://img.icons8.com/material-rounded/24/document.png"
                  alt="مستند"
                  style={{ width: '24px', height: '24px' }}
                />
              </div>
              <h3 className="document-card-title">{getDocumentTypeLabel(doc.document_type)}</h3>
            </div>
            <div className="document-card-body">
              <div className="document-info-item">
                <span className="document-info-label">اسم الملف</span>
                <span className="document-info-value">{doc.file_name || '-'}</span>
              </div>
              <div className="document-info-item">
                <span className="document-info-label">الحجم</span>
                <span className="document-info-value">
                  {doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'غير محدد'}
                </span>
              </div>
              <div className="document-info-item">
                <span className="document-info-label">تاريخ الرفع</span>
                <span className="document-info-value">
                  {formatDate(doc.uploaded_at)}
                </span>
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
                  <span className="document-info-value">
                    {formatDate(doc.expiry_date)}
                  </span>
                </div>
              )}
            </div>
            <div className="document-card-actions">
              {doc.mime_type && doc.mime_type.startsWith('image/') && (
                <button
                  onClick={() => onPreview(doc)}
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
                  onClick={() => onPreview(doc)}
                  disabled={previewLoading === doc.id}
                  className="btn btn-warning btn-sm"
                >
                  {previewLoading === doc.id ? (
                    <>
                      <span className="spinner"></span>
                      جاري التحميل...
                    </>
                  ) : (
                    <>
                      <img
                        src="https://img.icons8.com/material-rounded/24/document.png"
                        alt="PDF"
                        style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }}
                      />
                      فتح PDF
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => onDownload(doc.id)}
                disabled={downloading === doc.id}
                className="btn btn-primary btn-sm"
              >
                {downloading === doc.id ? (
                  <>
                    <span className="spinner"></span>
                    جاري التحميل...
                  </>
                ) : (
                  <>
                    <img
                      src="https://img.icons8.com/material-rounded/24/download--v1.png"
                      alt="تحميل"
                      style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }}
                    />
                    تحميل
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default DocumentsSection;

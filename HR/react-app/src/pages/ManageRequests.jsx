/**
 * Manage Requests Page
 * Main managers can view and respond to requests from branches
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { getLastSeen, setLastSeen, countNewByDate } from '../utils/notificationTracker';
import './ManageRequests.css';

const ManageRequests = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [responseData, setResponseData] = useState({
    status: '',
    response_text: '',
  });
  const [responseAttachment, setResponseAttachment] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [newRequestsCount, setNewRequestsCount] = useState(0);

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    // Load requests once when the component mounts or when the status filter changes
    loadRequests();
    // Note: Removed automatic polling to prevent unexpected page refreshes
    // If you want to re-enable polling, add a toggle and a longer interval.
  }, [statusFilter]);

  useEffect(() => {
    if (!isMainManager()) return;
    const key = 'requests_last_seen_main';
    const lastSeen = getLastSeen(key);
    const pendingRequests = requests.filter(r => r.status === 'pending');
    const count = countNewByDate(pendingRequests, 'created_at', lastSeen);
    setNewRequestsCount(count);
  }, [requests, isMainManager]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const filters = {};
      if (statusFilter) {
        filters.status = statusFilter;
      }
      const response = await requestsAPI.getAll(filters);
      if (response.data.success) {
        setRequests(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
      showError('فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = (request) => {
    setSelectedRequest(request);
    setResponseData({
      status: request.status === 'pending' ? 'approved' : request.status,
      response_text: request.response_text || '',
    });
    setResponseAttachment(null);
    setShowResponseForm(true);
  };

  const handleSubmitResponse = async (e) => {
    e.preventDefault();

    if (!responseData.status) {
      showWarning('يرجى اختيار حالة الرد');
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();
      formData.append('status', responseData.status);
      if (responseData.response_text) {
        formData.append('response_text', responseData.response_text);
      }
      if (responseAttachment) {
        formData.append('file', responseAttachment);
      }

      const response = await requestsAPI.respond(selectedRequest.id, formData);
      if (response.data.success) {
        showSuccess('تم الرد على الطلب بنجاح');
        setShowResponseForm(false);
        setSelectedRequest(null);
        setResponseData({ status: '', response_text: '' });
        setResponseAttachment(null);
        loadRequests();
      }
    } catch (error) {
      console.error('Error responding to request:', error);
      showError(error.response?.data?.message || 'فشل الرد على الطلب');
    } finally {
      setSaving(false);
    }
  };

  const navigateToEmployee = (employeeId) => {
    if (!employeeId) return;
    // Navigate to the Employees search page and request that it focuses the given employee
    navigate('/employees', { state: { focusEmployeeId: employeeId } });
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: { text: 'قيد الانتظار', color: '#FF9800' },
      approved: { text: 'موافق عليه', color: '#4CAF50' },
      rejected: { text: 'مرفوض', color: '#F44336' },
      in_progress: { text: 'قيد المعالجة', color: '#2196F3' },
      completed: { text: 'مكتمل', color: '#9C27B0' },
    };
    return labels[status] || { text: status, color: '#757575' };
  };


  if (!isMainManager()) {
    return (
      <div className="manage-requests-container">
        <div className="empty-state">
          <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="manage-requests-container">
        <div className="loading-container">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="manage-requests-container">
      <div className="manage-requests-header">
        <div>
          <h1>إدارة الطلبات</h1>
          {pendingCount > 0 && (
            <p className="pending-count">لديك {pendingCount} طلب قيد الانتظار</p>
          )}
        </div>
        <div className="filter-group">
          <label htmlFor="status-filter">تصفية حسب الحالة:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">الكل</option>
            <option value="pending">قيد الانتظار</option>
            <option value="approved">موافق عليه</option>
            <option value="rejected">مرفوض</option>
            <option value="in_progress">قيد المعالجة</option>
            <option value="completed">مكتمل</option>
          </select>
        </div>
      </div>

      {newRequestsCount > 0 && (
        <div className="notification-banner">
          <span>لديك {newRequestsCount} طلب جديد يحتاج مراجعة</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setLastSeen('requests_last_seen_main', new Date());
              setNewRequestsCount(0);
            }}
          >
            تم الاطلاع
          </button>
        </div>
      )}

      {showResponseForm && selectedRequest && (
        <div className="response-form-modal">
          <div className="response-form-content">
            <h2>الرد على الطلب</h2>
            <div className="request-preview">
              <h3>{selectedRequest.request_name}</h3>
              <p>{selectedRequest.request_text}</p>
              <div className="request-info">
                <span>من: {selectedRequest.branch_name}</span>
                {selectedRequest.employee_name && (
                  <span>الموظف: {selectedRequest.employee_name}</span>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmitResponse}>
              <div className="form-group">
                <label htmlFor="response_status">الحالة *</label>
                <select
                  id="response_status"
                  value={responseData.status}
                  onChange={(e) => setResponseData({ ...responseData, status: e.target.value })}
                  required
                >
                  <option value="">اختر الحالة</option>
                  <option value="approved">موافق عليه</option>
                  <option value="rejected">مرفوض</option>
                  <option value="in_progress">قيد المعالجة</option>
                  <option value="completed">مكتمل</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="response_text">نص الرد</label>
                <textarea
                  id="response_text"
                  value={responseData.response_text}
                  onChange={(e) => setResponseData({ ...responseData, response_text: e.target.value })}
                  placeholder="أدخل نص الرد (اختياري)"
                  rows="5"
                />
              </div>

              <div className="form-group">
                <label htmlFor="response_attachment">إرفاق ملف مع الرد (اختياري)</label>
                <input
                  type="file"
                  id="response_attachment"
                  accept=".pdf,.jpg,.jpeg,.png,.gif"
                  onChange={(e) => setResponseAttachment(e.target.files[0])}
                />
                {responseAttachment && (
                  <div className="file-info">
                    <span>الملف المحدد: {responseAttachment.name}</span>
                    <button
                      type="button"
                      className="btn-remove-file"
                      onClick={() => setResponseAttachment(null)}
                    >
                      إزالة
                    </button>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'إرسال الرد'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowResponseForm(false);
                    setSelectedRequest(null);
                    setResponseData({ status: '', response_text: '' });
                    setResponseAttachment(null);
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="requests-list">
        {requests.length === 0 ? (
          <div className="empty-state">
            <p>لا توجد طلبات</p>
          </div>
        ) : (
          <div className="requests-grid">
            {requests.map((request) => {
              const statusInfo = getStatusLabel(request.status);
              return (
                <div key={request.id} className="request-card">
                  <div className="request-header">
                    <h3>{request.request_name}</h3>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: statusInfo.color }}
                    >
                      {statusInfo.text}
                    </span>
                  </div>

                  <div className="request-body">
                    <p className="request-text">{request.request_text}</p>

                    <div className="request-details">
                      <div className="detail-item">
                        <span className="detail-label">الفرع:</span>
                        <span className="detail-value">{request.branch_name}</span>
                      </div>

                      {request.employee_name && (
                        <div className="detail-item">
                          <span className="detail-label">الموظف المعني:</span>
                          <span className="detail-value">
                            {request.employee_name}
                            {request.employee_id && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm show-employee-btn"
                                onClick={() => navigateToEmployee(request.employee_id)}
                              >
                                عرض الموظف
                              </button>
                            )}
                          </span>
                        </div>
                      )}

                      <div className="detail-item">
                        <span className="detail-label">تاريخ الإرسال:</span>
                        <span className="detail-value">{formatDate(request.created_at)}</span>
                      </div>

                      {request.attachment_name && (
                        <div className="detail-item">
                          <span className="detail-label">المرفق:</span>
                          <a
                            href={request.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="attachment-link"
                          >
                            {request.attachment_name}
                          </a>
                        </div>
                      )}

                      {request.response_text && (
                        <div className="response-section">
                          <span className="detail-label">الرد:</span>
                          <p className="response-text">{request.response_text}</p>
                          {request.response_attachment_name && (
                            <div className="detail-item">
                              <span className="detail-label">المرفق مع الرد:</span>
                              <a
                                href={request.response_attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="attachment-link"
                              >
                                {request.response_attachment_name}
                              </a>
                            </div>
                          )}
                          {request.responded_at && (
                            <span className="response-date">
                              بتاريخ: {formatDate(request.responded_at)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="request-actions">
                    {request.status === 'pending' ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleRespond(request)}
                      >
                        الرد على الطلب
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRespond(request)}
                      >
                        تعديل الرد
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageRequests;

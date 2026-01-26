/**
 * Branch Requests Page
 * Branch managers can submit requests to main managers
 */

import { useState, useEffect, useCallback } from 'react';
import { requestsAPI, employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { getLastSeen, setLastSeen } from '../utils/notificationTracker';
import './BranchRequests.css';

const BranchRequests = () => {
  const { user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [requests, setRequests] = useState([]);
  const [mainManagers, setMainManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newResponsesCount, setNewResponsesCount] = useState(0);

  const [formData, setFormData] = useState({
    main_manager_id: '',
    employee_id: '',
    request_name: '',
    request_text: '',
  });
  const [attachmentFile, setAttachmentFile] = useState(null);

  const branchId = user?.branch_id || null;
  const isMainManagerUser = user?.role === 'main_manager';

  const loadData = useCallback(async () => {
    if (!user || isMainManagerUser) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const employeeFilters = { is_active: true };
      if (branchId) {
        employeeFilters.branch_id = branchId;
      }

      const [requestsRes, managersRes, employeesRes] = await Promise.all([
        requestsAPI.getAll(),
        requestsAPI.getMainManagers(),
        employeesAPI.getAll(employeeFilters),
      ]);

      if (requestsRes.data.success) {
        setRequests(requestsRes.data.data || []);
      }

      if (managersRes.data.success) {
        setMainManagers(managersRes.data.data || []);
      }

      if (employeesRes.data.success) {
        setEmployees(employeesRes.data.data || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showError('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [user, isMainManagerUser, branchId, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!branchId || isMainManagerUser) return;
    const key = `branch_requests_last_seen_${branchId}`;
    const lastSeen = getLastSeen(key);
    const count = requests.filter((r) => {
      if (!r.responded_at) return false;
      const date = new Date(r.responded_at);
      return !isNaN(date.getTime()) && (!lastSeen || date > lastSeen);
    }).length;
    setNewResponsesCount(count);
  }, [requests, branchId, isMainManagerUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.main_manager_id || !formData.request_name.trim() || !formData.request_text.trim()) {
      showWarning('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      setSaving(true);

      const formDataToSend = new FormData();
      formDataToSend.append('main_manager_id', formData.main_manager_id);
      if (formData.employee_id) {
        formDataToSend.append('employee_id', formData.employee_id);
      }
      formDataToSend.append('request_name', formData.request_name.trim());
      formDataToSend.append('request_text', formData.request_text.trim());

      if (attachmentFile) {
        formDataToSend.append('file', attachmentFile);
      }

      const response = await requestsAPI.create(formDataToSend);

      if (response.data.success) {
        showSuccess('تم إرسال الطلب بنجاح');
        setFormData({
          main_manager_id: '',
          employee_id: '',
          request_name: '',
          request_text: '',
        });
        setAttachmentFile(null);
        setShowCreateForm(false);
        await loadData();
      }
    } catch (error) {
      console.error('Error creating request:', error);
      showError(error.response?.data?.message || 'فشل إنشاء الطلب');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      return;
    }

    try {
      const response = await requestsAPI.delete(id);
      if (response.data.success) {
        showSuccess('تم حذف الطلب بنجاح');
        await loadData();
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      showError(error.response?.data?.message || 'فشل حذف الطلب');
    }
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


  if (isMainManagerUser) {
    return (
      <div className="branch-requests-container">
        <div className="empty-state">
          <p>هذه الصفحة متاحة فقط لمديري الفروع</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="branch-requests-container">
        <div className="loading-container">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="branch-requests-container">
      <div className="branch-requests-header">
        <h1>طلبات</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'إلغاء' : 'إرسال طلب جديد'}
        </button>
      </div>

      {newResponsesCount > 0 && (
        <div className="notification-banner">
          <span>لديك {newResponsesCount} رد جديد على طلباتك</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const key = `branch_requests_last_seen_${branchId}`;
              setLastSeen(key, new Date());
              setNewResponsesCount(0);
            }}
          >
            تم الاطلاع
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="create-request-form">
          <h2>إرسال طلب جديد</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="main_manager_id">المدير الرئيسي *</label>
              <select
                id="main_manager_id"
                value={formData.main_manager_id}
                onChange={(e) => setFormData({ ...formData, main_manager_id: e.target.value })}
                required
              >
                <option value="">اختر المدير الرئيسي</option>
                {mainManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.full_name || manager.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="employee_id">الموظف المعني (اختياري)</label>
              <input
                type="text"
                placeholder="ابحث عن الموظف بالاسم..."
                value={employeeSearchTerm}
                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                style={{ marginBottom: '8px', padding: '8px', width: '100%' }}
              />
              <select
                id="employee_id"
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              >
                <option value="">لا يوجد</option>
                {employees
                  .filter((employee) => {
                    if (!employeeSearchTerm.trim()) return true;
                    const searchLower = employeeSearchTerm.toLowerCase();
                    const fullName = `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.toLowerCase();
                    return (
                      (employee.first_name && employee.first_name.toLowerCase().includes(searchLower)) ||
                      (employee.second_name && employee.second_name.toLowerCase().includes(searchLower)) ||
                      (employee.third_name && employee.third_name.toLowerCase().includes(searchLower)) ||
                      (employee.fourth_name && employee.fourth_name.toLowerCase().includes(searchLower)) ||
                      fullName.includes(searchLower)
                    );
                  })
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="request_name">اسم الطلب *</label>
              <input
                type="text"
                id="request_name"
                value={formData.request_name}
                onChange={(e) => setFormData({ ...formData, request_name: e.target.value })}
                placeholder="أدخل اسم الطلب"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="request_text">نص الطلب *</label>
              <textarea
                id="request_text"
                value={formData.request_text}
                onChange={(e) => setFormData({ ...formData, request_text: e.target.value })}
                placeholder="أدخل نص الطلب"
                rows="5"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="attachment">إرفاق ملف (اختياري)</label>
              <input
                type="file"
                id="attachment"
                accept=".pdf,.jpg,.jpeg,.png,.gif"
                onChange={(e) => setAttachmentFile(e.target.files[0])}
              />
              {attachmentFile && (
                <div className="file-info">
                  <span>الملف المحدد: {attachmentFile.name}</span>
                  <button
                    type="button"
                    className="btn-remove-file"
                    onClick={() => setAttachmentFile(null)}
                  >
                    إزالة
                  </button>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({
                    main_manager_id: '',
                    employee_id: '',
                    request_name: '',
                    request_text: '',
                  });
                  setAttachmentFile(null);
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="requests-list">
        <h2>الطلبات المرسلة</h2>
        {requests.length === 0 ? (
          <div className="empty-state">
            <p>لا توجد طلبات مرسلة</p>
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
                        <span className="detail-label">المدير الرئيسي:</span>
                        <span className="detail-value">{request.main_manager_name}</span>
                      </div>

                      {request.employee_name && (
                        <div className="detail-item">
                          <span className="detail-label">الموظف المعني:</span>
                          <span className="detail-value">{request.employee_name}</span>
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

                  {request.status === 'pending' && (
                    <div className="request-actions">
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(request.id)}
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchRequests;

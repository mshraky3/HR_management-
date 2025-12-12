/**
 * Branch Requests Page
 * Branch managers can submit requests to main managers
 */

import { useState, useEffect } from 'react';
import { requestsAPI, usersAPI, employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './BranchRequests.css';

const BranchRequests = () => {
  const { user, isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [requests, setRequests] = useState([]);
  const [mainManagers, setMainManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    main_manager_id: '',
    employee_id: '',
    request_name: '',
    request_text: '',
  });
  const [attachmentFile, setAttachmentFile] = useState(null);

  useEffect(() => {
    if (isMainManager()) {
      return; // This page is only for branch managers
    }
    loadData();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestsRes, managersRes, employeesRes] = await Promise.all([
        requestsAPI.getAll(),
        requestsAPI.getMainManagers(),
        employeesAPI.getAll({ branch_id: user?.branch_id, is_active: true }),
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
  };

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
        loadData();
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
        loadData();
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

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      calendar: 'gregory',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isMainManager()) {
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
              <select
                id="employee_id"
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              >
                <option value="">لا يوجد</option>
                {employees.map((employee) => (
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

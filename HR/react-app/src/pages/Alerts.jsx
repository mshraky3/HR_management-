/**
 * Alerts Page
 * Smart Alerts System - View and manage alerts for ID expiry, missing documents, incomplete data, etc.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { alertsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './Alerts.css';

const Alerts = () => {
  const { user, isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // 'all', 'unread', 'resolved', 'unresolved'
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState(null);

  useEffect(() => {
    loadAlerts();
    loadUnreadCount();
    loadSettings();
    if (isMainManager()) {
      loadSchedulerStatus();
    }
  }, [filterType, filterPriority, filterStatus]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const filters = {};
      
      if (filterType) filters.alert_type = filterType;
      if (filterPriority) filters.priority = filterPriority;
      if (filterStatus === 'unread') {
        filters.is_read = false;
        filters.is_resolved = false;
      } else if (filterStatus === 'resolved') {
        filters.is_resolved = true;
      } else if (filterStatus === 'unresolved') {
        filters.is_resolved = false;
      }

      const response = await alertsAPI.getAll(filters);
      if (response.data.success) {
        setAlerts(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
      showError('فشل تحميل التنبيهات');
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await alertsAPI.getUnreadCount();
      if (response.data.success) {
        setUnreadCount(response.data.count || 0);
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await alertsAPI.getSettings();
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const response = await alertsAPI.getSchedulerStatus();
      if (response.data.success) {
        setSchedulerStatus(response.data.data);
      }
    } catch (error) {
      console.error('Error loading scheduler status:', error);
    }
  };

  const handleMarkAsRead = async (alertId) => {
    try {
      await alertsAPI.markAsRead(alertId);
      showSuccess('تم تمييز التنبيه كمقروء');
      loadAlerts();
      loadUnreadCount();
    } catch (error) {
      console.error('Error marking alert as read:', error);
      showError('فشل تمييز التنبيه كمقروء');
    }
  };

  const handleMarkAsResolved = async (alertId) => {
    try {
      await alertsAPI.markAsResolved(alertId);
      showSuccess('تم حل التنبيه بنجاح');
      loadAlerts();
      loadUnreadCount();
    } catch (error) {
      console.error('Error resolving alert:', error);
      showError('فشل حل التنبيه');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadAlerts = alerts.filter(a => !a.is_read && !a.is_resolved);
      if (unreadAlerts.length === 0) {
        showWarning('لا توجد تنبيهات غير مقروءة');
        return;
      }

      await alertsAPI.markMultipleAsRead(unreadAlerts.map(a => a.id));
      showSuccess(`تم تمييز ${unreadAlerts.length} تنبيه كمقروء`);
      loadAlerts();
      loadUnreadCount();
    } catch (error) {
      console.error('Error marking all as read:', error);
      showError('فشل تمييز التنبيهات كمقروءة');
    }
  };

  const handleGenerateAlerts = async () => {
    if (!window.confirm('هل تريد توليد التنبيهات الآن؟ قد يستغرق هذا بعض الوقت.')) {
      return;
    }

    try {
      setGenerating(true);
      const response = await alertsAPI.generate();
      if (response.data.success) {
        showSuccess('تم توليد التنبيهات بنجاح');
        loadAlerts();
        loadUnreadCount();
      }
    } catch (error) {
      console.error('Error generating alerts:', error);
      showError(error.response?.data?.message || 'فشل توليد التنبيهات');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData(e.target);
      const updates = {
        id_expiry_enabled: formData.get('id_expiry_enabled') === 'on',
        id_expiry_days_before: parseInt(formData.get('id_expiry_days_before')) || 30,
        missing_document_enabled: formData.get('missing_document_enabled') === 'on',
        incomplete_data_enabled: formData.get('incomplete_data_enabled') === 'on',
        email_notifications_enabled: formData.get('email_notifications_enabled') === 'on',
        sms_notifications_enabled: formData.get('sms_notifications_enabled') === 'on',
      };

      const response = await alertsAPI.updateSettings(updates);
      if (response.data.success) {
        setSettings(response.data.data);
        setShowSettings(false);
        showSuccess('تم تحديث الإعدادات بنجاح');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      showError('فشل تحديث الإعدادات');
    }
  };

  const getAlertTypeLabel = (type) => {
    const labels = {
      id_expiry: 'انتهاء الهوية',
      missing_document: 'مستند مفقود',
      incomplete_data: 'بيانات غير مكتملة',
      custom: 'مخصص'
    };
    return labels[type] || type;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      critical: '#F44336',
      high: '#FF9800',
      medium: '#2196F3',
      low: '#4CAF50'
    };
    return colors[priority] || '#757575';
  };

  const getPriorityLabel = (priority) => {
    const labels = {
      critical: 'حرج جداً',
      high: 'عالي',
      medium: 'متوسط',
      low: 'منخفض'
    };
    return labels[priority] || priority;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="alerts-container">
        <div className="loading-container">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-container">
      <div className="alerts-header">
        <div>
          <h1>التنبيهات الذكية</h1>
          {unreadCount > 0 && (
            <span className="unread-badge">
              {unreadCount} غير مقروء
            </span>
          )}
        </div>
        <div className="alerts-header-actions">
          {alerts.filter(a => !a.is_read && !a.is_resolved).length > 0 && (
            <button 
              className="btn btn-secondary"
              onClick={handleMarkAllAsRead}
            >
              تمييز الكل كمقروء
            </button>
          )}
          {isMainManager() && (
            <button 
              className="btn btn-primary"
              onClick={handleGenerateAlerts}
              disabled={generating}
            >
              {generating ? 'جاري التوليد...' : 'توليد التنبيهات'}
            </button>
          )}
          <button 
            className="btn btn-secondary"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? 'إغلاق الإعدادات' : 'إعدادات التنبيهات'}
          </button>
        </div>
      </div>

      {/* Scheduler Status (Main Manager only) */}
      {isMainManager() && schedulerStatus && (
        <div className="scheduler-status">
          <strong>حالة المخطط:</strong> 
          <span>{schedulerStatus.isRunning ? 'يعمل' : 'متوقف'}</span>
          {schedulerStatus.intervalMinutes && (
            <span> (يعمل كل {schedulerStatus.intervalMinutes} دقيقة)</span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="alerts-filters">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="">جميع الأنواع</option>
          <option value="id_expiry">انتهاء الهوية</option>
          <option value="missing_document">مستندات مفقودة</option>
          <option value="incomplete_data">بيانات غير مكتملة</option>
          <option value="custom">مخصص</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="filter-select"
        >
          <option value="">جميع الأولويات</option>
          <option value="critical">حرج جداً</option>
          <option value="high">عالي</option>
          <option value="medium">متوسط</option>
          <option value="low">منخفض</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
        >
          <option value="all">الكل</option>
          <option value="unread">غير مقروء</option>
          <option value="unresolved">غير محلول</option>
          <option value="resolved">محلول</option>
        </select>
      </div>

      {/* Settings Panel */}
      {showSettings && settings && (
        <div className="alerts-settings-panel">
          <h2>إعدادات التنبيهات</h2>
          <form onSubmit={handleUpdateSettings}>
            <div className="settings-group">
              <h3>تنبيهات انتهاء الهوية</h3>
              <label>
                <input
                  type="checkbox"
                  name="id_expiry_enabled"
                  defaultChecked={settings.id_expiry_enabled}
                />
                تفعيل تنبيهات انتهاء الهوية
              </label>
              <label>
                عدد الأيام قبل الانتهاء:
                <input
                  type="number"
                  name="id_expiry_days_before"
                  defaultValue={settings.id_expiry_days_before || 30}
                  min="1"
                  max="365"
                />
              </label>
            </div>

            <div className="settings-group">
              <h3>تنبيهات المستندات</h3>
              <label>
                <input
                  type="checkbox"
                  name="missing_document_enabled"
                  defaultChecked={settings.missing_document_enabled}
                />
                تفعيل تنبيهات المستندات المفقودة
              </label>
            </div>

            <div className="settings-group">
              <h3>تنبيهات البيانات</h3>
              <label>
                <input
                  type="checkbox"
                  name="incomplete_data_enabled"
                  defaultChecked={settings.incomplete_data_enabled}
                />
                تفعيل تنبيهات البيانات غير المكتملة
              </label>
            </div>

            <div className="settings-group">
              <h3>طرق الإشعار</h3>
              <label>
                <input
                  type="checkbox"
                  name="email_notifications_enabled"
                  defaultChecked={settings.email_notifications_enabled}
                />
                تفعيل إشعارات البريد الإلكتروني
              </label>
              <label>
                <input
                  type="checkbox"
                  name="sms_notifications_enabled"
                  defaultChecked={settings.sms_notifications_enabled}
                />
                تفعيل إشعارات SMS
              </label>
            </div>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary">حفظ الإعدادات</button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setShowSettings(false)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Alerts List */}
      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <p>لا توجد تنبيهات</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-card ${alert.is_read ? 'read' : 'unread'} ${alert.is_resolved ? 'resolved' : ''}`}
              style={{ borderRight: `4px solid ${getPriorityColor(alert.priority)}` }}
            >
              <div className="alert-header">
                <div className="alert-title-row">
                  <h3>{alert.title}</h3>
                  <div className="alert-badges">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(alert.priority) }}
                    >
                      {getPriorityLabel(alert.priority)}
                    </span>
                    <span className="type-badge">{getAlertTypeLabel(alert.alert_type)}</span>
                  </div>
                </div>
                <div className="alert-meta">
                  <span className="alert-date">{formatDate(alert.created_at)}</span>
                  {!alert.is_read && <span className="unread-indicator"></span>}
                  {alert.is_resolved && <span className="resolved-indicator">محلول</span>}
                </div>
              </div>

              <div className="alert-body">
                <p className="alert-message">{alert.message}</p>
                
                {alert.branch_name && (
                  <div className="alert-info">
                    <strong>الفرع:</strong> {alert.branch_name}
                  </div>
                )}

                {alert.employee_name && (
                  <div className="alert-info">
                    <strong>الموظف:</strong>{' '}
                    <Link to={`/employees/${alert.employee_id}`}>
                      {alert.employee_name}
                    </Link>
                    {alert.employee_id_number && ` (${alert.employee_id_number})`}
                  </div>
                )}

                {alert.alert_data && typeof alert.alert_data === 'object' && (
                  <div className="alert-data">
                    {alert.alert_data.days_until_expiry !== undefined && (
                      <div>
                        <strong>الأيام المتبقية:</strong> {alert.alert_data.days_until_expiry} يوم
                      </div>
                    )}
                    {alert.alert_data.expiry_date && (
                      <div>
                        <strong>تاريخ الانتهاء:</strong> {alert.alert_data.expiry_date}
                      </div>
                    )}
                  </div>
                )}

                {alert.resolved_by_name && (
                  <div className="alert-info">
                    <strong>تم الحل بواسطة:</strong> {alert.resolved_by_name}
                    {alert.resolved_at && ` في ${formatDate(alert.resolved_at)}`}
                  </div>
                )}
              </div>

              <div className="alert-actions">
                {!alert.is_read && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleMarkAsRead(alert.id)}
                  >
                    تمييز كمقروء
                  </button>
                )}
                {!alert.is_resolved && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleMarkAsResolved(alert.id)}
                  >
                    حل التنبيه
                  </button>
                )}
                {alert.employee_id && (
                  <Link
                    to={`/employees/${alert.employee_id}`}
                    className="btn btn-sm btn-secondary"
                  >
                    عرض الموظف
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Alerts;



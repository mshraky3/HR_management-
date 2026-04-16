/**
 * Notify Branches Page
 * Main Manager can create notifications and view response reports
 */

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { notificationsAPI, branchesAPI } from "../utils/api";
import BranchBadge from '../components/BranchBadge';
import { formatDate } from '../utils/dateConverters';
import { getSeenCounts, setSeenCounts } from '../utils/notificationTracker';
import "./NotifyBranches.css";

const NotifyBranches = () => {
  const { user, isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [notifications, setNotifications] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [notificationDetails, setNotificationDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [newResponsesCount, setNewResponsesCount] = useState(0);
  const [newResponsesByNotification, setNewResponsesByNotification] = useState({});

  // Create form state
  const [formData, setFormData] = useState({
    message: "",
    importance_level: 2,
    branch_ids: [],
    duration_days: 7,
    one_time: false,
  });
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadData();
    // Update last visit time when viewing notifications page
    localStorage.setItem('notifications_last_visit', new Date().toISOString());
  }, [isMainManager]);

  // Reload data when showInactive changes
  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadData();
  }, [showInactive]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notificationsRes, branchesRes] = await Promise.all([
        notificationsAPI.getAll({ include_inactive: showInactive }),
        branchesAPI.getAll({ is_active: true }),
      ]);

      if (notificationsRes.data.success) {
        setNotifications(notificationsRes.data.data || []);
        const seenKey = 'notify_branches_seen_responses';
        const seenCounts = getSeenCounts(seenKey);
        const { totalNew, byId } = (notificationsRes.data.data || []).reduce(
          (acc, notif) => {
            const responded = parseInt(notif?.stats?.responded_count || 0, 10);
            const seen = parseInt(seenCounts?.[notif.id] || 0, 10);
            const delta = Math.max(0, responded - seen);
            if (delta > 0) {
              acc.totalNew += delta;
              acc.byId[notif.id] = delta;
            }
            return acc;
          },
          { totalNew: 0, byId: {} }
        );
        setNewResponsesCount(totalNew);
        setNewResponsesByNotification(byId);
      }

      if (branchesRes.data.success) {
        setBranches(branchesRes.data.data || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      showError("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNotification = async (e) => {
    e.preventDefault();

    if (!formData.message.trim()) {
      showWarning("الرسالة مطلوبة");
      return;
    }

    if (formData.branch_ids.length === 0) {
      showWarning("يجب اختيار فرع واحد على الأقل");
      return;
    }

    try {
      setSaving(true);

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('message', formData.message.trim());
      formDataToSend.append('importance_level', parseInt(formData.importance_level));
      formDataToSend.append('duration_days', parseInt(formData.duration_days) || 7);
      formDataToSend.append('one_time', formData.one_time ? 'true' : 'false');

      // Append branch_ids as JSON string to ensure proper parsing on server
      // This is more reliable than multiple append() calls with same key
      formDataToSend.append('branch_ids', JSON.stringify(formData.branch_ids.map(id => parseInt(id))));

      // Add file if selected
      if (attachmentFile) {
        formDataToSend.append('file', attachmentFile);
      }

      const response = await notificationsAPI.create(formDataToSend);

      if (response.data.success) {
        showSuccess("تم إرسال الإشعار بنجاح");
        setFormData({
          message: "",
          importance_level: 2,
          branch_ids: [],
          duration_days: 7,
          one_time: false,
        });
        setAttachmentFile(null);
        setShowCreateForm(false);
        loadData();
      }
    } catch (error) {
      console.error("Error creating notification:", error);
      showError(error.response?.data?.message || "فشل إنشاء الإشعار");
    } finally {
      setSaving(false);
    }
  };

  const handleViewDetails = async (notificationId) => {
    if (selectedNotification === notificationId && notificationDetails) {
      setSelectedNotification(null);
      setNotificationDetails(null);
      return;
    }

    try {
      setLoadingDetails(true);
      setSelectedNotification(notificationId);
      const response = await notificationsAPI.getById(notificationId);

      if (response.data.success) {
        setNotificationDetails(response.data.data);
        const seenKey = 'notify_branches_seen_responses';
        const seenCounts = getSeenCounts(seenKey);
        const responded = parseInt(response.data.data?.stats?.responded_count || 0, 10);
        if (responded > 0) {
          const nextCounts = { ...seenCounts, [notificationId]: responded };
          setSeenCounts(seenKey, nextCounts);
          const remaining = Object.entries(newResponsesByNotification)
            .filter(([id]) => parseInt(id, 10) !== notificationId)
            .reduce((sum, [, count]) => sum + count, 0);
          setNewResponsesByNotification((prev) => {
            const next = { ...prev };
            delete next[notificationId];
            return next;
          });
          setNewResponsesCount(remaining);
        }
      }
    } catch (error) {
      console.error("Error loading notification details:", error);
      showError("فشل تحميل تفاصيل الإشعار");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDeleteNotification = async (notificationId) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الإشعار؟")) {
      return;
    }

    try {
      const response = await notificationsAPI.delete(notificationId);
      if (response.data.success) {
        showSuccess("تم حذف الإشعار بنجاح");
        loadData();
        if (selectedNotification === notificationId) {
          setSelectedNotification(null);
          setNotificationDetails(null);
        }
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
      showError(error.response?.data?.message || "فشل حذف الإشعار");
    }
  };

  const handleToggleActive = async (notificationId) => {
    try {
      const response = await notificationsAPI.toggleActive(notificationId);
      if (response.data.success) {
        showSuccess(response.data.message);
        loadData();
      }
    } catch (error) {
      console.error("Error toggling notification status:", error);
      showError(error.response?.data?.message || "فشل تحديث حالة الإشعار");
    }
  };

  const toggleBranchSelection = (branchId) => {
    setFormData((prev) => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter((id) => id !== branchId)
        : [...prev.branch_ids, branchId],
    }));
  };

  const selectAllBranches = () => {
    setFormData((prev) => ({
      ...prev,
      branch_ids: branches.map((b) => b.id),
    }));
  };

  const deselectAllBranches = () => {
    setFormData((prev) => ({
      ...prev,
      branch_ids: [],
    }));
  };

  const importanceColors = {
    1: "#4CAF50", // Low - Green
    2: "#FF9800", // Medium - Orange
    3: "#F44336", // High - Red
    4: "#2196F3", // Circular - Blue
    5: "#9C27B0", // One-time - Purple
  };

  const importanceLabels = {
    1: "تنبيه",
    2: "هام و غير عاجل",
    3: "هام و عاجل",
    4: "تعميم",
    5: "تنبيه لمرة واحدة",
  };

  const responseStatusLabels = {
    done: { text: "تم", label: "Completed", color: "#4CAF50" },
    working_on_it: { text: "قيد العمل", label: "Working on", color: "var(--primary)" },
    seen: { text: "شوهد", label: "Aware", color: "#9E9E9E" },
  };

  if (!isMainManager()) {
    return (
      <div className="notify-branches-page">
        <h1>غير مصرح</h1>
        <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
      </div>
    );
  }

  return (
    <div className="notify-branches-page">
      <div className="page-header">
        <h1>إشعارات الفروع</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label className="modern-toggle" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => {
                  setShowInactive(e.target.checked);
                }}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
            <span style={{ userSelect: 'none', fontWeight: '500', fontSize: '14px' }}>عرض الإشعارات غير النشطة</span>
          </label>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "إلغاء" : "إرسال إشعار جديد"}
          </button>
        </div>
      </div>

      {newResponsesCount > 0 && (
        <div className="notification-banner">
          <span>لديك {newResponsesCount} رد جديد من الفروع</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const seenKey = 'notify_branches_seen_responses';
              const nextCounts = notifications.reduce((acc, notif) => {
                acc[notif.id] = parseInt(notif?.stats?.responded_count || 0, 10);
                return acc;
              }, {});
              setSeenCounts(seenKey, nextCounts);
              setNewResponsesByNotification({});
              setNewResponsesCount(0);
            }}
          >
            تم الاطلاع
          </button>
        </div>
      )}

      {/* Create Notification Form */}
      {showCreateForm && (
        <div className="create-notification-form modern-form">
          <div className="form-header">
            <h2>إرسال إشعار جديد</h2>
          </div>

          <form onSubmit={handleCreateNotification} className="modern-form-content">
            <div className="form-row">
              <div className="form-group form-group-full">
                <label htmlFor="message" className="form-label">
                  <span className="label-text">الرسالة</span>
                  <span className="required-badge">*</span>
                </label>
                <textarea
                  id="message"
                  className="form-textarea"
                  value={formData.message}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, message: e.target.value }))
                  }
                  rows="5"
                  required
                  placeholder="اكتب الرسالة هنا..."
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="importance_level" className="form-label">
                  <span className="label-text">مستوى الأهمية</span>
                  <span className="required-badge">*</span>
                </label>
                <select
                  id="importance_level"
                  className="form-select"
                  value={formData.importance_level}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      importance_level: parseInt(e.target.value),
                    }))
                  }
                  required
                >
                  <option value={1}>تنبيه</option>
                  <option value={2}>هام و غير عاجل</option>
                  <option value={3}>هام و عاجل</option>
                  <option value={4}>تعميم</option>
                  <option value={5}>تنبيه لمرة واحدة</option>
                </select>
              </div>

              <div className="form-group form-group-small">
                <label htmlFor="duration_days" className="form-label">
                  <span className="label-text">مدة الإشعار (أيام)</span>
                </label>
                <input
                  type="number"
                  id="duration_days"
                  className="form-input form-input-small"
                  min="1"
                  max="365"
                  value={formData.duration_days}
                  onChange={(e) => setFormData((prev) => ({ ...prev, duration_days: parseInt(e.target.value) || 7 }))}
                  placeholder="7"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group form-group-full">
                <label className="modern-toggle" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      id="one_time"
                      checked={formData.one_time}
                      onChange={(e) => {
                        const isOneTime = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          one_time: isOneTime,
                          // Automatically set importance level to 5 if one-time is checked
                          importance_level: isOneTime ? 5 : (prev.importance_level === 5 ? 2 : prev.importance_level)
                        }));
                      }}
                      className="toggle-input"
                    />
                    <span className="toggle-slider"></span>
                  </div>
                  <span style={{ userSelect: 'none', fontWeight: '500', fontSize: '14px' }}>إشعار لمرة واحدة فقط</span>
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group form-group-full">
                <label htmlFor="attachment" className="form-label">
                  <span className="label-text">إرفاق ملف أو صورة</span>
                  <span className="optional-badge">(اختياري)</span>
                </label>
                <div className="file-upload-container">
                  <input
                    id="attachment"
                    type="file"
                    className="file-input"
                    accept=".pdf,.jpg,.jpeg,.png,.gif"
                    onChange={(e) => setAttachmentFile(e.target.files[0] || null)}
                  />
                  {attachmentFile && (
                    <div className="file-selected">
                      <span className="file-icon">📎</span>
                      <div className="file-info">
                        <span className="file-name">{attachmentFile.name}</span>
                        <span className="file-size">
                          ({(attachmentFile.size / 1024 / 1024).toFixed(2)} ميجابايت)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="remove-file-btn"
                        onClick={() => setAttachmentFile(null)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group form-group-full">
                <div className="branches-selection-header modern-header">
                  <label className="form-label">
                    <span className="label-text">اختر الفروع</span>
                    <span className="required-badge">*</span>
                  </label>
                  <div className="selection-actions">
                    <button
                      type="button"
                      className="action-link-btn"
                      onClick={selectAllBranches}
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      className="action-link-btn"
                      onClick={deselectAllBranches}
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>
                <div className="branches-button-grid">
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      className={`branch-select-button ${formData.branch_ids.includes(branch.id) ? 'selected' : ''}`}
                      onClick={() => toggleBranchSelection(branch.id)}
                    >
                      <BranchBadge branch={branch} />
                      <span className="branch-name-text">{branch.branch_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-actions modern-actions">
              <button
                type="button"
                className="btn btn-secondary modern-btn-secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({
                    message: "",
                    importance_level: 2,
                    branch_ids: [],
                    duration_days: 7,
                    one_time: false,
                  });
                  setAttachmentFile(null);
                }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="btn btn-primary modern-btn-primary"
                disabled={saving || formData.branch_ids.length === 0}
              >
                {saving ? "جاري الإرسال..." : "إرسال الإشعار"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notifications List */}
      {loading ? (
        <div className="loading">جاري التحميل...</div>
      ) : (
        <div className="notifications-list">
          <h2>{showInactive ? 'جميع الإشعارات' : 'الإشعارات النشطة'} ({notifications.length})</h2>

          {notifications.length === 0 ? (
            <div className="empty-state">
              <p>لا توجد إشعارات مرسلة بعد</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const stats = notification.stats || {};
              const respondedCount = stats.responded_count || 0;
              const totalBranches = stats.total_branches || 0;
              const noResponseCount = stats.no_response_count || 0;

              return (
                <div
                  key={notification.id}
                  className="notification-card"
                  style={{
                    borderRight: `4px solid ${importanceColors[notification.importance_level]
                      }`,
                    opacity: notification.is_active ? 1 : 0.7,
                  }}
                >
                  <div className="notification-card-header">
                    <div className="notification-meta">
                      <span
                        className="importance-badge"
                        style={{
                          backgroundColor:
                            importanceColors[notification.importance_level],
                        }}
                      >
                        {importanceLabels[notification.importance_level]}
                      </span>
                      <span className="notification-date">
                        {formatDate(notification.created_at)}
                      </span>
                      {notification.created_by_name && (
                        <span className="notification-creator">
                          بواسطة: {notification.created_by_name}
                        </span>
                      )}
                    </div>
                    <div className="notification-actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleViewDetails(notification.id)}
                      >
                        {selectedNotification === notification.id
                          ? "إخفاء التفاصيل"
                          : "عرض التفاصيل"}
                      </button>
                      <button
                        className={`btn btn-sm ${notification.is_active ? 'btn-warning' : 'btn-success'}`}
                        onClick={() => handleToggleActive(notification.id)}
                        title={notification.is_active ? 'إلغاء التفعيل' : 'تفعيل'}
                      >
                        {notification.is_active ? 'إلغاء التفعيل' : 'تفعيل'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          handleDeleteNotification(notification.id)
                        }
                        style={{ marginLeft: '8px' }}
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="notification-message">
                    {notification.message}
                  </div>

                  {/* Attachment Display */}
                  {notification.attachment_url && (
                    <div className="notification-attachment" style={{
                      marginTop: '15px',
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      border: '1px solid #ddd'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '18px' }}>📎</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                            ملف مرفق: {notification.attachment_name || 'مرفق'}
                          </div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <a
                              href={notification.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'var(--primary)',
                                textDecoration: 'none',
                                fontSize: '14px'
                              }}
                            >
                              📥 تحميل الملف
                            </a>
                            {(notification.attachment_type?.startsWith('image/') || notification.attachment_type === 'application/pdf') && (
                              <a
                                href={notification.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--primary)',
                                  textDecoration: 'none',
                                  fontSize: '14px'
                                }}
                              >
                                👁️ معاينة
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="notification-stats">
                    <div className="stat-item">
                      <span className="stat-label">إجمالي الفروع:</span>
                      <span className="stat-value">{totalBranches}</span>
                    </div>
                    <div className="stat-item stat-success">
                      <span className="stat-label">تم الرد:</span>
                      <span className="stat-value">{respondedCount}</span>
                    </div>
                    <div className="stat-item stat-warning">
                      <span className="stat-label">لم يرد:</span>
                      <span className="stat-value">{noResponseCount}</span>
                    </div>
                    {notification.one_time && stats.seen_branches_count > 0 && (
                      <div className="stat-item stat-info">
                        <span className="stat-label">تم المشاهدة:</span>
                        <span className="stat-value">{stats.seen_branches_count}</span>
                      </div>
                    )}
                    {stats.done_count > 0 && (
                      <div className="stat-item stat-done">
                        <span className="stat-label">تم:</span>
                        <span className="stat-value">{stats.done_count}</span>
                      </div>
                    )}
                    {stats.working_on_it_count > 0 && (
                      <div className="stat-item stat-working">
                        <span className="stat-label">قيد العمل:</span>
                        <span className="stat-value">
                          {stats.working_on_it_count}
                        </span>
                      </div>
                    )}
                    {stats.seen_count > 0 && (
                      <div className="stat-item stat-seen">
                        <span className="stat-label">شوهد:</span>
                        <span className="stat-value">{stats.seen_count}</span>
                      </div>
                    )}
                  </div>

                  {/* Notification Details */}
                  {selectedNotification === notification.id && (
                    <div className="notification-details">
                      {loadingDetails ? (
                        <div className="loading">جاري تحميل التفاصيل...</div>
                      ) : notificationDetails ? (
                        <div className="details-content">
                          <h3>تفاصيل الردود</h3>

                          {/* Branches with Responses */}
                          {notificationDetails.responses &&
                            notificationDetails.responses.length > 0 && (
                              <div className="responses-section">
                                <h4>
                                  الفروع التي ردت (
                                  {notificationDetails.responses.length})
                                </h4>
                                <div className="responses-list">
                                  {notificationDetails.responses.map(
                                    (response) => {
                                      const statusInfo =
                                        responseStatusLabels[
                                        response.response_status
                                        ] || {};
                                      return (
                                        <div
                                          key={response.id}
                                          className="response-item"
                                        >
                                          <div className="response-header">
                                            <span className="branch-name">
                                              {response.branch_name}
                                            </span>
                                            <span
                                              className="response-status-badge"
                                              style={{
                                                backgroundColor:
                                                  statusInfo.color,
                                              }}
                                            >
                                              {statusInfo.text}
                                            </span>
                                          </div>
                                          {response.response_message && (
                                            <div className="response-message">
                                              <strong>الرسالة:</strong>{" "}
                                              {response.response_message}
                                            </div>
                                          )}
                                          <div className="response-date">
                                            {formatDate(response.responded_at)}
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              </div>
                            )}

                          {/* Branches without Responses */}
                          {notificationDetails.branches && (
                            <div className="no-responses-section">
                              <h4>الفروع التي لم ترد ({noResponseCount})</h4>
                              <div className="branches-list">
                                {notificationDetails.branches
                                  .filter(
                                    (branch) =>
                                      !notificationDetails.responses?.some(
                                        (r) => r.branch_id === branch.id
                                      )
                                  )
                                  .map((branch) => (
                                    <div
                                      key={branch.id}
                                      className="branch-item no-response"
                                    >
                                      <span className="branch-name">
                                        {branch.branch_name}
                                      </span>
                                      <span className="branch-type">
                                        {branch.branch_type === "school"
                                          ? "مدرسة"
                                          : "مركز رعاية نهارية"}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        <div className="error">فشل تحميل التفاصيل</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default NotifyBranches;

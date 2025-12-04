/**
 * Notify Branches Page
 * Main Manager can create notifications and view response reports
 */

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { notificationsAPI, branchesAPI } from "../utils/api";
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

  // Create form state
  const [formData, setFormData] = useState({
    message: "",
    importance_level: 2,
    branch_ids: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadData();
    // Update last visit time when viewing notifications page
    localStorage.setItem('notifications_last_visit', new Date().toISOString());
  }, [isMainManager]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notificationsRes, branchesRes] = await Promise.all([
        notificationsAPI.getAll(),
        branchesAPI.getAll({ is_active: true }),
      ]);

      if (notificationsRes.data.success) {
        setNotifications(notificationsRes.data.data || []);
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
      const response = await notificationsAPI.create({
        message: formData.message.trim(),
        importance_level: parseInt(formData.importance_level),
        branch_ids: formData.branch_ids.map((id) => parseInt(id)),
      });

      if (response.data.success) {
        showSuccess("تم إرسال الإشعار بنجاح");
        setFormData({
          message: "",
          importance_level: 2,
          branch_ids: [],
        });
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
  };

  const importanceLabels = {
    1: "منخفض",
    2: "متوسط",
    3: "عالي",
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
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "إلغاء" : "إرسال إشعار جديد"}
        </button>
      </div>

      {/* Create Notification Form */}
      {showCreateForm && (
        <div className="create-notification-form">
          <h2>إرسال إشعار جديد</h2>
          <form onSubmit={handleCreateNotification}>
            <div className="form-group">
              <label htmlFor="message">الرسالة *</label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, message: e.target.value }))
                }
                rows="5"
                required
                placeholder="اكتب الرسالة هنا..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="importance_level">مستوى الأهمية *</label>
              <select
                id="importance_level"
                value={formData.importance_level}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    importance_level: parseInt(e.target.value),
                  }))
                }
                required
              >
                <option value={1}>منخفض</option>
                <option value={2}>متوسط</option>
                <option value={3}>عالي</option>
              </select>
            </div>

            <div className="form-group">
              <div className="branches-selection-header">
                <label>اختر الفروع *</label>
                <div className="selection-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={selectAllBranches}
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={deselectAllBranches}
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </div>
              <div className="branches-checkbox-grid">
                {branches.map((branch) => (
                  <label key={branch.id} className="branch-checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.branch_ids.includes(branch.id)}
                      onChange={() => toggleBranchSelection(branch.id)}
                    />
                    <span>{branch.branch_name}</span>
                    <span className="branch-type-badge">
                      {branch.branch_type === "school" ? "مدرسة" : "مركز رعاية نهارية"}
                    </span>
                  </label>
                ))}
              </div>
              {formData.branch_ids.length === 0 && (
                <p className="form-error">يجب اختيار فرع واحد على الأقل</p>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || formData.branch_ids.length === 0}
              >
                {saving ? "جاري الإرسال..." : "إرسال الإشعار"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({
                    message: "",
                    importance_level: 2,
                    branch_ids: [],
                  });
                }}
              >
                إلغاء
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
          <h2>الإشعارات المرسلة ({notifications.length})</h2>

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
                    borderRight: `4px solid ${
                      importanceColors[notification.importance_level]
                    }`,
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
                        {new Date(notification.created_at).toLocaleDateString(
                          "en-GB",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
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
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          handleDeleteNotification(notification.id)
                        }
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="notification-message">
                    {notification.message}
                  </div>

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
                                            {new Date(
                                              response.responded_at
                                            ).toLocaleDateString("en-GB", {
                                              year: "numeric",
                                              month: "long",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
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

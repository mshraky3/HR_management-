/**
 * Suggestions Page
 * - Branch managers: Submit suggestions with importance level
 * - Main managers: View all suggestions with statistics
 */

import { useState, useEffect, useMemo } from 'react';
import { suggestionsAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
import { getLastSeen, setLastSeen, countNewByDate } from '../utils/notificationTracker';
import './Suggestions.css';

// Importance level colors for visual distinction
const IMPORTANCE_COLORS = {
    urgent_important: '#dc3545', // Red
    very_impactful: '#fd7e14',   // Orange
    useful: '#28a745',           // Green
    not_impactful: '#6c757d'     // Gray
};

// Status colors
const STATUS_COLORS = {
    pending: '#ffc107',      // Yellow
    reviewed: '#17a2b8',     // Cyan
    implemented: '#28a745',  // Green
    rejected: '#dc3545'      // Red
};

const Suggestions = () => {
    const { isMainManager, user } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();

    // State
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState({ importanceLevels: {}, statusOptions: {} });
    const [stats, setStats] = useState(null);
    const [branches, setBranches] = useState([]);
    const [newSuggestionsCount, setNewSuggestionsCount] = useState(0);

    // Form state (for branch managers)
    const [formData, setFormData] = useState({
        suggestion_text: '',
        importance_level: 'useful'
    });
    const [submitting, setSubmitting] = useState(false);

    // Filter state (for main managers)
    const [filters, setFilters] = useState({
        branch_id: '',
        importance_level: '',
        status: ''
    });

    // Edit modal state (for main managers)
    const [editModal, setEditModal] = useState({
        show: false,
        suggestion: null,
        status: '',
        admin_notes: ''
    });

    // Load data on mount
    useEffect(() => {
        loadInitialData();
    }, []);

    // Reload suggestions when filters change
    useEffect(() => {
        if (!loading) {
            loadSuggestions();
        }
    }, [filters]);

    useEffect(() => {
        if (loading) return;
        const key = isMainManager()
            ? 'suggestions_last_seen_main'
            : `suggestions_last_seen_branch_${user?.branch_id || 'unknown'}`;
        const lastSeen = getLastSeen(key);
        const count = isMainManager()
            ? countNewByDate(suggestions, 'created_at', lastSeen)
            : suggestions.filter((s) => {
                if (!s?.status || s.status === 'pending') return false;
                const updatedAt = s.updated_at || s.created_at;
                if (!updatedAt) return false;
                const date = new Date(updatedAt);
                return !isNaN(date.getTime()) && (!lastSeen || date > lastSeen);
            }).length;
        setNewSuggestionsCount(count);
    }, [suggestions, loading, isMainManager, user]);

    const loadInitialData = async () => {
        try {
            setLoading(true);

            // Load options
            const optionsRes = await suggestionsAPI.getOptions();
            if (optionsRes.data.success) {
                setOptions(optionsRes.data.data);
            }

            // Load branches for main manager filter
            if (isMainManager()) {
                const branchesRes = await branchesAPI.getAll();
                if (branchesRes.data.success || branchesRes.data.data) {
                    setBranches(branchesRes.data.data || []);
                }

                // Load stats
                const statsRes = await suggestionsAPI.getStats();
                if (statsRes.data.success) {
                    setStats(statsRes.data.data);
                }
            }

            // Load suggestions
            await loadSuggestions();
        } catch (error) {
            console.error('Error loading initial data:', error);
            showError('فشل في تحميل البيانات');
        } finally {
            setLoading(false);
        }
    };

    const loadSuggestions = async () => {
        try {
            const params = {};
            if (filters.branch_id) params.branch_id = filters.branch_id;
            if (filters.importance_level) params.importance_level = filters.importance_level;
            if (filters.status) params.status = filters.status;

            const res = await suggestionsAPI.getAll(params);
            if (res.data.success) {
                setSuggestions(res.data.data || []);
            }
        } catch (error) {
            console.error('Error loading suggestions:', error);
            showError('فشل في تحميل الاقتراحات');
        }
    };

    const loadStats = async () => {
        try {
            const statsRes = await suggestionsAPI.getStats();
            if (statsRes.data.success) {
                setStats(statsRes.data.data);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    // Handle form submission (branch managers)
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.suggestion_text.trim()) {
            showWarning('الرجاء إدخال نص الاقتراح');
            return;
        }

        try {
            setSubmitting(true);
            const res = await suggestionsAPI.create(formData);

            if (res.data.success) {
                showSuccess('تم إرسال الاقتراح بنجاح');
                setFormData({ suggestion_text: '', importance_level: 'useful' });
                await loadSuggestions();
            } else {
                showError(res.data.message || 'فشل في إرسال الاقتراح');
            }
        } catch (error) {
            console.error('Error submitting suggestion:', error);
            showError(error.response?.data?.message || 'فشل في إرسال الاقتراح');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle status update (main managers)
    const handleStatusUpdate = async () => {
        if (!editModal.suggestion) return;

        try {
            const res = await suggestionsAPI.update(editModal.suggestion.id, {
                status: editModal.status,
                admin_notes: editModal.admin_notes
            });

            if (res.data.success) {
                showSuccess('تم تحديث حالة الاقتراح بنجاح');
                setEditModal({ show: false, suggestion: null, status: '', admin_notes: '' });
                await loadSuggestions();
                await loadStats();
            } else {
                showError(res.data.message || 'فشل في تحديث الاقتراح');
            }
        } catch (error) {
            console.error('Error updating suggestion:', error);
            showError(error.response?.data?.message || 'فشل في تحديث الاقتراح');
        }
    };

    // Handle delete suggestion
    const handleDelete = async (id) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا الاقتراح؟')) return;

        try {
            const res = await suggestionsAPI.delete(id);
            if (res.data.success) {
                showSuccess('تم حذف الاقتراح بنجاح');
                await loadSuggestions();
                if (isMainManager()) {
                    await loadStats();
                }
            } else {
                showError(res.data.message || 'فشل في حذف الاقتراح');
            }
        } catch (error) {
            console.error('Error deleting suggestion:', error);
            showError(error.response?.data?.message || 'فشل في حذف الاقتراح');
        }
    };

    // Open edit modal
    const openEditModal = (suggestion) => {
        setEditModal({
            show: true,
            suggestion,
            status: suggestion.status,
            admin_notes: suggestion.admin_notes || ''
        });
    };

    // Format date
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Calculate stats percentages for chart
    const importancePercentages = useMemo(() => {
        if (!stats?.byImportance || stats.byImportance.length === 0) return [];

        const total = stats.byImportance.reduce((sum, item) => sum + parseInt(item.count), 0);
        return stats.byImportance.map(item => ({
            ...item,
            percentage: total > 0 ? ((parseInt(item.count) / total) * 100).toFixed(1) : 0,
            label: options.importanceLevels[item.importance_level] || item.importance_level
        }));
    }, [stats, options]);

    if (loading) {
        return <div className="loading">جاري التحميل...</div>;
    }

    return (
        <div className="suggestions-page">
            <div className="page-header">
                <h1>الاقتراحات</h1>
                <p className="page-description">
                    {isMainManager()
                        ? 'متابعة ومراجعة الاقتراحات المقدمة من الفروع'
                        : 'شاركنا اقتراحاتك لتحسين النظام'
                    }
                </p>
            </div>

            {newSuggestionsCount > 0 && (
                <div className="notification-banner">
                    <span>
                        {isMainManager()
                            ? `لديك ${newSuggestionsCount} اقتراح جديد`
                            : `لديك ${newSuggestionsCount} رد جديد على اقتراحاتك`}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                            const key = isMainManager()
                                ? 'suggestions_last_seen_main'
                                : `suggestions_last_seen_branch_${user?.branch_id || 'unknown'}`;
                            setLastSeen(key, new Date());
                            setNewSuggestionsCount(0);
                        }}
                    >
                        تم الاطلاع
                    </button>
                </div>
            )}

            {/* Main Manager: Statistics Section */}
            {isMainManager() && stats && (
                <div className="stats-section">
                    <h2>إحصائيات الاقتراحات</h2>

                    <div className="stats-grid">
                        {/* Overall Stats */}
                        <div className="stat-card total">
                            <div className="stat-icon">📊</div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.overall?.total || 0}</span>
                                <span className="stat-label">إجمالي الاقتراحات</span>
                            </div>
                        </div>

                        <div className="stat-card pending">
                            <div className="stat-icon">⏳</div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.overall?.pending_count || 0}</span>
                                <span className="stat-label">قيد الانتظار</span>
                            </div>
                        </div>

                        <div className="stat-card reviewed">
                            <div className="stat-icon">👁️</div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.overall?.reviewed_count || 0}</span>
                                <span className="stat-label">تمت المراجعة</span>
                            </div>
                        </div>

                        <div className="stat-card implemented">
                            <div className="stat-icon">✅</div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.overall?.implemented_count || 0}</span>
                                <span className="stat-label">تم التنفيذ</span>
                            </div>
                        </div>
                    </div>

                    {/* Importance Distribution */}
                    <div className="stats-charts">
                        <div className="chart-card">
                            <h3>توزيع الاقتراحات حسب الأهمية</h3>
                            <div className="importance-bars">
                                {importancePercentages.map((item) => (
                                    <div key={item.importance_level} className="importance-bar-item">
                                        <div className="bar-label">
                                            <span
                                                className="importance-dot"
                                                style={{ backgroundColor: IMPORTANCE_COLORS[item.importance_level] }}
                                            ></span>
                                            <span>{item.label}</span>
                                            <span className="bar-count">({item.count})</span>
                                        </div>
                                        <div className="bar-container">
                                            <div
                                                className="bar-fill"
                                                style={{
                                                    width: `${item.percentage}%`,
                                                    backgroundColor: IMPORTANCE_COLORS[item.importance_level]
                                                }}
                                            ></div>
                                            <span className="bar-percentage">{item.percentage}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="chart-card">
                            <h3>الاقتراحات حسب الفرع</h3>
                            <div className="branch-stats">
                                {stats.byBranch && stats.byBranch.length > 0 ? (
                                    stats.byBranch.map((item) => (
                                        <div key={item.branch_id} className="branch-stat-item">
                                            <span className="branch-name">{item.branch_name}</span>
                                            <span className="branch-count">{item.count} اقتراح</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="no-data">لا توجد بيانات</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Branch Manager: Submission Form */}
            {!isMainManager() && (
                <div className="submission-section">
                    <h2>إضافة اقتراح جديد</h2>
                    <form onSubmit={handleSubmit} className="suggestion-form">
                        <div className="form-group">
                            <label htmlFor="suggestion_text">نص الاقتراح *</label>
                            <textarea
                                id="suggestion_text"
                                value={formData.suggestion_text}
                                onChange={(e) => setFormData({ ...formData, suggestion_text: e.target.value })}
                                placeholder="اكتب اقتراحك هنا..."
                                rows={5}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="importance_level">مستوى الأهمية والتأثير</label>
                            <select
                                id="importance_level"
                                value={formData.importance_level}
                                onChange={(e) => setFormData({ ...formData, importance_level: e.target.value })}
                            >
                                {Object.entries(options.importanceLevels).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            <div className="importance-hint">
                                <div className="hint-item">
                                    <span className="dot" style={{ backgroundColor: IMPORTANCE_COLORS.urgent_important }}></span>
                                    <span>عاجل ومهم: يحتاج تنفيذ فوري</span>
                                </div>
                                <div className="hint-item">
                                    <span className="dot" style={{ backgroundColor: IMPORTANCE_COLORS.very_impactful }}></span>
                                    <span>مؤثر جداً: تأثير كبير على تجربة المستخدم</span>
                                </div>
                                <div className="hint-item">
                                    <span className="dot" style={{ backgroundColor: IMPORTANCE_COLORS.useful }}></span>
                                    <span>مفيد: تحسين عام للنظام</span>
                                </div>
                                <div className="hint-item">
                                    <span className="dot" style={{ backgroundColor: IMPORTANCE_COLORS.not_impactful }}></span>
                                    <span>غير مؤثر: اقتراح بسيط</span>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="submit-btn" disabled={submitting}>
                            {submitting ? 'جاري الإرسال...' : 'إرسال الاقتراح'}
                        </button>
                    </form>
                </div>
            )}

            {/* Main Manager: Filters */}
            {isMainManager() && (
                <div className="filters-section">
                    <h2>تصفية الاقتراحات</h2>
                    <div className="filters-row">
                        <div className="filter-group">
                            <label>الفرع</label>
                            <select
                                value={filters.branch_id}
                                onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
                            >
                                <option value="">جميع الفروع</option>
                                {branches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>مستوى الأهمية</label>
                            <select
                                value={filters.importance_level}
                                onChange={(e) => setFilters({ ...filters, importance_level: e.target.value })}
                            >
                                <option value="">جميع المستويات</option>
                                {Object.entries(options.importanceLevels).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>الحالة</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            >
                                <option value="">جميع الحالات</option>
                                {Object.entries(options.statusOptions).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            className="clear-filters-btn"
                            onClick={() => setFilters({ branch_id: '', importance_level: '', status: '' })}
                        >
                            مسح الفلاتر
                        </button>
                    </div>
                </div>
            )}

            {/* Suggestions List */}
            <div className="suggestions-list-section">
                <h2>
                    {isMainManager() ? 'قائمة الاقتراحات' : 'اقتراحاتي السابقة'}
                    <span className="count-badge">{suggestions.length}</span>
                </h2>

                {suggestions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">💡</div>
                        <p>{isMainManager() ? 'لا توجد اقتراحات حالياً' : 'لم تقم بإرسال أي اقتراحات بعد'}</p>
                    </div>
                ) : (
                    <div className="suggestions-list">
                        {suggestions.map((suggestion) => (
                            <div key={suggestion.id} className="suggestion-card">
                                <div className="suggestion-header">
                                    <div className="suggestion-meta">
                                        {isMainManager() && suggestion.branch_name && (
                                            <BranchBadge branchName={suggestion.branch_name} />
                                        )}
                                        <span
                                            className="importance-badge"
                                            style={{ backgroundColor: IMPORTANCE_COLORS[suggestion.importance_level] }}
                                        >
                                            {options.importanceLevels[suggestion.importance_level] || suggestion.importance_level}
                                        </span>
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: STATUS_COLORS[suggestion.status] }}
                                        >
                                            {options.statusOptions[suggestion.status] || suggestion.status}
                                        </span>
                                    </div>
                                    <span className="suggestion-date">{formatDate(suggestion.created_at)}</span>
                                </div>

                                <div className="suggestion-content">
                                    <p>{suggestion.suggestion_text}</p>
                                </div>

                                {suggestion.admin_notes && (
                                    <div className="admin-notes">
                                        <strong>ملاحظات الإدارة:</strong>
                                        <p>{suggestion.admin_notes}</p>
                                    </div>
                                )}

                                <div className="suggestion-actions">
                                    {isMainManager() && (
                                        <button
                                            className="action-btn edit"
                                            onClick={() => openEditModal(suggestion)}
                                        >
                                            تحديث الحالة
                                        </button>
                                    )}
                                    <button
                                        className="action-btn delete"
                                        onClick={() => handleDelete(suggestion.id)}
                                    >
                                        حذف
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Modal (Main Manager) */}
            {editModal.show && (
                <div className="modal-overlay" onClick={() => setEditModal({ show: false, suggestion: null, status: '', admin_notes: '' })}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>تحديث حالة الاقتراح</h3>
                            <button
                                className="close-btn"
                                onClick={() => setEditModal({ show: false, suggestion: null, status: '', admin_notes: '' })}
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="suggestion-preview">
                                <p><strong>الاقتراح:</strong></p>
                                <p className="preview-text">{editModal.suggestion?.suggestion_text}</p>
                            </div>

                            <div className="form-group">
                                <label>الحالة</label>
                                <select
                                    value={editModal.status}
                                    onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}
                                >
                                    {Object.entries(options.statusOptions).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>ملاحظات الإدارة</label>
                                <textarea
                                    value={editModal.admin_notes}
                                    onChange={(e) => setEditModal({ ...editModal, admin_notes: e.target.value })}
                                    placeholder="أضف ملاحظات للفرع..."
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn-secondary"
                                onClick={() => setEditModal({ show: false, suggestion: null, status: '', admin_notes: '' })}
                            >
                                إلغاء
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleStatusUpdate}
                            >
                                حفظ التغييرات
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Suggestions;

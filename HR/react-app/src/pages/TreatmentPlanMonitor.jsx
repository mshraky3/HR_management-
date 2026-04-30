/**
 * TreatmentPlanMonitor - Admin Page
 * Main manager can view, filter, review, and download submitted treatment plans
 */
import { useState, useEffect } from 'react';
import { treatmentPlansAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import { reportApiError } from '../utils/errorTracking';
import { useNotification } from '../contexts/NotificationContext';
import {
    getTreatmentPlanJobTitles,
    TREATMENT_PLAN_TYPES,
} from '../utils/employeeConstants';
import './TreatmentPlanMonitor.css';

const STATUS_LABELS = {
    pending: 'قيد الانتظار',
    reviewed: 'تمت المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض',
};

const STATUS_COLORS = {
    pending: '#f59e0b',
    reviewed: '#3b82f6',
    approved: '#10b981',
    rejected: '#ef4444',
};

const normalizeFilename = (filename) => {
    if (!filename || typeof filename !== 'string') return 'plan';

    const cleaned = filename.replace(/[\x00-\x1F\x7F-\x9F\r\n]/g, '').trim();
    const looksMojibake = /[ØÙÃÂÐ]/.test(cleaned);
    if (!looksMojibake) return cleaned || 'plan';

    try {
        const fixed = decodeURIComponent(escape(cleaned));
        return fixed && !fixed.includes('�') ? fixed : (cleaned || 'plan');
    } catch {
        return cleaned || 'plan';
    }
};

const TreatmentPlanMonitor = () => {
    const { showError, showSuccess } = useNotification();
    const [plans, setPlans] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        branch_id: '',
        department: '',
        job_title: '',
        status: '',
    });
    const [reviewModal, setReviewModal] = useState(null);
    const [reviewData, setReviewData] = useState({ status: '', review_notes: '' });
    const [saving, setSaving] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const jobTitles = getTreatmentPlanJobTitles();
    const departments = [...new Set(Object.values(TREATMENT_PLAN_TYPES).map(v => v.department))];

    useEffect(() => {
        loadData();
    }, [filters]);

    const loadData = async () => {
        try {
            setLoading(true);
            const cleanFilters = {};
            Object.entries(filters).forEach(([k, v]) => {
                if (v) cleanFilters[k] = v;
            });

            const [plansRes, statsRes] = await Promise.all([
                treatmentPlansAPI.getAll(cleanFilters),
                treatmentPlansAPI.getStats(),
            ]);

            setPlans(plansRes.data.data || []);
            setStats(statsRes.data.data || null);
        } catch (error) {
            console.error('Error loading treatment plans:', error);
            const msg = error.response?.data?.message || 'فشل تحميل الخطط';
            showError(msg);
            reportApiError(error, { url: '/api/treatment-plans', method: 'GET' });
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleDownload = async (plan) => {
        try {
            const response = await treatmentPlansAPI.download(plan.id);
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
            downloadFile(blob, normalizeFilename(plan.original_filename));
        } catch (error) {
            console.error('Error downloading:', error);
            const msg = error.response?.data?.message || 'فشل تحميل الملف. تأكد من وجود الملف وحاول مرة أخرى';
            showError(msg);
            reportApiError(error, { url: `/api/treatment-plans/${plan.id}/download`, method: 'GET' });
        }
    };

    const openReviewModal = (plan) => {
        setReviewModal(plan);
        setReviewData({
            status: plan.status === 'pending' ? 'approved' : plan.status,
            review_notes: plan.review_notes || '',
        });
    };

    const handleReview = async () => {
        if (!reviewData.status || reviewData.status === 'pending') {
            showError('يرجى اختيار حالة');
            return;
        }
        setSaving(true);
        try {
            await treatmentPlansAPI.review(reviewModal.id, reviewData);
            showSuccess('تم تحديث حالة الخطة بنجاح');
            setReviewModal(null);
            loadData();
        } catch (error) {
            console.error('Error reviewing:', error);
            const msg = error.response?.data?.message || 'فشل في تحديث الحالة';
            showError(msg);
            reportApiError(error, { url: `/api/treatment-plans/${reviewModal.id}/review`, method: 'PUT' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (plan) => {
        if (!window.confirm(`هل أنت متأكد من حذف خطة "${plan.plan_type}" المقدمة من ${plan.employee_name}؟`)) {
            return;
        }
        try {
            await treatmentPlansAPI.delete(plan.id);
            showSuccess('تم حذف الخطة بنجاح');
            loadData();
        } catch (error) {
            console.error('Error deleting:', error);
            const msg = error.response?.data?.message || 'فشل في حذف الخطة';
            showError(msg);
            reportApiError(error, { url: `/api/treatment-plans/${plan.id}`, method: 'DELETE' });
        }
    };

    const copyCollectionLink = () => {
        const link = `${window.location.origin}/treatment-plans`;
        navigator.clipboard.writeText(link).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="table-page tp-monitor">
            {/* Header */}
            <div className="table-page-header">
                <div className="tp-monitor-header-row">
                    <h1>الخطط العلاجية والتربوية</h1>
                    <button
                        className={`tp-copy-link-btn ${linkCopied ? 'copied' : ''}`}
                        onClick={copyCollectionLink}
                    >
                        {linkCopied ? '✓ تم النسخ' : '🔗 نسخ رابط صفحة التقديم'}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="tp-stats-grid">
                    <div className="tp-stat-card tp-stat-total">
                        <div className="tp-stat-number">{stats.total}</div>
                        <div className="tp-stat-label">إجمالي الخطط</div>
                    </div>
                    {stats.byStatus.map(s => (
                        <div
                            key={s.status}
                            className="tp-stat-card"
                            style={{ borderTopColor: STATUS_COLORS[s.status] || '#94a3b8' }}
                        >
                            <div className="tp-stat-number" style={{ color: STATUS_COLORS[s.status] }}>
                                {s.count}
                            </div>
                            <div className="tp-stat-label">{STATUS_LABELS[s.status] || s.status}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="tp-filters">
                <select name="status" value={filters.status} onChange={handleFilterChange}>
                    <option value="">كل الحالات</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>

                <select name="department" value={filters.department} onChange={handleFilterChange}>
                    <option value="">كل الأقسام</option>
                    {departments.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </select>

                <select name="job_title" value={filters.job_title} onChange={handleFilterChange}>
                    <option value="">كل المسميات</option>
                    {jobTitles.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>

                {stats?.byBranch && (
                    <select name="branch_id" value={filters.branch_id} onChange={handleFilterChange}>
                        <option value="">كل الفروع</option>
                        {stats.byBranch.map(b => (
                            <option key={b.branch_id} value={b.branch_id}>
                                {b.branch_name} ({b.count})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Table */}
            {loading ? (
                <div className="tp-loading-state">جاري التحميل...</div>
            ) : plans.length === 0 ? (
                <div className="tp-empty-state">
                    <div className="tp-empty-icon">📋</div>
                    <p>لا توجد خطط مقدمة {filters.status || filters.department ? 'بهذه الفلاتر' : 'حتى الآن'}</p>
                </div>
            ) : (
                <div className="tp-table-wrapper">
                    <table className="tp-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>الاسم</th>
                                <th>الفرع</th>
                                <th>المسمى الوظيفي</th>
                                <th>القسم</th>
                                <th>نوع الخطة</th>
                                <th>الملف</th>
                                <th>الحالة</th>
                                <th>تاريخ الإرسال</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map((plan, idx) => (
                                <tr key={plan.id}>
                                    <td>{idx + 1}</td>
                                    <td className="tp-cell-name">{plan.employee_name}</td>
                                    <td>{plan.branch_name}</td>
                                    <td>{plan.job_title}</td>
                                    <td className="tp-cell-dept">{plan.department}</td>
                                    <td>{plan.plan_type}</td>
                                    <td>
                                        <div className="tp-cell-file">
                                            <span className="tp-filename">{normalizeFilename(plan.original_filename)}</span>
                                            <span className="tp-filesize">{formatFileSize(plan.file_size)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span
                                            className="tp-status-badge"
                                            style={{
                                                background: `${STATUS_COLORS[plan.status]}18`,
                                                color: STATUS_COLORS[plan.status],
                                                borderColor: `${STATUS_COLORS[plan.status]}40`,
                                            }}
                                        >
                                            {STATUS_LABELS[plan.status] || plan.status}
                                        </span>
                                    </td>
                                    <td className="tp-cell-date">{formatDate(plan.created_at)}</td>
                                    <td>
                                        <div className="tp-actions">
                                            <button
                                                className="tp-action-btn tp-action-download"
                                                onClick={() => handleDownload(plan)}
                                                title="تحميل"
                                            >
                                                ⬇️
                                            </button>
                                            <button
                                                className="tp-action-btn tp-action-review"
                                                onClick={() => openReviewModal(plan)}
                                                title="مراجعة"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="tp-action-btn tp-action-delete"
                                                onClick={() => handleDelete(plan)}
                                                title="حذف"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Review Modal */}
            {reviewModal && (
                <div className="tp-modal-overlay" onClick={() => setReviewModal(null)}>
                    <div className="tp-modal" onClick={e => e.stopPropagation()}>
                        <div className="tp-modal-header">
                            <h3>مراجعة الخطة</h3>
                            <button className="tp-modal-close" onClick={() => setReviewModal(null)}>✕</button>
                        </div>
                        <div className="tp-modal-body">
                            <div className="tp-modal-info">
                                <div><strong>المقدم:</strong> {reviewModal.employee_name}</div>
                                <div><strong>الفرع:</strong> {reviewModal.branch_name}</div>
                                <div><strong>القسم:</strong> {reviewModal.department}</div>
                                <div><strong>نوع الخطة:</strong> {reviewModal.plan_type}</div>
                                <div><strong>الملف:</strong> {normalizeFilename(reviewModal.original_filename)}</div>
                                {reviewModal.notes && <div><strong>ملاحظات المقدم:</strong> {reviewModal.notes}</div>}
                            </div>

                            <div className="tp-modal-form">
                                <label>الحالة</label>
                                <select
                                    value={reviewData.status}
                                    onChange={e => setReviewData(prev => ({ ...prev, status: e.target.value }))}
                                >
                                    <option value="approved">معتمد ✅</option>
                                    <option value="reviewed">تمت المراجعة 📋</option>
                                    <option value="rejected">مرفوض ❌</option>
                                </select>

                                <label>ملاحظات المراجعة</label>
                                <textarea
                                    value={reviewData.review_notes}
                                    onChange={e => setReviewData(prev => ({ ...prev, review_notes: e.target.value }))}
                                    placeholder="أدخل ملاحظات المراجعة (اختياري)..."
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="tp-modal-footer">
                            <button className="tp-modal-cancel" onClick={() => setReviewModal(null)}>
                                إلغاء
                            </button>
                            <button
                                className="tp-modal-save"
                                onClick={handleReview}
                                disabled={saving}
                            >
                                {saving ? 'جاري الحفظ...' : 'حفظ المراجعة'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TreatmentPlanMonitor;

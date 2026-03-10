/**
 * Beneficiaries Page (المستفيدين)
 * - Branch managers: Add/edit/delete beneficiaries for their healthcare center
 * - Main managers: View all, filter, stats, export Excel, archive
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { beneficiariesAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './Beneficiaries.css';

const SERVICE_LABELS = {
    speech_therapy: 'نطق وتخاطب',
    physical_therapy: 'علاج طبيعي',
    occupational_therapy: 'علاج وظيفي',
    autism_therapy: 'علاج توحد',
    transport_service: 'خدمة نقل',
};

const ENROLLMENT_OPTIONS = ['صباحية', 'مسائية'];
const GENDER_OPTIONS = ['ذكر', 'أنثى'];
const AGE_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

const Beneficiaries = () => {
    const { isMainManager, user } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();

    // Data state
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTerm, setActiveTerm] = useState(null);
    const [branches, setBranches] = useState([]);
    const [terms, setTerms] = useState([]);
    const [stats, setStats] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState([]);
    const [branchStats, setBranchStats] = useState(null);

    // Filter state
    const [filters, setFilters] = useState({
        branch_id: '',
        term_id: '',
    });

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        beneficiary_number: '',
        enrollment_period: 'صباحية',
        beneficiary_name: '',
        civil_id: '',
        contact_number: '',
        gender: 'ذكر',
        age: '',
        speech_therapy: false,
        physical_therapy: false,
        occupational_therapy: false,
        autism_therapy: false,
        transport_service: false,
    });
    const [submitting, setSubmitting] = useState(false);

    // Confirm delete state
    const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, name: '' });

    // Stats view toggle
    const [showStats, setShowStats] = useState(false);

    // Inline edit mode: null | 'add' | beneficiary_id
    const [inlineMode, setInlineMode] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const inlineRowRef = useRef(null);

    // Detect mobile/desktop
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load initial data
    useEffect(() => {
        loadInitialData();
    }, []);

    // Reload when filters change
    useEffect(() => {
        if (!loading && (filters.term_id || activeTerm)) {
            loadBeneficiaries();
            if (isMainManager() && filters.term_id) {
                loadStats();
                loadSubmissionStatus();
            }
        }
    }, [filters.branch_id, filters.term_id]);

    const loadInitialData = async () => {
        try {
            setLoading(true);

            // Load active term
            const termRes = await beneficiariesAPI.getActiveTerm();
            const currentTerm = termRes.data.data;
            setActiveTerm(currentTerm);

            if (isMainManager()) {
                // Load branches (healthcare centers only) and all terms
                const [branchRes, termsRes] = await Promise.all([
                    branchesAPI.getAll(),
                    termsAPI.getAll({ branch_type: 'healthcare_center' })
                ]);

                const healthcareBranches = (branchRes.data.data || branchRes.data || [])
                    .filter(b => b.branch_type === 'healthcare_center' && b.is_active);
                setBranches(healthcareBranches);

                const allTerms = termsRes.data.data || termsRes.data || [];
                setTerms(allTerms);

                // Set default filter to active term
                if (currentTerm) {
                    setFilters(prev => ({ ...prev, term_id: currentTerm.id.toString() }));
                }
            } else {
                // Branch manager: just load their data for active term
                if (currentTerm) {
                    setFilters(prev => ({ ...prev, term_id: currentTerm.id.toString() }));
                }
            }

            // Load beneficiaries
            if (currentTerm) {
                await loadBeneficiariesForTerm(currentTerm.id);
                if (!isMainManager()) {
                    loadBranchStats(currentTerm.id);
                }
            }
        } catch (error) {
            showError('فشل في تحميل البيانات');
            console.error('Error loading initial data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadBeneficiaries = async () => {
        try {
            const params = {};
            if (filters.branch_id) params.branch_id = filters.branch_id;
            if (filters.term_id) params.term_id = filters.term_id;

            const res = await beneficiariesAPI.getAll(params);
            if (res.data.success) {
                setBeneficiaries(res.data.data || []);
            }
        } catch (error) {
            showError('فشل في تحميل المستفيدين');
        }
    };

    const loadBeneficiariesForTerm = async (termId) => {
        try {
            const params = { term_id: termId };
            const res = await beneficiariesAPI.getAll(params);
            if (res.data.success) {
                setBeneficiaries(res.data.data || []);
            }
        } catch (error) {
            showError('فشل في تحميل المستفيدين');
        }
    };

    const loadStats = async () => {
        try {
            const termId = filters.term_id;
            if (!termId) return;
            const res = await beneficiariesAPI.getStats({ term_id: termId });
            if (res.data.success) {
                setStats(res.data.data);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadBranchStats = async (termId) => {
        try {
            const res = await beneficiariesAPI.getBranchStats({ term_id: termId });
            if (res.data.success) {
                setBranchStats(res.data.data);
            }
        } catch (error) {
            console.error('Error loading branch stats:', error);
        }
    };

    const loadSubmissionStatus = async () => {
        try {
            const termId = filters.term_id;
            if (!termId) return;
            const res = await beneficiariesAPI.getSubmissionStatus({ term_id: termId });
            if (res.data.success) {
                setSubmissionStatus(res.data.data || []);
            }
        } catch (error) {
            console.error('Error loading submission status:', error);
        }
    };

    // Form handlers
    const resetForm = () => {
        setFormData({
            beneficiary_number: '',
            enrollment_period: 'صباحية',
            beneficiary_name: '',
            civil_id: '',
            contact_number: '',
            gender: 'ذكر',
            age: '',
            speech_therapy: false,
            physical_therapy: false,
            occupational_therapy: false,
            autism_therapy: false,
            transport_service: false,
        });
        setEditingId(null);
    };

    const cancelInline = () => {
        setInlineMode(null);
        resetForm();
    };

    const openAddModal = () => {
        resetForm();
        if (isMobile) {
            setShowModal(true);
        } else {
            setInlineMode('add');
            setTimeout(() => inlineRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    };

    const openEditModal = (beneficiary) => {
        setFormData({
            beneficiary_number: beneficiary.beneficiary_number || '',
            enrollment_period: beneficiary.enrollment_period,
            beneficiary_name: beneficiary.beneficiary_name,
            civil_id: beneficiary.civil_id,
            contact_number: beneficiary.contact_number,
            gender: beneficiary.gender,
            age: beneficiary.age.toString(),
            speech_therapy: beneficiary.speech_therapy,
            physical_therapy: beneficiary.physical_therapy,
            occupational_therapy: beneficiary.occupational_therapy,
            autism_therapy: beneficiary.autism_therapy,
            transport_service: beneficiary.transport_service,
        });
        setEditingId(beneficiary.id);
        if (isMobile) {
            setShowModal(true);
        } else {
            setInlineMode(beneficiary.id);
            setTimeout(() => inlineRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        // Validation
        if (!formData.beneficiary_number.trim() || !/^\d{6}$/.test(formData.beneficiary_number)) {
            return showWarning('رقم المستفيد يجب أن يكون 6 أرقام بالضبط');
        }
        if (!formData.beneficiary_name.trim()) {
            return showWarning('يجب إدخال اسم المستفيد');
        }
        if (!formData.civil_id.trim()) {
            return showWarning('يجب إدخال السجل المدني');
        }
        if (!formData.contact_number.trim()) {
            return showWarning('يجب إدخال رقم التواصل');
        }
        if (!formData.age) {
            return showWarning('يجب تحديد العمر');
        }

        try {
            setSubmitting(true);

            const data = {
                ...formData,
                age: parseInt(formData.age),
            };

            // For main manager creating for a specific branch
            if (isMainManager() && filters.branch_id) {
                data.branch_id = parseInt(filters.branch_id);
            }

            if (filters.term_id) {
                data.term_id = parseInt(filters.term_id);
            }

            if (editingId) {
                const res = await beneficiariesAPI.update(editingId, data);
                if (res.data.success) {
                    showSuccess('تم تحديث بيانات المستفيد بنجاح');
                }
            } else {
                const res = await beneficiariesAPI.create(data);
                if (res.data.success) {
                    showSuccess('تم إضافة المستفيد بنجاح');
                }
            }

            setShowModal(false);
            setInlineMode(null);
            resetForm();
            loadBeneficiaries();
            if (isMainManager()) loadStats();
            if (!isMainManager()) loadBranchStats(filters.term_id || activeTerm?.id);
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في حفظ البيانات';
            showError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await beneficiariesAPI.delete(deleteConfirm.id);
            showSuccess('تم حذف المستفيد بنجاح');
            setDeleteConfirm({ show: false, id: null, name: '' });
            loadBeneficiaries();
            if (isMainManager()) loadStats();
            if (!isMainManager()) loadBranchStats(filters.term_id || activeTerm?.id);
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في حذف المستفيد';
            showError(msg);
        }
    };

    const handleExport = async () => {
        try {
            const params = { term_id: filters.term_id };
            if (filters.branch_id) params.branch_id = filters.branch_id;

            const res = await beneficiariesAPI.exportExcel(params);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `beneficiaries-${filters.term_id}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showSuccess('تم تصدير البيانات بنجاح');
        } catch (error) {
            showError('فشل في تصدير البيانات');
        }
    };

    const handleArchive = async () => {
        if (!filters.term_id) return;
        if (!window.confirm('هل أنت متأكد من أرشفة بيانات هذا الفصل؟ لن يمكن التعديل عليها بعد الأرشفة.')) return;

        try {
            const res = await beneficiariesAPI.archiveTerm(filters.term_id);
            if (res.data.success) {
                showSuccess(res.data.message);
                loadBeneficiaries();
                loadStats();
            }
        } catch (error) {
            showError('فشل في أرشفة البيانات');
        }
    };

    // Can the current user add/edit/delete?
    const canEdit = activeTerm && (
        !filters.term_id || filters.term_id === activeTerm.id.toString()
    );

    if (loading) {
        return (
            <div className="beneficiaries-page">
                <div className="loading-container">
                    <div className="spinner-large"></div>
                    <p>جاري التحميل...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="beneficiaries-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-top">
                    <div>
                        <h1>المستفيدين</h1>
                        <p className="page-description">
                            {isMainManager()
                                ? 'إدارة ومتابعة بيانات المستفيدين في مراكز الرعاية الصحية'
                                : 'تسجيل بيانات المستفيدين والخدمات المقدمة لهم'}
                        </p>
                    </div>
                    <div className="header-actions">
                        {canEdit && (
                            <button className="btn btn-primary" onClick={openAddModal}>
                                + إضافة مستفيد
                            </button>
                        )}
                        {isMainManager() && filters.term_id && (
                            <>
                                <button className="btn btn-success" onClick={handleExport}>
                                    📥 تصدير Excel
                                </button>
                                <button className="btn btn-secondary" onClick={() => setShowStats(!showStats)}>
                                    {showStats ? '📋 عرض الجدول' : '📊 عرض الإحصائيات'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Term info */}
                {activeTerm && (
                    <div className="term-info-bar">
                        <span className="term-badge">
                            الفصل النشط: {activeTerm.term_name}
                        </span>
                    </div>
                )}
                {!activeTerm && (
                    <div className="no-term-warning">
                        ⚠️ لا يوجد فصل دراسي نشط حالياً لمراكز الرعاية الصحية
                    </div>
                )}
            </div>

            {/* Filters (Main Manager) */}
            {isMainManager() && (
                <div className="filters-section">
                    <div className="filters-row">
                        <div className="filter-group">
                            <label>الفرع</label>
                            <select
                                value={filters.branch_id}
                                onChange={(e) => setFilters(prev => ({ ...prev, branch_id: e.target.value }))}
                            >
                                <option value="">جميع الفروع</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.branch_name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>الفصل الدراسي</label>
                            <select
                                value={filters.term_id}
                                onChange={(e) => setFilters(prev => ({ ...prev, term_id: e.target.value }))}
                            >
                                <option value="">اختر الفصل</option>
                                {terms.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.term_name} {t.is_active ? '(نشط)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {filters.term_id && activeTerm && filters.term_id !== activeTerm.id.toString() && (
                            <button className="btn btn-warning btn-sm" onClick={handleArchive}>
                                📦 أرشفة هذا الفصل
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Branch Manager Summary */}
            {!isMainManager() && branchStats && (
                <div className="branch-summary">
                    <div className="summary-cards">
                        <div className="summary-card total">
                            <span className="summary-value">{branchStats.total || 0}</span>
                            <span className="summary-label">إجمالي المستفيدين</span>
                        </div>
                        <div className="summary-card male">
                            <span className="summary-value">{branchStats.male_count || 0}</span>
                            <span className="summary-label">ذكور</span>
                        </div>
                        <div className="summary-card female">
                            <span className="summary-value">{branchStats.female_count || 0}</span>
                            <span className="summary-label">إناث</span>
                        </div>
                        {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                            <div className="summary-card service" key={key}>
                                <span className="summary-value">{branchStats[`${key}_count`] || 0}</span>
                                <span className="summary-label">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Manager Stats View */}
            {isMainManager() && showStats && stats && (
                <div className="stats-dashboard">
                    {/* Overall Stats */}
                    <div className="stats-section">
                        <h2>إحصائيات عامة</h2>
                        <div className="stats-grid">
                            <div className="stat-card total">
                                <span className="stat-icon">👥</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.total || 0}</span>
                                    <span className="stat-label">إجمالي المستفيدين</span>
                                </div>
                            </div>
                            <div className="stat-card male">
                                <span className="stat-icon">👨</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.male_count || 0}</span>
                                    <span className="stat-label">ذكور</span>
                                </div>
                            </div>
                            <div className="stat-card female">
                                <span className="stat-icon">👩</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.female_count || 0}</span>
                                    <span className="stat-label">إناث</span>
                                </div>
                            </div>
                            <div className="stat-card morning">
                                <span className="stat-icon">🌅</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.morning_count || 0}</span>
                                    <span className="stat-label">فترة صباحية</span>
                                </div>
                            </div>
                            <div className="stat-card evening">
                                <span className="stat-icon">🌆</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.evening_count || 0}</span>
                                    <span className="stat-label">فترة مسائية</span>
                                </div>
                            </div>
                            <div className="stat-card avg-age">
                                <span className="stat-icon">📊</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.avg_age || '-'}</span>
                                    <span className="stat-label">متوسط العمر</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Service Stats */}
                    <div className="stats-section">
                        <h2>إحصائيات الخدمات</h2>
                        <div className="stats-grid">
                            {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                                <div className="stat-card service-stat" key={key}>
                                    <div className="stat-content">
                                        <span className="stat-value">{stats.totals?.[`${key}_count`] || 0}</span>
                                        <span className="stat-label">{label}</span>
                                    </div>
                                    <div className="stat-bar">
                                        <div
                                            className="stat-bar-fill"
                                            style={{
                                                width: stats.totals?.total
                                                    ? `${((stats.totals[`${key}_count`] || 0) / stats.totals.total) * 100}%`
                                                    : '0%'
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Per-branch breakdown */}
                    {stats.branchStats && stats.branchStats.length > 0 && (
                        <div className="stats-section">
                            <h2>توزيع المستفيدين حسب الفروع</h2>
                            <div className="table-wrapper">
                                <table className="data-table branch-stats-table">
                                    <thead>
                                        <tr>
                                            <th>الفرع</th>
                                            <th>الإجمالي</th>
                                            <th>ذكور</th>
                                            <th>إناث</th>
                                            <th>صباحية</th>
                                            <th>مسائية</th>
                                            {Object.values(SERVICE_LABELS).map(label => (
                                                <th key={label}>{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.branchStats.map(bs => (
                                            <tr key={bs.branch_id}>
                                                <td className="branch-name-cell">{bs.branch_name}</td>
                                                <td className="number-cell">{bs.total}</td>
                                                <td className="number-cell">{bs.male_count}</td>
                                                <td className="number-cell">{bs.female_count}</td>
                                                <td className="number-cell">{bs.morning_count}</td>
                                                <td className="number-cell">{bs.evening_count}</td>
                                                <td className="number-cell">{bs.speech_therapy_count}</td>
                                                <td className="number-cell">{bs.physical_therapy_count}</td>
                                                <td className="number-cell">{bs.occupational_therapy_count}</td>
                                                <td className="number-cell">{bs.autism_therapy_count}</td>
                                                <td className="number-cell">{bs.transport_service_count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Age distribution */}
                    {stats.ageDistribution && stats.ageDistribution.length > 0 && (
                        <div className="stats-section">
                            <h2>توزيع الأعمار</h2>
                            <div className="age-distribution">
                                {stats.ageDistribution.map(ad => (
                                    <div className="age-bar-group" key={ad.age_group}>
                                        <span className="age-label">{ad.age_group}</span>
                                        <div className="age-bar-container">
                                            <div
                                                className="age-bar-fill"
                                                style={{
                                                    width: stats.totals?.total
                                                        ? `${(parseInt(ad.count) / parseInt(stats.totals.total)) * 100}%`
                                                        : '0%'
                                                }}
                                            ></div>
                                        </div>
                                        <span className="age-count">{ad.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Service combination analysis */}
                    {stats.serviceCombinations && stats.serviceCombinations.length > 0 && (
                        <div className="stats-section">
                            <h2>عدد الخدمات لكل مستفيد</h2>
                            <div className="service-combo-grid">
                                {stats.serviceCombinations.map(sc => (
                                    <div className="combo-card" key={sc.service_count}>
                                        <span className="combo-count">{sc.beneficiary_count}</span>
                                        <span className="combo-label">
                                            {sc.service_count === 0
                                                ? 'بدون خدمات'
                                                : sc.service_count === 1
                                                    ? 'خدمة واحدة'
                                                    : sc.service_count === 2
                                                        ? 'خدمتان'
                                                        : `${sc.service_count} خدمات`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Submission Status */}
                    {submissionStatus.length > 0 && (
                        <div className="stats-section">
                            <h2>حالة إدخال البيانات</h2>
                            <div className="submission-grid">
                                {submissionStatus.map(ss => (
                                    <div
                                        className={`submission-card ${ss.has_submitted ? 'submitted' : 'not-submitted'}`}
                                        key={ss.branch_id}
                                    >
                                        <span className="submission-icon">{ss.has_submitted ? '✅' : '⏳'}</span>
                                        <span className="submission-branch">{ss.branch_name}</span>
                                        <span className="submission-count">
                                            {ss.has_submitted ? `${ss.beneficiary_count} مستفيد` : 'لم يتم الإدخال'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Data Table */}
            {(!isMainManager() || !showStats) && (
                <div className="table-section">
                    {beneficiaries.length === 0 && inlineMode !== 'add' ? (
                        <div className="empty-state">
                            <span className="empty-icon">📋</span>
                            <h3>لا توجد بيانات</h3>
                            <p>
                                {!activeTerm
                                    ? 'لا يوجد فصل دراسي نشط حالياً'
                                    : canEdit
                                        ? 'ابدأ بإضافة المستفيدين'
                                        : 'لا توجد بيانات مسجلة لهذا الفصل'}
                            </p>
                            {canEdit && activeTerm && (
                                <button className="btn btn-primary" onClick={openAddModal}>
                                    + إضافة مستفيد
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table beneficiaries-table">
                                <thead>
                                    <tr>
                                        <th>التسلسل</th>
                                        {isMainManager() && <th>الفرع</th>}
                                        <th>فترة الإلتحاق</th>
                                        <th>اسم المستفيد</th>
                                        <th>رقم المستفيد</th>
                                        <th>السجل المدني</th>
                                        <th>رقم التواصل</th>
                                        <th>الجنس</th>
                                        <th>العمر</th>
                                        <th>نطق وتخاطب</th>
                                        <th>علاج طبيعي</th>
                                        <th>علاج وظيفي</th>
                                        <th>علاج توحد</th>
                                        <th>خدمة نقل</th>
                                        {canEdit && <th>إجراءات</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Inline Add Row */}
                                    {inlineMode === 'add' && (
                                        <tr className="inline-form-row" ref={inlineRowRef}>
                                            <td className="number-cell">—</td>
                                            {isMainManager() && <td>—</td>}
                                            <td>
                                                <select
                                                    className="inline-input"
                                                    value={formData.enrollment_period}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, enrollment_period: e.target.value }))}
                                                >
                                                    {ENROLLMENT_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    className="inline-input"
                                                    type="text"
                                                    value={formData.beneficiary_name}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_name: e.target.value }))}
                                                    placeholder="اسم المستفيد"
                                                    autoFocus
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="inline-input"
                                                    type="text"
                                                    value={formData.beneficiary_number}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                        setFormData(prev => ({ ...prev, beneficiary_number: val }));
                                                    }}
                                                    placeholder="6 أرقام"
                                                    maxLength={6}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="inline-input"
                                                    type="text"
                                                    value={formData.civil_id}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, civil_id: e.target.value }))}
                                                    placeholder="السجل المدني"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="inline-input"
                                                    type="text"
                                                    value={formData.contact_number}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                                                    placeholder="05XXXXXXXX"
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    className="inline-input"
                                                    value={formData.gender}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                                                >
                                                    {GENDER_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <select
                                                    className="inline-input"
                                                    value={formData.age}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                                                >
                                                    <option value="">العمر</option>
                                                    {AGE_OPTIONS.map(age => (
                                                        <option key={age} value={age}>{age}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            {Object.keys(SERVICE_LABELS).map(key => (
                                                <td key={key}>
                                                    <select
                                                        className={`inline-input inline-service ${formData[key] ? 'active' : ''}`}
                                                        value={formData[key] ? 'true' : 'false'}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value === 'true' }))}
                                                    >
                                                        <option value="false">لا</option>
                                                        <option value="true">نعم</option>
                                                    </select>
                                                </td>
                                            ))}
                                            <td className="actions-cell inline-actions">
                                                <button
                                                    className="btn btn-sm btn-save"
                                                    onClick={handleSubmit}
                                                    disabled={submitting}
                                                    title="حفظ"
                                                >
                                                    {submitting ? '⏳' : '✅'}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-cancel"
                                                    onClick={cancelInline}
                                                    title="إلغاء"
                                                >
                                                    ❌
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                    {beneficiaries.map((b) => (
                                        inlineMode === b.id ? (
                                            /* Inline Edit Row */
                                            <tr key={b.id} className="inline-form-row" ref={inlineRowRef}>
                                                <td className="number-cell">{b.sequence_number}</td>
                                                {isMainManager() && <td className="branch-name-cell">{b.branch_name}</td>}
                                                <td>
                                                    <select
                                                        className="inline-input"
                                                        value={formData.enrollment_period}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, enrollment_period: e.target.value }))}
                                                    >
                                                        {ENROLLMENT_OPTIONS.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        className="inline-input"
                                                        type="text"
                                                        value={formData.beneficiary_name}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_name: e.target.value }))}
                                                        autoFocus
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="inline-input"
                                                        type="text"
                                                        value={formData.beneficiary_number}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                            setFormData(prev => ({ ...prev, beneficiary_number: val }));
                                                        }}
                                                        maxLength={6}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="inline-input"
                                                        type="text"
                                                        value={formData.civil_id}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, civil_id: e.target.value }))}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="inline-input"
                                                        type="text"
                                                        value={formData.contact_number}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="inline-input"
                                                        value={formData.gender}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                                                    >
                                                        {GENDER_OPTIONS.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        className="inline-input"
                                                        value={formData.age}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                                                    >
                                                        <option value="">العمر</option>
                                                        {AGE_OPTIONS.map(age => (
                                                            <option key={age} value={age}>{age}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                {Object.keys(SERVICE_LABELS).map(key => (
                                                    <td key={key}>
                                                        <select
                                                            className={`inline-input inline-service ${formData[key] ? 'active' : ''}`}
                                                            value={formData[key] ? 'true' : 'false'}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value === 'true' }))}
                                                        >
                                                            <option value="false">لا</option>
                                                            <option value="true">نعم</option>
                                                        </select>
                                                    </td>
                                                ))}
                                                <td className="actions-cell inline-actions">
                                                    <button
                                                        className="btn btn-sm btn-save"
                                                        onClick={handleSubmit}
                                                        disabled={submitting}
                                                        title="حفظ"
                                                    >
                                                        {submitting ? '⏳' : '✅'}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-cancel"
                                                        onClick={cancelInline}
                                                        title="إلغاء"
                                                    >
                                                        ❌
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            /* Normal Display Row */
                                            <tr key={b.id}>
                                                <td className="number-cell">{b.sequence_number}</td>
                                                {isMainManager() && <td className="branch-name-cell">{b.branch_name}</td>}
                                                <td>{b.enrollment_period}</td>
                                                <td className="name-cell">{b.beneficiary_name}</td>
                                                <td className="number-cell">{b.beneficiary_number}</td>
                                                <td className="number-cell">{b.civil_id}</td>
                                                <td className="number-cell">{b.contact_number}</td>
                                                <td>{b.gender}</td>
                                                <td className="number-cell">{b.age}</td>
                                                <td>
                                                    <span className={`service-badge ${b.speech_therapy ? 'yes' : 'no'}`}>
                                                        {b.speech_therapy ? 'نعم' : 'لا'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`service-badge ${b.physical_therapy ? 'yes' : 'no'}`}>
                                                        {b.physical_therapy ? 'نعم' : 'لا'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`service-badge ${b.occupational_therapy ? 'yes' : 'no'}`}>
                                                        {b.occupational_therapy ? 'نعم' : 'لا'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`service-badge ${b.autism_therapy ? 'yes' : 'no'}`}>
                                                        {b.autism_therapy ? 'نعم' : 'لا'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`service-badge ${b.transport_service ? 'yes' : 'no'}`}>
                                                        {b.transport_service ? 'نعم' : 'لا'}
                                                    </span>
                                                </td>
                                                {canEdit && (
                                                    <td className="actions-cell">
                                                        <button
                                                            className="btn btn-sm btn-edit"
                                                            onClick={() => openEditModal(b)}
                                                            title="تعديل"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-delete"
                                                            onClick={() => setDeleteConfirm({ show: true, id: b.id, name: b.beneficiary_name })}
                                                            title="حذف"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Add/Edit Modal (Mobile Only) */}
            {showModal && isMobile && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingId ? 'تعديل بيانات المستفيد' : 'إضافة مستفيد جديد'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>اسم المستفيد <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={formData.beneficiary_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_name: e.target.value }))}
                                        placeholder="ادخل اسم المستفيد الكامل"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>رقم المستفيد <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={formData.beneficiary_number}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                            setFormData(prev => ({ ...prev, beneficiary_number: val }));
                                        }}
                                        placeholder="أدخل 6 أرقام"
                                        maxLength={6}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>السجل المدني <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={formData.civil_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, civil_id: e.target.value }))}
                                        placeholder="أدخل رقم السجل المدني"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>رقم التواصل <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={formData.contact_number}
                                        onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                                        placeholder="05XXXXXXXX"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>فترة الإلتحاق <span className="required">*</span></label>
                                    <select
                                        value={formData.enrollment_period}
                                        onChange={(e) => setFormData(prev => ({ ...prev, enrollment_period: e.target.value }))}
                                        required
                                    >
                                        {ENROLLMENT_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>الجنس <span className="required">*</span></label>
                                    <select
                                        value={formData.gender}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                                        required
                                    >
                                        {GENDER_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>العمر <span className="required">*</span></label>
                                    <select
                                        value={formData.age}
                                        onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                                        required
                                    >
                                        <option value="">اختر العمر</option>
                                        {AGE_OPTIONS.map(age => (
                                            <option key={age} value={age}>{age}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Services Section */}
                            <div className="services-section">
                                <h3>الخدمات المقدمة</h3>
                                <div className="services-grid">
                                    {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                                        <div className="service-toggle" key={key}>
                                            <label className="toggle-label">
                                                <span className="toggle-text">{label}</span>
                                                <div className="toggle-wrapper">
                                                    <select
                                                        value={formData[key] ? 'true' : 'false'}
                                                        onChange={(e) => setFormData(prev => ({
                                                            ...prev,
                                                            [key]: e.target.value === 'true'
                                                        }))}
                                                        className={`service-select ${formData[key] ? 'active' : ''}`}
                                                    >
                                                        <option value="false">لا</option>
                                                        <option value="true">نعم</option>
                                                    </select>
                                                </div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? 'جاري الحفظ...' : editingId ? 'تحديث' : 'إضافة'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm.show && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm({ show: false, id: null, name: '' })}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>تأكيد الحذف</h2>
                        </div>
                        <div className="confirm-body">
                            <p>هل أنت متأكد من حذف المستفيد:</p>
                            <strong>{deleteConfirm.name}</strong>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-danger" onClick={handleDelete}>
                                حذف
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setDeleteConfirm({ show: false, id: null, name: '' })}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Beneficiaries;

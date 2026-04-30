/**
 * Beneficiaries Archive Page (أرشيف المستفيدين)
 * Main manager only - view archived beneficiary data by term/year
 * Read-only view with statistics and Excel export
 */

import { useState, useEffect } from 'react';
import { beneficiariesAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import './Beneficiaries.css';

const SERVICE_LABELS = {
    speech_therapy: 'نطق وتخاطب',
    physical_therapy: 'علاج طبيعي',
    occupational_therapy: 'علاج وظيفي',
    autism_therapy: 'علاج توحد',
    transport_service: 'خدمة نقل',
};

const BeneficiariesArchive = () => {
    const { user } = useAuth();
    const { showError, showSuccess } = useNotification();

    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [termsWithData, setTermsWithData] = useState([]);
    const [branches, setBranches] = useState([]);
    const [stats, setStats] = useState(null);
    const [showStats, setShowStats] = useState(false);

    const [filters, setFilters] = useState({
        term_id: '',
        branch_id: '',
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (filters.term_id) {
            loadArchivedData();
            loadArchivedStats();
        }
    }, [filters.term_id, filters.branch_id]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const [termsRes, branchRes] = await Promise.all([
                beneficiariesAPI.getTermsWithData(),
                branchesAPI.getAll()
            ]);

            const terms = termsRes.data.data || [];
            setTermsWithData(terms.filter(t => t.has_archived));

            const healthcareBranches = (branchRes.data.data || branchRes.data || [])
                .filter(b => b.branch_type === 'healthcare_center');
            setBranches(healthcareBranches);

            // Auto-select first archived term
            const archivedTerms = terms.filter(t => t.has_archived);
            if (archivedTerms.length > 0) {
                setFilters(prev => ({ ...prev, term_id: archivedTerms[0].id.toString() }));
            }
        } catch (error) {
            showError('فشل في تحميل البيانات');
        } finally {
            setLoading(false);
        }
    };

    const loadArchivedData = async () => {
        try {
            const params = { term_id: filters.term_id };
            if (filters.branch_id) params.branch_id = filters.branch_id;

            const res = await beneficiariesAPI.getArchive(params);
            if (res.data.success) {
                setBeneficiaries(res.data.data || []);
            }
        } catch (error) {
            showError('فشل في تحميل الأرشيف');
        }
    };

    const loadArchivedStats = async () => {
        try {
            // Use stats endpoint — archived data stats need term filter
            // Since archived data uses is_archived=true, we'll compute stats from loaded data
            const params = { term_id: filters.term_id };
            const res = await beneficiariesAPI.getStats(params);
            if (res.data.success) {
                setStats(res.data.data);
            }
        } catch (error) {
            console.error('Error loading archived stats:', error);
        }
    };

    const handleExport = async () => {
        try {
            const params = { term_id: filters.term_id, is_archived: 'true' };
            if (filters.branch_id) params.branch_id = filters.branch_id;

            const res = await beneficiariesAPI.exportExcel(params);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            downloadFile(blob, `beneficiaries-archive-${filters.term_id}.xlsx`);
            showSuccess('تم تصدير البيانات بنجاح');
        } catch (error) {
            showError('فشل في تصدير البيانات');
        }
    };

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
                        <h1>📦 أرشيف المستفيدين</h1>
                        <p className="page-description">عرض بيانات المستفيدين المؤرشفة من الفصول السابقة</p>
                    </div>
                    <div className="header-actions">
                        {filters.term_id && (
                            <>
                                <button className="btn btn-success" onClick={handleExport}>
                                    تصدير Excel
                                </button>
                                <button className="btn btn-secondary" onClick={() => setShowStats(!showStats)}>
                                    {showStats ? '📋 عرض الجدول' : '📊 عرض الإحصائيات'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-section">
                <div className="filters-row">
                    <div className="filter-group">
                        <label>الفصل الدراسي</label>
                        <select
                            value={filters.term_id}
                            onChange={(e) => setFilters(prev => ({ ...prev, term_id: e.target.value }))}
                        >
                            <option value="">اختر الفصل</option>
                            {termsWithData.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.term_name} ({t.beneficiary_count} مستفيد)
                                </option>
                            ))}
                        </select>
                    </div>
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
                </div>
            </div>

            {/* No data state */}
            {termsWithData.length === 0 && (
                <div className="empty-state">
                    <span className="empty-icon">📦</span>
                    <h3>لا توجد بيانات مؤرشفة</h3>
                    <p>لم تتم أرشفة أي بيانات مستفيدين بعد</p>
                </div>
            )}

            {/* Stats View */}
            {showStats && stats && (
                <div className="stats-dashboard">
                    <div className="stats-section">
                        <h2>إحصائيات مؤرشفة</h2>
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
                            {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                                <div className="stat-card service-stat" key={key}>
                                    <div className="stat-content">
                                        <span className="stat-value">{stats.totals?.[`${key}_count`] || 0}</span>
                                        <span className="stat-label">{label}</span>
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
                </div>
            )}

            {/* Data Table */}
            {!showStats && filters.term_id && (
                <div className="table-section">
                    {beneficiaries.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📋</span>
                            <h3>لا توجد بيانات مؤرشفة</h3>
                            <p>لا توجد بيانات مؤرشفة لهذا الفصل</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table beneficiaries-table">
                                <thead>
                                    <tr>
                                        <th>التسلسل</th>
                                        <th>الفرع</th>
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {beneficiaries.map((b) => (
                                        <tr key={b.id}>
                                            <td className="number-cell">{b.sequence_number}</td>
                                            <td className="branch-name-cell">{b.branch_name}</td>
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
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BeneficiariesArchive;

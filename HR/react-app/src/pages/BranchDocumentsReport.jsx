/**
 * Branch Documents Report Page
 * Shows statistics about branch documents with expiration dates
 * Can generate PDF reports in 2 types: Stats and Documents
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { branchDocumentsAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { API_URL } from '../config/api';
import { downloadFile } from '../utils/downloadFile';
import './BranchDocumentsReport.css';

const BranchDocumentsReport = () => {
    const { isMainManager } = useAuth();
    const { showError, showSuccess } = useNotification();

    const [documents, setDocuments] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [selectedBranches, setSelectedBranches] = useState([]);
    const [daysThreshold, setDaysThreshold] = useState(30);
    const [showBranchesDropdown, setShowBranchesDropdown] = useState(false);
    const [branchesFilter, setBranchesFilter] = useState('');
    const branchesDropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (branchesDropdownRef.current && !branchesDropdownRef.current.contains(event.target)) {
                setShowBranchesDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load data
    useEffect(() => {
        if (!isMainManager()) return;
        loadData();
    }, [isMainManager]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [docsRes, branchesRes] = await Promise.all([
                branchDocumentsAPI.getAll(),
                branchesAPI.getAll(),
            ]);
            // Ensure documents is an array
            const docsArray = Array.isArray(docsRes?.data) ? docsRes.data : (docsRes?.data?.data || []);
            const branchesArray = Array.isArray(branchesRes?.data) ? branchesRes.data : (branchesRes?.data?.data || []);

            setDocuments(docsArray);
            setBranches(branchesArray);
        } catch (err) {
            showError('فشل تحميل البيانات');
            console.error(err);
            setDocuments([]);
            setBranches([]);
        } finally {
            setLoading(false);
        }
    };

    // Calculate expiration statistics
    const expirationStats = useMemo(() => {
        const now = new Date();
        const stats = {
            total: 0,
            expiredCount: 0,
            expiringCount: 0,
            byBranch: {},
            expiredDocs: [],
            expiringDocs: [],
        };

        // Ensure documents is an array
        if (!Array.isArray(documents)) {
            return stats;
        }

        stats.total = documents.length;

        documents.forEach(doc => {
            const expiryDate = doc.expiry_date ? new Date(doc.expiry_date) : null;
            if (!expiryDate) return;

            const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            const branchId = doc.branch_id;

            // Initialize branch stats
            if (!stats.byBranch[branchId]) {
                stats.byBranch[branchId] = {
                    total: 0,
                    expired: 0,
                    expiring: 0,
                };
            }
            stats.byBranch[branchId].total++;

            if (daysUntilExpiry < 0) {
                stats.expiredCount++;
                stats.byBranch[branchId].expired++;
                stats.expiredDocs.push({
                    ...doc,
                    daysUntilExpiry,
                });
            } else if (daysUntilExpiry <= daysThreshold) {
                stats.expiringCount++;
                stats.byBranch[branchId].expiring++;
                stats.expiringDocs.push({
                    ...doc,
                    daysUntilExpiry,
                });
            }
        });

        return stats;
    }, [documents, daysThreshold]);

    // Filter branches for dropdown
    const filteredBranchesForDropdown = useMemo(() => {
        if (!Array.isArray(branches)) return [];
        return branches.filter(b => b.branch_name.includes(branchesFilter));
    }, [branches, branchesFilter]);

    // Filter documents based on selected branches
    const filteredDocuments = useMemo(() => {
        if (selectedBranches.length === 0) {
            return [...expirationStats.expiredDocs, ...expirationStats.expiringDocs].sort(
                (a, b) => a.daysUntilExpiry - b.daysUntilExpiry
            );
        }
        return [
            ...expirationStats.expiredDocs.filter(d => selectedBranches.includes(d.branch_id)),
            ...expirationStats.expiringDocs.filter(d => selectedBranches.includes(d.branch_id)),
        ].sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    }, [expirationStats, selectedBranches]);

    // Generate Stats PDF via API
    const generateStatsPDF = async () => {
        if (expirationStats.expiredCount === 0 && expirationStats.expiringCount === 0) {
            showError('لا توجد مستندات منتهية أو قريبة الانتهاء');
            return;
        }

        try {
            setGenerating(true);
            const token = localStorage.getItem('token');
            const branchIds = selectedBranches.length > 0 ? selectedBranches : (Array.isArray(branches) ? branches.map(b => b.id) : []);

            const response = await fetch(`${API_URL}/api/branch-documents/generate-pdf-stats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branch_ids: branchIds,
                    days_threshold: daysThreshold,
                }),
            });

            if (!response.ok) {
                throw new Error('فشل في إنشاء التقرير');
            }

            const blob = await response.blob();
            downloadFile(blob, `تقرير-مستندات-الفروع-${formatDate(new Date())}.pdf`);
            showSuccess('تم إنشاء التقرير بنجاح');
        } catch (err) {
            showError('فشل في إنشاء التقرير');
            console.error(err);
        } finally {
            setGenerating(false);
        }
    };

    // Generate Documents PDF via API
    const generateDocumentsPDF = async () => {
        if (filteredDocuments.length === 0) {
            showError('لا توجد مستندات لإنشاء التقرير');
            return;
        }

        try {
            setGenerating(true);
            const token = localStorage.getItem('token');
            const branchIds = selectedBranches.length > 0 ? selectedBranches : (Array.isArray(branches) ? branches.map(b => b.id) : []);

            const response = await fetch(`${API_URL}/api/branch-documents/generate-pdf-documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branch_ids: branchIds,
                    days_threshold: daysThreshold,
                }),
            });

            if (!response.ok) {
                throw new Error('فشل في إنشاء التقرير');
            }

            const blob = await response.blob();
            downloadFile(blob, `مستندات-الفروع-${formatDate(new Date())}.pdf`);
            showSuccess('تم إنشاء التقرير بنجاح');
        } catch (err) {
            showError('فشل في إنشاء التقرير');
            console.error(err);
        } finally {
            setGenerating(false);
        }
    };

    const toggleBranch = (branchId) => {
        setSelectedBranches(prev => {
            if (prev.includes(branchId)) {
                return prev.filter(id => id !== branchId);
            } else {
                return [...prev, branchId];
            }
        });
    };

    // Document type labels in Arabic
    const documentTypeLabels = {
        license: 'الترخيص',
        permit: 'التصريح',
        insurance: 'التأمين',
        insurance_print: 'كشف التأمينات',
        contract: 'العقد',
        rental_contract: 'عقد الايجار',
        registration: 'السجل التجاري',
        security_contract: 'عقد الامن والسلامة',
        civil_defense_certificate: 'شهادة الدفاع المدني',
        municipality_certificate: 'شهادة بلدي',
        insurance_certificate: 'شهادة التامينات',
        insurance_statement: 'كشف التأمينات',
        operational_plan: 'الخطة التشغلية',
        owner_civil_id_copy: 'نسخة هوية المالك',
        disclosure_commitment: 'إفصاح وتعهد',
        certification_commitment_form: 'نموذج تصديق وتعاقد',
        financial_platform_declaration: 'ملف إقرار المنصة المالية',
        financial_claim_form: 'نموذج مطالبة مالية',
        student_cadre_file: 'بيانات الطلاب',
        dropped_students: 'الطلاب المنقطعين',
        free_seats: 'المقاعد المتاحة',
        acceptance_notifications: 'إشعارات القبول',
        // NOTE: payroll_file removed - users enter payroll data directly, not upload files
    };

    // Helper to get document type label in Arabic
    const getDocumentTypeLabel = (docType) => {
        return documentTypeLabels[docType] || docType;
    };

    // Helper to get branch name
    const getBranchName = (branchId) => {
        if (!Array.isArray(branches)) return 'غير محدد';
        return branches.find(b => b.id === branchId)?.branch_name || 'غير محدد';
    };

    if (!isMainManager()) {
        return (
            <div className="branch-documents-report-page">
                <h1>غير مصرح</h1>
                <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="branch-documents-report-page">
                <div className="loading">جاري التحميل...</div>
            </div>
        );
    }

    return (
        <div className="branch-documents-report-page">
            <div className="page-header">
                <h1>تقرير مستندات الفروع</h1>
                <p className="subtitle">عرض المستندات المنتهية والقريبة من الانتهاء وتوليد التقارير</p>
            </div>

            {/* Filters Section */}
            <div className="filters-section">
                <div className="filters-header">
                    <h3>🔍 تصفية وبحث</h3>
                    {selectedBranches.length > 0 && (
                        <button
                            className="clear-filters-btn"
                            onClick={() => setSelectedBranches([])}
                        >
                            ✕ إزالة التصفية
                        </button>
                    )}
                </div>

                <div className="filters-content">
                    <div className="filter-group">
                        <label>
                            <span className="filter-icon">⏱️</span>
                            عتبة الانتهاء (بالأيام)
                        </label>
                        <div className="input-with-icon">
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={daysThreshold}
                                onChange={e => setDaysThreshold(Math.max(1, parseInt(e.target.value) || 30))}
                                className="filter-input"
                            />
                            <span className="input-suffix">يوم</span>
                        </div>
                    </div>

                    <div className="filter-group" ref={branchesDropdownRef}>
                        <label>
                            <span className="filter-icon">🏢</span>
                            اختيار الفروع
                        </label>
                        <button
                            className="filter-button"
                            onClick={() => setShowBranchesDropdown(!showBranchesDropdown)}
                        >
                            <span className="button-content">
                                {selectedBranches.length > 0 ? (
                                    <>
                                        <span className="selected-count">{selectedBranches.length}</span>
                                        فروع محددة
                                    </>
                                ) : (
                                    'جميع الفروع'
                                )}
                            </span>
                            <span className={`dropdown-arrow ${showBranchesDropdown ? 'open' : ''}`}>▼</span>
                        </button>
                        {showBranchesDropdown && (
                            <div className="filter-dropdown-wrapper">
                                <div className="dropdown-header">
                                    <input
                                        type="text"
                                        placeholder="🔍 ابحث عن فرع..."
                                        value={branchesFilter}
                                        onChange={e => setBranchesFilter(e.target.value)}
                                        className="filter-search-input"
                                        autoFocus
                                    />
                                </div>
                                <div className="filter-dropdown-menu">
                                    {filteredBranchesForDropdown.length > 0 ? (
                                        filteredBranchesForDropdown.map(branch => (
                                            <label key={branch.id} className="dropdown-checkbox-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedBranches.includes(branch.id)}
                                                    onChange={() => toggleBranch(branch.id)}
                                                />
                                                <span className="branch-item-text">{branch.branch_name}</span>
                                                {selectedBranches.includes(branch.id) && (
                                                    <span className="check-icon">✓</span>
                                                )}
                                            </label>
                                        ))
                                    ) : (
                                        <div className="empty-filter-message">
                                            <span className="empty-icon">🔍</span>
                                            <span>لا توجد فروع مطابقة</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="stats-section">
                <div className="stat-card total">
                    <div className="stat-icon">📊</div>
                    <div className="stat-content">
                        <div className="stat-label">إجمالي المستندات</div>
                        <div className="stat-value">{expirationStats.total}</div>
                    </div>
                </div>

                <div className="stat-card expired">
                    <div className="stat-icon">❌</div>
                    <div className="stat-content">
                        <div className="stat-label">مستندات منتهية</div>
                        <div className="stat-value">{expirationStats.expiredCount}</div>
                    </div>
                </div>

                <div className="stat-card expiring">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-content">
                        <div className="stat-label">قريبة الانتهاء</div>
                        <div className="stat-value">{expirationStats.expiringCount}</div>
                    </div>
                </div>
            </div>

            {/* PDF Generation Section */}
            <div className="pdf-section">
                <h2>توليد التقارير</h2>
                <div className="pdf-buttons">
                    <button
                        className="btn btn-stats"
                        onClick={generateStatsPDF}
                        disabled={generating || (expirationStats.expiredCount === 0 && expirationStats.expiringCount === 0)}
                    >
                        {generating ? 'جاري الإنشاء...' : '📊 تقرير الإحصائيات'}
                    </button>
                    <button
                        className="btn btn-documents"
                        onClick={generateDocumentsPDF}
                        disabled={generating || filteredDocuments.length === 0}
                    >
                        {generating ? 'جاري الإنشاء...' : '📄 تقرير المستندات'}
                    </button>
                </div>
            </div>

            {/* Documents List */}
            <div className="documents-section">
                <h2>المستندات المنتهية والقريبة من الانتهاء ({filteredDocuments.length})</h2>

                {filteredDocuments.length === 0 ? (
                    <div className="empty-state">
                        <p>لا توجد مستندات منتهية أو قريبة من الانتهاء</p>
                    </div>
                ) : (
                    <div className="documents-cards-grid">
                        {filteredDocuments.map((doc, idx) => (
                            <div key={idx} className={`document-card ${doc.daysUntilExpiry < 0 ? 'expired' : 'expiring'}`}>
                                <div className="document-card-header">
                                    <span className={`status-badge ${doc.daysUntilExpiry < 0 ? 'expired' : 'expiring'}`}>
                                        {doc.daysUntilExpiry < 0 ? 'منتهي' : 'قريب الانتهاء'}
                                    </span>
                                    <div className="branch-name">{getBranchName(doc.branch_id)}</div>
                                </div>

                                <div className="document-card-body">
                                    <div className="document-field">
                                        <span className="field-label">نوع المستند:</span>
                                        <span className="field-value">{getDocumentTypeLabel(doc.document_type)}</span>
                                    </div>

                                    <div className="document-field">
                                        <span className="field-label">رقم المستند:</span>
                                        <span className="field-value">{doc.document_number || '-'}</span>
                                    </div>

                                    <div className="document-dates">
                                        <div className="date-item">
                                            <span className="date-label">تاريخ الإصدار</span>
                                            <span className="date-value">
                                                {doc.issue_date ? formatDate(new Date(doc.issue_date)) : '-'}
                                            </span>
                                        </div>
                                        <div className="date-divider">→</div>
                                        <div className="date-item">
                                            <span className="date-label">تاريخ الانتهاء</span>
                                            <span className="date-value">
                                                {doc.expiry_date ? formatDate(new Date(doc.expiry_date)) : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="document-card-footer">
                                    <div className={`days-remaining ${doc.daysUntilExpiry < 0 ? 'danger' : 'warning'}`}>
                                        {doc.daysUntilExpiry < 0 ?
                                            `متأخر ${Math.abs(doc.daysUntilExpiry)} يوم` :
                                            `${doc.daysUntilExpiry} يوم متبقي`
                                        }
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchDocumentsReport;

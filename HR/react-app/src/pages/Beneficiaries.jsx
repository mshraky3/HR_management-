/**
 * Beneficiaries Page (المستفيدين)
 * - Branch managers: Add/edit/delete beneficiaries for their healthcare center
 * - Main managers: View all, filter, stats, export Excel, archive
 */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { beneficiariesAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import SearchableSelect from '../components/SearchableSelect';
import { downloadFile } from '../utils/downloadFile';
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
    const navigate = useNavigate();

    // School branches should not access this page
    useEffect(() => {
        if (user?.branch_type === 'school') {
            navigate('/dashboard', { replace: true });
        }
    }, [user?.branch_type, navigate]);

    // Data state
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTerm, setActiveTerm] = useState(null);
    const [branches, setBranches] = useState([]);
    const [terms, setTerms] = useState([]);
    const [stats, setStats] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState([]);
    const [branchStats, setBranchStats] = useState(null);
    const [staffingData, setStaffingData] = useState([]);
    const [staffingLoading, setStaffingLoading] = useState(false);

    // Staffing calculation toggles (main manager only)
    const [includeFreeStudents, setIncludeFreeStudents] = useState(false);
    const [mergeTherapy, setMergeTherapy] = useState(false);

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
        free_student: false,
        notes: '',
    });
    const [submitting, setSubmitting] = useState(false);

    // Confirm delete state
    const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, name: '' });

    // Main manager active tab: 'staffing' | 'data' | 'stats' | 'exports'
    const [activeTab, setActiveTab] = useState('staffing');
    const [exportColumns, setExportColumns] = useState({
        sequence_number: true,
        enrollment_period: true,
        beneficiary_name: true,
        beneficiary_number: true,
        civil_id: true,
        contact_number: true,
        gender: true,
        age: true,
        speech_therapy: true,
        physical_therapy: true,
        occupational_therapy: true,
        autism_therapy: true,
        transport_service: true,
        notes: true,
        branch_name: false,
        free_student: false,
    });

    const [staffingBranchFilter, setStaffingBranchFilter] = useState('');
    const [staffingSearch, setStaffingSearch] = useState('');

    // Copy from previous term state
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copySourceTerm, setCopySourceTerm] = useState('');
    const [copying, setCopying] = useState(false);
    const [availableCopyTerms, setAvailableCopyTerms] = useState([]);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');

    // Import from bus state
    const [showImportModal, setShowImportModal] = useState(false);
    const [busStudents, setBusStudents] = useState([]);
    const [loadingBusStudents, setLoadingBusStudents] = useState(false);
    const [importedFromBus, setImportedFromBus] = useState(false);

    // Bus assignment state
    const [showBusAssignModal, setShowBusAssignModal] = useState(false);
    const [availableBuses, setAvailableBuses] = useState([]);
    const [loadingBuses, setLoadingBuses] = useState(false);
    const [assigningBeneficiaryId, setAssigningBeneficiaryId] = useState(null);
    const [assigningBus, setAssigningBus] = useState(false);

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
                loadStaffingRequirements();
            }
        }
    }, [filters.branch_id, filters.term_id, includeFreeStudents, mergeTherapy]);

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

            // Load beneficiaries and main manager data
            if (currentTerm) {
                await loadBeneficiariesForTerm(currentTerm.id);
                if (isMainManager()) {
                    // Load staffing/stats directly — don't rely on useEffect (race condition with loading flag)
                    const termId = currentTerm.id.toString();
                    Promise.all([
                        beneficiariesAPI.getStaffingRequirements({ term_id: termId, include_free: includeFreeStudents, merge_therapy: mergeTherapy }).then(r => { if (r.data.success) setStaffingData(r.data.data || []); }),
                        beneficiariesAPI.getStats({ term_id: termId, include_free: includeFreeStudents }).then(r => { if (r.data.success) setStats(r.data.data); }),
                        beneficiariesAPI.getSubmissionStatus({ term_id: termId, include_free: includeFreeStudents }).then(r => { if (r.data.success) setSubmissionStatus(r.data.data || []); }),
                    ]).catch(err => console.error('Error loading main manager data:', err));
                } else {
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

    const loadStaffingRequirements = async () => {
        try {
            const termId = filters.term_id;
            if (!termId) return;
            setStaffingLoading(true);
            const res = await beneficiariesAPI.getStaffingRequirements({ term_id: termId, include_free: includeFreeStudents, merge_therapy: mergeTherapy });
            if (res.data.success) {
                setStaffingData(res.data.data || []);
            }
        } catch (error) {
            console.error('Error loading staffing requirements:', error);
        } finally {
            setStaffingLoading(false);
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
            const res = await beneficiariesAPI.getSubmissionStatus({ term_id: termId, include_free: includeFreeStudents });
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
            free_student: false,
            notes: '',
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
            free_student: beneficiary.free_student || false,
            notes: beneficiary.notes || '',
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
        if (!formData.beneficiary_number.trim() || !/^\d{6,7}$/.test(formData.beneficiary_number)) {
            return showWarning('رقم المستفيد يجب أن يكون 6 أو 7 أرقام');
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
                    // If transport_service is enabled and NOT imported from bus, prompt bus assignment
                    if (data.transport_service && res.data.data?.id && !importedFromBus) {
                        promptBusAssignment(res.data.data.id);
                    }
                }
            }

            setShowModal(false);
            setInlineMode(null);
            resetForm();
            setImportedFromBus(false);
            loadBeneficiaries();
            if (isMainManager()) { loadStats(); loadStaffingRequirements(); }
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
            if (isMainManager()) { loadStats(); loadStaffingRequirements(); }
            if (!isMainManager()) loadBranchStats(filters.term_id || activeTerm?.id);
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في حذف المستفيد';
            showError(msg);
        }
    };

    const handleExport = async (customColumns) => {
        try {
            const params = { term_id: filters.term_id };
            if (filters.branch_id) params.branch_id = filters.branch_id;
            // Pass selected columns
            const cols = customColumns || Object.keys(exportColumns).filter(k => exportColumns[k]);
            if (cols.length > 0) params.columns = cols.join(',');

            const res = await beneficiariesAPI.exportExcel(params);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            downloadFile(blob, `beneficiaries-${filters.term_id}.xlsx`);
            showSuccess('تم تصدير البيانات بنجاح');
        } catch (error) {
            showError('فشل في تصدير البيانات');
        }
    };

    const handleStaffingExport = () => {
        if (!staffingData.length) return;
        const selectedId = staffingBranchFilter || staffingData[0]?.branch_id?.toString();
        const filteredData = selectedId
            ? staffingData.filter(b => b.branch_id.toString() === selectedId)
            : staffingData;
        // Build CSV rows
        const BOM = '\uFEFF';
        const headers = ['الفرع', 'عدد المستفيدين', 'الوظيفة', 'المطلوب', 'الموجود', 'النقص', 'الفائض', 'القاعدة'];
        const rows = [headers.join(',')];
        for (const branch of filteredData) {
            for (const s of branch.staffing.filter(s => s.required > 0)) {
                rows.push([
                    `"${branch.branch_name}"`,
                    branch.total_beneficiaries,
                    `"${s.role}"`,
                    s.required,
                    s.current,
                    s.deficit,
                    s.surplus,
                    `"${s.rule}"`
                ].join(','));
            }
        }
        const blob = new Blob([BOM + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, `staffing-requirements-${filters.term_id}.csv`);
        showSuccess('تم تصدير متطلبات التوظيف بنجاح');
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
                loadStaffingRequirements();
            }
        } catch (error) {
            showError('فشل في أرشفة البيانات');
        }
    };

    // Copy from previous term
    const openCopyModal = async () => {
        try {
            const res = await beneficiariesAPI.getTermsWithData();
            const termsWithData = res.data.data || res.data || [];
            // Exclude current active term
            const filtered = termsWithData.filter(t => activeTerm && t.id !== activeTerm.id);
            setAvailableCopyTerms(filtered);
            setCopySourceTerm('');
            setShowCopyModal(true);
        } catch {
            showError('فشل في تحميل الفصول المتاحة للنسخ');
        }
    };

    const handleCopyFromTerm = async () => {
        if (!copySourceTerm) {
            showWarning('يرجى اختيار الفصل المصدر');
            return;
        }
        try {
            setCopying(true);
            const data = { source_term_id: copySourceTerm };
            if (isMainManager() && filters.branch_id) {
                data.branch_id = filters.branch_id;
            }
            const res = await beneficiariesAPI.copyFromTerm(data);
            if (res.data.success) {
                showSuccess(res.data.message);
                setShowCopyModal(false);
                loadBeneficiaries();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في نسخ المستفيدين');
        } finally {
            setCopying(false);
        }
    };

    // Import from bus handlers
    const openImportModal = async () => {
        try {
            setLoadingBusStudents(true);
            setShowImportModal(true);
            const res = await beneficiariesAPI.getBusStudents();
            setBusStudents(res.data.data || []);
        } catch {
            showError('فشل في تحميل بيانات طلاب الباص');
        } finally {
            setLoadingBusStudents(false);
        }
    };

    const handleImportStudent = (student) => {
        resetForm();
        setImportedFromBus(true);
        setFormData(prev => ({
            ...prev,
            beneficiary_name: student.student_full_name || '',
            contact_number: student.contact_mobile_number || '',
            transport_service: true,
        }));
        setShowImportModal(false);
        if (isMobile) {
            setShowModal(true);
        } else {
            setInlineMode('add');
            setTimeout(() => inlineRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    };

    // Bus assignment handlers
    const promptBusAssignment = async (beneficiaryId) => {
        try {
            setLoadingBuses(true);
            setAssigningBeneficiaryId(beneficiaryId);
            const res = await beneficiariesAPI.getAvailableBuses();
            const buses = res.data.data || [];
            if (buses.length === 0) {
                return; // No buses available, skip silently
            }
            setAvailableBuses(buses);
            setShowBusAssignModal(true);
        } catch {
            // Don't show error — bus assignment is optional
        } finally {
            setLoadingBuses(false);
        }
    };

    const handleAssignBus = async (busId) => {
        if (!assigningBeneficiaryId || !busId) return;
        try {
            setAssigningBus(true);
            const res = await beneficiariesAPI.assignToBus(assigningBeneficiaryId, { bus_id: busId });
            if (res.data.success) {
                showSuccess('تم تسجيل المستفيد في الباص بنجاح');
            }
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في تسجيل المستفيد في الباص';
            showError(msg);
        } finally {
            setAssigningBus(false);
            setShowBusAssignModal(false);
            setAssigningBeneficiaryId(null);
        }
    };

    const skipBusAssignment = () => {
        setShowBusAssignModal(false);
        setAssigningBeneficiaryId(null);
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
                                ? 'إدارة ومتابعة بيانات المستفيدين ومتطلبات التوظيف'
                                : 'تسجيل بيانات المستفيدين والخدمات المقدمة لهم'}
                        </p>
                    </div>
                    <div className="header-actions">
                        {canEdit && !isMainManager() && (
                            <>
                                <button className="btn btn-primary" onClick={openAddModal}>
                                    + إضافة مستفيد
                                </button>
                                <button className="btn btn-info" onClick={openImportModal}>
                                    🚌 استيراد من الباص
                                </button>
                                <button className="btn btn-secondary" onClick={openCopyModal}>
                                    نسخ من فصل سابق
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Term info */}
                {!isMainManager() && activeTerm && (
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

            {/* Main Manager: Filters + Tabs */}
            {isMainManager() && (
                <>
                    <div className="mm-controls">
                        <div className="mm-filters">
                            <div className="filter-group">
                                <label>الفصل الدراسي</label>
                                <SearchableSelect
                                    value={filters.term_id}
                                    onChange={(val) => setFilters(prev => ({ ...prev, term_id: val }))}
                                    placeholder="اختر الفصل"
                                    options={[
                                        { value: '', label: 'اختر الفصل' },
                                        ...terms.map(t => ({ value: t.id.toString(), label: `${t.term_name} ${activeTerm && t.id === activeTerm.id ? '(نشط)' : ''}` }))
                                    ]}
                                />
                            </div>
                            {activeTab !== 'staffing' && (
                                <div className="filter-group">
                                    <label>الفرع</label>
                                    <SearchableSelect
                                        value={filters.branch_id}
                                        onChange={(val) => setFilters(prev => ({ ...prev, branch_id: val }))}
                                        placeholder="جميع الفروع"
                                        options={[
                                            { value: '', label: 'جميع الفروع' },
                                            ...branches.map(b => ({ value: b.id.toString(), label: b.branch_name }))
                                        ]}
                                    />
                                </div>
                            )}
                            {filters.term_id && activeTerm && filters.term_id !== activeTerm.id.toString() && (
                                <button className="btn btn-warning btn-sm" onClick={handleArchive}>
                                    📦 أرشفة هذا الفصل
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mm-tabs">
                        <button
                            className={`mm-tab ${activeTab === 'staffing' ? 'active' : ''}`}
                            onClick={() => setActiveTab('staffing')}
                        >
                            📋 متطلبات التوظيف
                        </button>
                        <button
                            className={`mm-tab ${activeTab === 'data' ? 'active' : ''}`}
                            onClick={() => setActiveTab('data')}
                        >
                            📄 بيانات المستفيدين
                        </button>
                        <button
                            className={`mm-tab ${activeTab === 'stats' ? 'active' : ''}`}
                            onClick={() => setActiveTab('stats')}
                        >
                            📊 الإحصائيات
                        </button>
                        <button
                            className={`mm-tab ${activeTab === 'exports' ? 'active' : ''}`}
                            onClick={() => setActiveTab('exports')}
                        >
                            📥 التصدير
                        </button>
                    </div>
                </>
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
            {isMainManager() && activeTab === 'stats' && stats && (
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
                            <div className="stat-card paid">
                                <span className="stat-icon">💰</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.paid_student_count || 0}</span>
                                    <span className="stat-label">مستفيدين مدفوعين</span>
                                </div>
                            </div>
                            <div className="stat-card free">
                                <span className="stat-icon">🎓</span>
                                <div className="stat-content">
                                    <span className="stat-value">{stats.totals?.free_student_count || 0}</span>
                                    <span className="stat-label">مستفيدين مجانيين</span>
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
                                            <th>مدفوع</th>
                                            <th>مجاني</th>
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
                                                <td className="number-cell">{bs.paid_student_count}</td>
                                                <td className="number-cell">{bs.free_student_count}</td>
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

            {/* Staffing Controls (shared across all staffing states) */}
            {isMainManager() && activeTab === 'staffing' && filters.term_id && (
                <div className="sf-controls">
                    <button
                        className={`sf-toggle-btn ${includeFreeStudents ? 'active' : ''}`}
                        onClick={() => setIncludeFreeStudents(prev => !prev)}
                    >
                        {includeFreeStudents ? '✅' : '⬜'} تضمين الطلاب المجانيين
                    </button>
                    <button
                        className={`sf-toggle-btn ${mergeTherapy ? 'active' : ''}`}
                        onClick={() => setMergeTherapy(prev => !prev)}
                    >
                        {mergeTherapy ? '✅' : '⬜'} دمج العلاج الطبيعي والوظيفي
                    </button>
                    {staffingData.length > 0 && (
                        <button
                            className="btn btn-sm btn-success"
                            onClick={handleStaffingExport}
                            title="تصدير متطلبات التوظيف"
                        >
                            📥 تصدير
                        </button>
                    )}
                </div>
            )}

            {/* Staffing Requirements Section */}
            {isMainManager() && activeTab === 'staffing' && filters.term_id && staffingData.length > 0 && (() => {
                // Auto-select first branch if none selected
                const selectedId = staffingBranchFilter || staffingData[0]?.branch_id?.toString();
                const branch = staffingData.find(b => b.branch_id.toString() === selectedId);
                const filteredBranches = staffingSearch
                    ? staffingData.filter(b => b.branch_name.includes(staffingSearch))
                    : staffingData;

                return (
                    <div className="staffing-section">

                        <div className="sf-picker">
                            <div className="sf-picker-search">
                                <input
                                    type="text"
                                    placeholder="🔍 ابحث عن فرع..."
                                    value={staffingSearch}
                                    onChange={(e) => setStaffingSearch(e.target.value)}
                                />
                            </div>
                            <div className="sf-picker-list">
                                {filteredBranches.map(b => (
                                    <button
                                        key={b.branch_id}
                                        className={`sf-picker-item ${b.branch_id.toString() === selectedId ? 'selected' : ''} ${b.total_deficit > 0 ? 'has-deficit' : 'all-ok'}`}
                                        onClick={() => { setStaffingBranchFilter(b.branch_id.toString()); setStaffingSearch(''); }}
                                    >
                                        <span className="sf-pi-name">{b.branch_name}</span>
                                        {b.total_deficit > 0 ? (
                                            <span className="sf-pi-badge deficit">−{b.total_deficit}</span>
                                        ) : (
                                            <span className="sf-pi-badge ok">✓</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Branch Dashboard */}
                        {branch && (
                            <div className="sf-dashboard">
                                {/* Branch Header */}
                                <div className="sf-dash-header">
                                    <div className="sf-dash-title">
                                        <h2>{branch.branch_name}</h2>
                                        <span className={`sf-dash-status ${branch.total_deficit > 0 ? 'status-deficit' : 'status-ok'}`}>
                                            {branch.total_deficit > 0 ? `⚠️ يوجد نقص ${branch.total_deficit} وظيفة` : '✅ التوظيف مكتمل'}
                                        </span>
                                    </div>
                                    <div className="sf-dash-summary">
                                        <div className="sf-sum-item">
                                            <span className="sf-sum-num">{branch.total_required}</span>
                                            <span className="sf-sum-label">المطلوب</span>
                                        </div>
                                        <div className="sf-sum-item">
                                            <span className="sf-sum-num">{branch.total_current}</span>
                                            <span className="sf-sum-label">الموجود</span>
                                        </div>
                                        <div className={`sf-sum-item ${branch.total_deficit > 0 ? 'sum-deficit' : 'sum-ok'}`}>
                                            <span className="sf-sum-num">{branch.total_deficit}</span>
                                            <span className="sf-sum-label">النقص</span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="sf-sum-progress">
                                            <div className="sf-progress-bar">
                                                <div
                                                    className={`sf-progress-fill ${branch.total_deficit > 0 ? 'fill-deficit' : 'fill-ok'}`}
                                                    style={{ width: `${branch.total_required > 0 ? Math.min(100, ((branch.total_required - branch.total_deficit) / branch.total_required) * 100) : 100}%` }}
                                                />
                                            </div>
                                            <span className="sf-progress-text">
                                                {branch.total_required > 0 ? Math.round(((branch.total_required - branch.total_deficit) / branch.total_required) * 100) : 100}% مكتمل
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Beneficiaries breakdown */}
                                <div className="sf-students-strip">
                                    <div className="sf-ss-item sf-ss-total">
                                        <span className="sf-ss-icon">👥</span>
                                        <span className="sf-ss-num">{branch.total_beneficiaries}</span>
                                        <span className="sf-ss-label">إجمالي</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🌅</span>
                                        <span className="sf-ss-num">{branch.morning_count}</span>
                                        <span className="sf-ss-label">صباحية</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🌆</span>
                                        <span className="sf-ss-num">{branch.evening_count}</span>
                                        <span className="sf-ss-label">مسائية</span>
                                    </div>
                                    <div className="sf-ss-divider" />
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🗣️</span>
                                        <span className="sf-ss-num">{branch.speech_therapy_count}</span>
                                        <span className="sf-ss-label">نطق</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🦿</span>
                                        <span className="sf-ss-num">{branch.physical_therapy_count}</span>
                                        <span className="sf-ss-label">طبيعي</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🧩</span>
                                        <span className="sf-ss-num">{branch.occupational_therapy_count}</span>
                                        <span className="sf-ss-label">وظيفي</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🧠</span>
                                        <span className="sf-ss-num">{branch.autism_therapy_count}</span>
                                        <span className="sf-ss-label">توحد</span>
                                    </div>
                                    <div className="sf-ss-item">
                                        <span className="sf-ss-icon">🚐</span>
                                        <span className="sf-ss-num">{branch.transport_service_count}</span>
                                        <span className="sf-ss-label">نقل</span>
                                    </div>
                                </div>

                                {/* Role cards */}
                                <div className="sf-roles">
                                    {branch.staffing.filter(s => s.required > 0).map(s => (
                                        <div className={`sf-role-card ${s.deficit > 0 ? 'rc-deficit' : s.surplus > 0 ? 'rc-surplus' : 'rc-met'}`} key={s.role}>
                                            <div className="sf-rc-top">
                                                <div className="sf-rc-icon">{s.icon}</div>
                                                <div className="sf-rc-header">
                                                    <h4 className="sf-rc-name">{s.role}</h4>
                                                    <span className="sf-rc-rule">{s.rule}</span>
                                                </div>
                                                <div className="sf-rc-gauge">
                                                    <div className="sf-gauge-ring">
                                                        <svg viewBox="0 0 36 36" className="sf-gauge-svg">
                                                            <path className="sf-gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                            <path className={`sf-gauge-fill ${s.deficit > 0 ? 'gauge-deficit' : 'gauge-ok'}`}
                                                                strokeDasharray={`${s.required > 0 ? Math.min(100, (s.current / s.required) * 100) : 100}, 100`}
                                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                        </svg>
                                                        <span className="sf-gauge-text">{s.current}/{s.required}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sf-rc-reason">{s.reason}</div>
                                            <div className="sf-rc-footer">
                                                <div className="sf-rc-stat">
                                                    <span className="sf-rcs-label">المطلوب</span>
                                                    <span className="sf-rcs-val">{s.required}</span>
                                                </div>
                                                <div className="sf-rc-stat">
                                                    <span className="sf-rcs-label">الموجود</span>
                                                    <span className="sf-rcs-val">{s.current}</span>
                                                </div>
                                                {s.deficit > 0 && (
                                                    <div className="sf-rc-stat sf-rcs-deficit">
                                                        <span className="sf-rcs-label">النقص</span>
                                                        <span className="sf-rcs-val">{s.deficit}</span>
                                                    </div>
                                                )}
                                                {s.surplus > 0 && (
                                                    <div className="sf-rc-stat sf-rcs-surplus">
                                                        <span className="sf-rcs-label">الفائض</span>
                                                        <span className="sf-rcs-val">{s.surplus}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}
            {isMainManager() && activeTab === 'staffing' && filters.term_id && staffingLoading && (
                <div className="staffing-section staffing-section-centered">
                    <div className="staffing-loading">جاري حساب متطلبات التوظيف...</div>
                </div>
            )}
            {isMainManager() && activeTab === 'staffing' && filters.term_id && !staffingLoading && staffingData.length === 0 && (
                <div className="staffing-section staffing-section-centered">
                    <div className="empty-state">
                        <span className="empty-icon">📋</span>
                        <h3>لا توجد بيانات مستفيدين</h3>
                        <p>يجب إدخال بيانات المستفيدين أولاً لحساب متطلبات التوظيف</p>
                    </div>
                </div>
            )}
            {isMainManager() && activeTab === 'staffing' && !filters.term_id && (
                <div className="staffing-section staffing-section-centered">
                    <div className="empty-state">
                        <span className="empty-icon">📅</span>
                        <h3>اختر الفصل الدراسي</h3>
                        <p>يجب اختيار فصل دراسي لعرض متطلبات التوظيف</p>
                    </div>
                </div>
            )}

            {/* Exports Tab */}
            {isMainManager() && activeTab === 'exports' && filters.term_id && (
                <div className="exports-tab">
                    {/* Beneficiaries Excel Export */}
                    <div className="export-card">
                        <div className="export-card-header">
                            <h3>📄 تصدير بيانات المستفيدين</h3>
                            <p>اختر الأعمدة التي تريد تضمينها في ملف Excel</p>
                        </div>
                        <div className="export-columns">
                            {[
                                { key: 'sequence_number', label: 'التسلسل' },
                                { key: 'branch_name', label: 'الفرع' },
                                { key: 'enrollment_period', label: 'فترة الالتحاق' },
                                { key: 'beneficiary_name', label: 'اسم المستفيد' },
                                { key: 'beneficiary_number', label: 'رقم المستفيد' },
                                { key: 'civil_id', label: 'السجل المدني' },
                                { key: 'contact_number', label: 'رقم التواصل' },
                                { key: 'gender', label: 'الجنس' },
                                { key: 'age', label: 'العمر' },
                                { key: 'speech_therapy', label: 'نطق وتخاطب' },
                                { key: 'physical_therapy', label: 'علاج طبيعي' },
                                { key: 'occupational_therapy', label: 'علاج وظيفي' },
                                { key: 'autism_therapy', label: 'علاج توحد' },
                                { key: 'transport_service', label: 'خدمة نقل' },
                                { key: 'free_student', label: 'طالب مجاني' },
                                { key: 'notes', label: 'ملاحظات' },
                            ].map(col => (
                                <label key={col.key} className="export-col-check">
                                    <input
                                        type="checkbox"
                                        checked={exportColumns[col.key]}
                                        onChange={() => setExportColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                                    />
                                    <span>{col.label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="export-card-actions">
                            <button
                                className="btn btn-sm"
                                onClick={() => setExportColumns(prev => {
                                    const allOn = Object.values(prev).every(v => v);
                                    const next = {};
                                    for (const k of Object.keys(prev)) next[k] = !allOn;
                                    return next;
                                })}
                            >
                                {Object.values(exportColumns).every(v => v) ? 'إلغاء الكل' : 'تحديد الكل'}
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={() => handleExport()}
                                disabled={!Object.values(exportColumns).some(v => v)}
                            >
                                📥 تصدير بيانات المستفيدين
                            </button>
                        </div>
                    </div>

                    {/* Staffing Export */}
                    <div className="export-card">
                        <div className="export-card-header">
                            <h3>📋 تصدير متطلبات التوظيف</h3>
                            <p>تصدير قائمة الوظائف المطلوبة حسب اللائحة لكل فرع</p>
                        </div>
                        <div className="export-card-actions">
                            <button
                                className="btn btn-success"
                                onClick={handleStaffingExport}
                                disabled={!staffingData.length}
                            >
                                📥 تصدير متطلبات التوظيف
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isMainManager() && activeTab === 'exports' && !filters.term_id && (
                <div className="exports-tab">
                    <div className="empty-state">
                        <span className="empty-icon">📅</span>
                        <h3>اختر الفصل الدراسي</h3>
                        <p>يجب اختيار فصل دراسي لتصدير البيانات</p>
                    </div>
                </div>
            )}

            {/* Data Table */}
            {(!isMainManager() || activeTab === 'data') && (
                <div className="table-section">
                    {beneficiaries.length > 0 && (
                        <div className="table-search-bar">
                            <input
                                type="text"
                                placeholder="بحث بالاسم أو رقم الهوية أو رقم المستفيد..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="table-search-input"
                            />
                            {searchQuery && (
                                <span className="search-result-count">
                                    {beneficiaries.filter(b => {
                                        const q = searchQuery.trim().toLowerCase();
                                        return (b.beneficiary_name || '').toLowerCase().includes(q)
                                            || (b.civil_id || '').includes(q)
                                            || (b.beneficiary_number || '').includes(q);
                                    }).length} نتيجة
                                </span>
                            )}
                        </div>
                    )}
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
                    ) : (<>
                        {/* Inline Add/Edit Form Panel */}
                        {(inlineMode === 'add' || (inlineMode && inlineMode !== 'add')) && (
                            <div className="inline-form-panel" ref={inlineRowRef}>
                                <div className="inline-form-header">
                                    <h3>{inlineMode === 'add' ? 'إضافة مستفيد جديد' : 'تعديل بيانات المستفيد'}</h3>
                                    <button className="btn btn-sm btn-cancel" onClick={cancelInline} title="إلغاء">✕</button>
                                </div>
                                <div className="inline-form-grid">
                                    <div className="inline-form-group">
                                        <label>اسم المستفيد <span className="required">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.beneficiary_name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_name: e.target.value }))}
                                            placeholder="اسم المستفيد الكامل"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="inline-form-group">
                                        <label>رقم المستفيد <span className="required">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.beneficiary_number}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                                                setFormData(prev => ({ ...prev, beneficiary_number: val }));
                                            }}
                                            placeholder="6-7 أرقام"
                                            maxLength={7}
                                        />
                                    </div>
                                    <div className="inline-form-group">
                                        <label>السجل المدني <span className="required">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.civil_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, civil_id: e.target.value }))}
                                            placeholder="السجل المدني"
                                        />
                                    </div>
                                    <div className="inline-form-group">
                                        <label>رقم التواصل <span className="required">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.contact_number}
                                            onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                                            placeholder="05XXXXXXXX"
                                        />
                                    </div>
                                    <div className="inline-form-group">
                                        <label>فترة الالتحاق <span className="required">*</span></label>
                                        <select
                                            value={formData.enrollment_period}
                                            onChange={(e) => setFormData(prev => ({ ...prev, enrollment_period: e.target.value }))}
                                        >
                                            {ENROLLMENT_OPTIONS.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inline-form-group">
                                        <label>الجنس <span className="required">*</span></label>
                                        <select
                                            value={formData.gender}
                                            onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                                        >
                                            {GENDER_OPTIONS.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inline-form-group">
                                        <label>العمر <span className="required">*</span></label>
                                        <SearchableSelect
                                            value={formData.age?.toString() || ''}
                                            onChange={(val) => setFormData(prev => ({ ...prev, age: val }))}
                                            placeholder="اختر العمر"
                                            options={[
                                                { value: '', label: 'اختر العمر' },
                                                ...AGE_OPTIONS.map(age => ({ value: age.toString(), label: age.toString() }))
                                            ]}
                                        />
                                    </div>
                                    <div className="inline-form-group">
                                        <label>طالب مجاني</label>
                                        <select
                                            value={formData.free_student ? 'true' : 'false'}
                                            onChange={(e) => setFormData(prev => ({ ...prev, free_student: e.target.value === 'true' }))}
                                            className={formData.free_student ? 'select-active' : ''}
                                        >
                                            <option value="false">لا</option>
                                            <option value="true">نعم</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="inline-form-services">
                                    <label>الخدمات المقدمة</label>
                                    <div className="inline-services-row">
                                        {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                className={`service-chip ${formData[key] ? 'active' : ''}`}
                                                onClick={() => setFormData(prev => ({ ...prev, [key]: !prev[key] }))}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="inline-form-notes">
                                    <label>ملاحظات</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="أدخل ملاحظات (اختياري)"
                                        rows={2}
                                    />
                                </div>
                                <div className="inline-form-actions">
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                    >
                                        {submitting ? 'جاري الحفظ...' : inlineMode === 'add' ? '+ إضافة' : 'تحديث'}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={cancelInline}
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="table-wrapper">
                            <table className="data-table beneficiaries-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        {isMainManager() && <th>الفرع</th>}
                                        <th>الفترة</th>
                                        <th>اسم المستفيد</th>
                                        <th>رقم المستفيد</th>
                                        <th>السجل المدني</th>
                                        <th>التواصل</th>
                                        <th>الجنس</th>
                                        <th>العمر</th>
                                        <th>الخدمات</th>
                                        <th>مجاني</th>
                                        <th>ملاحظات</th>
                                        {canEdit && <th></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {beneficiaries.filter(b => {
                                        if (!searchQuery.trim()) return true;
                                        const q = searchQuery.trim().toLowerCase();
                                        return (b.beneficiary_name || '').toLowerCase().includes(q)
                                            || (b.civil_id || '').includes(q)
                                            || (b.beneficiary_number || '').includes(q);
                                    }).map((b, displayIndex) => (
                                        <tr key={b.id} className={inlineMode === b.id ? 'editing-row' : ''}>
                                            <td className="number-cell">{displayIndex + 1}</td>
                                            {isMainManager() && <td className="branch-name-cell">{b.branch_name}</td>}
                                            <td>{b.enrollment_period}</td>
                                            <td className="name-cell">{b.beneficiary_name}</td>
                                            <td className="number-cell">{b.beneficiary_number}</td>
                                            <td className="number-cell">{b.civil_id}</td>
                                            <td className="number-cell">{b.contact_number}</td>
                                            <td>{b.gender}</td>
                                            <td className="number-cell">{b.age}</td>
                                            <td className="services-cell">
                                                {Object.entries(SERVICE_LABELS).filter(([key]) => b[key]).map(([key, label]) => (
                                                    <span key={key} className="service-pill">{label}</span>
                                                ))}
                                                {Object.keys(SERVICE_LABELS).every(key => !b[key]) && (
                                                    <span className="no-services">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {b.free_student ? (
                                                    <span className="free-badge">مجاني</span>
                                                ) : (
                                                    <span className="no-services">—</span>
                                                )}
                                            </td>
                                            <td className="notes-cell" title={b.notes || ''}>
                                                {b.notes ? (
                                                    <span className="notes-text">{b.notes}</span>
                                                ) : '—'}
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>)}
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
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                                            setFormData(prev => ({ ...prev, beneficiary_number: val }));
                                        }}
                                        placeholder="أدخل 6 أو 7 أرقام"
                                        maxLength={7}
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
                                    <label>فترة الالتحاق <span className="required">*</span></label>
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
                                    <SearchableSelect
                                        value={formData.age?.toString() || ''}
                                        onChange={(val) => setFormData(prev => ({ ...prev, age: val }))}
                                        placeholder="اختر العمر"
                                        options={[
                                            { value: '', label: 'اختر العمر' },
                                            ...AGE_OPTIONS.map(age => ({ value: age.toString(), label: age.toString() }))
                                        ]}
                                    />
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
                                    <div className="service-toggle" key="free_student">
                                        <label className="toggle-label">
                                            <span className="toggle-text">طالب مجاني</span>
                                            <div className="toggle-wrapper">
                                                <select
                                                    value={formData.free_student ? 'true' : 'false'}
                                                    onChange={(e) => setFormData(prev => ({
                                                        ...prev,
                                                        free_student: e.target.value === 'true'
                                                    }))}
                                                    className={`service-select ${formData.free_student ? 'active' : ''}`}
                                                >
                                                    <option value="false">لا</option>
                                                    <option value="true">نعم</option>
                                                </select>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Notes Section */}
                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>ملاحظات</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="أدخل ملاحظات (اختياري)"
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
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

            {/* Import from Bus Modal */}
            {showImportModal && (
                <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <h2>استيراد من طلاب الباص</h2>
                            <button className="modal-close" onClick={() => setShowImportModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ padding: '16px' }}>
                            {loadingBusStudents ? (
                                <div style={{ textAlign: 'center', padding: '30px' }}>
                                    <div className="spinner-large"></div>
                                    <p>جاري التحميل...</p>
                                </div>
                            ) : busStudents.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                                    <p>لا يوجد طلاب باص يمكن استيرادهم</p>
                                    <small>جميع طلاب الباص مسجلون بالفعل كمستفيدين</small>
                                </div>
                            ) : (
                                <>
                                    <p style={{ marginBottom: 12, color: '#555', fontSize: 13 }}>
                                        اختر طالب لاستيراد بياناته كمستفيد جديد. سيتم تعبئة الاسم ورقم التواصل تلقائياً.
                                    </p>
                                    <div className="import-list">
                                        {busStudents.map(s => (
                                            <div key={s.id} className="import-item" onClick={() => handleImportStudent(s)}>
                                                <div className="import-item-info">
                                                    <strong>{s.student_full_name}</strong>
                                                    <span className="import-item-details">
                                                        {s.contact_mobile_number && `📞 ${s.contact_mobile_number}`}
                                                        {s.bus_number && ` · باص ${s.bus_number}`}
                                                    </span>
                                                </div>
                                                <button className="btn btn-sm btn-primary">استيراد</button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Bus Assignment Modal */}
            {showBusAssignModal && (
                <div className="modal-overlay" onClick={skipBusAssignment}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h2>تسجيل في باص</h2>
                            <button className="modal-close" onClick={skipBusAssignment}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ padding: '16px' }}>
                            <p style={{ marginBottom: 12, color: '#555', fontSize: 13 }}>
                                المستفيد لديه خدمة نقل مفعلة. هل تريد تسجيله في أحد الباصات؟
                            </p>
                            {loadingBuses ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <div className="spinner-large"></div>
                                </div>
                            ) : (
                                <div className="bus-assign-list">
                                    {availableBuses.map(bus => (
                                        <div key={bus.id} className="bus-assign-item">
                                            <div className="bus-assign-info">
                                                <strong>باص {bus.bus_number}</strong>
                                                <span className="bus-assign-details">
                                                    {bus.driver_full_name && `السائق: ${bus.driver_full_name}`}
                                                    {bus.number_of_seats && ` · المقاعد: ${bus.student_count}/${bus.number_of_seats}`}
                                                    {!bus.number_of_seats && ` · الطلاب: ${bus.student_count}`}
                                                </span>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => handleAssignBus(bus.id)}
                                                disabled={assigningBus}
                                            >
                                                {assigningBus ? '...' : 'تسجيل'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={skipBusAssignment} disabled={assigningBus}>
                                تخطي
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copy from previous term modal */}
            {showCopyModal && (
                <div className="modal-overlay" onClick={() => !copying && setShowCopyModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h2>نسخ المستفيدين من فصل سابق</h2>
                            <button className="modal-close" onClick={() => !copying && setShowCopyModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <p style={{ marginBottom: 16, color: '#555', fontSize: 14 }}>
                                سيتم نسخ جميع المستفيدين من الفصل المختار إلى الفصل الحالي.
                                سيتم تخطي المستفيدين المسجلين مسبقاً (بناءً على رقم الهوية).
                            </p>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>اختر الفصل المصدر</label>
                                <SearchableSelect
                                    value={copySourceTerm}
                                    onChange={(val) => setCopySourceTerm(val)}
                                    placeholder="-- اختر الفصل --"
                                    options={[
                                        { value: '', label: '-- اختر الفصل --' },
                                        ...availableCopyTerms.map(t => ({ value: t.id.toString(), label: `${t.term_name} (${t.beneficiary_count} مستفيد)` }))
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={handleCopyFromTerm} disabled={copying || !copySourceTerm}>
                                {copying ? 'جاري النسخ...' : 'نسخ المستفيدين'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowCopyModal(false)} disabled={copying}>
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

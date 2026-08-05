/**
 * Beneficiaries Page (المستفيدين)
 * - Branch managers: Add/edit/delete beneficiaries for their healthcare center
 * - Main managers: View all, filter, stats, export Excel, archive
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { beneficiariesAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import './Beneficiaries.css';
import SearchableSelect from "../components/SearchableSelect.jsx";

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

    // Active tab. Main managers get the full set; branch managers only ever see
    // 'data' and — during the between-years window — 'rollover'.
    const [activeTab, setActiveTab] = useState(isMainManager() ? 'staffing' : 'data');
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

    // New-year rollover state (مراجعة المستفيدين للسنة الجديدة)
    const [rolloverStatus, setRolloverStatus] = useState(null);
    const [rolloverCandidates, setRolloverCandidates] = useState([]);
    const [rolloverOverview, setRolloverOverview] = useState([]);
    const [rolloverLoading, setRolloverLoading] = useState(false);
    const [rolloverFilter, setRolloverFilter] = useState('undecided');
    const [decidingId, setDecidingId] = useState(null);
    const [reasonModal, setReasonModal] = useState({ show: false, candidate: null, reason: '' });
    const [confirmModal, setConfirmModal] = useState({ show: false, note: '' });

    // Guided review: one beneficiary at a time, in source order.
    const [reviewIndex, setReviewIndex] = useState(0);
    const [reviewForm, setReviewForm] = useState(null);
    const [reviewBusId, setReviewBusId] = useState('');
    const [savingReview, setSavingReview] = useState(false);
    const [rolloverView, setRolloverView] = useState('guided'); // 'guided' | 'list'
    const [showStepsHelp, setShowStepsHelp] = useState(true);

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
                loadRolloverOverview(filters.term_id);
            }
            // A main manager's rollover view follows the branch filter; a branch
            // manager's is always their own branch.
            loadRolloverStatus();
            loadRolloverCandidates({ jumpToFirstUnfinished: true });
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
                        beneficiariesAPI.getRolloverOverview({ target_term_id: termId }).then(r => { if (r.data.success) setRolloverOverview(r.data.data || []); }),
                    ]).catch(err => console.error('Error loading main manager data:', err));
                } else {
                    loadBranchStats(currentTerm.id);
                    // Branch managers land straight on the review when there is work to do.
                    const status = await loadRolloverStatus();
                    if (status?.is_active) {
                        await loadRolloverCandidates({ jumpToFirstUnfinished: true });
                        if (status.counts.undecided > 0 || status.counts.pending_review > 0) {
                            setActiveTab('rollover');
                        }
                    }
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
            // include_free must match what loadInitialData and the staffing tab send,
            // otherwise the stats and staffing tabs disagree on the same term.
            const res = await beneficiariesAPI.getStats({ term_id: termId, include_free: includeFreeStudents });
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

    // ---- New-year rollover ----

    // Branch managers are always scoped to their own branch server-side; a main
    // manager must pick one from the branch filter for the rollover to resolve.
    const rolloverParams = (extra = {}) => {
        const params = { ...extra };
        if (isMainManager() && filters.branch_id) params.branch_id = filters.branch_id;
        return params;
    };

    const loadRolloverStatus = async () => {
        if (isMainManager() && !filters.branch_id) {
            setRolloverStatus(null);
            return null;
        }
        try {
            const res = await beneficiariesAPI.getRolloverStatus(rolloverParams());
            if (res.data.success) {
                setRolloverStatus(res.data.data);
                return res.data.data;
            }
        } catch (error) {
            console.error('Error loading rollover status:', error);
        }
        return null;
    };

    const loadRolloverCandidates = async ({ jumpToFirstUnfinished = false } = {}) => {
        if (isMainManager() && !filters.branch_id) {
            setRolloverCandidates([]);
            return;
        }
        try {
            setRolloverLoading(true);
            const res = await beneficiariesAPI.getRolloverCandidates(rolloverParams());
            if (res.data.success) {
                const rows = res.data.data || [];
                setRolloverCandidates(rows);
                if (jumpToFirstUnfinished) {
                    const i = rows.findIndex(c => !(
                        c.continuity_status === 'not_continuing' ||
                        (c.continuity_status === 'continuing' && c.target_review_status !== 'pending')
                    ));
                    setReviewIndex(i === -1 ? 0 : i);
                }
                // Returned so callers can act on fresh rows — reading the state right
                // after awaiting this would still see the previous render's array.
                return rows;
            }
        } catch (error) {
            console.error('Error loading rollover candidates:', error);
        } finally {
            setRolloverLoading(false);
        }
        return null;
    };

    const loadRolloverOverview = async (termId) => {
        const target = termId || filters.term_id;
        if (!target) return;
        try {
            const res = await beneficiariesAPI.getRolloverOverview({ target_term_id: target });
            if (res.data.success) {
                setRolloverOverview(res.data.data || []);
            }
        } catch (error) {
            console.error('Error loading rollover overview:', error);
        }
    };

    // ---- Guided review wizard ----

    // A beneficiary is "finished" once a decision exists and, if they continue,
    // their new-term data has been reviewed.
    const isCandidateDone = (c) =>
        c.continuity_status === 'not_continuing' ||
        (c.continuity_status === 'continuing' && c.target_review_status !== 'pending');

    const currentCandidate = rolloverCandidates[reviewIndex] || null;

    /**
     * Apply a decision's outcome to the one row it touched.
     *
     * Reloading the whole list after every click made the wizard unmount behind a
     * spinner and re-mount, which read as "the button did nothing" and cost three
     * requests per beneficiary. The server already returns everything we need, so
     * the row is patched in place instead.
     */
    const patchCandidate = (id, patch) => {
        setRolloverCandidates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    };

    // `list` is passed explicitly when the caller has fresher rows than state.
    const goToNextUnfinished = (list = rolloverCandidates) => {
        if (!list.length) return;
        const next = list.findIndex((c, i) => i > reviewIndex && !isCandidateDone(c));
        if (next !== -1) { setReviewIndex(next); return; }
        const anyLeft = list.findIndex(c => !isCandidateDone(c));
        if (anyLeft !== -1) setReviewIndex(anyLeft);
        // Everything is done — stay put; the render switches to the completion panel.
    };

    const handleMarkContinuing = async (candidate) => {
        if (decidingId) return;
        setDecidingId(candidate.id);
        try {
            const res = await beneficiariesAPI.decideRollover(
                rolloverParams({ decisions: [{ beneficiary_id: candidate.id, decision: 'continuing' }] })
            );
            const result = res.data?.data?.results?.[0];
            if (!result?.ok) {
                showWarning(result?.error || 'تعذر حفظ القرار');
                return;
            }
            patchCandidate(candidate.id, {
                continuity_status: 'continuing',
                non_continuation_reason: null,
                target_id: result.target_id,
                target: result.target || null,
                target_review_status: result.target?.carry_review_status || 'pending',
                target_transport_service: result.target?.transport_service ?? candidate.transport_service,
            });
            showSuccess('سيستمر — راجع بياناته الآن');
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في حفظ القرار');
        } finally {
            setDecidingId(null);
        }
    };

    const handleSubmitNonContinuation = async () => {
        const reason = reasonModal.reason.trim();
        if (reason.length < 3) {
            showWarning('يجب كتابة سبب عدم الاستمرار');
            return;
        }
        const candidate = reasonModal.candidate;
        setDecidingId(candidate.id);
        try {
            const res = await beneficiariesAPI.decideRollover(
                rolloverParams({ decisions: [{ beneficiary_id: candidate.id, decision: 'not_continuing', reason }] })
            );
            const result = res.data?.data?.results?.[0];
            if (!result?.ok) {
                showWarning(result?.error || 'تعذر حفظ القرار');
                return;
            }
            const patched = rolloverCandidates.map(c => c.id === candidate.id
                ? { ...c, continuity_status: 'not_continuing', non_continuation_reason: reason, target_id: null, target: null, target_review_status: null }
                : c);
            setRolloverCandidates(patched);
            setReasonModal({ show: false, candidate: null, reason: '' });
            showSuccess('تم نقل المستفيد إلى الأرشيف');
            goToNextUnfinished(patched);
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في حفظ القرار';
            showError(msg);
        } finally {
            setDecidingId(null);
        }
    };

    // Prefill the review form from the row that was carried into the new term.
    useEffect(() => {
        const t = currentCandidate?.target;
        setReviewForm(t ? {
            beneficiary_number: t.beneficiary_number || '',
            enrollment_period: t.enrollment_period || 'صباحية',
            beneficiary_name: t.beneficiary_name || '',
            civil_id: t.civil_id || '',
            contact_number: t.contact_number || '',
            age: t.age != null ? String(t.age) : '',
            speech_therapy: !!t.speech_therapy,
            physical_therapy: !!t.physical_therapy,
            occupational_therapy: !!t.occupational_therapy,
            autism_therapy: !!t.autism_therapy,
            transport_service: !!t.transport_service,
            free_student: !!t.free_student,
            notes: t.notes || '',
        } : null);
        setReviewBusId(currentCandidate?.assigned_bus_id ? String(currentCandidate.assigned_bus_id) : '');
    }, [currentCandidate?.id, currentCandidate?.target_id, currentCandidate?.target_review_status]);

    const loadAvailableBusesForReview = async () => {
        try {
            const res = await beneficiariesAPI.getAvailableBuses(rolloverParams());
            setAvailableBuses(res.data.data || []);
        } catch {
            setAvailableBuses([]);
        }
    };

    // Step 3 only exists when transport is on, so the bus list is only needed then.
    useEffect(() => {
        if (activeTab === 'rollover' && reviewForm?.transport_service && availableBuses.length === 0) {
            loadAvailableBusesForReview();
        }
    }, [activeTab, reviewForm?.transport_service]);

    const handleSaveReview = async () => {
        const c = currentCandidate;
        if (!c?.target_id || !reviewForm) return;

        if (!/^\d{6,7}$/.test(reviewForm.beneficiary_number || '')) return showWarning('رقم المستفيد يجب أن يكون 6 أو 7 أرقام');
        if (!reviewForm.beneficiary_name.trim()) return showWarning('يجب إدخال اسم المستفيد');
        if (!reviewForm.civil_id.trim()) return showWarning('يجب إدخال السجل المدني');
        if (!reviewForm.contact_number.trim()) return showWarning('يجب إدخال رقم التواصل');
        if (!reviewForm.age) return showWarning('يجب تحديد العمر');
        if (reviewForm.transport_service && !reviewBusId && availableBuses.length > 0) {
            return showWarning('خدمة النقل مفعلة — يجب اختيار الحافلة');
        }

        try {
            setSavingReview(true);
            // Saving through the normal update endpoint is what marks the row reviewed.
            await beneficiariesAPI.update(c.target_id, { ...reviewForm, age: parseInt(reviewForm.age) });

            const wantedBus = reviewForm.transport_service ? (reviewBusId || null) : null;
            const currentBus = c.assigned_bus_id ? String(c.assigned_bus_id) : null;
            if (String(wantedBus || '') !== String(currentBus || '')) {
                await beneficiariesAPI.assignRolloverBus(
                    rolloverParams({ beneficiary_id: c.target_id, bus_id: wantedBus })
                );
            }

            showSuccess('تم حفظ بيانات المستفيد');
            const rows = await refreshRollover();
            goToNextUnfinished(rows || undefined);
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في حفظ البيانات');
        } finally {
            setSavingReview(false);
        }
    };

    const handleStartRollover = async () => {
        try {
            setRolloverLoading(true);
            const res = await beneficiariesAPI.startRollover(rolloverParams());
            if (res.data.success) {
                showSuccess(res.data.message);
                await refreshRollover();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في بدء المراجعة');
        } finally {
            setRolloverLoading(false);
        }
    };

    const handleConfirmReview = async () => {
        try {
            const res = await beneficiariesAPI.confirmRollover(
                rolloverParams({ note: confirmModal.note.trim() || undefined })
            );
            if (res.data.success) {
                showSuccess(res.data.message);
                setConfirmModal({ show: false, note: '' });
                await loadRolloverStatus();
                if (isMainManager()) loadRolloverOverview();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في تأكيد المراجعة');
        }
    };

    const handleUnconfirmReview = async () => {
        if (!window.confirm('هل تريد إلغاء تأكيد اكتمال المراجعة؟')) return;
        try {
            const res = await beneficiariesAPI.unconfirmRollover(rolloverParams());
            if (res.data.success) {
                showSuccess(res.data.message);
                await loadRolloverStatus();
                if (isMainManager()) loadRolloverOverview();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في إلغاء التأكيد');
        }
    };

    // Jump the guided flow to a specific beneficiary (used by the list view).
    const openInGuidedReview = (candidateId) => {
        const idx = rolloverCandidates.findIndex(c => c.id === candidateId);
        if (idx !== -1) {
            setReviewIndex(idx);
            setRolloverView('guided');
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

    // The rollover tab only exists while there is a new term to prepare AND there is
    // previous-year data to review — otherwise the page is unchanged.
    const rolloverAvailable = Boolean(
        rolloverStatus?.is_active &&
        (rolloverStatus.source_term || rolloverStatus.counts?.pending_review > 0)
    );
    const rolloverPending = (rolloverStatus?.counts?.undecided || 0) + (rolloverStatus?.counts?.pending_review || 0);

    const visibleTabs = [
        ...(isMainManager()
            ? [
                { key: 'staffing', label: '📋 متطلبات التوظيف' },
                { key: 'data', label: '📄 بيانات المستفيدين' },
                { key: 'stats', label: '📊 الإحصائيات' },
                { key: 'exports', label: '📥 التصدير' },
            ]
            : [{ key: 'data', label: '📄 بيانات المستفيدين' }]),
        ...(rolloverAvailable || isMainManager()
            ? [{ key: 'rollover', label: '🔄 مراجعة السنة الجديدة' }]
            : []),
    ];

    // A tab can disappear (e.g. the rollover closes) while it is selected.
    const visibleTabKeys = visibleTabs.map(t => t.key).join(',');
    useEffect(() => {
        const keys = visibleTabKeys.split(',').filter(Boolean);
        if (keys.length && !keys.includes(activeTab)) {
            setActiveTab(keys[0]);
        }
    }, [visibleTabKeys, activeTab]);

    const filteredCandidates = rolloverCandidates.filter(c => {
        if (rolloverFilter === 'all') return true;
        if (rolloverFilter === 'undecided') return !c.continuity_status;
        return c.continuity_status === rolloverFilter;
    });

    // "Done" means decided AND — for those continuing — their new-term data reviewed.
    const rolloverDoneCount = rolloverCandidates.filter(isCandidateDone).length;
    const rolloverRemaining = rolloverCandidates.length - rolloverDoneCount;

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
                                {/* The rollover tab supersedes the blind bulk copy — showing
                                    both lets the two mechanisms fight over the same rows. */}
                                {!rolloverAvailable && (
                                    <button className="btn btn-secondary" onClick={openCopyModal}>
                                        نسخ من فصل سابق
                                    </button>
                                )}
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
                </>
            )}

            {/* Tabs — shared by both roles. Rendered only when more than one tab
                applies, so outside the between-years window a branch manager's
                page looks exactly as it did before. */}
            {visibleTabs.length > 1 && (
                <div className="mm-tabs">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`mm-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            {tab.key === 'rollover' && rolloverPending > 0 && (
                                <span className="tab-badge">{rolloverPending}</span>
                            )}
                        </button>
                    ))}
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

            {/* New-Year Rollover Tab */}
            {activeTab === 'rollover' && (
                <div className="rollover-tab">
                    {isMainManager() && !filters.branch_id ? (
                        <>
                            <div className="rollover-overview-header">
                                <h2>حالة مراجعة المستفيدين للسنة الجديدة</h2>
                                <span className="rollover-summary-chip">
                                    {rolloverOverview.filter(b => b.is_confirmed).length} / {rolloverOverview.length} فرع أكّد
                                </span>
                            </div>
                            {rolloverOverview.length === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-icon">🏥</span>
                                    <h3>لا توجد فروع</h3>
                                    <p>اختر فصلاً دراسياً لعرض حالة الفروع</p>
                                </div>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="data-table rollover-overview-table">
                                        <thead>
                                            <tr>
                                                <th>الفرع</th>
                                                <th>مستفيدو الفصل السابق</th>
                                                <th>تم القرار</th>
                                                <th>مستمر</th>
                                                <th>غير مستمر</th>
                                                <th>بانتظار المراجعة</th>
                                                <th>مستفيدون جدد</th>
                                                <th>الحالة</th>
                                                <th>تأكيد بواسطة</th>
                                                <th>التاريخ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rolloverOverview.map(row => (
                                                <tr
                                                    key={row.branch_id}
                                                    className="clickable-row"
                                                    onClick={() => setFilters(prev => ({ ...prev, branch_id: row.branch_id.toString() }))}
                                                >
                                                    <td>{row.branch_name}</td>
                                                    <td>{row.source_total}</td>
                                                    <td>{row.decided} / {row.source_total}</td>
                                                    <td>{row.continuing}</td>
                                                    <td>{row.not_continuing}</td>
                                                    <td>{row.pending_review}</td>
                                                    <td>{row.new_in_target}</td>
                                                    <td>
                                                        <span className={`rollover-badge ${row.is_confirmed ? 'confirmed' : 'not-confirmed'}`}>
                                                            {row.is_confirmed ? '🟢 مكتمل' : '🔴 غير مكتمل'}
                                                        </span>
                                                    </td>
                                                    <td>{row.confirmed_by_label || '-'}</td>
                                                    <td>
                                                        {row.confirmed_at
                                                            ? new Date(row.confirmed_at).toLocaleDateString('ar-SA')
                                                            : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : !rolloverStatus ? (
                        <div className="loading-container"><div className="spinner-large"></div><p>جاري التحميل...</p></div>
                    ) : !rolloverStatus.is_active ? (
                        <div className="empty-state">
                            <span className="empty-icon">📅</span>
                            <h3>لا يوجد فصل دراسي للسنة الجديدة</h3>
                            <p>{rolloverStatus.blocking_reason}</p>
                            {isMainManager() && (
                                <button className="btn btn-primary" onClick={() => navigate('/term-management')}>
                                    إدارة السنوات والفصول الدراسية
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {isMainManager() && (
                                <button
                                    className="btn btn-secondary btn-sm rollover-back-btn"
                                    onClick={() => setFilters(prev => ({ ...prev, branch_id: '' }))}
                                >
                                    ← العودة لحالة كل الفروع
                                </button>
                            )}

                            <div className="rollover-header">
                                <div className="rollover-terms">
                                    <span className="rollover-term-chip previous">
                                        بيانات الفصل السابق: {rolloverStatus.source_term
                                            ? `${rolloverStatus.source_term.academic_year_label} — ${rolloverStatus.source_term.term_name}`
                                            : 'لا يوجد'}
                                    </span>
                                    <span className="rollover-arrow">←</span>
                                    <span className="rollover-term-chip next">
                                        الفصل الجديد: {rolloverStatus.target_term?.academic_year_label} — {rolloverStatus.target_term?.term_name}
                                    </span>
                                </div>
                                <div className="rollover-progress">
                                    <div className="rollover-progress-bar">
                                        <div
                                            className="rollover-progress-fill"
                                            style={{
                                                width: `${rolloverStatus.counts.total_source > 0
                                                    ? Math.round((rolloverDoneCount / rolloverStatus.counts.total_source) * 100)
                                                    : 100}%`
                                            }}
                                        />
                                    </div>
                                    <span className="rollover-progress-label">
                                        أنجزت {rolloverDoneCount} من {rolloverStatus.counts.total_source} مستفيد
                                    </span>
                                </div>
                            </div>

                            {/* How this page works — spelled out, because getting the
                                order wrong here means losing a year of data. */}
                            <div className="rollover-help">
                                <button className="rollover-help-toggle" onClick={() => setShowStepsHelp(v => !v)}>
                                    {showStepsHelp ? '▼' : '◀'} كيف أكمل مراجعة المستفيدين؟ (اقرأ الخطوات)
                                </button>
                                {showStepsHelp && (
                                    <ol className="rollover-help-list">
                                        <li><strong>حدّد المصير:</strong> لكل مستفيد من العام الماضي، اختر «سيستمر» أو «لن يستمر».</li>
                                        <li><strong>راجع البيانات:</strong> إذا كان سيستمر، تأكد من صحة بياناته وعدّل ما تغيّر (العمر، رقم التواصل، الخدمات...).</li>
                                        <li><strong>اختر الحافلة:</strong> إذا كانت خدمة النقل مفعلة، حدّد الحافلة التي سيركبها هذا العام.</li>
                                        <li><strong>احفظ:</strong> اضغط «حفظ والانتقال للتالي» — سينتقل تلقائياً للمستفيد التالي.</li>
                                        <li><strong>كرّر</strong> حتى تنتهي من جميع المستفيدين.</li>
                                        <li><strong>أضف الجدد:</strong> من تبويب «بيانات المستفيدين» أضف المستفيدين الجدد الذين لم يكونوا مسجلين العام الماضي.</li>
                                        <li><strong>أكّد:</strong> في نهاية هذه الصفحة اضغط «تأكيد اكتمال البيانات 100%» — بعد أن تنتهي من كل ما سبق.</li>
                                    </ol>
                                )}
                                <p className="rollover-help-note">
                                    ⚠️ المستفيد الذي تحدده «لن يستمر» يُنقل مباشرة إلى الأرشيف ولن يظهر في قوائم هذا العام.
                                </p>
                            </div>

                            {rolloverStatus.counts.total_source === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-icon">🆕</span>
                                    <h3>لا توجد بيانات من الفصل السابق</h3>
                                    <p>لا يوجد مستفيدون لمراجعتهم — يمكنك إضافة المستفيدين مباشرة للفصل الجديد</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => { setActiveTab('data'); setTimeout(openAddModal, 0); }}
                                    >
                                        + إضافة مستفيد
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="rollover-view-switch">
                                        <button
                                            className={`rollover-pill ${rolloverView === 'guided' ? 'active' : ''}`}
                                            onClick={() => setRolloverView('guided')}
                                        >
                                            📝 المراجعة خطوة بخطوة
                                        </button>
                                        <button
                                            className={`rollover-pill ${rolloverView === 'list' ? 'active' : ''}`}
                                            onClick={() => setRolloverView('list')}
                                        >
                                            📋 عرض القائمة كاملة
                                        </button>
                                    </div>

                                    {rolloverLoading ? (
                                        <div className="loading-container"><div className="spinner-large"></div><p>جاري التحميل...</p></div>
                                    ) : rolloverView === 'guided' ? (
                                        !currentCandidate ? (
                                            <div className="empty-state">
                                                <span className="empty-icon">✅</span>
                                                <h3>انتهيت من جميع المستفيدين</h3>
                                                <p>انتقل إلى الخطوة الأخيرة في أسفل الصفحة</p>
                                            </div>
                                        ) : (
                                            <div className="rollover-wizard">
                                                {/* Position in the queue */}
                                                <div className="rollover-wizard-nav">
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        disabled={reviewIndex === 0}
                                                        onClick={() => setReviewIndex(i => Math.max(0, i - 1))}
                                                    >
                                                        → السابق
                                                    </button>
                                                    <span className="rollover-wizard-pos">
                                                        المستفيد {reviewIndex + 1} من {rolloverCandidates.length}
                                                        {rolloverRemaining > 0 && (
                                                            <span className="rollover-wizard-remaining"> · متبقٍ {rolloverRemaining}</span>
                                                        )}
                                                    </span>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        disabled={reviewIndex >= rolloverCandidates.length - 1}
                                                        onClick={() => setReviewIndex(i => Math.min(rolloverCandidates.length - 1, i + 1))}
                                                    >
                                                        التالي ←
                                                    </button>
                                                </div>

                                                {/* Who we are looking at — gender is set once at registration
                                                    and never changes, so it is context here, not a field to review. */}
                                                <div className="rollover-identity">
                                                    <h3 className="rollover-identity-name">{currentCandidate.beneficiary_name}</h3>
                                                    <div className="rollover-identity-meta">
                                                        <span>السجل المدني: <strong>{currentCandidate.civil_id}</strong></span>
                                                        <span>الجنس: <strong>{currentCandidate.gender}</strong></span>
                                                        <span>رقم المستفيد: <strong>{currentCandidate.beneficiary_number}</strong></span>
                                                        <span>عمره العام الماضي: <strong>{currentCandidate.age}</strong></span>
                                                    </div>
                                                    <div className="rollover-identity-services">
                                                        <span className="muted">خدماته العام الماضي:</span>
                                                        {Object.entries(SERVICE_LABELS)
                                                            .filter(([key]) => currentCandidate[key])
                                                            .map(([key, label]) => (
                                                                <span className="service-pill" key={key}>{label}</span>
                                                            ))}
                                                        {!Object.keys(SERVICE_LABELS).some(k => currentCandidate[k]) && <span className="muted">لا يوجد</span>}
                                                    </div>
                                                </div>

                                                {/* ── STEP 1 ── */}
                                                <div className={`rollover-step ${currentCandidate.continuity_status ? 'done' : 'active'}`}>
                                                    <div className="rollover-step-head">
                                                        <span className="rollover-step-num">1</span>
                                                        <h4>هل سيستمر هذا المستفيد معنا هذا العام؟</h4>
                                                    </div>
                                                    <div className="rollover-step-body">
                                                        {!currentCandidate.continuity_status ? (
                                                            <div className="rollover-choice">
                                                                <button
                                                                    className="btn btn-success"
                                                                    disabled={decidingId === currentCandidate.id}
                                                                    onClick={() => handleMarkContinuing(currentCandidate)}
                                                                >
                                                                    ✅ نعم، سيستمر
                                                                </button>
                                                                <button
                                                                    className="btn btn-danger"
                                                                    disabled={decidingId === currentCandidate.id}
                                                                    onClick={() => setReasonModal({ show: true, candidate: currentCandidate, reason: '' })}
                                                                >
                                                                    ⛔ لا، لن يستمر
                                                                </button>
                                                            </div>
                                                        ) : currentCandidate.continuity_status === 'continuing' ? (
                                                            <div className="rollover-answered">
                                                                <span className="rollover-badge reviewed">✅ سيستمر هذا العام</span>
                                                                <button
                                                                    className="rollover-link-btn"
                                                                    onClick={() => setReasonModal({ show: true, candidate: currentCandidate, reason: '' })}
                                                                >
                                                                    تغيير إلى «لن يستمر»
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="rollover-answered">
                                                                <span className="rollover-badge stopped">⛔ لن يستمر — تم نقله إلى الأرشيف</span>
                                                                <span className="rollover-reason-shown">السبب: {currentCandidate.non_continuation_reason}</span>
                                                                <button
                                                                    className="rollover-link-btn"
                                                                    disabled={decidingId === currentCandidate.id}
                                                                    onClick={() => handleMarkContinuing(currentCandidate)}
                                                                >
                                                                    تراجع — سيستمر فعلاً
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* ── STEP 2 ── */}
                                                {currentCandidate.continuity_status === 'continuing' && reviewForm && (
                                                    <div className={`rollover-step ${currentCandidate.target_review_status === 'pending' ? 'active' : 'done'}`}>
                                                        <div className="rollover-step-head">
                                                            <span className="rollover-step-num">2</span>
                                                            <h4>راجع بياناته وعدّل ما تغيّر</h4>
                                                            {currentCandidate.target_review_status !== 'pending' && (
                                                                <span className="rollover-badge reviewed">تمت المراجعة</span>
                                                            )}
                                                        </div>
                                                        <div className="rollover-step-body">
                                                            <div className="rollover-form-grid">
                                                                <div className="inline-form-group">
                                                                    <label>اسم المستفيد <span className="required">*</span></label>
                                                                    <input
                                                                        type="text"
                                                                        value={reviewForm.beneficiary_name}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, beneficiary_name: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div className="inline-form-group">
                                                                    <label>رقم المستفيد <span className="required">*</span></label>
                                                                    <input
                                                                        type="text"
                                                                        maxLength={7}
                                                                        value={reviewForm.beneficiary_number}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, beneficiary_number: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                                                                    />
                                                                </div>
                                                                <div className="inline-form-group">
                                                                    <label>السجل المدني <span className="required">*</span></label>
                                                                    <input
                                                                        type="text"
                                                                        value={reviewForm.civil_id}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, civil_id: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div className="inline-form-group">
                                                                    <label>رقم التواصل <span className="required">*</span></label>
                                                                    <input
                                                                        type="text"
                                                                        value={reviewForm.contact_number}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, contact_number: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div className="inline-form-group">
                                                                    <label>العمر هذا العام <span className="required">*</span></label>
                                                                    <select
                                                                        value={reviewForm.age}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, age: e.target.value }))}
                                                                    >
                                                                        <option value="">اختر</option>
                                                                        {AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="inline-form-group">
                                                                    <label>فترة الالتحاق <span className="required">*</span></label>
                                                                    <select
                                                                        value={reviewForm.enrollment_period}
                                                                        onChange={(e) => setReviewForm(p => ({ ...p, enrollment_period: e.target.value }))}
                                                                    >
                                                                        {ENROLLMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            <div className="rollover-services-block">
                                                                <label className="rollover-block-label">الخدمات التي سيتلقاها هذا العام</label>
                                                                <div className="rollover-services">
                                                                    {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                                                                        <label key={key} className={`rollover-service-check ${reviewForm[key] ? 'on' : ''}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={reviewForm[key]}
                                                                                onChange={(e) => setReviewForm(p => ({ ...p, [key]: e.target.checked }))}
                                                                            />
                                                                            {label}
                                                                        </label>
                                                                    ))}
                                                                    <label className={`rollover-service-check ${reviewForm.free_student ? 'on' : ''}`}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={reviewForm.free_student}
                                                                            onChange={(e) => setReviewForm(p => ({ ...p, free_student: e.target.checked }))}
                                                                        />
                                                                        طالب مجاني
                                                                    </label>
                                                                </div>
                                                            </div>

                                                            <div className="inline-form-group">
                                                                <label>ملاحظات</label>
                                                                <input
                                                                    type="text"
                                                                    value={reviewForm.notes}
                                                                    onChange={(e) => setReviewForm(p => ({ ...p, notes: e.target.value }))}
                                                                    placeholder="اختياري"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── STEP 3 — only when transport is on ── */}
                                                {currentCandidate.continuity_status === 'continuing' && reviewForm?.transport_service && (
                                                    <div className={`rollover-step ${reviewBusId ? 'done' : 'active'}`}>
                                                        <div className="rollover-step-head">
                                                            <span className="rollover-step-num">3</span>
                                                            <h4>خدمة النقل مفعلة — اختر الحافلة</h4>
                                                        </div>
                                                        <div className="rollover-step-body">
                                                            {availableBuses.length === 0 ? (
                                                                <div className="rollover-inline-warning">
                                                                    لا توجد حافلات مسجلة في الفصل الجديد بعد.
                                                                    <button className="btn btn-sm btn-secondary" onClick={handleStartRollover} disabled={rolloverLoading}>
                                                                        🚌 نقل حافلات العام الماضي
                                                                    </button>
                                                                    <button className="btn btn-sm btn-info" onClick={() => navigate('/bus-transportation')}>
                                                                        إدارة الحافلات
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    className="rollover-bus-select"
                                                                    value={reviewBusId}
                                                                    onChange={(e) => setReviewBusId(e.target.value)}
                                                                >
                                                                    <option value="">— اختر الحافلة —</option>
                                                                    {availableBuses.map(bus => (
                                                                        <option key={bus.id} value={bus.id}>
                                                                            حافلة {bus.bus_number}
                                                                            {bus.driver_full_name ? ` — ${bus.driver_full_name}` : ''}
                                                                            {bus.number_of_seats ? ` (${bus.student_count}/${bus.number_of_seats} مقعد)` : ''}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── STEP 4 ── */}
                                                {currentCandidate.continuity_status === 'continuing' && reviewForm && (
                                                    <div className="rollover-step active">
                                                        <div className="rollover-step-head">
                                                            <span className="rollover-step-num">4</span>
                                                            <h4>احفظ وانتقل للمستفيد التالي</h4>
                                                        </div>
                                                        <div className="rollover-step-body rollover-save-row">
                                                            <button
                                                                className="btn btn-primary btn-lg"
                                                                disabled={savingReview}
                                                                onClick={handleSaveReview}
                                                            >
                                                                {savingReview ? 'جاري الحفظ...' : 'حفظ والانتقال للمستفيد التالي ←'}
                                                            </button>
                                                            <button className="btn btn-secondary" onClick={goToNextUnfinished}>
                                                                تخطٍ مؤقتاً
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {currentCandidate.continuity_status === 'not_continuing' && (
                                                    <div className="rollover-step-actions">
                                                        <button className="btn btn-primary" onClick={goToNextUnfinished}>
                                                            الانتقال للمستفيد التالي ←
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    ) : (
                                        /* ── List view: overview + jump into the guided flow ── */
                                        <>
                                            <div className="rollover-filters">
                                                {[
                                                    { key: 'undecided', label: `لم يتم القرار (${rolloverStatus.counts.undecided})` },
                                                    { key: 'continuing', label: `مستمر (${rolloverStatus.counts.continuing})` },
                                                    { key: 'not_continuing', label: `غير مستمر (${rolloverStatus.counts.not_continuing})` },
                                                    { key: 'all', label: `الكل (${rolloverStatus.counts.total_source})` },
                                                ].map(pill => (
                                                    <button
                                                        key={pill.key}
                                                        className={`rollover-pill ${rolloverFilter === pill.key ? 'active' : ''}`}
                                                        onClick={() => setRolloverFilter(pill.key)}
                                                    >
                                                        {pill.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {filteredCandidates.length === 0 ? (
                                                <div className="empty-state">
                                                    <span className="empty-icon">✅</span>
                                                    <h3>لا توجد سجلات في هذا التصنيف</h3>
                                                </div>
                                            ) : (
                                                <div className="table-wrapper">
                                                    <table className="data-table rollover-table">
                                                        <thead>
                                                            <tr>
                                                                <th>#</th>
                                                                <th>اسم المستفيد</th>
                                                                <th>السجل المدني</th>
                                                                <th>التواصل</th>
                                                                <th>الخدمات السابقة</th>
                                                                <th>الحافلة</th>
                                                                <th>الحالة</th>
                                                                <th>الإجراء</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {filteredCandidates.map((c, index) => (
                                                                <tr key={c.id} className={`rollover-row ${c.continuity_status || 'undecided'}`}>
                                                                    <td>{index + 1}</td>
                                                                    <td>{c.beneficiary_name}</td>
                                                                    <td>{c.civil_id}</td>
                                                                    <td>{c.contact_number}</td>
                                                                    <td>
                                                                        <div className="service-pills">
                                                                            {Object.entries(SERVICE_LABELS)
                                                                                .filter(([key]) => c[key])
                                                                                .map(([key, label]) => (
                                                                                    <span className="service-pill" key={key}>{label}</span>
                                                                                ))}
                                                                            {!Object.keys(SERVICE_LABELS).some(k => c[k]) && <span className="muted">-</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td>{c.bus_number ? `🚌 ${c.bus_number}` : <span className="muted">-</span>}</td>
                                                                    <td>
                                                                        {!c.continuity_status && <span className="rollover-badge undecided">⏳ بانتظار القرار</span>}
                                                                        {c.continuity_status === 'continuing' && c.target_review_status === 'pending' && (
                                                                            <span className="rollover-badge pending">✅ مستمر — بانتظار المراجعة</span>
                                                                        )}
                                                                        {c.continuity_status === 'continuing' && c.target_review_status !== 'pending' && (
                                                                            <span className="rollover-badge reviewed">✅ مكتمل</span>
                                                                        )}
                                                                        {c.continuity_status === 'not_continuing' && (
                                                                            <span className="rollover-badge stopped" title={c.non_continuation_reason || ''}>⛔ غير مستمر</span>
                                                                        )}
                                                                    </td>
                                                                    <td>
                                                                        <button className="btn btn-sm btn-primary" onClick={() => openInGuidedReview(c.id)}>
                                                                            {isCandidateDone(c) ? 'عرض / تعديل' : 'ابدأ المراجعة'}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}

                            {/* ── Final step: add the new intake, then confirm ── */}
                            <div className="rollover-final">
                                <div className="rollover-step-head">
                                    <span className="rollover-step-num final">✓</span>
                                    <h4>الخطوة الأخيرة — تأكيد اكتمال البيانات</h4>
                                </div>
                                <ul className="rollover-checklist">
                                    <li className={rolloverStatus.counts.undecided === 0 ? 'ok' : 'todo'}>
                                        {rolloverStatus.counts.undecided === 0 ? '✅' : '⬜'} تحديد مصير جميع مستفيدي العام الماضي
                                        <span className="rollover-checklist-count">
                                            ({rolloverStatus.counts.decided} من {rolloverStatus.counts.total_source})
                                        </span>
                                    </li>
                                    <li className={rolloverStatus.counts.pending_review === 0 ? 'ok' : 'todo'}>
                                        {rolloverStatus.counts.pending_review === 0 ? '✅' : '⬜'} مراجعة بيانات المستفيدين المستمرين
                                        {rolloverStatus.counts.pending_review > 0 && (
                                            <span className="rollover-checklist-count">(متبقٍ {rolloverStatus.counts.pending_review})</span>
                                        )}
                                    </li>
                                    <li className="info">
                                        ℹ️ إضافة المستفيدين الجدد الذين لم يكونوا مسجلين العام الماضي
                                        <span className="rollover-checklist-count">(تمت إضافة {rolloverStatus.counts.new_in_target})</span>
                                        <button
                                            className="rollover-link-btn"
                                            onClick={() => { setActiveTab('data'); setTimeout(openAddModal, 0); }}
                                        >
                                            + إضافة مستفيد جديد
                                        </button>
                                    </li>
                                </ul>

                                <div className="rollover-confirm-bar">
                                    {rolloverStatus.confirmation ? (
                                        <div className="rollover-confirmed">
                                            <span className="rollover-confirmed-text">
                                                ✅ تم تأكيد اكتمال البيانات بواسطة {rolloverStatus.confirmation.confirmed_by_label || '—'} بتاريخ{' '}
                                                {new Date(rolloverStatus.confirmation.confirmed_at).toLocaleDateString('ar-SA')}
                                            </span>
                                            {rolloverStatus.confirmation.is_stale && (
                                                <span className="rollover-stale-note">⚠️ تم تعديل بيانات بعد التأكيد</span>
                                            )}
                                            <button className="btn btn-sm btn-secondary" onClick={handleUnconfirmReview}>
                                                تراجع عن التأكيد
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                className="btn btn-primary btn-lg"
                                                disabled={!rolloverStatus.can_confirm}
                                                onClick={() => setConfirmModal({ show: true, note: '' })}
                                            >
                                                تأكيد اكتمال البيانات 100%
                                            </button>
                                            <span className="rollover-blocking-reason">
                                                {rolloverStatus.blocking_reason
                                                    || 'اضغط الزر فقط بعد مراجعة جميع المستفيدين وإضافة المستفيدين الجدد'}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Data Table */}
            {activeTab === 'data' && (
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

            {/* Non-continuation reason — required, and archives the record on save */}
            {reasonModal.show && (
                <div className="modal-overlay" onClick={() => setReasonModal({ show: false, candidate: null, reason: '' })}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>عدم استمرار المستفيد</h2>
                        </div>
                        <div className="confirm-body">
                            <p>سيتم نقل بيانات المستفيد إلى الأرشيف:</p>
                            <strong>{reasonModal.candidate?.beneficiary_name}</strong>
                            <label className="rollover-reason-label">سبب عدم الاستمرار <span className="required">*</span></label>
                            <textarea
                                className="rollover-reason-input"
                                rows={3}
                                value={reasonModal.reason}
                                onChange={(e) => setReasonModal(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="مثال: انتقل إلى مركز آخر"
                                autoFocus
                            />
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn btn-danger"
                                disabled={reasonModal.reason.trim().length < 3 || decidingId === reasonModal.candidate?.id}
                                onClick={handleSubmitNonContinuation}
                            >
                                تأكيد ونقل للأرشيف
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setReasonModal({ show: false, candidate: null, reason: '' })}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm 100% complete */}
            {confirmModal.show && (
                <div className="modal-overlay" onClick={() => setConfirmModal({ show: false, note: '' })}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>تأكيد اكتمال المراجعة</h2>
                        </div>
                        <div className="confirm-body">
                            <p>
                                بالتأكيد أنت تقر بأن بيانات المستفيدين للفصل{' '}
                                <strong>{rolloverStatus?.target_term?.term_name}</strong> مكتملة بنسبة 100%.
                            </p>
                            <p className="muted">يمكنك الاستمرار في التعديل بعد التأكيد.</p>
                            <label className="rollover-reason-label">ملاحظة (اختياري)</label>
                            <textarea
                                className="rollover-reason-input"
                                rows={2}
                                value={confirmModal.note}
                                onChange={(e) => setConfirmModal(prev => ({ ...prev, note: e.target.value }))}
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={handleConfirmReview}>تأكيد</button>
                            <button className="btn btn-secondary" onClick={() => setConfirmModal({ show: false, note: '' })}>
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

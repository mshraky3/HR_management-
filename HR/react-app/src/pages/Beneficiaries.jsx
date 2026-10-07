/**
 * Beneficiaries (المستفيدون)
 * - Branch managers: add / edit / delete beneficiaries of their healthcare centre, and review last year's
 *   beneficiaries during the new-year window.
 * - Head office: staffing requirements, statistics, exports, archive, and every branch's review status.
 * State and handlers live here; the panels under ./beneficiaries are layout.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { beneficiariesAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
    Page, PageHeader, Card, StatCard, Tabs, Toolbar, Select, FormField, Textarea, Button, Badge, Alert, Modal, Spinner,
    EmptyState, useConfirm,
} from '../ui';
import { downloadFile } from '../utils/downloadFile';
import './Beneficiaries.css';
import { SERVICE_LABELS, EMPTY_BENEFICIARY } from './beneficiaries/constants';
import BeneficiaryFields from './beneficiaries/BeneficiaryFields';
import DataPanel from './beneficiaries/DataPanel';
import StatsPanel from './beneficiaries/StatsPanel';
import StaffingPanel from './beneficiaries/StaffingPanel';
import ExportsPanel from './beneficiaries/ExportsPanel';
import RolloverPanel from './beneficiaries/RolloverPanel';

const Beneficiaries = () => {
    const { isMainManager, user } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();
    const { confirm } = useConfirm();
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

    // Add / edit dialog
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_BENEFICIARY);
    const [submitting, setSubmitting] = useState(false);

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
    // Set when the user deliberately opens one beneficiary from the list, so the
    // "all done" panel does not hide the wizard they just asked for.
    const [reviewPinned, setReviewPinned] = useState(false);
    const [showStepsHelp, setShowStepsHelp] = useState(true);

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
                    // isCandidateDone, not an inlined copy of it — the two drifted
                    // apart once already and this one silently skipped past rows the
                    // wizard still had work for.
                    const i = rows.findIndex(c => !isCandidateDone(c));
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
    // they actually HAVE a row in the new term and it has been reviewed.
    //
    // target_id is checked explicitly because target_review_status is NULL when
    // no such row exists, and `NULL !== 'pending'` is true — so a "continuing"
    // beneficiary whose new-term row went missing (deleted, or a carry-over that
    // failed) used to render as ✅ complete and get skipped by the wizard. They
    // are the opposite of done: they have no place in the new year at all.
    const isCandidateDone = (c) =>
        c.continuity_status === 'not_continuing' ||
        (c.continuity_status === 'continuing' && c.target_id && c.target_review_status !== 'pending');

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
            const res = await beneficiariesAPI.update(c.target_id, { ...reviewForm, age: parseInt(reviewForm.age) });

            const wantedBus = reviewForm.transport_service ? (reviewBusId || null) : null;
            const currentBus = c.assigned_bus_id ? String(c.assigned_bus_id) : null;
            let busChanged = false;
            if (String(wantedBus || '') !== String(currentBus || '')) {
                await beneficiariesAPI.assignRolloverBus(
                    rolloverParams({ beneficiary_id: c.target_id, bus_id: wantedBus })
                );
                busChanged = true;
            }

            // Patch the one row we changed and move on. Refetching the whole list here
            // put a spinner over the wizard between every beneficiary.
            const saved = res.data?.data || null;
            const patched = rolloverCandidates.map(row => row.id === c.id
                ? {
                    ...row,
                    target: saved || { ...row.target, ...reviewForm, age: parseInt(reviewForm.age) },
                    target_review_status: 'reviewed',
                    target_transport_service: reviewForm.transport_service,
                    assigned_bus_id: busChanged ? (wantedBus ? parseInt(wantedBus) : null) : row.assigned_bus_id,
                    bus_number: busChanged
                        ? (availableBuses.find(b => String(b.id) === String(wantedBus))?.bus_number || null)
                        : row.bus_number,
                }
                : row);
            setRolloverCandidates(patched);
            showSuccess('تم حفظ بيانات المستفيد');
            if (patched.every(isCandidateDone)) setReviewPinned(false);
            goToNextUnfinished(patched);

            // Only the new-intake count and the confirmation banner come from the
            // server now, so refresh those quietly in the background.
            loadRolloverStatus();
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
                // Carrying the buses over is the one action that changes data the
                // candidate rows don't hold, so re-read status and the bus list.
                await Promise.all([loadRolloverStatus(), loadAvailableBusesForReview()]);
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
        if (!await confirm({ message: 'هل تريد إلغاء تأكيد اكتمال المراجعة؟' })) return;
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
    // Pins the wizard open so it is still reachable after everything is done —
    // otherwise the completion panel would make already-reviewed rows uneditable.
    const openInGuidedReview = (candidateId) => {
        const idx = rolloverCandidates.findIndex(c => c.id === candidateId);
        if (idx !== -1) {
            setReviewIndex(idx);
            setReviewPinned(true);
            setRolloverView('guided');
        }
    };

    // Form handlers
    const resetForm = () => {
        setFormData(EMPTY_BENEFICIARY);
        setEditingId(null);
    };

    const closeForm = () => {
        if (submitting) return;
        setShowModal(false);
        resetForm();
        setImportedFromBus(false);
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
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
        setShowModal(true);
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
            resetForm();
            setImportedFromBus(false);
            loadBeneficiaries();
            if (isMainManager()) { loadStats(); loadStaffingRequirements(); }
            if (!isMainManager()) loadBranchStats(filters.term_id || activeTerm?.id);
            // Keeps the rollover checklist's "new beneficiaries added" count honest.
            if (rolloverStatus?.is_active) loadRolloverStatus();
        } catch (error) {
            const msg = error.response?.data?.message || 'فشل في حفظ البيانات';
            showError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (beneficiary) => {
        const ok = await confirm({
            title: 'تأكيد الحذف',
            message: `هل أنت متأكد من حذف المستفيد «${beneficiary.beneficiary_name}»؟`,
            tone: 'danger',
            confirmText: 'حذف',
        });
        if (!ok) return;
        try {
            await beneficiariesAPI.delete(beneficiary.id);
            showSuccess('تم حذف المستفيد بنجاح');
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
        if (!await confirm({ message: 'هل أنت متأكد من أرشفة بيانات هذا الفصل؟ لن يمكن التعديل عليها بعد الأرشفة.', tone: 'danger' })) return;

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
        setShowModal(true);
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
                { key: 'staffing', label: 'متطلبات التوظيف', icon: 'clipboard' },
                { key: 'data', label: 'بيانات المستفيدين', icon: 'users' },
                { key: 'stats', label: 'الإحصائيات', icon: 'chart' },
                { key: 'exports', label: 'التصدير', icon: 'download' },
            ]
            : [{ key: 'data', label: 'بيانات المستفيدين', icon: 'users' }]),
        ...(rolloverAvailable || isMainManager()
            ? [{ key: 'rollover', label: 'مراجعة السنة الجديدة', icon: 'refresh' }]
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
    // Once nothing is left, the per-beneficiary steps are over. Showing step 4
    // ("save and go to the next one") at that point is misleading — there is no next
    // one, and the real next action is adding the new intake.
    const rolloverAllDone = rolloverCandidates.length > 0 && rolloverRemaining === 0;

    // Derived from the rows we already hold rather than from the last status fetch,
    // so the progress bar and checklist move the instant a decision is applied
    // instead of waiting on a round-trip.
    const rolloverLive = {
        total: rolloverCandidates.length,
        undecided: rolloverCandidates.filter(c => !c.continuity_status).length,
        continuing: rolloverCandidates.filter(c => c.continuity_status === 'continuing').length,
        notContinuing: rolloverCandidates.filter(c => c.continuity_status === 'not_continuing').length,
        pendingReview: rolloverCandidates.filter(c => c.continuity_status === 'continuing' && c.target_review_status === 'pending').length,
    };
    rolloverLive.decided = rolloverLive.continuing + rolloverLive.notContinuing;
    const rolloverCanConfirm = rolloverLive.undecided === 0 && rolloverLive.pendingReview === 0;

    if (loading) {
        return (
            <Page>
                <PageHeader title="المستفيدون" />
                <Card><Spinner block label="جاري التحميل…" /></Card>
            </Page>
        );
    }

    const termOptions = terms.map((t) => ({
        value: t.id.toString(),
        label: `${t.term_name}${activeTerm && t.id === activeTerm.id ? ' (نشط)' : ''}`,
    }));
    const showArchive = filters.term_id && activeTerm && filters.term_id !== activeTerm.id.toString();

    const tabItems = visibleTabs.map((tab) => ({
        id: tab.key,
        label: tab.label,
        icon: tab.icon,
        count: tab.key === 'rollover' && rolloverPending > 0 ? rolloverPending : undefined,
    }));

    const rolloverProps = {
        isMain: isMainManager(), branchId: filters.branch_id, setFilters, rolloverOverview, rolloverStatus, navigate, setActiveTab,
        openAddModal, rolloverLive, rolloverDoneCount, showStepsHelp, setShowStepsHelp, rolloverView, setRolloverView,
        setReviewPinned, rolloverLoading, rolloverAllDone, reviewPinned, currentCandidate, reviewIndex, setReviewIndex,
        rolloverCandidates, rolloverRemaining, decidingId, handleMarkContinuing, setReasonModal, reviewForm, setReviewForm,
        availableBuses, reviewBusId, setReviewBusId, handleStartRollover, savingReview, handleSaveReview, goToNextUnfinished,
        rolloverFilter, setRolloverFilter, filteredCandidates, openInGuidedReview, isCandidateDone, handleUnconfirmReview,
        rolloverCanConfirm, setConfirmModal,
    };

    return (
        <Page>
            <PageHeader
                title="المستفيدون"
                subtitle={isMainManager()
                    ? 'إدارة ومتابعة بيانات المستفيدين ومتطلبات التوظيف'
                    : 'تسجيل بيانات المستفيدين والخدمات المقدمة لهم'}
                actions={canEdit && !isMainManager() && (
                    <>
                        <Button variant="primary" icon="plus" onClick={openAddModal}>إضافة مستفيد</Button>
                        <Button variant="secondary" icon="bus" onClick={openImportModal}>استيراد من الباص</Button>
                        {/* The rollover tab supersedes the blind bulk copy: showing both lets the two mechanisms
                            fight over the same rows. */}
                        {!rolloverAvailable && <Button variant="secondary" icon="restore" onClick={openCopyModal}>نسخ من فصل سابق</Button>}
                    </>
                )}
            />

            {!activeTerm && <Alert tone="warning">لا يوجد فصل دراسي نشط حالياً لمراكز الرعاية الصحية.</Alert>}
            {!isMainManager() && activeTerm && (
                <div><Badge tone="info" dot>الفصل النشط: {activeTerm.term_name}</Badge></div>
            )}

            {isMainManager() && (
                <Card flush>
                    <Toolbar>
                        <FormField label="الفصل الدراسي" className="bn-filter">
                            <Select
                                value={filters.term_id}
                                onChange={(e) => setFilters((prev) => ({ ...prev, term_id: e.target.value }))}
                                options={termOptions}
                                placeholder="اختر الفصل"
                            />
                        </FormField>
                        {activeTab !== 'staffing' && (
                            <FormField label="الفرع" className="bn-filter">
                                <Select
                                    value={filters.branch_id}
                                    onChange={(e) => setFilters((prev) => ({ ...prev, branch_id: e.target.value }))}
                                    options={branches.map((b) => ({ value: b.id.toString(), label: b.branch_name }))}
                                    placeholder="جميع الفروع"
                                />
                            </FormField>
                        )}
                        {showArchive && <Button variant="warning" icon="archive" onClick={handleArchive} className="bn-push">أرشفة هذا الفصل</Button>}
                    </Toolbar>
                </Card>
            )}

            {/* Tabs show only when more than one applies, so outside the between-years window a branch
                manager's page is just the list. */}
            {tabItems.length > 1 && <Tabs items={tabItems} value={activeTab} onChange={setActiveTab} ariaLabel="أقسام المستفيدين" />}

            {!isMainManager() && branchStats && activeTab === 'data' && (
                <div className="ui-grid-stats">
                    <StatCard label="إجمالي المستفيدين" value={branchStats.total || 0} icon="users" tone="primary" />
                    <StatCard label="ذكور" value={branchStats.male_count || 0} icon="user" tone="primary" />
                    <StatCard label="إناث" value={branchStats.female_count || 0} icon="user" tone="primary" />
                    {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                        <StatCard key={key} label={label} value={branchStats[`${key}_count`] || 0} icon="graduation-cap" tone="success" />
                    ))}
                </div>
            )}

            {isMainManager() && activeTab === 'stats' && <StatsPanel stats={stats} submissionStatus={submissionStatus} />}

            {isMainManager() && activeTab === 'staffing' && (
                <StaffingPanel
                    hasTerm={Boolean(filters.term_id)}
                    staffingData={staffingData}
                    staffingLoading={staffingLoading}
                    includeFreeStudents={includeFreeStudents}
                    setIncludeFreeStudents={setIncludeFreeStudents}
                    mergeTherapy={mergeTherapy}
                    setMergeTherapy={setMergeTherapy}
                    onExport={handleStaffingExport}
                    staffingBranchFilter={staffingBranchFilter}
                    setStaffingBranchFilter={setStaffingBranchFilter}
                    staffingSearch={staffingSearch}
                    setStaffingSearch={setStaffingSearch}
                />
            )}

            {isMainManager() && activeTab === 'exports' && (
                <ExportsPanel
                    hasTerm={Boolean(filters.term_id)}
                    exportColumns={exportColumns}
                    setExportColumns={setExportColumns}
                    onExport={handleExport}
                    onStaffingExport={handleStaffingExport}
                    hasStaffing={staffingData.length > 0}
                />
            )}

            {activeTab === 'rollover' && <RolloverPanel {...rolloverProps} />}

            {activeTab === 'data' && (
                <DataPanel
                    beneficiaries={beneficiaries}
                    isMain={isMainManager()}
                    canEdit={Boolean(canEdit)}
                    activeTerm={activeTerm}
                    searchQuery={searchQuery}
                    onSearch={setSearchQuery}
                    onAdd={openAddModal}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                />
            )}

            {/* Add / edit */}
            <Modal
                open={showModal}
                onClose={closeForm}
                title={editingId ? 'تعديل بيانات المستفيد' : 'إضافة مستفيد جديد'}
                size="lg"
                footer={(
                    <>
                        <Button variant="secondary" onClick={closeForm} disabled={submitting}>إلغاء</Button>
                        <Button variant="primary" type="submit" form="bn-form" loading={submitting}>{editingId ? 'تحديث' : 'إضافة'}</Button>
                    </>
                )}
            >
                <form id="bn-form" onSubmit={handleSubmit} noValidate>
                    <BeneficiaryFields values={formData} onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))} autoFocus />
                </form>
            </Modal>

            {/* Non-continuation reason: required, and archives the record on save */}
            <Modal
                open={reasonModal.show}
                onClose={() => setReasonModal({ show: false, candidate: null, reason: '' })}
                title="عدم استمرار المستفيد"
                description={`سيتم نقل بيانات «${reasonModal.candidate?.beneficiary_name || ''}» إلى الأرشيف.`}
                size="sm"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setReasonModal({ show: false, candidate: null, reason: '' })}>إلغاء</Button>
                        <Button
                            variant="danger"
                            disabled={reasonModal.reason.trim().length < 3 || decidingId === reasonModal.candidate?.id}
                            onClick={handleSubmitNonContinuation}
                        >
                            تأكيد ونقل للأرشيف
                        </Button>
                    </>
                )}
            >
                <FormField label="سبب عدم الاستمرار" required>
                    <Textarea
                        rows={3}
                        value={reasonModal.reason}
                        onChange={(e) => setReasonModal((prev) => ({ ...prev, reason: e.target.value }))}
                        placeholder="مثال: انتقل إلى مركز آخر"
                    />
                </FormField>
            </Modal>

            {/* Confirm 100% complete */}
            <Modal
                open={confirmModal.show}
                onClose={() => setConfirmModal({ show: false, note: '' })}
                title="تأكيد اكتمال المراجعة"
                size="sm"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setConfirmModal({ show: false, note: '' })}>إلغاء</Button>
                        <Button variant="primary" onClick={handleConfirmReview}>تأكيد</Button>
                    </>
                )}
            >
                <div className="ui-form-stack">
                    <p className="bn-text">
                        بالتأكيد أنت تقر بأن بيانات المستفيدين للفصل <strong>{rolloverStatus?.target_term?.term_name}</strong> مكتملة بنسبة 100%.
                        يمكنك الاستمرار في التعديل بعد التأكيد.
                    </p>
                    <FormField label="ملاحظة (اختياري)">
                        <Textarea rows={2} value={confirmModal.note} onChange={(e) => setConfirmModal((prev) => ({ ...prev, note: e.target.value }))} />
                    </FormField>
                </div>
            </Modal>

            {/* Import from the bus students */}
            <Modal open={showImportModal} onClose={() => setShowImportModal(false)} title="استيراد من طلاب الباص" description="اختر طالباً لاستيراد بياناته كمستفيد جديد. سيتم تعبئة الاسم ورقم التواصل تلقائياً." size="md">
                {loadingBusStudents ? (
                    <Spinner block label="جاري التحميل…" />
                ) : busStudents.length === 0 ? (
                    <EmptyState compact icon="bus" title="لا يوجد طلاب باص يمكن استيرادهم" description="جميع طلاب الباص مسجلون بالفعل كمستفيدين." />
                ) : (
                    <ul className="bn-list">
                        {busStudents.map((s) => (
                            <li key={s.id}>
                                <div className="bn-list-info">
                                    <strong>{s.student_full_name}</strong>
                                    <span className="bn-muted">
                                        {s.contact_mobile_number && <bdi>{s.contact_mobile_number}</bdi>}
                                        {s.bus_number && ` · باص ${s.bus_number}`}
                                    </span>
                                </div>
                                <Button size="sm" variant="primary" onClick={() => handleImportStudent(s)}>استيراد</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Modal>

            {/* Register in a bus right after saving a transport beneficiary */}
            <Modal
                open={showBusAssignModal}
                onClose={skipBusAssignment}
                title="تسجيل في باص"
                description="المستفيد لديه خدمة نقل مفعلة. هل تريد تسجيله في أحد الباصات؟"
                size="md"
                footer={<Button variant="secondary" onClick={skipBusAssignment} disabled={assigningBus}>تخطي</Button>}
            >
                {loadingBuses ? (
                    <Spinner block />
                ) : (
                    <ul className="bn-list">
                        {availableBuses.map((bus) => (
                            <li key={bus.id}>
                                <div className="bn-list-info">
                                    <strong>باص {bus.bus_number}</strong>
                                    <span className="bn-muted">
                                        {bus.driver_full_name && `السائق: ${bus.driver_full_name}`}
                                        {bus.number_of_seats ? ` · المقاعد: ${bus.student_count}/${bus.number_of_seats}` : ` · الطلاب: ${bus.student_count}`}
                                    </span>
                                </div>
                                <Button size="sm" variant="primary" loading={assigningBus} onClick={() => handleAssignBus(bus.id)}>تسجيل</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Modal>

            {/* Copy from a previous term */}
            <Modal
                open={showCopyModal}
                onClose={() => !copying && setShowCopyModal(false)}
                title="نسخ المستفيدين من فصل سابق"
                description="سيتم نسخ جميع المستفيدين من الفصل المختار إلى الفصل الحالي، وتخطي المسجلين مسبقاً (بناءً على رقم الهوية)."
                size="sm"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setShowCopyModal(false)} disabled={copying}>إلغاء</Button>
                        <Button variant="primary" loading={copying} disabled={!copySourceTerm} onClick={handleCopyFromTerm}>نسخ المستفيدين</Button>
                    </>
                )}
            >
                <FormField label="الفصل المصدر">
                    <Select
                        value={copySourceTerm}
                        onChange={(e) => setCopySourceTerm(e.target.value)}
                        options={availableCopyTerms.map((t) => ({ value: t.id.toString(), label: `${t.term_name} (${t.beneficiary_count} مستفيد)` }))}
                        placeholder="— اختر الفصل —"
                    />
                </FormField>
            </Modal>
        </Page>
    );
};

export default Beneficiaries;

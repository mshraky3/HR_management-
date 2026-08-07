/**
 * Employee Year Review (مراجعة الموظفين للسنة الجديدة)
 *
 * Guided, one-employee-at-a-time review for the between-years transition,
 * deliberately built to feel identical to the beneficiary rollover in
 * Beneficiaries.jsx: the same numbered steps, the same completion panel, the
 * same per-branch confirm bar. Both share styles/yearReview.css.
 *
 * Unlike beneficiaries, an employee's data lives on ONE row edited on their
 * own detail page (/employees/:id) rather than inline here — so "review the
 * data" opens that page in a new tab, and the branch comes back to confirm.
 * Saving there already marks the review done automatically (see the PUT
 * /api/employees/:id route), so returning here and refreshing shows it as
 * complete without any extra step.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import '../styles/yearReview.css';
import './EmployeeYearReview.css';

const LEAVING_STATUS_OPTIONS = [
    { value: 'terminated_article_80', label: 'إنهاء المادة 80' },
    { value: 'terminated_article_77', label: 'إنهاء المادة 77' },
    { value: 'resigned', label: 'استقالة' },
    { value: 'contract_ended', label: 'انتهاء العقد' },
    { value: 'non_renewal', label: 'عدم التجديد' },
    { value: 'other', label: 'أخرى' },
];
const LEAVING_STATUS_LABELS = Object.fromEntries(LEAVING_STATUS_OPTIONS.map(o => [o.value, o.label]));

const DOCUMENT_TYPE_LABELS = {
    employment_contract: 'عقد العمل',
};

const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

const isCandidateDone = (c) =>
    c.decision === 'leaving' || (c.decision === 'continuing' && c.data_reviewed);

const EmployeeYearReview = () => {
    const { isMainManager } = useAuth();
    const { showSuccess, showError, showWarning } = useNotification();
    const navigate = useNavigate();

    const [status, setStatus] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [decidingId, setDecidingId] = useState(null);

    const [view, setView] = useState('guided'); // 'guided' | 'list'
    const [filter, setFilter] = useState('undecided');
    const [showStepsHelp, setShowStepsHelp] = useState(true);
    const [reviewIndex, setReviewIndex] = useState(0);
    const [reviewPinned, setReviewPinned] = useState(false);

    const [leavingModal, setLeavingModal] = useState({ show: false, candidate: null, status: '', reason: '' });
    const [confirmModal, setConfirmModal] = useState({ show: false, note: '' });

    // Main manager only: pick a branch type to see the overview, then drill
    // into one branch. Branch managers never touch this — the server resolves
    // their own branch.
    const [overviewBranchType, setOverviewBranchType] = useState('healthcare_center');
    const [overview, setOverview] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState(null);
    const [selectedBranchName, setSelectedBranchName] = useState(null);

    const branchParams = (extra = {}) => {
        const params = { ...extra };
        if (isMainManager() && selectedBranchId) params.branch_id = selectedBranchId;
        return params;
    };

    const loadStatus = async () => {
        if (isMainManager() && !selectedBranchId) { setStatus(null); return null; }
        try {
            const res = await employeesAPI.getYearReviewStatus(branchParams());
            if (res.data.success) { setStatus(res.data.data); return res.data.data; }
        } catch (error) {
            console.error('Error loading employee year-review status:', error);
        }
        return null;
    };

    const loadCandidates = async ({ jumpToFirstUnfinished = false } = {}) => {
        if (isMainManager() && !selectedBranchId) { setCandidates([]); return null; }
        try {
            setLoading(true);
            const res = await employeesAPI.getYearReviewCandidates(branchParams());
            if (res.data.success) {
                const rows = res.data.data || [];
                setCandidates(rows);
                if (jumpToFirstUnfinished) {
                    const i = rows.findIndex(c => !isCandidateDone(c));
                    setReviewIndex(i === -1 ? 0 : i);
                }
                return rows;
            }
        } catch (error) {
            console.error('Error loading employee year-review candidates:', error);
        } finally {
            setLoading(false);
        }
        return null;
    };

    const loadOverview = async (branchType = overviewBranchType) => {
        try {
            const res = await employeesAPI.getYearReviewOverview({ branch_type: branchType });
            if (res.data.success) setOverview(res.data.data || []);
        } catch (error) {
            console.error('Error loading employee year-review overview:', error);
        }
    };

    const refresh = async () => {
        const [, rows] = await Promise.all([loadStatus(), loadCandidates()]);
        return rows;
    };

    // Branch manager: load on mount. Main manager: load the overview on mount,
    // and load status/candidates whenever a branch is selected.
    useEffect(() => {
        if (isMainManager()) {
            loadOverview(overviewBranchType);
        } else {
            (async () => {
                const s = await loadStatus();
                if (s?.is_active) {
                    await loadCandidates({ jumpToFirstUnfinished: true });
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isMainManager() && selectedBranchId) {
            (async () => {
                const s = await loadStatus();
                if (s?.is_active) await loadCandidates({ jumpToFirstUnfinished: true });
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBranchId]);

    // Coming back from the employee detail page (edited in a new tab) should
    // reflect any change without the branch needing to remember to refresh.
    useEffect(() => {
        const onFocus = () => {
            if (status?.is_active) refresh();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.is_active, selectedBranchId]);

    const currentCandidate = candidates[reviewIndex] || null;
    const doneCount = candidates.filter(isCandidateDone).length;
    const allDone = candidates.length > 0 && doneCount === candidates.length;

    const live = useMemo(() => {
        const undecided = candidates.filter(c => !c.decision).length;
        const continuing = candidates.filter(c => c.decision === 'continuing').length;
        const leaving = candidates.filter(c => c.decision === 'leaving').length;
        const pendingReview = candidates.filter(c => c.decision === 'continuing' && !c.data_reviewed).length;
        return {
            total: candidates.length, undecided, continuing, leaving,
            decided: continuing + leaving, pendingReview,
        };
    }, [candidates]);
    const canConfirm = live.undecided === 0 && live.pendingReview === 0;

    const goToNextUnfinished = (list = candidates) => {
        if (!list.length) return;
        const next = list.findIndex((c, i) => i > reviewIndex && !isCandidateDone(c));
        if (next !== -1) { setReviewIndex(next); return; }
        const anyLeft = list.findIndex(c => !isCandidateDone(c));
        if (anyLeft !== -1) setReviewIndex(anyLeft);
    };

    const filteredCandidates = candidates.filter(c => {
        if (filter === 'all') return true;
        if (filter === 'undecided') return !c.decision;
        return c.decision === filter;
    });

    const handleMarkContinuing = async (candidate) => {
        setDecidingId(candidate.id);
        try {
            const res = await employeesAPI.decideYearReview(
                branchParams({ decisions: [{ employee_id: candidate.id, decision: 'continuing' }] })
            );
            const result = res.data?.data?.results?.[0];
            if (!result?.ok) { showWarning(result?.error || 'تعذر حفظ القرار'); return; }
            const patched = candidates.map(c => c.id === candidate.id
                ? { ...c, decision: 'continuing', leaving_status: null, leaving_reason: null, data_reviewed: false }
                : c);
            setCandidates(patched);
            showSuccess('سيستمر — راجع بياناته الآن');
            loadStatus();
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في حفظ القرار');
        } finally {
            setDecidingId(null);
        }
    };

    const handleSubmitLeaving = async () => {
        const reason = leavingModal.reason.trim();
        if (!leavingModal.status) return showWarning('يجب اختيار سبب المغادرة');

        const candidate = leavingModal.candidate;
        setDecidingId(candidate.id);
        try {
            const res = await employeesAPI.decideYearReview(
                branchParams({ decisions: [{ employee_id: candidate.id, decision: 'leaving', leaving_status: leavingModal.status, reason }] })
            );
            const result = res.data?.data?.results?.[0];
            if (!result?.ok) { showWarning(result?.error || 'تعذر حفظ القرار'); return; }
            const patched = candidates.map(c => c.id === candidate.id
                ? { ...c, decision: 'leaving', leaving_status: leavingModal.status, leaving_reason: reason, data_reviewed: true }
                : c);
            setCandidates(patched);
            setLeavingModal({ show: false, candidate: null, status: '', reason: '' });
            showSuccess('تم نقل الموظف إلى الأرشيف');
            loadStatus();
            goToNextUnfinished(patched);
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في حفظ القرار');
        } finally {
            setDecidingId(null);
        }
    };

    const handleMarkReviewed = async (candidate) => {
        setDecidingId(candidate.id);
        try {
            const res = await employeesAPI.markYearReviewReviewed(
                branchParams({ employee_ids: [candidate.id] })
            );
            // Patch only the ids the server actually flipped. Trusting the bare
            // success flag ticked the employee off locally even when the update
            // matched nothing, so the screen showed the review complete while
            // the server kept counting them as pending and the confirm button
            // stayed disabled with no explanation.
            const flipped = res.data?.data?.employeeIds || [];
            if (res.data.success && flipped.includes(candidate.id)) {
                const patched = candidates.map(c => c.id === candidate.id ? { ...c, data_reviewed: true } : c);
                setCandidates(patched);
                showSuccess('تمت مراجعة بيانات الموظف');
                loadStatus();
                if (patched.every(isCandidateDone)) setReviewPinned(false);
                goToNextUnfinished(patched);
            } else {
                showWarning('تعذر تحديث حالة المراجعة. يتم تحديث القائمة الآن');
                await refresh();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في تحديث حالة المراجعة');
            // The server rejected the flip (409 = nothing matched), so this
            // screen is out of date. Re-read rather than leaving the branch
            // clicking a button that will keep failing.
            if (error.response?.status === 409) await refresh();
        } finally {
            setDecidingId(null);
        }
    };

    const openEmployeeDetail = (id) => {
        window.open(`/employees/${id}`, '_blank', 'noopener');
    };

    const openInGuidedReview = (candidateId) => {
        const idx = candidates.findIndex(c => c.id === candidateId);
        if (idx !== -1) { setReviewIndex(idx); setReviewPinned(true); setView('guided'); }
    };

    const handleConfirm = async () => {
        try {
            const res = await employeesAPI.confirmYearReview(
                branchParams({ note: confirmModal.note.trim() || undefined })
            );
            if (res.data.success) {
                showSuccess(res.data.message);
                setConfirmModal({ show: false, note: '' });
                loadStatus();
                if (isMainManager()) loadOverview();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في تأكيد المراجعة');
        }
    };

    const handleUnconfirm = async () => {
        if (!window.confirm('هل تريد إلغاء تأكيد اكتمال المراجعة؟')) return;
        try {
            const res = await employeesAPI.unconfirmYearReview(branchParams());
            if (res.data.success) {
                showSuccess(res.data.message);
                loadStatus();
                if (isMainManager()) loadOverview();
            }
        } catch (error) {
            showError(error.response?.data?.message || 'فشل في إلغاء التأكيد');
        }
    };

    // ---- Main manager: pick a branch type, see the overview, drill into one branch ----
    if (isMainManager() && !selectedBranchId) {
        return (
            <div className="rollover-tab eyr-overview">
                <div className="rollover-overview-header">
                    <h2>حالة مراجعة الموظفين للسنة الجديدة</h2>
                    <span className="rollover-summary-chip">
                        {overview.filter(b => b.is_confirmed).length} / {overview.length} فرع أكّد
                    </span>
                </div>
                <div className="rollover-view-switch">
                    <button
                        className={`rollover-pill ${overviewBranchType === 'healthcare_center' ? 'active' : ''}`}
                        onClick={() => { setOverviewBranchType('healthcare_center'); loadOverview('healthcare_center'); }}
                    >
                        🏥 مراكز الرعاية
                    </button>
                    <button
                        className={`rollover-pill ${overviewBranchType === 'school' ? 'active' : ''}`}
                        onClick={() => { setOverviewBranchType('school'); loadOverview('school'); }}
                    >
                        🏫 المدارس
                    </button>
                </div>
                {overview.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🏢</span>
                        <h3>لا توجد فروع</h3>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table rollover-overview-table">
                            <thead>
                                <tr>
                                    <th>الفرع</th>
                                    <th>موظفو العام الماضي</th>
                                    <th>تم القرار</th>
                                    <th>مستمر</th>
                                    <th>مغادر</th>
                                    <th>بانتظار المراجعة</th>
                                    <th>موظفون جدد</th>
                                    <th>الحالة</th>
                                    <th>تأكيد بواسطة</th>
                                    <th>التاريخ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overview.map(row => (
                                    <tr
                                        key={row.branch_id}
                                        className="clickable-row"
                                        onClick={() => { setSelectedBranchId(row.branch_id); setSelectedBranchName(row.branch_name); }}
                                    >
                                        <td>{row.branch_name}</td>
                                        <td>{row.source_total}</td>
                                        <td>{row.decided} / {row.source_total}</td>
                                        <td>{row.continuing}</td>
                                        <td>{row.leaving}</td>
                                        <td>{row.pending_review}</td>
                                        <td>{row.new_hires}</td>
                                        <td>
                                            <span className={`rollover-badge ${row.is_confirmed ? 'confirmed' : 'not-confirmed'}`}>
                                                {row.is_confirmed ? '🟢 مكتمل' : '🔴 غير مكتمل'}
                                            </span>
                                        </td>
                                        <td>{row.confirmed_by_label || '-'}</td>
                                        <td>{row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString('ar-SA') : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="rollover-tab">
            {isMainManager() && (
                <button
                    className="btn btn-secondary btn-sm rollover-back-btn"
                    onClick={() => { setSelectedBranchId(null); setSelectedBranchName(null); setStatus(null); setCandidates([]); }}
                >
                    ← العودة لحالة كل الفروع
                </button>
            )}

            {isMainManager() && selectedBranchName && (
                <div className="eyr-branch-chip">الفرع: {selectedBranchName}</div>
            )}

            {!status ? (
                <div className="loading-container"><div className="spinner-large"></div><p>جاري التحميل...</p></div>
            ) : !status.is_active ? (
                <div className="empty-state">
                    <span className="empty-icon">📅</span>
                    <h3>لا توجد سنة دراسية جديدة</h3>
                    <p>{status.blocking_reason}</p>
                    {isMainManager() && (
                        <button className="btn btn-primary" onClick={() => navigate('/term-management')}>
                            إدارة السنوات والفصول الدراسية
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div className="rollover-header">
                        <div className="rollover-terms">
                            <span className="rollover-term-chip previous">
                                السنة السابقة: {status.previous_year?.year_label || 'لا يوجد'}
                            </span>
                            <span className="rollover-arrow">←</span>
                            <span className="rollover-term-chip next">
                                السنة الجديدة: {status.target_year?.year_label}
                            </span>
                        </div>
                        <div className="rollover-progress">
                            <div className="rollover-progress-bar">
                                <div
                                    className="rollover-progress-fill"
                                    style={{ width: `${live.total > 0 ? Math.round((doneCount / live.total) * 100) : 100}%` }}
                                />
                            </div>
                            <span className="rollover-progress-label">
                                أنجزت {doneCount} من {live.total} موظف
                            </span>
                        </div>
                    </div>

                    <div className="rollover-help">
                        <button className="rollover-help-toggle" onClick={() => setShowStepsHelp(v => !v)}>
                            {showStepsHelp ? '▼' : '◀'} كيف أكمل مراجعة الموظفين؟ (اقرأ الخطوات)
                        </button>
                        {showStepsHelp && (
                            <ol className="rollover-help-list">
                                <li><strong>حدّد المصير:</strong> لكل موظف من العام الماضي، اختر «سيستمر» أو «مغادر».</li>
                                <li><strong>عند المغادرة:</strong> اختر السبب من القائمة (التفاصيل اختيارية).</li>
                                <li><strong>راجع بياناته:</strong> إذا كان سيستمر، تحقق من قائمة النواقص ومستندات التجديد.</li>
                                <li><strong>عدّل عند الحاجة:</strong> افتح صفحة الموظف من زر «تعديل بيانات الموظف»، احفظ، ثم عد لهذه الصفحة.</li>
                                <li><strong>أو أكّد أن لا تعديل مطلوب</strong> بزر «تم التحقق»، وينتقل تلقائياً للموظف التالي.</li>
                                <li><strong>أضف الجدد:</strong> من صفحة الموظفين أضف من لم يكن مسجلاً العام الماضي.</li>
                                <li><strong>أكّد:</strong> بعد إنهاء كل ما سبق، اضغط «تأكيد اكتمال بيانات الموظفين 100%» أسفل الصفحة.</li>
                            </ol>
                        )}
                        <p className="rollover-help-note">
                            ⚠️ الموظف الذي تحدده «مغادر» يُنقل مباشرة إلى الأرشيف بالسبب الذي تحدده.
                        </p>
                    </div>

                    {live.total === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">🆕</span>
                            <h3>لا يوجد موظفون من العام الماضي لمراجعتهم</h3>
                        </div>
                    ) : (
                        <>
                            <div className="rollover-view-switch">
                                <button className={`rollover-pill ${view === 'guided' ? 'active' : ''}`} onClick={() => setView('guided')}>
                                    📝 المراجعة خطوة بخطوة
                                </button>
                                <button className={`rollover-pill ${view === 'list' ? 'active' : ''}`} onClick={() => { setReviewPinned(false); setView('list'); }}>
                                    📋 عرض القائمة كاملة
                                </button>
                            </div>

                            {loading ? (
                                <div className="loading-container"><div className="spinner-large"></div><p>جاري التحميل...</p></div>
                            ) : view === 'guided' ? (
                                ((allDone && !reviewPinned) || !currentCandidate) ? (
                                    <div className="rollover-done-panel">
                                        <span className="rollover-done-icon">🎉</span>
                                        <h3>انتهيت من مراجعة جميع موظفي العام الماضي</h3>
                                        <p className="rollover-done-sub">{doneCount} من {live.total} — لم يتبقَ أحد للمراجعة</p>
                                        <div className="rollover-done-next">
                                            <span className="rollover-done-next-label">الخطوة التالية</span>
                                            <p>هل هناك موظفون <strong>جدد</strong> لم يكونوا مسجلين العام الماضي؟ أضفهم من صفحة الموظفين.</p>
                                            <button className="btn btn-primary btn-lg" onClick={() => navigate('/employees')}>
                                                + إضافة موظف جديد
                                            </button>
                                            <p className="rollover-done-hint">
                                                وإذا لم يكن هناك موظفون جدد، انتقل مباشرة إلى «تأكيد اكتمال البيانات 100%» في الأسفل.
                                            </p>
                                        </div>
                                        <button className="rollover-link-btn" onClick={() => { setReviewPinned(false); setView('list'); }}>
                                            مراجعة القائمة كاملة مرة أخرى
                                        </button>
                                    </div>
                                ) : (
                                    <div className="rollover-wizard">
                                        <div className="rollover-wizard-nav">
                                            <button className="btn btn-sm btn-secondary" disabled={reviewIndex === 0} onClick={() => setReviewIndex(i => Math.max(0, i - 1))}>
                                                → السابق
                                            </button>
                                            <span className="rollover-wizard-pos">
                                                الموظف {reviewIndex + 1} من {candidates.length}
                                                {(live.total - doneCount) > 0 && <span className="rollover-wizard-remaining"> · متبقٍ {live.total - doneCount}</span>}
                                            </span>
                                            <button className="btn btn-sm btn-secondary" disabled={reviewIndex >= candidates.length - 1} onClick={() => setReviewIndex(i => Math.min(candidates.length - 1, i + 1))}>
                                                التالي ←
                                            </button>
                                        </div>

                                        <div className="rollover-identity">
                                            <h3 className="rollover-identity-name">{fullName(currentCandidate)}</h3>
                                            <div className="rollover-identity-meta">
                                                <span>رقم الهوية/الإقامة: <strong>{currentCandidate.id_or_residency_number}</strong></span>
                                                <span>رقم الموظف: <strong>{currentCandidate.employee_id_number || '-'}</strong></span>
                                                <span>المسمى الوظيفي: <strong>{currentCandidate.job_title || currentCandidate.occupation || '-'}</strong></span>
                                                <span>الجنسية: <strong>{currentCandidate.nationality}</strong></span>
                                            </div>
                                        </div>

                                        <div className={`rollover-step ${currentCandidate.decision ? 'done' : 'active'}`}>
                                            <div className="rollover-step-head">
                                                <span className="rollover-step-num">1</span>
                                                <h4>هل سيستمر هذا الموظف معنا هذا العام؟</h4>
                                            </div>
                                            <div className="rollover-step-body">
                                                {!currentCandidate.decision ? (
                                                    <div className="rollover-choice">
                                                        <button className="btn btn-success" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>
                                                            ✅ نعم، سيستمر
                                                        </button>
                                                        <button className="btn btn-danger" disabled={decidingId === currentCandidate.id} onClick={() => setLeavingModal({ show: true, candidate: currentCandidate, status: '', reason: '' })}>
                                                            ⛔ لا، مغادر
                                                        </button>
                                                    </div>
                                                ) : currentCandidate.decision === 'continuing' ? (
                                                    <div className="rollover-answered">
                                                        <span className="rollover-badge reviewed">✅ سيستمر هذا العام</span>
                                                        <button className="rollover-link-btn" onClick={() => setLeavingModal({ show: true, candidate: currentCandidate, status: '', reason: '' })}>
                                                            تغيير إلى «مغادر»
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="rollover-answered">
                                                        <span className="rollover-badge stopped">⛔ مغادر — {LEAVING_STATUS_LABELS[currentCandidate.leaving_status] || currentCandidate.leaving_status}</span>
                                                        <span className="rollover-reason-shown">السبب: {currentCandidate.leaving_reason}</span>
                                                        <button className="rollover-link-btn" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>
                                                            تراجع — سيستمر فعلاً
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {currentCandidate.decision === 'continuing' && (
                                            <div className={`rollover-step ${currentCandidate.data_reviewed ? 'done' : 'active'}`}>
                                                <div className="rollover-step-head">
                                                    <span className="rollover-step-num">2</span>
                                                    <h4>راجع بياناته</h4>
                                                    {currentCandidate.data_reviewed && <span className="rollover-badge reviewed">تمت المراجعة</span>}
                                                </div>
                                                <div className="rollover-step-body">
                                                    {currentCandidate.missing_fields_live?.length > 0 ? (
                                                        <div className="eyr-missing-block">
                                                            <label className="rollover-block-label">بيانات ناقصة</label>
                                                            <ul className="eyr-missing-list">
                                                                {currentCandidate.missing_fields_live.map((f, i) => <li key={i}>⬜ {f}</li>)}
                                                            </ul>
                                                        </div>
                                                    ) : (
                                                        <p className="eyr-complete-note">✅ لا توجد بيانات ناقصة أساسية</p>
                                                    )}

                                                    {(currentCandidate.renewal_documents?.missing?.length > 0 || currentCandidate.renewal_documents?.stale?.length > 0) && (
                                                        <div className="rollover-inline-warning eyr-docs-warning">
                                                            <div>
                                                                <strong>مستندات التجديد (تنبيه — لن يمنع الحفظ):</strong>
                                                                {currentCandidate.renewal_documents.missing.length > 0 && (
                                                                    <div>غير موجودة: {currentCandidate.renewal_documents.missing.map(t => DOCUMENT_TYPE_LABELS[t] || t).join('، ')}</div>
                                                                )}
                                                                {currentCandidate.renewal_documents.stale.length > 0 && (
                                                                    <div>قديمة (قبل بداية السنة الجديدة): {currentCandidate.renewal_documents.stale.map(t => DOCUMENT_TYPE_LABELS[t] || t).join('، ')}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="rollover-save-row">
                                                        <button className="btn btn-primary btn-lg" onClick={() => openEmployeeDetail(currentCandidate.id)}>
                                                            تعديل بيانات الموظف ↗
                                                        </button>
                                                        {!currentCandidate.data_reviewed && (
                                                            <button className="btn btn-secondary" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkReviewed(currentCandidate)}>
                                                                تم التحقق — لا تعديل مطلوب
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {currentCandidate.decision === 'leaving' && (
                                            <div className="rollover-step-actions">
                                                <button className="btn btn-primary" onClick={() => goToNextUnfinished()}>
                                                    الانتقال للموظف التالي ←
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            ) : (
                                <>
                                    <div className="rollover-filters">
                                        {[
                                            { key: 'undecided', label: `لم يتم القرار (${live.undecided})` },
                                            { key: 'continuing', label: `مستمر (${live.continuing})` },
                                            { key: 'leaving', label: `مغادر (${live.leaving})` },
                                            { key: 'all', label: `الكل (${live.total})` },
                                        ].map(pill => (
                                            <button key={pill.key} className={`rollover-pill ${filter === pill.key ? 'active' : ''}`} onClick={() => setFilter(pill.key)}>
                                                {pill.label}
                                            </button>
                                        ))}
                                    </div>
                                    {filteredCandidates.length === 0 ? (
                                        <div className="empty-state"><span className="empty-icon">✅</span><h3>لا توجد سجلات في هذا التصنيف</h3></div>
                                    ) : (
                                        <div className="table-wrapper">
                                            <table className="data-table rollover-table">
                                                <thead>
                                                    <tr>
                                                        <th>#</th>
                                                        <th>الاسم</th>
                                                        <th>رقم الهوية/الإقامة</th>
                                                        <th>المسمى الوظيفي</th>
                                                        <th>الحالة</th>
                                                        <th>الإجراء</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredCandidates.map((c, index) => (
                                                        <tr key={c.id} className={`rollover-row ${c.decision || 'undecided'}`}>
                                                            <td>{index + 1}</td>
                                                            <td>{fullName(c)}</td>
                                                            <td>{c.id_or_residency_number}</td>
                                                            <td>{c.job_title || c.occupation || '-'}</td>
                                                            <td>
                                                                {!c.decision && <span className="rollover-badge undecided">⏳ بانتظار القرار</span>}
                                                                {c.decision === 'continuing' && !c.data_reviewed && <span className="rollover-badge pending">✅ مستمر — بانتظار المراجعة</span>}
                                                                {c.decision === 'continuing' && c.data_reviewed && <span className="rollover-badge reviewed">✅ مكتمل</span>}
                                                                {c.decision === 'leaving' && <span className="rollover-badge stopped" title={c.leaving_reason || ''}>⛔ مغادر</span>}
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

                    <div className="rollover-final">
                        <div className="rollover-step-head">
                            <span className="rollover-step-num final">✓</span>
                            <h4>الخطوة الأخيرة — تأكيد اكتمال البيانات</h4>
                        </div>
                        <ul className="rollover-checklist">
                            <li className={live.undecided === 0 ? 'ok' : 'todo'}>
                                {live.undecided === 0 ? '✅' : '⬜'} تحديد مصير جميع موظفي العام الماضي
                                <span className="rollover-checklist-count">({live.decided} من {live.total})</span>
                            </li>
                            <li className={live.pendingReview === 0 ? 'ok' : 'todo'}>
                                {live.pendingReview === 0 ? '✅' : '⬜'} مراجعة بيانات الموظفين المستمرين
                                {live.pendingReview > 0 && <span className="rollover-checklist-count">(متبقٍ {live.pendingReview})</span>}
                            </li>
                            <li className="info rollover-checklist-add">
                                <span>
                                    ℹ️ إضافة الموظفين الجدد الذين لم يكونوا مسجلين العام الماضي
                                    <span className="rollover-checklist-count">(تمت إضافة {status.counts.new_hires})</span>
                                </span>
                                <button className={`btn btn-sm ${allDone ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate('/employees')}>
                                    + إضافة موظف جديد
                                </button>
                            </li>
                        </ul>

                        <div className="rollover-confirm-bar">
                            {status.confirmation ? (
                                <div className="rollover-confirmed">
                                    <span className="rollover-confirmed-text">
                                        ✅ تم تأكيد اكتمال البيانات بواسطة {status.confirmation.confirmed_by_label || '—'} بتاريخ{' '}
                                        {new Date(status.confirmation.confirmed_at).toLocaleDateString('ar-SA')}
                                    </span>
                                    {status.confirmation.is_stale && <span className="rollover-stale-note">⚠️ تم تعديل بيانات بعد التأكيد</span>}
                                    <button className="btn btn-sm btn-secondary" onClick={handleUnconfirm}>تراجع عن التأكيد</button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        className="btn btn-primary btn-lg"
                                        disabled={!canConfirm}
                                        onClick={() => setConfirmModal({ show: true, note: '' })}
                                    >
                                        تأكيد اكتمال بيانات الموظفين 100%
                                    </button>
                                    <span className="rollover-blocking-reason">
                                        {live.undecided > 0
                                            ? `يوجد ${live.undecided} موظف لم يتم اتخاذ قرار بشأنه`
                                            : live.pendingReview > 0
                                                ? `يوجد ${live.pendingReview} موظف لم تتم مراجعة بياناته`
                                                : 'اضغط الزر فقط بعد إضافة الموظفين الجدد أيضاً'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {leavingModal.show && (
                <div className="modal-overlay" onClick={() => setLeavingModal({ show: false, candidate: null, status: '', reason: '' })}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header"><h2>مغادرة الموظف</h2></div>
                        <div className="confirm-body">
                            <p>سيتم نقل بيانات الموظف إلى الأرشيف:</p>
                            <strong>{fullName(leavingModal.candidate || {})}</strong>
                            <label className="rollover-reason-label">سبب المغادرة <span className="required">*</span></label>
                            <select
                                className="rollover-select"
                                value={leavingModal.status}
                                onChange={(e) => setLeavingModal(prev => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="">— اختر السبب —</option>
                                {LEAVING_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <label className="rollover-reason-label">تفاصيل السبب (اختياري)</label>
                            <textarea
                                className="rollover-reason-input"
                                rows={3}
                                value={leavingModal.reason}
                                onChange={(e) => setLeavingModal(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="مثال: انتقل للعمل في جهة أخرى"
                                autoFocus
                            />
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn btn-danger"
                                disabled={!leavingModal.status || decidingId === leavingModal.candidate?.id}
                                onClick={handleSubmitLeaving}
                            >
                                تأكيد ونقل للأرشيف
                            </button>
                            <button className="btn btn-secondary" onClick={() => setLeavingModal({ show: false, candidate: null, status: '', reason: '' })}>
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmModal.show && (
                <div className="modal-overlay" onClick={() => setConfirmModal({ show: false, note: '' })}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header"><h2>تأكيد اكتمال المراجعة</h2></div>
                        <div className="confirm-body">
                            <p>
                                بالتأكيد أنت تقر بأن بيانات الموظفين للسنة{' '}
                                <strong>{status?.target_year?.year_label}</strong> مكتملة بنسبة 100%.
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
                            <button className="btn btn-primary" onClick={handleConfirm}>تأكيد</button>
                            <button className="btn btn-secondary" onClick={() => setConfirmModal({ show: false, note: '' })}>إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeYearReview;

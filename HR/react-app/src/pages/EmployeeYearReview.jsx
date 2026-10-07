/**
 * Employee Year Review (مراجعة الموظفين للسنة الجديدة)
 *
 * Guided, one-employee-at-a-time review for the between-years transition,
 * deliberately built to feel identical to the beneficiary rollover in
 * Beneficiaries.jsx: the same numbered steps, the same completion panel, the
 * same per-branch confirm bar. Both share styles/yearReview.css.
 *
 * Unlike beneficiaries, an employee's data lives on ONE row edited in the
 * employee form of the Employees page (this review is a tab of that page), so
 * "review the data" opens that form via onEditEmployee and closing it comes
 * back here. Saving the form already marks the review done automatically (see
 * the PUT /api/employees/:id route). A new contract can also be uploaded right
 * here, since an outdated contract is the most common renewal gap.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeesAPI, documentsAPI } from '../utils/api';
import { MAX_UPLOAD_BYTES, fileTooLargeMessage, uploadErrorMessage } from '../utils/uploadLimits';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
    Card, Tabs, Button, Badge, Alert, Icon, DataTable, EmptyState, Spinner, FormField, Select, Input, Textarea, Modal, CopyText, useConfirm,
} from '../ui';
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

function Step({ n, title, state = 'active', children, aside }) {
    return (
        <section className={`eyr-step is-${state}`}>
            <header className="eyr-step-head">
                <span className="eyr-step-num" aria-hidden="true">{state === 'done' ? <Icon name="check" size={16} /> : n}</span>
                <h3>{title}</h3>
                {aside}
            </header>
            <div className="eyr-step-body">{children}</div>
        </section>
    );
}

const EmployeeYearReview = ({ onAddEmployee, onEditEmployee }) => {
    const { isMainManager } = useAuth();
    const { showSuccess, showError, showWarning } = useNotification();
    const { confirm } = useConfirm();
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

    const [contractUploadingId, setContractUploadingId] = useState(null);
    const [leavingModal, setLeavingModal] = useState({ show: false, candidate: null, status: '', reason: '', last_working_day: '' });
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
                branchParams({ decisions: [{ employee_id: candidate.id, decision: 'leaving', leaving_status: leavingModal.status, reason, last_working_day: leavingModal.last_working_day || undefined }] })
            );
            const result = res.data?.data?.results?.[0];
            if (!result?.ok) { showWarning(result?.error || 'تعذر حفظ القرار'); return; }
            const patched = candidates.map(c => c.id === candidate.id
                ? { ...c, decision: 'leaving', leaving_status: leavingModal.status, leaving_reason: reason, data_reviewed: true }
                : c);
            setCandidates(patched);
            setLeavingModal({ show: false, candidate: null, status: '', reason: '', last_working_day: '' });
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

    // Opens the employee form (with its document uploads) on the Employees page.
    // Without the callback (rendered elsewhere) fall back to the detail page.
    const openEmployeeDetail = (id) => {
        if (onEditEmployee) onEditEmployee(id);
        else window.open(`/employees/${id}`, '_blank', 'noopener');
    };

    // The review lives inside /employees, so navigating there would do nothing.
    const addNewEmployee = () => {
        if (onAddEmployee) onAddEmployee();
        else navigate('/employees');
    };

    const handleContractUpload = async (candidate, event) => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
            showWarning('نوع الملف غير مدعوم. يُسمح بملفات PDF و JPG و PNG.');
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            showWarning(fileTooLargeMessage(file.name));
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('employee_id', candidate.id);
        formData.append('document_type', 'employment_contract');
        setContractUploadingId(candidate.id);
        try {
            await documentsAPI.upload(formData);
            showSuccess(`تم رفع عقد العمل الجديد لـ ${fullName(candidate)}`);
            await refresh();
        } catch (error) {
            showError(`لم يتم رفع العقد: ${uploadErrorMessage(error)}`);
        } finally {
            setContractUploadingId(null);
        }
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
        if (!await confirm({ message: 'هل تريد إلغاء تأكيد اكتمال المراجعة؟' })) return;
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

    const resetLeaving = () => setLeavingModal({ show: false, candidate: null, status: '', reason: '', last_working_day: '' });
    const askLeaving = (candidate) => setLeavingModal({ show: true, candidate, status: '', reason: '', last_working_day: '' });
    const formatDay = (value) => (value ? new Date(value).toLocaleDateString('ar-SA') : '—');
    const goBackToOverview = () => { setSelectedBranchId(null); setSelectedBranchName(null); setStatus(null); setCandidates([]); };

    // ---- Main manager: pick a branch type, see the overview, drill into one branch ----
    if (isMainManager() && !selectedBranchId) {
        const columns = [
            { key: 'branch_name', header: 'الفرع', mobilePrimary: true, render: (row) => <strong>{row.branch_name}</strong> },
            { key: 'source_total', header: 'موظفو العام الماضي', align: 'center' },
            { key: 'decided', header: 'تم القرار', align: 'center', render: (row) => <bdi>{row.decided} / {row.source_total}</bdi> },
            { key: 'continuing', header: 'مستمر', align: 'center' },
            { key: 'leaving', header: 'مغادر', align: 'center' },
            { key: 'pending_review', header: 'بانتظار المراجعة', align: 'center' },
            { key: 'new_hires', header: 'موظفون جدد', align: 'center' },
            { key: 'status', header: 'الحالة', render: (row) => (row.is_confirmed ? <Badge tone="success" dot>مكتمل</Badge> : <Badge tone="danger" dot>غير مكتمل</Badge>) },
            { key: 'confirmed_by_label', header: 'تأكيد بواسطة', mobileHidden: true, render: (row) => row.confirmed_by_label || '—' },
            { key: 'confirmed_at', header: 'التاريخ', mobileHidden: true, render: (row) => formatDay(row.confirmed_at) },
        ];
        return (
            <div className="eyr-stack">
                <Tabs
                    value={overviewBranchType}
                    onChange={(type) => { setOverviewBranchType(type); loadOverview(type); }}
                    ariaLabel="نوع الفرع"
                    items={[{ id: 'healthcare_center', label: 'مراكز الرعاية', icon: 'building' }, { id: 'school', label: 'المدارس', icon: 'graduation-cap' }]}
                />
                <Card
                    title="حالة مراجعة الموظفين للسنة الجديدة"
                    subtitle="اضغط على فرع لعرض تفاصيله"
                    actions={<Badge tone="info"><bdi>{overview.filter((b) => b.is_confirmed).length} / {overview.length}</bdi> فرع أكّد</Badge>}
                    flush
                >
                    <DataTable
                        columns={columns}
                        rows={overview}
                        rowKey="branch_id"
                        onRowClick={(row) => { setSelectedBranchId(row.branch_id); setSelectedBranchName(row.branch_name); }}
                        emptyIcon="building"
                        emptyTitle="لا توجد فروع"
                    />
                </Card>
            </div>
        );
    }

    if (!status) return <Card><Spinner block label="جاري التحميل…" /></Card>;

    if (!status.is_active) {
        return (
            <div className="eyr-stack">
                {isMainManager() && <div><Button variant="ghost" icon="arrow-start" onClick={goBackToOverview}>العودة لحالة كل الفروع</Button></div>}
                <Card>
                    <EmptyState
                        icon="calendar"
                        title="لا توجد سنة دراسية جديدة"
                        description={status.blocking_reason}
                        action={isMainManager() ? <Button variant="primary" onClick={() => navigate('/term-management')}>إدارة السنوات والفصول الدراسية</Button> : null}
                    />
                </Card>
            </div>
        );
    }

    const progress = live.total > 0 ? Math.round((doneCount / live.total) * 100) : 100;
    const wizardDone = (allDone && !reviewPinned) || !currentCandidate;
    const renewal = currentCandidate?.renewal_documents;
    const needsContract = renewal ? [...renewal.missing, ...renewal.stale].includes('employment_contract') : false;
    const statusOf = (c) => {
        if (!c.decision) return <Badge tone="neutral" dot>بانتظار القرار</Badge>;
        if (c.decision === 'leaving') return <Badge tone="danger" dot title={c.leaving_reason || ''}>مغادر</Badge>;
        return c.data_reviewed ? <Badge tone="success" dot>مكتمل</Badge> : <Badge tone="warning" dot>مستمر — بانتظار المراجعة</Badge>;
    };

    const listColumns = [
        { key: 'n', header: '#', width: '3rem', mobileHidden: true, render: (_, i) => i + 1 },
        { key: 'name', header: 'الاسم', mobilePrimary: true, render: (c) => <strong>{fullName(c)}</strong> },
        { key: 'id', header: 'رقم الهوية/الإقامة', mobileHidden: true, render: (c) => <bdi>{c.id_or_residency_number}</bdi> },
        { key: 'job', header: 'المسمى الوظيفي', render: (c) => c.job_title || c.occupation || '—' },
        { key: 'status', header: 'الحالة', render: statusOf },
        {
            key: 'actions', header: '', align: 'end',
            render: (c) => <Button size="sm" variant={isCandidateDone(c) ? 'secondary' : 'primary'} onClick={() => openInGuidedReview(c.id)}>{isCandidateDone(c) ? 'عرض / تعديل' : 'ابدأ المراجعة'}</Button>,
        },
    ];

    return (
        <div className="eyr-stack">
            {isMainManager() && (
                <div><Button variant="ghost" icon="arrow-start" onClick={goBackToOverview}>العودة لحالة كل الفروع</Button></div>
            )}

            <Card>
                <div className="eyr-terms">
                    {isMainManager() && selectedBranchName && <Badge tone="primary">الفرع: {selectedBranchName}</Badge>}
                    <Badge tone="neutral">السنة السابقة: {status.previous_year?.year_label || 'لا يوجد'}</Badge>
                    <Icon name="arrow-start" size={18} />
                    <Badge tone="info">السنة الجديدة: {status.target_year?.year_label}</Badge>
                </div>
                <div className="eyr-progress">
                    <div className="eyr-meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <span className="eyr-meter-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="eyr-muted">أنجزت <bdi>{doneCount}</bdi> من <bdi>{live.total}</bdi> موظف</span>
                </div>
            </Card>

            <Card
                title="كيف أكمل مراجعة الموظفين؟"
                actions={<Button size="sm" variant="secondary" iconEnd={showStepsHelp ? 'chevron-up' : 'chevron-down'} aria-expanded={showStepsHelp} onClick={() => setShowStepsHelp((v) => !v)}>{showStepsHelp ? 'إخفاء الخطوات' : 'عرض الخطوات'}</Button>}
            >
                {showStepsHelp && (
                    <ol className="eyr-help">
                        <li><strong>حدّد المصير:</strong> لكل موظف من العام الماضي، اختر «سيستمر» أو «مغادر».</li>
                        <li><strong>عند المغادرة:</strong> اختر السبب من القائمة (التفاصيل اختيارية).</li>
                        <li><strong>راجع بياناته:</strong> إذا كان سيستمر، تحقق من قائمة النواقص ومستندات التجديد.</li>
                        <li><strong>عدّل عند الحاجة:</strong> افتح نموذج الموظف من زر «تعديل بيانات الموظف»، احفظ، ثم عد لهذه الصفحة.</li>
                        <li><strong>أو أكّد أن لا تعديل مطلوب</strong> بزر «تم التحقق»، وينتقل تلقائياً للموظف التالي.</li>
                        <li><strong>أضف الجدد:</strong> أضف من لم يكن مسجلاً العام الماضي.</li>
                        <li><strong>أكّد:</strong> بعد إنهاء كل ما سبق، اضغط «تأكيد اكتمال بيانات الموظفين 100%» أسفل الصفحة.</li>
                    </ol>
                )}
                <Alert tone="warning">الموظف الذي تحدده «مغادر» يُنقل مباشرة إلى الأرشيف بالسبب الذي تحدده.</Alert>
            </Card>

            {live.total === 0 ? (
                <Card><EmptyState icon="user-plus" title="لا يوجد موظفون من العام الماضي لمراجعتهم" action={<Button variant="primary" icon="plus" onClick={addNewEmployee}>إضافة موظف جديد</Button>} /></Card>
            ) : (
                <>
                    <div className="eyr-switch" role="group" aria-label="طريقة العرض">
                        <Button variant={view === 'guided' ? 'primary' : 'secondary'} icon="list-check" onClick={() => setView('guided')}>المراجعة خطوة بخطوة</Button>
                        <Button variant={view === 'list' ? 'primary' : 'secondary'} icon="clipboard" onClick={() => { setReviewPinned(false); setView('list'); }}>عرض القائمة كاملة</Button>
                    </div>

                    {loading ? (
                        <Card><Spinner block label="جاري التحميل…" /></Card>
                    ) : view === 'guided' ? (
                        wizardDone ? (
                            <Card>
                                <EmptyState
                                    icon="check-circle"
                                    title="انتهيت من مراجعة جميع موظفي العام الماضي"
                                    description={`${doneCount} من ${live.total}. الخطوة التالية: هل هناك موظفون جدد لم يكونوا مسجلين العام الماضي؟ أضفهم الآن. وإن لم يوجد، انتقل مباشرة إلى «تأكيد اكتمال البيانات» في الأسفل.`}
                                    action={(
                                        <div className="eyr-switch">
                                            <Button variant="primary" size="lg" icon="plus" onClick={addNewEmployee}>إضافة موظف جديد</Button>
                                            <Button variant="ghost" onClick={() => { setReviewPinned(false); setView('list'); }}>مراجعة القائمة كاملة مرة أخرى</Button>
                                        </div>
                                    )}
                                />
                            </Card>
                        ) : (
                            <div className="eyr-stack">
                                <div className="eyr-nav">
                                    <Button size="sm" variant="secondary" iconEnd="arrow-start" disabled={reviewIndex === 0} onClick={() => setReviewIndex((i) => Math.max(0, i - 1))}>السابق</Button>
                                    <span className="eyr-pos">
                                        الموظف <bdi>{reviewIndex + 1}</bdi> من <bdi>{candidates.length}</bdi>
                                        {(live.total - doneCount) > 0 && <span className="eyr-muted"> · متبقٍ <bdi>{live.total - doneCount}</bdi></span>}
                                    </span>
                                    <Button size="sm" variant="secondary" icon="arrow-end" disabled={reviewIndex >= candidates.length - 1} onClick={() => setReviewIndex((i) => Math.min(candidates.length - 1, i + 1))}>التالي</Button>
                                </div>

                                <Card title={fullName(currentCandidate)}>
                                    <dl className="eyr-identity">
                                        <div><dt>رقم الهوية/الإقامة</dt><dd><CopyText value={currentCandidate.id_or_residency_number}>{currentCandidate.id_or_residency_number}</CopyText></dd></div>
                                        <div><dt>رقم الموظف</dt><dd><bdi>{currentCandidate.employee_id_number || '—'}</bdi></dd></div>
                                        <div><dt>المسمى الوظيفي</dt><dd>{currentCandidate.job_title || currentCandidate.occupation || '—'}</dd></div>
                                        <div><dt>الجنسية</dt><dd>{currentCandidate.nationality || '—'}</dd></div>
                                    </dl>
                                </Card>

                                <Step n={1} title="هل سيستمر هذا الموظف معنا هذا العام؟" state={currentCandidate.decision ? 'done' : 'active'}>
                                    {!currentCandidate.decision ? (
                                        <div className="eyr-switch">
                                            <Button variant="success" icon="check-circle" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>نعم، سيستمر</Button>
                                            <Button variant="danger" icon="x-circle" disabled={decidingId === currentCandidate.id} onClick={() => askLeaving(currentCandidate)}>لا، مغادر</Button>
                                        </div>
                                    ) : currentCandidate.decision === 'continuing' ? (
                                        <div className="eyr-answer">
                                            <Badge tone="success" dot>سيستمر هذا العام</Badge>
                                            <Button variant="link" onClick={() => askLeaving(currentCandidate)}>تغيير إلى «مغادر»</Button>
                                        </div>
                                    ) : (
                                        <div className="eyr-answer">
                                            <Badge tone="danger" dot>مغادر — {LEAVING_STATUS_LABELS[currentCandidate.leaving_status] || currentCandidate.leaving_status}</Badge>
                                            <span className="eyr-muted">السبب: {currentCandidate.leaving_reason || '—'}</span>
                                            <Button variant="link" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>تراجع — سيستمر فعلاً</Button>
                                        </div>
                                    )}
                                </Step>

                                {currentCandidate.decision === 'continuing' && (
                                    <Step
                                        n={2}
                                        title="راجع بياناته"
                                        state={currentCandidate.data_reviewed ? 'done' : 'active'}
                                        aside={currentCandidate.data_reviewed ? <Badge tone="success">تمت المراجعة</Badge> : null}
                                    >
                                        <div className="ui-form-stack">
                                            {currentCandidate.missing_fields_live?.length > 0 ? (
                                                <Alert tone="warning" title="بيانات ناقصة">
                                                    <ul className="eyr-missing">
                                                        {currentCandidate.missing_fields_live.map((f, i) => <li key={i}>{f}</li>)}
                                                    </ul>
                                                </Alert>
                                            ) : (
                                                <Alert tone="success">لا توجد بيانات ناقصة أساسية</Alert>
                                            )}

                                            {(renewal?.missing?.length > 0 || renewal?.stale?.length > 0) && (
                                                <Alert
                                                    tone="info"
                                                    title="مستندات التجديد (تنبيه — لن يمنع الحفظ)"
                                                    action={needsContract ? (
                                                        <label className="btn btn-primary btn-sm eyr-upload">
                                                            {contractUploadingId === currentCandidate.id ? 'جاري رفع العقد…' : 'رفع العقد الجديد'}
                                                            <input
                                                                type="file"
                                                                accept="application/pdf,image/jpeg,image/png"
                                                                hidden
                                                                disabled={contractUploadingId === currentCandidate.id}
                                                                onChange={(e) => handleContractUpload(currentCandidate, e)}
                                                            />
                                                        </label>
                                                    ) : null}
                                                >
                                                    {renewal.missing.length > 0 && <div>غير موجودة: {renewal.missing.map((t) => DOCUMENT_TYPE_LABELS[t] || t).join('، ')}</div>}
                                                    {renewal.stale.length > 0 && <div>قديمة (قبل بداية السنة الجديدة): {renewal.stale.map((t) => DOCUMENT_TYPE_LABELS[t] || t).join('، ')}</div>}
                                                </Alert>
                                            )}

                                            <div className="eyr-switch">
                                                <Button variant="primary" size="lg" icon="edit" onClick={() => openEmployeeDetail(currentCandidate.id)}>تعديل بيانات الموظف ومستنداته</Button>
                                                {!currentCandidate.data_reviewed && (
                                                    <Button variant="secondary" icon="check" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkReviewed(currentCandidate)}>تم التحقق — لا تعديل مطلوب</Button>
                                                )}
                                            </div>
                                        </div>
                                    </Step>
                                )}

                                {currentCandidate.decision === 'leaving' && (
                                    <div><Button variant="primary" iconEnd="arrow-end" onClick={() => goToNextUnfinished()}>الانتقال للموظف التالي</Button></div>
                                )}
                            </div>
                        )
                    ) : (
                        <Card flush>
                            <div className="eyr-pills" role="group" aria-label="تصفية الحالة">
                                {[
                                    { key: 'undecided', label: `لم يتم القرار (${live.undecided})` },
                                    { key: 'continuing', label: `مستمر (${live.continuing})` },
                                    { key: 'leaving', label: `مغادر (${live.leaving})` },
                                    { key: 'all', label: `الكل (${live.total})` },
                                ].map((pill) => (
                                    <Button key={pill.key} size="sm" variant={filter === pill.key ? 'primary' : 'secondary'} onClick={() => setFilter(pill.key)}>{pill.label}</Button>
                                ))}
                            </div>
                            <DataTable columns={listColumns} rows={filteredCandidates} rowKey="id" emptyIcon="check-circle" emptyTitle="لا توجد سجلات في هذا التصنيف" />
                        </Card>
                    )}
                </>
            )}

            <Card title="الخطوة الأخيرة — تأكيد اكتمال البيانات">
                <div className="ui-form-stack">
                    <ul className="eyr-checklist">
                        <li className={live.undecided === 0 ? 'is-ok' : ''}>
                            <Icon name={live.undecided === 0 ? 'check-circle' : 'clock'} size={18} />
                            <span>تحديد مصير جميع موظفي العام الماضي <span className="eyr-muted">(<bdi>{live.decided}</bdi> من <bdi>{live.total}</bdi>)</span></span>
                        </li>
                        <li className={live.pendingReview === 0 ? 'is-ok' : ''}>
                            <Icon name={live.pendingReview === 0 ? 'check-circle' : 'clock'} size={18} />
                            <span>مراجعة بيانات الموظفين المستمرين{live.pendingReview > 0 && <span className="eyr-muted"> (متبقٍ <bdi>{live.pendingReview}</bdi>)</span>}</span>
                        </li>
                        <li className="eyr-checklist-add">
                            <Icon name="info" size={18} />
                            <span>إضافة الموظفين الجدد الذين لم يكونوا مسجلين العام الماضي <span className="eyr-muted">(تمت إضافة <bdi>{status.counts.new_hires}</bdi>)</span></span>
                            <Button size="sm" variant={allDone ? 'primary' : 'secondary'} icon="plus" onClick={addNewEmployee}>إضافة موظف جديد</Button>
                        </li>
                    </ul>

                    {status.confirmation ? (
                        <Alert tone="success" action={<Button size="sm" variant="secondary" onClick={handleUnconfirm}>تراجع عن التأكيد</Button>}>
                            تم تأكيد اكتمال البيانات بواسطة {status.confirmation.confirmed_by_label || '—'} بتاريخ {formatDay(status.confirmation.confirmed_at)}
                            {status.confirmation.is_stale && <div><strong>تم تعديل بيانات بعد التأكيد.</strong></div>}
                        </Alert>
                    ) : (
                        <div className="eyr-confirm">
                            <Button variant="primary" size="lg" disabled={!canConfirm} onClick={() => setConfirmModal({ show: true, note: '' })}>تأكيد اكتمال بيانات الموظفين 100%</Button>
                            <span className="eyr-muted">
                                {live.undecided > 0
                                    ? `يوجد ${live.undecided} موظف لم يتم اتخاذ قرار بشأنه`
                                    : live.pendingReview > 0
                                        ? `يوجد ${live.pendingReview} موظف لم تتم مراجعة بياناته`
                                        : 'اضغط الزر فقط بعد إضافة الموظفين الجدد أيضاً'}
                            </span>
                        </div>
                    )}
                </div>
            </Card>

            <Modal
                open={leavingModal.show}
                onClose={resetLeaving}
                title="مغادرة الموظف"
                description={`سيتم نقل بيانات الموظف إلى الأرشيف: ${fullName(leavingModal.candidate || {})}`}
                footer={(
                    <>
                        <Button variant="danger" loading={decidingId === leavingModal.candidate?.id} disabled={!leavingModal.status} onClick={handleSubmitLeaving}>تأكيد ونقل للأرشيف</Button>
                        <Button variant="secondary" onClick={resetLeaving}>إلغاء</Button>
                    </>
                )}
            >
                <div className="ui-form-stack">
                    <FormField label="سبب المغادرة" required>
                        <Select value={leavingModal.status} onChange={(e) => setLeavingModal((prev) => ({ ...prev, status: e.target.value }))} options={LEAVING_STATUS_OPTIONS} placeholder="— اختر السبب —" />
                    </FormField>
                    <FormField label="تفاصيل السبب (اختياري)">
                        <Textarea rows={3} value={leavingModal.reason} onChange={(e) => setLeavingModal((prev) => ({ ...prev, reason: e.target.value }))} placeholder="مثال: انتقل للعمل في جهة أخرى" />
                    </FormField>
                    <FormField label="آخر يوم عمل (اختياري)">
                        <Input type="date" value={leavingModal.last_working_day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setLeavingModal((prev) => ({ ...prev, last_working_day: e.target.value }))} />
                    </FormField>
                </div>
            </Modal>

            <Modal
                open={confirmModal.show}
                onClose={() => setConfirmModal({ show: false, note: '' })}
                title="تأكيد اكتمال المراجعة"
                description={`بالتأكيد أنت تقر بأن بيانات الموظفين للسنة ${status?.target_year?.year_label || ''} مكتملة بنسبة 100%. يمكنك الاستمرار في التعديل بعد التأكيد.`}
                footer={(
                    <>
                        <Button variant="primary" onClick={handleConfirm}>تأكيد</Button>
                        <Button variant="secondary" onClick={() => setConfirmModal({ show: false, note: '' })}>إلغاء</Button>
                    </>
                )}
            >
                <FormField label="ملاحظة (اختياري)">
                    <Textarea rows={2} value={confirmModal.note} onChange={(e) => setConfirmModal((prev) => ({ ...prev, note: e.target.value }))} />
                </FormField>
            </Modal>
        </div>
    );
};

export default EmployeeYearReview;

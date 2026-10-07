/**
 * New-year review (مراجعة المستفيدين للسنة الجديدة).
 * Branch managers decide, for each beneficiary of the previous term, whether they continue, review the
 * carried-over data and pick a bus; head office sees every branch's progress. All state and handlers live
 * in the parent page and arrive as props, so this file is layout only.
 */
import {
  Card, Button, Badge, Alert, Icon, DataTable, EmptyState, Spinner, FormField, Select,
} from '../../ui';
import BeneficiaryFields from './BeneficiaryFields';
import { SERVICE_LABELS } from './constants';

const formatDay = (value) => (value ? new Date(value).toLocaleDateString('ar-SA') : '—');

function ServiceBadges({ row }) {
  const on = Object.entries(SERVICE_LABELS).filter(([key]) => row[key]);
  if (on.length === 0) return <span className="bn-muted">لا يوجد</span>;
  return <span className="bn-pills">{on.map(([key, label]) => <Badge key={key} tone="info">{label}</Badge>)}</span>;
}

function Step({ n, title, state = 'active', children, aside }) {
  return (
    <section className={`bn-step is-${state}`}>
      <header className="bn-step-head">
        <span className="bn-step-num" aria-hidden="true">{state === 'done' ? <Icon name="check" size={16} /> : n}</span>
        <h3>{title}</h3>
        {aside}
      </header>
      <div className="bn-step-body">{children}</div>
    </section>
  );
}

function StatusBadge({ c }) {
  if (!c.continuity_status) return <Badge tone="neutral" dot>بانتظار القرار</Badge>;
  if (c.continuity_status === 'not_continuing') return <Badge tone="danger" dot title={c.non_continuation_reason || ''}>غير مستمر</Badge>;
  if (c.target_review_status === 'pending') return <Badge tone="warning" dot>مستمر — بانتظار المراجعة</Badge>;
  return <Badge tone="success" dot>مكتمل</Badge>;
}

export default function RolloverPanel(r) {
  const {
    isMain, branchId, setFilters, rolloverOverview, rolloverStatus, navigate, setActiveTab, openAddModal, rolloverLive,
    rolloverDoneCount, showStepsHelp, setShowStepsHelp, rolloverView, setRolloverView, setReviewPinned, rolloverLoading,
    rolloverAllDone, reviewPinned, currentCandidate, reviewIndex, setReviewIndex, rolloverCandidates, rolloverRemaining,
    decidingId, handleMarkContinuing, setReasonModal, reviewForm, setReviewForm, availableBuses, reviewBusId, setReviewBusId,
    handleStartRollover, savingReview, handleSaveReview, goToNextUnfinished, rolloverFilter, setRolloverFilter,
    filteredCandidates, openInGuidedReview, isCandidateDone, handleUnconfirmReview, rolloverCanConfirm, setConfirmModal,
  } = r;

  const goAdd = () => { setActiveTab('data'); setTimeout(openAddModal, 0); };

  // ---- head office, no branch chosen: progress of every branch ------------------------------------------------------
  if (isMain && !branchId) {
    const columns = [
      { key: 'branch_name', header: 'الفرع', mobilePrimary: true, render: (row) => <strong>{row.branch_name}</strong> },
      { key: 'source_total', header: 'مستفيدو الفصل السابق', align: 'center' },
      { key: 'decided', header: 'تم القرار', align: 'center', render: (row) => <bdi>{row.decided} / {row.source_total}</bdi> },
      { key: 'continuing', header: 'مستمر', align: 'center' },
      { key: 'not_continuing', header: 'غير مستمر', align: 'center' },
      { key: 'pending_review', header: 'بانتظار المراجعة', align: 'center' },
      { key: 'new_in_target', header: 'مستفيدون جدد', align: 'center' },
      { key: 'status', header: 'الحالة', render: (row) => (row.is_confirmed ? <Badge tone="success" dot>مكتمل</Badge> : <Badge tone="danger" dot>غير مكتمل</Badge>) },
      { key: 'confirmed_by_label', header: 'تأكيد بواسطة', mobileHidden: true, render: (row) => row.confirmed_by_label || '—' },
      { key: 'confirmed_at', header: 'التاريخ', mobileHidden: true, render: (row) => formatDay(row.confirmed_at) },
    ];
    return (
      <Card
        title="حالة مراجعة المستفيدين للسنة الجديدة"
        subtitle="اضغط على فرع لعرض تفاصيله"
        actions={<Badge tone="info"><bdi>{rolloverOverview.filter((b) => b.is_confirmed).length} / {rolloverOverview.length}</bdi> فرع أكّد</Badge>}
        flush
      >
        <DataTable
          columns={columns}
          rows={rolloverOverview}
          rowKey="branch_id"
          onRowClick={(row) => setFilters((prev) => ({ ...prev, branch_id: row.branch_id.toString() }))}
          emptyIcon="building"
          emptyTitle="لا توجد فروع"
          emptyDescription="اختر فصلاً دراسياً لعرض حالة الفروع."
        />
      </Card>
    );
  }

  if (!rolloverStatus) return <Card><Spinner block label="جاري التحميل…" /></Card>;

  if (!rolloverStatus.is_active) {
    return (
      <Card>
        <EmptyState
          icon="calendar"
          title="لا يوجد فصل دراسي للسنة الجديدة"
          description={rolloverStatus.blocking_reason}
          action={isMain ? <Button variant="primary" onClick={() => navigate('/term-management')}>إدارة السنوات والفصول الدراسية</Button> : null}
        />
      </Card>
    );
  }

  const progress = rolloverLive.total > 0 ? Math.round((rolloverDoneCount / rolloverLive.total) * 100) : 100;
  const busOptions = availableBuses.map((bus) => ({
    value: String(bus.id),
    label: `حافلة ${bus.bus_number}${bus.driver_full_name ? ` — ${bus.driver_full_name}` : ''}${bus.number_of_seats ? ` (${bus.student_count}/${bus.number_of_seats} مقعد)` : ''}`,
  }));

  const wizardDone = (rolloverAllDone && !reviewPinned) || !currentCandidate;

  const listColumns = [
    { key: 'n', header: '#', width: '3rem', mobileHidden: true, render: (_, i) => i + 1 },
    { key: 'beneficiary_name', header: 'اسم المستفيد', mobilePrimary: true, render: (c) => <strong>{c.beneficiary_name}</strong> },
    { key: 'civil_id', header: 'السجل المدني', mobileHidden: true, render: (c) => <bdi>{c.civil_id}</bdi> },
    { key: 'contact_number', header: 'التواصل', mobileHidden: true, render: (c) => <bdi>{c.contact_number}</bdi> },
    { key: 'services', header: 'الخدمات السابقة', render: (c) => <ServiceBadges row={c} /> },
    { key: 'bus_number', header: 'الحافلة', render: (c) => (c.bus_number ? `حافلة ${c.bus_number}` : '—') },
    { key: 'status', header: 'الحالة', render: (c) => <StatusBadge c={c} /> },
    {
      key: 'actions', header: '', align: 'end',
      render: (c) => <Button size="sm" variant={isCandidateDone(c) ? 'secondary' : 'primary'} onClick={() => openInGuidedReview(c.id)}>{isCandidateDone(c) ? 'عرض / تعديل' : 'ابدأ المراجعة'}</Button>,
    },
  ];

  return (
    <div className="bn-stack">
      {isMain && (
        <div>
          <Button variant="ghost" icon="arrow-start" onClick={() => setFilters((prev) => ({ ...prev, branch_id: '' }))}>العودة لحالة كل الفروع</Button>
        </div>
      )}

      <Card>
        <div className="bn-terms">
          <Badge tone="neutral">
            بيانات الفصل السابق: {rolloverStatus.source_term ? `${rolloverStatus.source_term.academic_year_label} — ${rolloverStatus.source_term.term_name}` : 'لا يوجد'}
          </Badge>
          <Icon name="arrow-start" size={18} />
          <Badge tone="info">الفصل الجديد: {rolloverStatus.target_term?.academic_year_label} — {rolloverStatus.target_term?.term_name}</Badge>
        </div>
        <div className="bn-progress">
          <div className="bn-meter-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="bn-meter-fill is-ok" style={{ width: `${progress}%` }} />
          </div>
          <span className="bn-muted">أنجزت <bdi>{rolloverDoneCount}</bdi> من <bdi>{rolloverLive.total}</bdi> مستفيد</span>
        </div>
      </Card>

      <Card
        title="كيف أكمل المراجعة؟"
        subtitle="الترتيب مهم: الخطأ فيه قد يضيّع بيانات عام كامل"
        actions={<Button size="sm" variant="secondary" iconEnd={showStepsHelp ? 'chevron-up' : 'chevron-down'} aria-expanded={showStepsHelp} onClick={() => setShowStepsHelp((v) => !v)}>{showStepsHelp ? 'إخفاء الخطوات' : 'عرض الخطوات'}</Button>}
      >
        {showStepsHelp && (
          <ol className="bn-help">
            <li><strong>حدّد المصير:</strong> لكل مستفيد من العام الماضي، اختر «سيستمر» أو «لن يستمر».</li>
            <li><strong>راجع البيانات:</strong> إذا كان سيستمر، تأكد من صحة بياناته وعدّل ما تغيّر (العمر، رقم التواصل، الخدمات…).</li>
            <li><strong>اختر الحافلة:</strong> إذا كانت خدمة النقل مفعلة، حدّد الحافلة التي سيركبها هذا العام.</li>
            <li><strong>احفظ:</strong> اضغط «حفظ والانتقال للتالي» ثم كرّر حتى تنتهي من الجميع.</li>
            <li><strong>أضف الجدد:</strong> أضف المستفيدين الجدد الذين لم يكونوا مسجلين العام الماضي.</li>
            <li><strong>أكّد:</strong> في الأسفل اضغط «تأكيد اكتمال البيانات 100%» بعد أن تنتهي من كل ما سبق.</li>
          </ol>
        )}
        <Alert tone="warning">المستفيد الذي تحدده «لن يستمر» يُنقل مباشرة إلى الأرشيف ولن يظهر في قوائم هذا العام.</Alert>
      </Card>

      {rolloverStatus.counts.total_source === 0 ? (
        <Card>
          <EmptyState
            icon="user-plus"
            title="لا توجد بيانات من الفصل السابق"
            description="لا يوجد مستفيدون لمراجعتهم — يمكنك إضافة المستفيدين مباشرة للفصل الجديد."
            action={<Button variant="primary" icon="plus" onClick={goAdd}>إضافة مستفيد</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="bn-switch" role="group" aria-label="طريقة العرض">
            <Button variant={rolloverView === 'guided' ? 'primary' : 'secondary'} icon="list-check" onClick={() => setRolloverView('guided')}>المراجعة خطوة بخطوة</Button>
            <Button variant={rolloverView === 'list' ? 'primary' : 'secondary'} icon="clipboard" onClick={() => { setReviewPinned(false); setRolloverView('list'); }}>عرض القائمة كاملة</Button>
          </div>

          {rolloverLoading ? (
            <Card><Spinner block label="جاري التحميل…" /></Card>
          ) : rolloverView === 'guided' ? (
            wizardDone ? (
              <Card>
                <EmptyState
                  icon="check-circle"
                  title="انتهيت من مراجعة جميع مستفيدي العام الماضي"
                  description={`${rolloverDoneCount} من ${rolloverCandidates.length}. الخطوة التالية: هل هناك مستفيدون جدد لم يكونوا مسجلين العام الماضي؟ أضفهم الآن. وإن لم يوجد، انتقل مباشرة إلى «تأكيد اكتمال البيانات» في الأسفل.`}
                  action={(
                    <div className="bn-switch">
                      <Button variant="primary" size="lg" icon="plus" onClick={goAdd}>إضافة مستفيد جديد</Button>
                      <Button variant="ghost" onClick={() => { setReviewPinned(false); setRolloverView('list'); }}>مراجعة القائمة كاملة مرة أخرى</Button>
                    </div>
                  )}
                />
              </Card>
            ) : (
              <div className="bn-stack">
                <div className="bn-wizard-nav">
                  <Button size="sm" variant="secondary" iconEnd="arrow-start" disabled={reviewIndex === 0} onClick={() => setReviewIndex((i) => Math.max(0, i - 1))}>السابق</Button>
                  <span className="bn-wizard-pos">
                    المستفيد <bdi>{reviewIndex + 1}</bdi> من <bdi>{rolloverCandidates.length}</bdi>
                    {rolloverRemaining > 0 && <span className="bn-muted"> · متبقٍ <bdi>{rolloverRemaining}</bdi></span>}
                  </span>
                  <Button size="sm" variant="secondary" icon="arrow-end" disabled={reviewIndex >= rolloverCandidates.length - 1} onClick={() => setReviewIndex((i) => Math.min(rolloverCandidates.length - 1, i + 1))}>التالي</Button>
                </div>

                <Card title={currentCandidate.beneficiary_name}>
                  <dl className="bn-identity">
                    <div><dt>السجل المدني</dt><dd><bdi>{currentCandidate.civil_id}</bdi></dd></div>
                    <div><dt>الجنس</dt><dd>{currentCandidate.gender}</dd></div>
                    <div><dt>رقم المستفيد</dt><dd><bdi>{currentCandidate.beneficiary_number}</bdi></dd></div>
                    <div><dt>عمره العام الماضي</dt><dd><bdi>{currentCandidate.age}</bdi></dd></div>
                    <div className="bn-identity-wide"><dt>خدماته العام الماضي</dt><dd><ServiceBadges row={currentCandidate} /></dd></div>
                  </dl>
                </Card>

                <Step n={1} title="هل سيستمر هذا المستفيد معنا هذا العام؟" state={currentCandidate.continuity_status ? 'done' : 'active'}>
                  {!currentCandidate.continuity_status ? (
                    <div className="bn-switch">
                      <Button variant="success" icon="check-circle" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>نعم، سيستمر</Button>
                      <Button variant="danger" icon="x-circle" disabled={decidingId === currentCandidate.id} onClick={() => setReasonModal({ show: true, candidate: currentCandidate, reason: '' })}>لا، لن يستمر</Button>
                    </div>
                  ) : currentCandidate.continuity_status === 'continuing' ? (
                    <div className="bn-answer">
                      <Badge tone="success" dot>سيستمر هذا العام</Badge>
                      <Button variant="link" onClick={() => setReasonModal({ show: true, candidate: currentCandidate, reason: '' })}>تغيير إلى «لن يستمر»</Button>
                      {/* Decided "continuing" but nothing exists in the new term: re-applying the same decision
                          recreates the row, otherwise this beneficiary could never be finished. */}
                      {!currentCandidate.target_id && (
                        <Alert tone="warning" action={<Button size="sm" variant="primary" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>إعادة إنشاء السجل</Button>}>
                          لم يتم إنشاء سجل هذا المستفيد في الفصل الجديد.
                        </Alert>
                      )}
                    </div>
                  ) : (
                    <div className="bn-answer">
                      <Badge tone="danger" dot>لن يستمر — تم نقله إلى الأرشيف</Badge>
                      <span className="bn-muted">السبب: {currentCandidate.non_continuation_reason}</span>
                      <Button variant="link" disabled={decidingId === currentCandidate.id} onClick={() => handleMarkContinuing(currentCandidate)}>تراجع — سيستمر فعلاً</Button>
                    </div>
                  )}
                </Step>

                {currentCandidate.continuity_status === 'continuing' && reviewForm && (
                  <Step
                    n={2}
                    title="راجع بياناته وعدّل ما تغيّر"
                    state={currentCandidate.target_review_status === 'pending' ? 'active' : 'done'}
                    aside={currentCandidate.target_review_status !== 'pending' ? <Badge tone="success">تمت المراجعة</Badge> : null}
                  >
                    <BeneficiaryFields values={reviewForm} onChange={(patch) => setReviewForm((p) => ({ ...p, ...patch }))} showGender={false} ageLabel="العمر هذا العام" />
                  </Step>
                )}

                {currentCandidate.continuity_status === 'continuing' && reviewForm?.transport_service && (
                  <Step n={3} title="خدمة النقل مفعلة — اختر الحافلة" state={reviewBusId ? 'done' : 'active'}>
                    {availableBuses.length === 0 ? (
                      <Alert
                        tone="warning"
                        action={(
                          <span className="bn-switch">
                            <Button size="sm" variant="secondary" icon="bus" onClick={handleStartRollover} disabled={rolloverLoading}>نقل حافلات العام الماضي</Button>
                            <Button size="sm" variant="soft" onClick={() => navigate('/bus-transportation')}>إدارة الحافلات</Button>
                          </span>
                        )}
                      >
                        لا توجد حافلات مسجلة في الفصل الجديد بعد.
                      </Alert>
                    ) : (
                      <FormField label="الحافلة">
                        <Select value={reviewBusId} onChange={(e) => setReviewBusId(e.target.value)} options={busOptions} placeholder="— اختر الحافلة —" />
                      </FormField>
                    )}
                  </Step>
                )}

                {currentCandidate.continuity_status === 'continuing' && reviewForm && (
                  <Step n={4} title="احفظ وانتقل للمستفيد التالي" state="active">
                    <div className="bn-switch">
                      <Button variant="primary" size="lg" iconEnd="arrow-end" loading={savingReview} onClick={handleSaveReview}>حفظ والانتقال للمستفيد التالي</Button>
                      <Button variant="secondary" onClick={() => goToNextUnfinished()}>تخطٍ مؤقتاً</Button>
                    </div>
                  </Step>
                )}

                {currentCandidate.continuity_status === 'not_continuing' && (
                  <div><Button variant="primary" iconEnd="arrow-end" onClick={() => goToNextUnfinished()}>الانتقال للمستفيد التالي</Button></div>
                )}
              </div>
            )
          ) : (
            <Card flush>
              <div className="bn-filter-pills" role="group" aria-label="تصفية الحالة">
                {[
                  { key: 'undecided', label: `لم يتم القرار (${rolloverLive.undecided})` },
                  { key: 'continuing', label: `مستمر (${rolloverLive.continuing})` },
                  { key: 'not_continuing', label: `غير مستمر (${rolloverLive.notContinuing})` },
                  { key: 'all', label: `الكل (${rolloverLive.total})` },
                ].map((pill) => (
                  <Button key={pill.key} size="sm" variant={rolloverFilter === pill.key ? 'primary' : 'secondary'} onClick={() => setRolloverFilter(pill.key)}>{pill.label}</Button>
                ))}
              </div>
              <DataTable
                columns={listColumns}
                rows={filteredCandidates}
                rowKey="id"
                emptyIcon="check-circle"
                emptyTitle="لا توجد سجلات في هذا التصنيف"
              />
            </Card>
          )}
        </>
      )}

      {/* Final step: add the new intake, then confirm */}
      <Card title="الخطوة الأخيرة — تأكيد اكتمال البيانات">
        <div className="ui-form-stack">
          <ul className="bn-checklist">
            <li className={rolloverLive.undecided === 0 ? 'is-ok' : ''}>
              <Icon name={rolloverLive.undecided === 0 ? 'check-circle' : 'clock'} size={18} />
              <span>تحديد مصير جميع مستفيدي العام الماضي <span className="bn-muted">(<bdi>{rolloverLive.decided}</bdi> من <bdi>{rolloverLive.total}</bdi>)</span></span>
            </li>
            <li className={rolloverLive.pendingReview === 0 ? 'is-ok' : ''}>
              <Icon name={rolloverLive.pendingReview === 0 ? 'check-circle' : 'clock'} size={18} />
              <span>مراجعة بيانات المستفيدين المستمرين{rolloverLive.pendingReview > 0 && <span className="bn-muted"> (متبقٍ <bdi>{rolloverLive.pendingReview}</bdi>)</span>}</span>
            </li>
            <li className="bn-checklist-add">
              <Icon name="info" size={18} />
              <span>إضافة المستفيدين الجدد الذين لم يكونوا مسجلين العام الماضي <span className="bn-muted">(تمت إضافة <bdi>{rolloverStatus.counts.new_in_target}</bdi>)</span></span>
              <Button size="sm" variant={rolloverAllDone ? 'primary' : 'secondary'} icon="plus" onClick={goAdd}>إضافة مستفيد جديد</Button>
            </li>
          </ul>

          {rolloverStatus.counts.transport_without_bus > 0 && (
            <Alert
              tone="warning"
              title={`${rolloverStatus.counts.transport_without_bus} مستفيد لديهم خدمة نقل بدون حافلة`}
              action={(
                <span className="bn-switch">
                  {rolloverStatus.counts.target_buses === 0 && (
                    <Button size="sm" variant="primary" icon="bus" onClick={handleStartRollover} disabled={rolloverLoading}>نقل حافلات العام الماضي</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => navigate('/bus-transportation')}>إدارة الحافلات</Button>
                </span>
              )}
            >
              {rolloverStatus.counts.transport_without_bus_names?.length > 0 && (
                <div>
                  {rolloverStatus.counts.transport_without_bus_names.join('، ')}
                  {rolloverStatus.counts.transport_without_bus > rolloverStatus.counts.transport_without_bus_names.length && ' …'}
                </div>
              )}
              <div>يمكنك التأكيد الآن وإكمال تعيين الحافلات لاحقاً.</div>
            </Alert>
          )}

          {rolloverStatus.confirmation ? (
            <Alert
              tone="success"
              action={<Button size="sm" variant="secondary" onClick={handleUnconfirmReview}>تراجع عن التأكيد</Button>}
            >
              تم تأكيد اكتمال البيانات بواسطة {rolloverStatus.confirmation.confirmed_by_label || '—'} بتاريخ {formatDay(rolloverStatus.confirmation.confirmed_at)}
              {rolloverStatus.confirmation.is_stale && <div><strong>تم تعديل بيانات بعد التأكيد.</strong></div>}
            </Alert>
          ) : (
            <div className="bn-confirm">
              <Button variant="primary" size="lg" disabled={!rolloverCanConfirm} onClick={() => setConfirmModal({ show: true, note: '' })}>تأكيد اكتمال البيانات 100%</Button>
              <span className="bn-muted">
                {rolloverLive.undecided > 0
                  ? `يوجد ${rolloverLive.undecided} مستفيد لم يتم اتخاذ قرار بشأنه`
                  : rolloverLive.pendingReview > 0
                    ? `يوجد ${rolloverLive.pendingReview} مستفيد لم تتم مراجعة بياناته`
                    : 'اضغط الزر فقط بعد إضافة المستفيدين الجدد أيضاً'}
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

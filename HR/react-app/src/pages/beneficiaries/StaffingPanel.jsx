/**
 * Staffing requirements (head office): for the chosen term, how many staff each branch needs
 * by regulation against how many it has. Pick a branch on the side, read its roles on the right.
 */
import { Card, Button, Badge, Checkbox, SearchInput, EmptyState, Spinner, Icon } from '../../ui';

const progressOf = (branch) => (branch.total_required > 0
  ? Math.min(100, ((branch.total_required - branch.total_deficit) / branch.total_required) * 100)
  : 100);

function Gauge({ current, required, ok }) {
  const value = required > 0 ? Math.min(100, (current / required) * 100) : 100;
  const path = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831';
  return (
    <div className="bn-gauge" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <path className="bn-gauge-bg" d={path} />
        <path className={`bn-gauge-fill ${ok ? 'is-ok' : 'is-deficit'}`} strokeDasharray={`${value}, 100`} d={path} />
      </svg>
      <span className="bn-gauge-text"><bdi>{current}/{required}</bdi></span>
    </div>
  );
}

export default function StaffingPanel({
  hasTerm, staffingData, staffingLoading, includeFreeStudents, setIncludeFreeStudents, mergeTherapy, setMergeTherapy,
  onExport, staffingBranchFilter, setStaffingBranchFilter, staffingSearch, setStaffingSearch,
}) {
  if (!hasTerm) {
    return <Card><EmptyState icon="calendar" title="اختر الفصل الدراسي" description="يجب اختيار فصل دراسي لعرض متطلبات التوظيف." /></Card>;
  }

  const selectedId = staffingBranchFilter || staffingData[0]?.branch_id?.toString();
  const branch = staffingData.find((b) => b.branch_id.toString() === selectedId);
  const visibleBranches = staffingSearch ? staffingData.filter((b) => b.branch_name.includes(staffingSearch)) : staffingData;

  return (
    <div className="bn-stack">
      <Card>
        <div className="bn-controls">
          <Checkbox label="تضمين الطلاب المجانيين" checked={includeFreeStudents} onChange={() => setIncludeFreeStudents((v) => !v)} />
          <Checkbox label="دمج العلاج الطبيعي والوظيفي" checked={mergeTherapy} onChange={() => setMergeTherapy((v) => !v)} />
          {staffingData.length > 0 && (
            <Button variant="secondary" size="sm" icon="download" onClick={onExport} className="bn-push">تصدير</Button>
          )}
        </div>
      </Card>

      {staffingLoading ? (
        <Card><Spinner block label="جاري حساب متطلبات التوظيف…" /></Card>
      ) : staffingData.length === 0 ? (
        <Card><EmptyState icon="clipboard" title="لا توجد بيانات مستفيدين" description="يجب إدخال بيانات المستفيدين أولاً لحساب متطلبات التوظيف." /></Card>
      ) : (
        <div className="bn-staffing">
          <Card title="الفروع" flush className="bn-picker">
            <div className="bn-picker-search">
              <SearchInput value={staffingSearch} onChange={(e) => setStaffingSearch(e.target.value)} onClear={() => setStaffingSearch('')} placeholder="ابحث عن فرع…" />
            </div>
            <ul className="bn-picker-list">
              {visibleBranches.map((b) => (
                <li key={b.branch_id}>
                  <button
                    type="button"
                    className={`bn-picker-item${b.branch_id.toString() === selectedId ? ' is-selected' : ''}`}
                    aria-pressed={b.branch_id.toString() === selectedId}
                    onClick={() => { setStaffingBranchFilter(b.branch_id.toString()); setStaffingSearch(''); }}
                  >
                    <span>{b.branch_name}</span>
                    {b.total_deficit > 0
                      ? <Badge tone="danger">−<bdi>{b.total_deficit}</bdi></Badge>
                      : <Badge tone="success"><Icon name="check" size={14} /></Badge>}
                  </button>
                </li>
              ))}
              {visibleBranches.length === 0 && <li className="bn-muted bn-pad">لا توجد فروع مطابقة</li>}
            </ul>
          </Card>

          {branch && (
            <div className="bn-stack">
              <Card
                title={branch.branch_name}
                actions={branch.total_deficit > 0
                  ? <Badge tone="danger" dot>يوجد نقص <bdi>{branch.total_deficit}</bdi> وظيفة</Badge>
                  : <Badge tone="success" dot>التوظيف مكتمل</Badge>}
              >
                <div className="bn-summary">
                  <div><span className="bn-big"><bdi>{branch.total_required}</bdi></span><span>المطلوب</span></div>
                  <div><span className="bn-big"><bdi>{branch.total_current}</bdi></span><span>الموجود</span></div>
                  <div className={branch.total_deficit > 0 ? 'is-deficit' : 'is-ok'}><span className="bn-big"><bdi>{branch.total_deficit}</bdi></span><span>النقص</span></div>
                  <div className="bn-summary-progress">
                    <div className="bn-meter-track" role="presentation">
                      <span className={`bn-meter-fill ${branch.total_deficit > 0 ? 'is-deficit' : 'is-ok'}`} style={{ width: `${progressOf(branch)}%` }} />
                    </div>
                    <span className="bn-muted"><bdi>{Math.round(progressOf(branch))}%</bdi> مكتمل</span>
                  </div>
                </div>

                <dl className="bn-strip">
                  <div><dt>إجمالي</dt><dd><bdi>{branch.total_beneficiaries}</bdi></dd></div>
                  <div><dt>صباحية</dt><dd><bdi>{branch.morning_count}</bdi></dd></div>
                  <div><dt>مسائية</dt><dd><bdi>{branch.evening_count}</bdi></dd></div>
                  <div><dt>نطق</dt><dd><bdi>{branch.speech_therapy_count}</bdi></dd></div>
                  <div><dt>طبيعي</dt><dd><bdi>{branch.physical_therapy_count}</bdi></dd></div>
                  <div><dt>وظيفي</dt><dd><bdi>{branch.occupational_therapy_count}</bdi></dd></div>
                  <div><dt>توحد</dt><dd><bdi>{branch.autism_therapy_count}</bdi></dd></div>
                  <div><dt>نقل</dt><dd><bdi>{branch.transport_service_count}</bdi></dd></div>
                </dl>
              </Card>

              <div className="bn-roles">
                {branch.staffing.filter((s) => s.required > 0).map((s) => (
                  <article key={s.role} className={`bn-role ${s.deficit > 0 ? 'is-deficit' : s.surplus > 0 ? 'is-surplus' : 'is-met'}`}>
                    <header>
                      <span className="bn-role-icon" aria-hidden="true">{s.icon}</span>
                      <div className="bn-role-title">
                        <h3>{s.role}</h3>
                        <span>{s.rule}</span>
                      </div>
                      <Gauge current={s.current} required={s.required} ok={s.deficit <= 0} />
                    </header>
                    <p className="bn-role-reason">{s.reason}</p>
                    <footer>
                      <span>المطلوب <strong><bdi>{s.required}</bdi></strong></span>
                      <span>الموجود <strong><bdi>{s.current}</bdi></strong></span>
                      {s.deficit > 0 && <Badge tone="danger">النقص <bdi>{s.deficit}</bdi></Badge>}
                      {s.surplus > 0 && <Badge tone="info">الفائض <bdi>{s.surplus}</bdi></Badge>}
                    </footer>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

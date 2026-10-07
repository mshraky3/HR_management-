import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Page, PageHeader, Card, Tabs, Toolbar, SearchInput, Select, Button, Badge, StatusBadge, DataTable, Pagination,
  RowActions, Modal, FormField, Alert,
} from '../../ui';
import { employeesAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import OffboardModal from './OffboardModal';
import ImportModal from './ImportModal';
import { fullName, isDataComplete, normalizeSearch } from './employeeUtils';

const STATUS_FILTER = [
  { value: '', label: 'كل الحالات' },
  { value: 'active', label: 'نشط' },
  { value: 'pending', label: 'قيد التجديد' },
];
const COMPLETION_FILTER = [
  { value: '', label: 'كل البيانات' },
  { value: 'incomplete', label: 'بيانات غير مكتملة' },
  { value: 'complete', label: 'بيانات مكتملة' },
];

/**
 * EmployeesView: the employee list for head office and branch managers.
 * One search box (name, ID, phone, job title) instead of four, a branch filter for the head office,
 * status / completeness filters, a sortable table that turns into cards on phones, bulk selection
 * and end-of-service from the row menu. The add/edit form stays in the parent page.
 */
export default function EmployeesView({
  employees, branches, loading, isMain, user,
  yearReviewActive, activeTab, onTabChange, yearReviewPanel,
  focusEmployee, onClearFocus,
  initialIncomplete = false,
  onAdd, onEdit, onView, onReload,
}) {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [completion, setCompletion] = useState(initialIncomplete ? 'incomplete' : '');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(() => new Set());

  const [offboardTargets, setOffboardTargets] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferBranch, setTransferBranch] = useState('');
  const [transferring, setTransferring] = useState(false);

  const branchesMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const activeBranches = useMemo(() => branches.filter((b) => b.is_active), [branches]);

  const counts = useMemo(() => ({
    total: employees.length,
    incomplete: employees.filter((e) => !isDataComplete(e)).length,
    pending: employees.filter((e) => e.status === 'pending').length,
  }), [employees]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const rows = employees.filter((e) => {
      if (branchId && String(e.branch_id) !== branchId) return false;
      if (status && (e.status || 'active') !== status) return false;
      if (completion === 'incomplete' && isDataComplete(e)) return false;
      if (completion === 'complete' && !isDataComplete(e)) return false;
      if (!q) return true;
      const hay = normalizeSearch([fullName(e), e.id_or_residency_number, e.phone_number, e.job_title, e.occupation, e.employee_id_number, e.email, branchesMap.get(e.branch_id)?.branch_name].join(' '));
      return q.split(/\s+/).every((part) => hay.includes(part));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = (e) => {
      if (sort.key === 'branch') return branchesMap.get(e.branch_id)?.branch_name || '';
      if (sort.key === 'job') return e.job_title || e.occupation || '';
      if (sort.key === 'status') return e.status || 'active';
      return fullName(e);
    };
    return [...rows].sort((a, b) => value(a).localeCompare(value(b), 'ar') * dir);
  }, [employees, search, branchId, status, completion, sort, branchesMap]);

  // The parent reads ?data_completion_status=incomplete from the URL after the first render.
  useEffect(() => { if (initialIncomplete) setCompletion('incomplete'); }, [initialIncomplete]);

  // Back to the first page when the result set changes; keep the selection only for rows still listed.
  useEffect(() => { setPage(1); }, [search, branchId, status, completion, pageSize]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(filtered.map((e) => e.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const selectedEmployees = useMemo(() => employees.filter((e) => selected.has(e.id)), [employees, selected]);
  const hasFilters = Boolean(search || branchId || status || completion);
  const clearFilters = () => { setSearch(''); setBranchId(''); setStatus(''); setCompletion(''); };

  const columns = [
    {
      key: 'name', header: 'الموظف', sortable: true, mobilePrimary: true,
      render: (e) => (
        <div className="ui-cell-stack">
          <button type="button" className="ui-link-cell" onClick={(ev) => { ev.stopPropagation(); onView(e); }}>{fullName(e)}</button>
          <bdi className="ui-cell-sub">{e.id_or_residency_number || '—'}</bdi>
        </div>
      ),
    },
    {
      key: 'job', header: 'المهنة', sortable: true,
      render: (e) => (
        <div className="ui-cell-stack">
          <span>{e.job_title || e.occupation || '—'}</span>
          {e.nationality && <span className="ui-cell-sub">{e.nationality}</span>}
        </div>
      ),
    },
    ...(isMain ? [{
      key: 'branch', header: 'الفرع', sortable: true,
      render: (e) => <span className="ui-clamp-2">{branchesMap.get(e.branch_id)?.branch_name || '—'}</span>,
    }] : []),
    {
      key: 'completion', header: 'البيانات',
      render: (e) => (isDataComplete(e)
        ? <Badge tone="success" dot>مكتملة</Badge>
        : <Badge tone="warning" dot>غير مكتملة</Badge>),
    },
    { key: 'status', header: 'الحالة', sortable: true, render: (e) => <StatusBadge status={e.status || 'active'} /> },
    {
      key: 'actions', header: 'الإجراءات', align: 'end',
      render: (e) => (
        <div className="ui-row-actions-group" onClick={(ev) => ev.stopPropagation()}>
          <Button size="sm" variant={isDataComplete(e) ? 'soft' : 'primary'} onClick={() => onEdit(e)}>
            {isDataComplete(e) ? 'تعديل' : 'إكمال البيانات'}
          </Button>
          <RowActions actions={[
            { label: 'عرض الملف الكامل', icon: 'eye', onClick: () => onView(e) },
            { label: 'إنهاء الخدمة', icon: 'archive', danger: true, onClick: () => setOffboardTargets([e]) },
            { label: 'نقل أو ربط بفرع آخر', icon: 'transfer', hidden: !isMain, onClick: () => navigate('/employee-transfer', { state: { employeeId: e.id } }) },
          ]} />
        </div>
      ),
    },
  ];

  const doTransfer = async () => {
    if (!transferBranch) return;
    setTransferring(true);
    try {
      const res = await employeesAPI.bulkTransfer({ employee_ids: [...selected], target_branch_id: Number(transferBranch) });
      const { ok, failed } = res.data.counts;
      if (ok) showSuccess(`تم نقل ${ok} موظف`);
      if (failed) showError(`تعذر نقل ${failed} موظف (مؤرشف أو في الفرع نفسه)`);
      setTransferOpen(false); setTransferBranch(''); setSelected(new Set());
      onReload();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل النقل');
    } finally {
      setTransferring(false);
    }
  };

  const tabs = [
    { id: 'list', label: 'الموظفون', icon: 'users', count: counts.total },
    { id: 'year-review', label: 'مراجعة السنة الجديدة', icon: 'refresh' },
  ];

  return (
    <Page>
      <PageHeader
        title="الموظفون"
        subtitle={isMain ? 'كل موظفي الفروع النشطين وقيد التجديد' : `موظفو ${user?.full_name || 'الفرع'}`}
        actions={(
          <>
            {isMain && <Button variant="secondary" icon="transfer" to="/employee-transfer">نقل وربط</Button>}
            <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>استيراد من Excel</Button>
            <Button variant="primary" icon="user-plus" onClick={onAdd}>إضافة موظف</Button>
          </>
        )}
      />

      {yearReviewActive && <Tabs items={tabs} value={activeTab} onChange={onTabChange} ariaLabel="أقسام الموظفين" />}

      {activeTab === 'year-review' ? yearReviewPanel : (
        <>
          {focusEmployee && (
            <Alert
              tone="info"
              title={fullName(focusEmployee)}
              onClose={onClearFocus}
              action={(
                <div className="ui-inline-actions">
                  <Button size="sm" variant="primary" onClick={() => onView(focusEmployee)}>عرض</Button>
                  <Button size="sm" variant="secondary" onClick={() => onEdit(focusEmployee)}>تعديل</Button>
                </div>
              )}
            >
              رقم الهوية/الإقامة: <bdi>{focusEmployee.id_or_residency_number || '—'}</bdi>
            </Alert>
          )}

          {counts.incomplete > 0 && completion !== 'incomplete' && !loading && (
            <Alert
              tone="warning"
              action={<Button size="sm" variant="secondary" onClick={() => setCompletion('incomplete')}>عرضهم</Button>}
            >
              {counts.incomplete} موظف بياناتهم غير مكتملة. إكمال البيانات مطلوب للمستندات والتقارير.
            </Alert>
          )}

          <Card flush>
            <Toolbar>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو البريد أو المهنة أو الفرع…"
              />
              {isMain && (
                <Select
                  aria-label="الفرع"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="ui-toolbar-select"
                  options={[{ value: '', label: 'كل الفروع' }, ...activeBranches.map((b) => ({ value: String(b.id), label: b.branch_name }))]}
                />
              )}
              <Select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value)} className="ui-toolbar-select" options={STATUS_FILTER} />
              <Select aria-label="اكتمال البيانات" value={completion} onChange={(e) => setCompletion(e.target.value)} className="ui-toolbar-select" options={COMPLETION_FILTER} />
              {hasFilters && <Button variant="ghost" size="sm" icon="x" onClick={clearFilters}>مسح الفلاتر</Button>}
            </Toolbar>

            {selected.size > 0 && (
              <div className="ui-bulkbar" role="region" aria-label="إجراءات جماعية">
                <strong>{selected.size} محدد</strong>
                <div className="ui-inline-actions">
                  {isMain && <Button size="sm" variant="secondary" icon="transfer" onClick={() => setTransferOpen(true)}>نقل إلى فرع</Button>}
                  <Button size="sm" variant="danger" icon="archive" onClick={() => setOffboardTargets(selectedEmployees)}>إنهاء الخدمة</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
                </div>
              </div>
            )}

            <DataTable
              caption="قائمة الموظفين"
              columns={columns}
              rows={pageRows}
              loading={loading}
              selectable
              selectedKeys={selected}
              onSelectionChange={setSelected}
              sort={sort}
              onSortChange={setSort}
              onRowClick={onView}
              emptyIcon={hasFilters ? 'search' : 'users'}
              emptyTitle={hasFilters ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون بعد'}
              emptyDescription={hasFilters ? 'جرّب تغيير البحث أو مسح الفلاتر.' : 'ابدأ بإضافة أول موظف في الفرع.'}
              emptyAction={hasFilters
                ? <Button variant="secondary" onClick={clearFilters}>مسح الفلاتر</Button>
                : <Button variant="primary" icon="user-plus" onClick={onAdd}>إضافة موظف</Button>}
              footer={(
                <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
              )}
            />
          </Card>
        </>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        isMain={isMain}
        branches={branches}
        onDone={onReload}
      />

      <OffboardModal
        open={Boolean(offboardTargets)}
        employees={offboardTargets}
        onClose={() => setOffboardTargets(null)}
        onDone={() => { setSelected(new Set()); onReload(); }}
      />

      <Modal
        open={transferOpen}
        onClose={transferring ? undefined : () => setTransferOpen(false)}
        size="sm"
        title={`نقل ${selected.size} موظف`}
        description="ينتقل الموظف إلى الفرع الجديد ويُزال من الفرع القديم."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(false)} disabled={transferring}>إلغاء</Button>
            <Button variant="primary" onClick={doTransfer} loading={transferring} disabled={!transferBranch}>نقل</Button>
          </>
        )}
      >
        <FormField label="الفرع الجديد" required>
          <Select
            value={transferBranch}
            onChange={(e) => setTransferBranch(e.target.value)}
            placeholder="اختر الفرع"
            options={activeBranches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
          />
        </FormField>
      </Modal>

    </Page>
  );
}

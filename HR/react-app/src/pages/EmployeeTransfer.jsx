/**
 * Transfer and multi-branch linking (head office): find an employee, move them to another branch, or link
 * them to extra branches while keeping their primary one.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Page, PageHeader, Card, SearchInput, FormField, Select, Button, Badge, DataTable, StatusBadge, useConfirm } from '../ui';
import { employeesAPI, branchesAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import './EmployeeTransfer.css';

const nameOf = (e) => e.full_name || [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

export default function EmployeeTransfer() {
  const { showSuccess, showError, showWarning } = useNotification();
  const { confirm } = useConfirm();

  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [linked, setLinked] = useState([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  const [targetBranchId, setTargetBranchId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [linkBranchId, setLinkBranchId] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await branchesAPI.getAll();
        const data = response.data?.data || response.data || [];
        setBranches(data.filter((b) => b.is_active !== false));
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    })();
  }, []);

  // Debounced single-box search (name, ID, phone, email, employee number): needs 2+ characters
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = { page: 1, pageSize: 20, search: term };
        const response = await employeesAPI.getPaginated(params);
        setResults(response.data?.data || []);
      } catch (error) {
        console.error('Error searching employees:', error);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  const loadLinked = async (employeeId) => {
    setLoadingLinked(true);
    try {
      const response = await employeesAPI.getLinkedBranches(employeeId);
      setLinked(response.data?.data || []);
    } catch (error) {
      console.error('Error loading linked branches:', error);
      setLinked([]);
    } finally {
      setLoadingLinked(false);
    }
  };

  const select = async (employee) => {
    setSelected(employee);
    setResults([]);
    setSearch('');
    setTargetBranchId('');
    setLinkBranchId('');
    await loadLinked(employee.id);
  };

  const clearSelection = () => {
    setSelected(null);
    setLinked([]);
    setTargetBranchId('');
    setLinkBranchId('');
  };

  const transfer = async () => {
    if (!targetBranchId) { showWarning('يرجى اختيار الفرع المستهدف'); return; }
    const target = branches.find((b) => b.id === parseInt(targetBranchId, 10));
    const ok = await confirm({
      title: 'نقل الموظف',
      message: `هل أنت متأكد من نقل الموظف «${nameOf(selected)}» إلى فرع «${target?.branch_name}»؟ سيصبح فرعه الأساسي.`,
      confirmText: 'نقل',
    });
    if (!ok) return;
    setTransferring(true);
    try {
      const response = await employeesAPI.transfer(selected.id, { target_branch_id: parseInt(targetBranchId, 10) });
      if (response.data.success) {
        showSuccess(response.data.message);
        const fresh = await employeesAPI.getById(selected.id);
        setSelected(fresh.data?.data || fresh.data);
        await loadLinked(selected.id);
        setTargetBranchId('');
      }
    } catch (error) {
      console.error('Error transferring employee:', error);
      showError(error.response?.data?.message || 'فشل نقل الموظف');
    } finally {
      setTransferring(false);
    }
  };

  const link = async () => {
    if (!linkBranchId) { showWarning('يرجى اختيار الفرع للربط'); return; }
    setLinking(true);
    try {
      const response = await employeesAPI.linkToBranch({ employee_id: selected.id, branch_id: parseInt(linkBranchId, 10) });
      if (response.data.success) {
        showSuccess(response.data.message);
        await loadLinked(selected.id);
        setLinkBranchId('');
      }
    } catch (error) {
      console.error('Error linking employee:', error);
      showError(error.response?.data?.message || 'فشل ربط الموظف بالفرع');
    } finally {
      setLinking(false);
    }
  };

  const unlink = async (branchId, branchName) => {
    const ok = await confirm({ title: 'إلغاء الربط', message: `هل أنت متأكد من إلغاء ربط الموظف بفرع «${branchName}»؟`, tone: 'danger', confirmText: 'إلغاء الربط' });
    if (!ok) return;
    try {
      const response = await employeesAPI.unlinkFromBranch(selected.id, branchId);
      if (response.data.success) {
        showSuccess(response.data.message);
        await loadLinked(selected.id);
      }
    } catch (error) {
      console.error('Error unlinking:', error);
      showError(error.response?.data?.message || 'فشل إلغاء ربط الموظف');
    }
  };

  const branchName = (id) => branches.find((b) => b.id === id)?.branch_name || '—';
  const transferable = useMemo(() => branches.filter((b) => selected && b.id !== selected.branch_id), [branches, selected]);
  const linkable = useMemo(() => branches.filter((b) => !linked.some((lb) => lb.branch_id === b.id)), [branches, linked]);

  const resultColumns = [
    { key: 'name', header: 'الاسم', mobilePrimary: true, render: (e) => <strong>{nameOf(e)}</strong> },
    { key: 'id', header: 'رقم الهوية', render: (e) => (e.id_or_residency_number ? <bdi>{e.id_or_residency_number}</bdi> : '—') },
    { key: 'branch', header: 'الفرع', render: (e) => branchName(e.branch_id) },
    { key: 'status', header: 'الحالة', render: (e) => <StatusBadge status={e.status || 'active'} /> },
    { key: 'pick', header: '', align: 'end', render: (e) => <Button size="sm" variant="primary" onClick={() => select(e)}>اختيار</Button> },
  ];

  const linkedColumns = [
    { key: 'branch', header: 'الفرع', mobilePrimary: true, render: (lb) => <strong>{lb.branch_name}</strong> },
    { key: 'primary', header: 'النوع', render: (lb) => (lb.is_primary ? <Badge tone="success">أساسي</Badge> : <Badge tone="neutral">إضافي</Badge>) },
    { key: 'added', header: 'تاريخ الربط', render: (lb) => (lb.added_at ? new Date(lb.added_at).toLocaleDateString('ar-SA') : '—') },
    {
      key: 'actions', header: '', align: 'end',
      render: (lb) => (lb.is_primary
        ? <span className="et-hint">لا يمكن إلغاء ربط الفرع الأساسي</span>
        : <Button size="sm" variant="danger" onClick={() => unlink(lb.branch_id, lb.branch_name)}>إلغاء الربط</Button>),
    },
  ];

  return (
    <Page>
      <PageHeader title="نقل وربط الموظفين" subtitle="انقل موظفاً إلى فرع آخر، أو اربطه بفروع إضافية مع بقاء فرعه الأساسي" />

      <Card title="البحث عن موظف" subtitle="اكتب جزءاً من الاسم أو رقم الهوية أو الجوال أو البريد في خانة واحدة">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو البريد…" />
        {search.trim().length === 1 && <p className="et-hint">أدخل حرفين على الأقل</p>}
      </Card>

      {(searching || results.length > 0) && (
        <Card title="نتائج البحث" flush>
          <DataTable columns={resultColumns} rows={results} rowKey="id" loading={searching} emptyIcon="search" emptyTitle="لا توجد نتائج" />
        </Card>
      )}

      {selected && (
        <>
          <Card
            title="الموظف المختار"
            actions={<Button size="sm" variant="secondary" icon="x" onClick={clearSelection}>إلغاء الاختيار</Button>}
          >
            <dl className="et-info">
              <div><dt>الاسم</dt><dd>{nameOf(selected)}</dd></div>
              <div><dt>رقم الهوية</dt><dd><bdi>{selected.id_or_residency_number || '—'}</bdi></dd></div>
              <div><dt>الفرع الأساسي</dt><dd>{branchName(selected.branch_id)}</dd></div>
              <div><dt>الوظيفة</dt><dd>{selected.occupation || '—'}</dd></div>
            </dl>
          </Card>

          <Card title="نقل الموظف إلى فرع آخر" subtitle="سيتم تغيير فرعه الأساسي إلى الفرع المختار">
            <div className="et-row">
              <FormField label="الفرع المستهدف">
                <Select value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} options={transferable.map((b) => ({ value: String(b.id), label: b.branch_name }))} placeholder="اختر الفرع" />
              </FormField>
              <Button variant="primary" icon="transfer" loading={transferring} disabled={!targetBranchId} onClick={transfer}>نقل الموظف</Button>
            </div>
          </Card>

          <Card title="ربط الموظف بفروع إضافية" subtitle="يمكن ربط الموظف بعدة فروع مع الاحتفاظ بفرعه الأساسي" flush>
            <DataTable columns={linkedColumns} rows={linked} rowKey="branch_id" loading={loadingLinked} emptyIcon="building" emptyTitle="لا توجد فروع مرتبطة" />
            {linkable.length > 0 && (
              <div className="et-row et-row-pad">
                <FormField label="فرع للربط">
                  <Select value={linkBranchId} onChange={(e) => setLinkBranchId(e.target.value)} options={linkable.map((b) => ({ value: String(b.id), label: b.branch_name }))} placeholder="اختر الفرع" />
                </FormField>
                <Button variant="primary" icon="link" loading={linking} disabled={!linkBranchId} onClick={link}>ربط بالفرع</Button>
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

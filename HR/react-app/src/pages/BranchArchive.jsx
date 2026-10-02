import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Page, PageHeader, Card, Toolbar, SearchInput, Select, DataTable, Pagination, StatusBadge, Badge, Alert,
  ARCHIVED_STATUS_OPTIONS,
} from '../ui';
import { employeesAPI } from '../utils/api';
import { fullName, normalizeSearch } from './employees/employeeUtils';

const day = (value) => (value ? String(value).slice(0, 10) : '—');

/**
 * BranchArchive: employees who left the branch (read-only for branch managers).
 * Shows why and when they left, so the branch no longer has to ask the head office.
 * Restoring is a head-office action (Archive screen).
 */
export default function BranchArchive() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    employeesAPI.getLeft()
      .then((res) => setRows(res.data.data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [search, reason, pageSize]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return rows.filter((e) => {
      if (reason && e.status !== reason) return false;
      if (!q) return true;
      return q.split(/\s+/).every((p) => normalizeSearch(`${fullName(e)} ${e.id_or_residency_number} ${e.job_title}`).includes(p));
    });
  }, [rows, search, reason]);

  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const columns = [
    {
      key: 'name', header: 'الموظف', mobilePrimary: true,
      render: (e) => (
        <div className="ui-cell-stack">
          <strong>{fullName(e)}</strong>
          <bdi className="ui-cell-sub">{e.id_or_residency_number || '—'}</bdi>
        </div>
      ),
    },
    { key: 'job', header: 'المهنة', render: (e) => e.job_title || '—' },
    { key: 'status', header: 'سبب المغادرة', render: (e) => <StatusBadge status={e.status} /> },
    { key: 'last', header: 'آخر يوم عمل', nowrap: true, render: (e) => day(e.last_working_day || e.status_changed_at) },
    { key: 'note', header: 'التفاصيل', mobileHidden: true, render: (e) => <span className="ui-clamp-2">{e.status_change_reason || e.exit_notes || '—'}</span> },
    {
      key: 'rehire', header: 'إعادة التوظيف',
      render: (e) => (e.rehire_eligible === true ? <Badge tone="success">ممكن</Badge> : e.rehire_eligible === false ? <Badge tone="danger">غير موصى به</Badge> : '—'),
    },
  ];

  return (
    <Page>
      <PageHeader title="من غادروا الفرع" subtitle="الموظفون الذين انتهت خدمتهم، مع السبب وتاريخ المغادرة" />
      <Alert tone="info">لاستعادة موظف إلى الفرع تواصل مع المدير الرئيسي. السجل الكامل يظهر في ملف الموظف.</Alert>
      <Card flush>
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو رقم الهوية…" />
          <Select
            aria-label="سبب المغادرة"
            className="ui-toolbar-select"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={[{ value: '', label: 'كل الأسباب' }, ...ARCHIVED_STATUS_OPTIONS]}
          />
        </Toolbar>
        <DataTable
          caption="الموظفون الذين غادروا الفرع"
          columns={columns}
          rows={pageRows}
          loading={loading}
          error={error}
          onRetry={load}
          onRowClick={(e) => navigate(`/employees/${e.id}`)}
          emptyIcon="archive"
          emptyTitle={search || reason ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون غادروا الفرع'}
          emptyDescription="عند إنهاء خدمة موظف يظهر هنا مع السبب وآخر يوم عمل."
          footer={<Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />}
        />
      </Card>
    </Page>
  );
}

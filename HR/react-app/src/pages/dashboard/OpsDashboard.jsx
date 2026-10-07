/**
 * OpsDashboard: home of the branch operations manager. Shows the branches assigned to them and, per branch, which
 * required branch documents are still missing, with a shortcut to upload them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Page, PageHeader, Card, StatCard, Button, Badge, EmptyState, ErrorState, Skeleton } from '../../ui';
import { useAuth } from '../../contexts/AuthContext';
import { branchesAPI, employeesAPI, branchDocumentsAPI } from '../../utils/api';
import { getRequiredBranchDocuments, getMonthlyRequiredBranchDocuments } from '../../utils/employeeHelpers';
import { branchDocumentLabel } from '../../utils/branchDocumentLabels';
import './OpsDashboard.css';

const hasStoredFile = (doc) => !!(doc?.file_path || doc?.file_url || doc?.blob_url);
const normalizeType = (type) => (type === 'insurance_print' ? 'insurance_statement' : type);

/** Required, non-monthly document types a branch has no active stored file for. */
function missingDocumentTypes(branch, documents) {
  const monthly = getMonthlyRequiredBranchDocuments();
  const required = [...new Set(getRequiredBranchDocuments(branch.branch_type).filter((t) => !monthly.includes(t)))];
  return required.filter((type) => !documents.some((d) => (
    d.branch_id === branch.id && normalizeType(d.document_type) === type && d.is_active !== false && hasStoredFile(d)
  )));
}

export default function OpsDashboard() {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const assigned = useMemo(
    () => (Array.isArray(user?.assigned_branches) ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite) : []),
    [user?.assigned_branches],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [b, e, d] = await Promise.all([
        branchesAPI.getAll({ is_active: true }),
        employeesAPI.getAll({ is_active: true }).catch(() => ({ data: { data: [] } })),
        branchDocumentsAPI.getAll({}).catch(() => ({ data: { data: [] } })),
      ]);
      const mine = (rows, key) => (rows || []).filter((row) => assigned.includes(parseInt(row[key], 10)));
      setBranches((b.data?.data || []).filter((branch) => assigned.includes(parseInt(branch.id, 10))));
      setEmployees(mine(e.data?.data, 'branch_id'));
      setDocuments(mine(d.data?.data, 'branch_id'));
    } catch (err) {
      console.error('[OpsDashboard] load failed:', err?.message);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assigned]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => branches
    .map((branch) => ({
      branch,
      employees: employees.filter((e) => e.branch_id === branch.id).length,
      missing: missingDocumentTypes(branch, documents),
    }))
    .sort((a, b) => b.missing.length - a.missing.length || a.branch.branch_name.localeCompare(b.branch.branch_name, 'ar')), [branches, employees, documents]);

  const totalMissing = rows.reduce((sum, r) => sum + r.missing.length, 0);
  const branchesWithGaps = rows.filter((r) => r.missing.length > 0).length;

  return (
    <Page>
      <PageHeader
        title="لوحة التحكم"
        subtitle={`مرحباً ${user?.full_name || user?.username || ''} — ${branches.length} ${branches.length === 1 ? 'فرع' : 'فروع'} مُعيّنة`}
      />

      {error ? (
        <ErrorState title="تعذر تحميل البيانات" onRetry={load} />
      ) : (
        <>
          <div className="ui-grid-stats">
            <StatCard label="الفروع المعيّنة" value={branches.length} icon="building" tone="primary" loading={loading} />
            <StatCard label="الموظفون" value={employees.length} icon="users" tone="success" loading={loading} />
            <StatCard label="مستندات ناقصة" value={totalMissing} icon="file" tone={totalMissing ? 'danger' : 'success'} loading={loading} />
            <StatCard label="فروع تحتاج مستندات" value={branchesWithGaps} icon="alert" tone={branchesWithGaps ? 'warning' : 'success'} loading={loading} />
          </div>

          {loading ? (
            <Card><Skeleton lines={4} height={16} /></Card>
          ) : rows.length === 0 ? (
            <Card><EmptyState icon="building" title="لا توجد فروع معيّنة لك" description="تواصل مع المدير الرئيسي لتعيين الفروع." /></Card>
          ) : totalMissing === 0 ? (
            <Card><EmptyState icon="check-circle" title="لا توجد مستندات ناقصة حالياً" description="كل الفروع المعيّنة لك مغطاة بالمستندات المطلوبة." /></Card>
          ) : (
            <div className="od-grid">
              {rows.filter((r) => r.missing.length > 0).map(({ branch, employees: count, missing }) => (
                <Card
                  key={branch.id}
                  title={branch.branch_name}
                  subtitle={`${count} موظف`}
                  actions={<Badge tone="danger" dot>{missing.length} ناقص</Badge>}
                >
                  <div className="od-chips">
                    {missing.map((type) => <Badge key={type} tone="warning">{branchDocumentLabel(type)}</Badge>)}
                  </div>
                  <Button to={`/branch-documents?branch_id=${branch.id}`} variant="primary" icon="upload">رفع المستندات</Button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

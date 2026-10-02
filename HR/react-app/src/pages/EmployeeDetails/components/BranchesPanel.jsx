import { useEffect, useState } from 'react';
import { Badge, Button, Card, DataTable, ErrorState, useConfirm } from '../../../ui';
import { employeesAPI } from '../../../utils/api';
import { useNotification } from '../../../contexts/NotificationContext';

/** BranchesPanel: the branches an employee works in. Only the head office can unlink a secondary branch. */
export default function BranchesPanel({ employeeId, isMain, onChanged }) {
  const { confirm } = useConfirm();
  const { showSuccess, showError } = useNotification();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    employeesAPI.getLinkedBranches(employeeId).then((res) => setRows(res.data.data || [])).catch(() => setError(true));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [employeeId]);

  const unlink = async (row) => {
    const ok = await confirm({
      title: 'إلغاء ربط الفرع',
      message: `سيتوقف ${row.branch_name} عن رؤية هذا الموظف. هل تريد المتابعة؟`,
      tone: 'danger',
      confirmText: 'إلغاء الربط',
    });
    if (!ok) return;
    try {
      await employeesAPI.unlinkFromBranch(employeeId, row.branch_id);
      showSuccess('تم إلغاء ربط الفرع');
      load();
      onChanged?.();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إلغاء الربط');
    }
  };

  if (error) return <ErrorState compact title="تعذّر تحميل الفروع" onRetry={load} />;

  const columns = [
    { key: 'name', header: 'الفرع', mobilePrimary: true, render: (r) => <strong>{r.branch_name || `فرع ${r.branch_id}`}</strong> },
    { key: 'type', header: 'النوع', render: (r) => (r.branch_type === 'school' ? 'مدرسة' : r.branch_type === 'healthcare_center' ? 'مركز رعاية' : '—') },
    { key: 'primary', header: 'الصفة', render: (r) => (r.is_primary ? <Badge tone="info" dot>الفرع الأساسي</Badge> : <Badge>فرع إضافي</Badge>) },
    ...(isMain ? [{
      key: 'actions', header: '', align: 'end',
      render: (r) => (!r.is_primary ? <Button size="sm" variant="outline" onClick={() => unlink(r)}>إلغاء الربط</Button> : null),
    }] : []),
  ];

  return (
    <Card
      title="الفروع"
      subtitle="الفرع الأساسي يملك الموظف، والفروع الإضافية ترى بياناته فقط"
      actions={isMain ? <Button variant="secondary" icon="transfer" to="/employee-transfer" state={{ employeeId }}>نقل أو ربط بفرع</Button> : null}
      flush
    >
      <DataTable columns={columns} rows={rows || []} rowKey="branch_id" loading={!rows} emptyIcon="building" emptyTitle="لا توجد فروع مرتبطة" />
    </Card>
  );
}

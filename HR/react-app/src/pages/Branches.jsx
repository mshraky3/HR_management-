/**
 * Branches (head office): branch login accounts and contact details.
 * Create / edit, temporary password, unlock, sign-in activity, and deactivate / reactivate with the
 * consequence for the branch's employees spelled out before anything happens.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, Tabs, Toolbar, SearchInput, Select, Button, Badge, DataTable, RowActions, Modal, FormField, Input,
  Alert, useConfirm,
} from '../ui';
import { branchesAPI, clearCache } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { normalizeSearch } from './employees/employeeUtils';
import { AccountStatusBadge, LastLogin, SecretCell, ActivityModal, TempPasswordModal } from './accounts/shared';

const EMPTY = { branch_name: '', branch_location: '', branch_type: 'school', username: '', password: '', phone_number: '', email: '' };
const TYPE_LABEL = { school: 'مدرسة', healthcare_center: 'مركز رعاية' };

export default function Branches() {
  const { showError, showSuccess } = useNotification();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState('active');
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [activityFor, setActivityFor] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    clearCache('/api/branches');
    branchesAPI.getAll({ is_active: tab === 'active', include_counts: true })
      .then((res) => setBranches(Array.isArray(res.data.data) ? res.data.data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const q = normalizeSearch(search);
    return branches.filter((b) => {
      if (typeFilter && b.branch_type !== typeFilter) return false;
      if (!q) return true;
      return normalizeSearch(`${b.branch_name} ${b.branch_location || ''} ${b.username} ${b.email || ''} ${b.phone_number || ''}`).includes(q);
    });
  }, [branches, search, typeFilter]);

  const openCreate = () => { setForm({ ...EMPTY }); setFormError(''); };
  const openEdit = (b) => {
    setForm({
      id: b.id, branch_name: b.branch_name || '', branch_location: b.branch_location || '', branch_type: b.branch_type,
      username: b.username || '', password: '', phone_number: b.phone_number || '', email: b.email || '',
    });
    setFormError('');
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.id && form.password.length < 6) return setFormError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    setSaving(true);
    try {
      const { id, ...fields } = form;
      if (id) {
        if (!fields.password) delete fields.password;
        delete fields.branch_type; // the type of an existing branch is fixed (terms and year cycle depend on it)
        await branchesAPI.update(id, fields);
      } else {
        await branchesAPI.create(fields);
      }
      showSuccess(id ? 'تم تحديث الفرع' : 'تم إنشاء الفرع');
      setForm(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ الفرع');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (b) => {
    const n = b.active_employees || 0;
    const ok = await confirm({
      title: `إيقاف فرع "${b.branch_name}"`,
      message: [
        n > 0 ? `سيتم نقل ${n} موظف من هذا الفرع إلى الأرشيف.` : 'لا يوجد موظفون نشطون في الفرع.',
        'سيتم تسجيل خروج مدير الفرع فوراً، وإزالة الفرع من حسابات مسؤولي الفروع.',
        'يمكنك إعادة تفعيل الفرع لاحقاً، وسيعود موظفوه الذين أُرشفوا بسبب الإيقاف.',
      ].join('\n\n'),
      tone: 'danger',
      confirmText: 'إيقاف الفرع',
    });
    if (!ok) return;
    try {
      const res = await branchesAPI.delete(b.id);
      showSuccess(`تم إيقاف الفرع${res.data.archivedEmployeesCount ? ` وأرشفة ${res.data.archivedEmployeesCount} موظف` : ''}`);
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إيقاف الفرع');
    }
  };

  const reactivate = async (b) => {
    const ok = await confirm({
      title: `إعادة تفعيل فرع "${b.branch_name}"`,
      message: 'سيعود الفرع للعمل ويعود إليه الموظفون الذين أُرشفوا بسبب إيقافه.',
      confirmText: 'إعادة التفعيل',
    });
    if (!ok) return;
    try {
      const res = await branchesAPI.reactivate(b.id, true);
      showSuccess(`تم تفعيل الفرع${res.data.restoredEmployeesCount ? ` واستعادة ${res.data.restoredEmployeesCount} موظف` : ''}`);
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إعادة التفعيل');
    }
  };

  const reset = async (b) => {
    const ok = await confirm({
      title: 'كلمة مرور مؤقتة',
      message: `سيتم إنشاء كلمة مرور مؤقتة لفرع "${b.branch_name}" وتنتهي جلسته الحالية، وسيُطلب من مدير الفرع تغييرها عند الدخول.`,
      confirmText: 'إنشاء كلمة مرور',
    });
    if (!ok) return;
    try { const res = await branchesAPI.resetPassword(b.id); setTempPassword({ ...res.data.data, username: res.data.data.username }); load(); } catch (err) { showError(err.response?.data?.message || 'فشل إنشاء كلمة المرور'); }
  };

  const unlock = async (b) => {
    try { await branchesAPI.unlock(b.id); showSuccess('تم فك القفل'); load(); } catch (err) { showError(err.response?.data?.message || 'فشل فك القفل'); }
  };

  const columns = [
    {
      key: 'name', header: 'الفرع', mobilePrimary: true,
      render: (b) => (
        <div className="ui-cell-stack">
          <strong>{b.branch_name}</strong>
          <span className="ui-cell-sub">{b.branch_location || '—'}</span>
        </div>
      ),
    },
    { key: 'type', header: 'النوع', render: (b) => <Badge tone={b.branch_type === 'school' ? 'info' : 'success'}>{TYPE_LABEL[b.branch_type] || '—'}</Badge> },
    {
      key: 'login', header: 'بيانات الدخول', mobileHidden: true,
      render: (b) => (
        <div className="ui-cell-stack">
          <bdi>{b.username}</bdi>
          <SecretCell value={b.password} />
        </div>
      ),
    },
    {
      key: 'contact', header: 'التواصل', mobileHidden: true,
      render: (b) => (
        <div className="ui-cell-stack">
          {b.email ? <bdi>{b.email}</bdi> : <Badge tone="danger">لا يوجد بريد</Badge>}
          {b.phone_number && <bdi className="ui-cell-sub">{b.phone_number}</bdi>}
        </div>
      ),
    },
    { key: 'employees', header: 'الموظفون', align: 'center', render: (b) => b.active_employees ?? '—' },
    { key: 'last', header: 'آخر دخول', render: (b) => <LastLogin value={b.last_login_at} /> },
    { key: 'status', header: 'الحالة', render: (b) => <AccountStatusBadge account={b} /> },
    {
      key: 'actions', header: '', align: 'end',
      render: (b) => (
        <div className="ui-row-actions-group">
          {tab === 'active'
            ? <Button size="sm" variant="soft" onClick={() => openEdit(b)}>تعديل</Button>
            : <Button size="sm" variant="primary" onClick={() => reactivate(b)}>إعادة التفعيل</Button>}
          <RowActions actions={[
            { label: 'كلمة مرور مؤقتة', icon: 'key', onClick: () => reset(b) },
            { label: 'فك القفل', icon: 'lock', hidden: !(b.locked_until && new Date(b.locked_until) > new Date()), onClick: () => unlock(b) },
            { label: 'سجل الدخول', icon: 'history', onClick: () => setActivityFor(b) },
            { label: 'تعديل البيانات', icon: 'edit', hidden: tab === 'active', onClick: () => openEdit(b) },
            { label: 'إيقاف الفرع', icon: 'x-circle', danger: true, hidden: tab !== 'active', onClick: () => deactivate(b) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="حسابات الفروع"
        subtitle="بيانات دخول كل فرع ومعلومات التواصل معه"
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>إضافة فرع</Button>}
      />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'active', label: 'الفروع النشطة' }, { id: 'inactive', label: 'الفروع الموقوفة' }]} />
      <Card flush>
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث باسم الفرع أو المدينة أو اسم الدخول…" />
          <Select
            aria-label="نوع الفرع"
            className="ui-toolbar-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[{ value: '', label: 'كل الأنواع' }, { value: 'school', label: 'مدارس' }, { value: 'healthcare_center', label: 'مراكز رعاية' }]}
          />
        </Toolbar>
        <DataTable
          caption="الفروع"
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={load}
          emptyIcon="building"
          emptyTitle={tab === 'active' ? 'لا توجد فروع مطابقة' : 'لا توجد فروع موقوفة'}
        />
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={saving ? undefined : () => setForm(null)}
        size="lg"
        title={form?.id ? 'تعديل الفرع' : 'إضافة فرع جديد'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="branch-form" loading={saving}>{form?.id ? 'حفظ التعديلات' : 'إنشاء الفرع'}</Button>
          </>
        )}
      >
        {form && (
          <form id="branch-form" onSubmit={submit} className="ui-form-stack">
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="ui-form-grid">
              <FormField label="اسم الفرع" required><Input value={form.branch_name} onChange={set('branch_name')} required /></FormField>
              <FormField label="المدينة / الموقع" required><Input value={form.branch_location} onChange={set('branch_location')} required /></FormField>
              <FormField label="نوع الفرع" required hint={form.id ? 'لا يمكن تغيير نوع فرع قائم' : undefined}>
                <Select
                  value={form.branch_type}
                  onChange={set('branch_type')}
                  disabled={Boolean(form.id)}
                  options={[{ value: 'school', label: 'مدرسة' }, { value: 'healthcare_center', label: 'مركز رعاية' }]}
                />
              </FormField>
              <FormField label="اسم المستخدم" required><Input value={form.username} onChange={set('username')} dir="ltr" autoComplete="off" required /></FormField>
              <FormField label="البريد الإلكتروني" hint="يصله رمز التحقق عند كل تسجيل دخول"><Input type="email" value={form.email} onChange={set('email')} dir="ltr" /></FormField>
              <FormField label="رقم الجوال"><Input value={form.phone_number} onChange={set('phone_number')} dir="ltr" inputMode="tel" /></FormField>
            </div>
            <FormField
              label={form.id ? 'كلمة مرور جديدة' : 'كلمة المرور'}
              required={!form.id}
              hint={form.id ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية. تغييرها يُنهي جلسة الفرع.' : '6 أحرف على الأقل'}
            >
              <Input type="text" value={form.password} onChange={set('password')} dir="ltr" autoComplete="new-password" />
            </FormField>
          </form>
        )}
      </Modal>

      <TempPasswordModal data={tempPassword} onClose={() => setTempPassword(null)} />
      <ActivityModal
        open={Boolean(activityFor)}
        onClose={() => setActivityFor(null)}
        title={`سجل دخول ${activityFor?.branch_name || ''}`}
        load={() => branchesAPI.getActivity(activityFor.id)}
      />
    </Page>
  );
}

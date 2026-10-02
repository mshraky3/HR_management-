/**
 * Branch operations accounts: staff who manage documents and buses for several branches.
 * Create / edit with their branches in one step, temporary password, unlock, activity, disable / enable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, Tabs, Toolbar, SearchInput, Button, Badge, DataTable, RowActions, Modal, FormField, Input, Alert,
  useConfirm,
} from '../ui';
import { usersAPI, branchesAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { normalizeSearch } from './employees/employeeUtils';
import { AccountStatusBadge, LastLogin, SecretCell, ActivityModal, TempPasswordModal } from './accounts/shared';
import BranchPicker from './accounts/BranchPicker';

const EMPTY = { username: '', password: '', full_name: '', phone_number: '', email: '', branch_ids: [] };

export default function BranchOpsAccounts() {
  const { showError, showSuccess } = useNotification();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState('active');
  const [accounts, setAccounts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [activityFor, setActivityFor] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    usersAPI.getBranchOpsList({ status: tab === 'active' ? 'active' : 'disabled' })
      .then((res) => setAccounts(res.data.data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(load, [load]);
  useEffect(() => {
    branchesAPI.getAll({ is_active: true }).then((res) => setBranches(res.data.data || [])).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return accounts;
    return accounts.filter((a) => normalizeSearch(`${a.full_name} ${a.username} ${a.email || ''} ${(a.assigned_branches || []).map((b) => b.branch_name).join(' ')}`).includes(q));
  }, [accounts, search]);

  const openCreate = () => { setForm({ ...EMPTY }); setFormError(''); };
  const openEdit = (a) => {
    setForm({
      id: a.id, username: a.username, password: '', full_name: a.full_name || '', phone_number: a.phone_number || '',
      email: a.email || '', branch_ids: (a.assigned_branches || []).map((b) => b.branch_id),
    });
    setFormError('');
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.email) return setFormError('البريد الإلكتروني مطلوب: يصله رمز التحقق عند كل دخول');
    if (!form.id && form.password.length < 6) return setFormError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    setSaving(true);
    try {
      const { id, branch_ids: branchIds, ...fields } = form;
      if (id) {
        if (!fields.password) delete fields.password;
        await usersAPI.update(id, fields);
        await usersAPI.setAssignedBranches(id, branchIds);
      } else {
        // One request: the account and its branches are created together or not at all
        await usersAPI.create({ ...fields, role: 'branch_operations_manager', assigned_branch_ids: branchIds });
      }
      showSuccess(id ? 'تم تحديث الحساب' : 'تم إنشاء الحساب');
      setForm(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ الحساب');
    } finally {
      setSaving(false);
    }
  };

  const disable = async (a) => {
    const ok = await confirm({
      title: 'تعطيل الحساب',
      message: `سيتم تسجيل خروج ${a.full_name || a.username} فوراً. تبقى الفروع المعيّنة محفوظة إن أعدت تفعيله.`,
      tone: 'danger',
      confirmText: 'تعطيل الحساب',
    });
    if (!ok) return;
    try { await usersAPI.delete(a.id); showSuccess('تم تعطيل الحساب'); load(); } catch (err) { showError(err.response?.data?.message || 'فشل تعطيل الحساب'); }
  };
  const enable = async (a) => {
    try { await usersAPI.reactivate(a.id); showSuccess('تم تفعيل الحساب'); load(); } catch (err) { showError(err.response?.data?.message || 'فشل تفعيل الحساب'); }
  };
  const reset = async (a) => {
    const ok = await confirm({
      title: 'كلمة مرور مؤقتة',
      message: `سيتم إنشاء كلمة مرور مؤقتة لـ ${a.full_name || a.username} وتنتهي جلساته الحالية.`,
      confirmText: 'إنشاء كلمة مرور',
    });
    if (!ok) return;
    try { const res = await usersAPI.resetPassword(a.id); setTempPassword(res.data.data); load(); } catch (err) { showError(err.response?.data?.message || 'فشل إنشاء كلمة المرور'); }
  };
  const unlock = async (a) => {
    try { await usersAPI.unlock(a.id); showSuccess('تم فك القفل'); load(); } catch (err) { showError(err.response?.data?.message || 'فشل فك القفل'); }
  };

  const columns = [
    {
      key: 'name', header: 'الحساب', mobilePrimary: true,
      render: (a) => (
        <div className="ui-cell-stack">
          <strong>{a.full_name || '—'}</strong>
          <bdi className="ui-cell-sub">{a.username}</bdi>
        </div>
      ),
    },
    { key: 'email', header: 'البريد (يصله رمز الدخول)', mobileHidden: true, render: (a) => (a.email ? <bdi>{a.email}</bdi> : <Badge tone="danger">لا يوجد</Badge>) },
    {
      key: 'branches', header: 'الفروع',
      render: (a) => {
        const list = a.assigned_branches || [];
        if (list.length === 0) return <Badge tone="warning">بدون فروع</Badge>;
        return (
          <div className="ui-chips" title={list.map((b) => b.branch_name).join('، ')}>
            {list.slice(0, 2).map((b) => <Badge key={b.branch_id}>{b.branch_name}</Badge>)}
            {list.length > 2 && <Badge tone="info">+{list.length - 2}</Badge>}
          </div>
        );
      },
    },
    { key: 'password', header: 'كلمة المرور', mobileHidden: true, render: (a) => <SecretCell value={a.password} /> },
    { key: 'last', header: 'آخر دخول', render: (a) => <LastLogin value={a.last_login_at} /> },
    { key: 'status', header: 'الحالة', render: (a) => <AccountStatusBadge account={a} /> },
    {
      key: 'actions', header: '', align: 'end',
      render: (a) => (
        <div className="ui-row-actions-group">
          {tab === 'active'
            ? <Button size="sm" variant="soft" onClick={() => openEdit(a)}>تعديل</Button>
            : <Button size="sm" variant="primary" onClick={() => enable(a)}>تفعيل الحساب</Button>}
          <RowActions actions={[
            { label: 'كلمة مرور مؤقتة', icon: 'key', onClick: () => reset(a) },
            { label: 'فك القفل', icon: 'lock', hidden: !(a.locked_until && new Date(a.locked_until) > new Date()), onClick: () => unlock(a) },
            { label: 'سجل الدخول', icon: 'history', onClick: () => setActivityFor(a) },
            { label: 'تعديل الحساب والفروع', icon: 'edit', hidden: tab === 'active', onClick: () => openEdit(a) },
            { label: 'تعطيل الحساب', icon: 'x-circle', danger: true, hidden: tab !== 'active', onClick: () => disable(a) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="حسابات مسؤولي الفروع"
        subtitle="يديرون مستندات الفروع والباصات للفروع المعيّنة لهم فقط، ويدخلون برمز يصل بريدهم"
        actions={<Button variant="primary" icon="user-plus" onClick={openCreate}>إضافة حساب</Button>}
      />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'active', label: 'الحسابات النشطة' }, { id: 'disabled', label: 'الحسابات المعطّلة' }]} />
      <Card flush>
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو الفرع…" />
        </Toolbar>
        <DataTable
          caption="حسابات مسؤولي الفروع"
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={load}
          emptyIcon="user-check"
          emptyTitle={tab === 'active' ? 'لا توجد حسابات بعد' : 'لا توجد حسابات معطّلة'}
          emptyAction={tab === 'active' ? <Button variant="primary" icon="user-plus" onClick={openCreate}>إضافة حساب</Button> : null}
        />
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={saving ? undefined : () => setForm(null)}
        size="lg"
        title={form?.id ? 'تعديل الحساب' : 'إضافة حساب جديد'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="ops-form" loading={saving}>{form?.id ? 'حفظ التعديلات' : 'إنشاء الحساب'}</Button>
          </>
        )}
      >
        {form && (
          <form id="ops-form" onSubmit={submit} className="ui-form-stack">
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="ui-form-grid">
              <FormField label="الاسم الكامل" required><Input value={form.full_name} onChange={set('full_name')} required /></FormField>
              <FormField label="اسم المستخدم" required><Input value={form.username} onChange={set('username')} dir="ltr" autoComplete="off" required /></FormField>
              <FormField label="البريد الإلكتروني" required hint="يصله رمز التحقق عند كل تسجيل دخول"><Input type="email" value={form.email} onChange={set('email')} dir="ltr" required /></FormField>
              <FormField label="رقم الجوال"><Input value={form.phone_number} onChange={set('phone_number')} dir="ltr" inputMode="tel" /></FormField>
            </div>
            <FormField
              label={form.id ? 'كلمة مرور جديدة' : 'كلمة المرور'}
              required={!form.id}
              hint={form.id ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية' : '6 أحرف على الأقل'}
            >
              <Input type="text" value={form.password} onChange={set('password')} dir="ltr" autoComplete="new-password" />
            </FormField>
            <BranchPicker branches={branches} value={form.branch_ids} onChange={(ids) => setForm((f) => ({ ...f, branch_ids: ids }))} />
          </form>
        )}
      </Modal>

      <TempPasswordModal data={tempPassword} onClose={() => setTempPassword(null)} />
      <ActivityModal
        open={Boolean(activityFor)}
        onClose={() => setActivityFor(null)}
        title={`سجل دخول ${activityFor?.full_name || activityFor?.username || ''}`}
        load={() => usersAPI.getActivity(activityFor.id)}
      />
    </Page>
  );
}

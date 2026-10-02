/**
 * Account Management: head-office (main manager) accounts.
 * Create / edit, temporary-password reset, unlock, sign-in activity, disable and re-enable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, Tabs, Toolbar, SearchInput, Button, DataTable, RowActions, Modal, FormField, Input, Alert,
  useConfirm,
} from '../ui';
import { usersAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { normalizeSearch } from './employees/employeeUtils';
import { AccountStatusBadge, LastLogin, SecretCell, ActivityModal, TempPasswordModal } from './accounts/shared';

const EMPTY = { username: '', password: '', full_name: '', phone_number: '', email: '' };

export default function AccountManagement() {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState('active');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState(null); // null = closed, else { id?, ...fields }
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [activityFor, setActivityFor] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    usersAPI.getAll({ role: 'main_manager', status: tab === 'active' ? 'active' : 'disabled' })
      .then((res) => setAccounts(res.data.data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return accounts;
    return accounts.filter((a) => normalizeSearch(`${a.full_name} ${a.username} ${a.email || ''}`).includes(q));
  }, [accounts, search]);

  const openCreate = () => { setForm({ ...EMPTY }); setFormError(''); };
  const openEdit = (a) => {
    setForm({ id: a.id, username: a.username, password: '', full_name: a.full_name || '', phone_number: a.phone_number || '', email: a.email || '' });
    setFormError('');
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.id && form.password.length < 6) return setFormError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.id;
      if (form.id) {
        if (!payload.password) delete payload.password;
        await usersAPI.update(form.id, payload);
      } else {
        await usersAPI.create(payload);
      }
      showSuccess(form.id ? 'تم تحديث الحساب' : 'تم إنشاء الحساب');
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
      message: `سيتم تسجيل خروج ${a.full_name || a.username} فوراً ولن يتمكن من الدخول حتى تعيد تفعيل الحساب.`,
      tone: 'danger',
      confirmText: 'تعطيل الحساب',
    });
    if (!ok) return;
    try {
      await usersAPI.delete(a.id);
      showSuccess('تم تعطيل الحساب');
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل تعطيل الحساب');
    }
  };

  const enable = async (a) => {
    try {
      await usersAPI.reactivate(a.id);
      showSuccess('تم تفعيل الحساب');
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل تفعيل الحساب');
    }
  };

  const reset = async (a) => {
    const ok = await confirm({
      title: 'كلمة مرور مؤقتة',
      message: `سيتم إنشاء كلمة مرور مؤقتة لـ ${a.full_name || a.username}، وتنتهي جلساته الحالية، وسيُطلب منه تغييرها عند الدخول.`,
      confirmText: 'إنشاء كلمة مرور',
    });
    if (!ok) return;
    try {
      const res = await usersAPI.resetPassword(a.id);
      setTempPassword(res.data.data);
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل إنشاء كلمة المرور');
    }
  };

  const unlock = async (a) => {
    try {
      await usersAPI.unlock(a.id);
      showSuccess('تم فك القفل');
      load();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل فك القفل');
    }
  };

  const columns = [
    {
      key: 'name', header: 'الحساب', mobilePrimary: true,
      render: (a) => (
        <div className="ui-cell-stack">
          <strong>{a.full_name || '—'}{a.id === user?.id && <span className="ui-cell-sub"> (أنت)</span>}</strong>
          <bdi className="ui-cell-sub">{a.username}</bdi>
        </div>
      ),
    },
    { key: 'email', header: 'البريد', mobileHidden: true, render: (a) => (a.email ? <bdi>{a.email}</bdi> : '—') },
    { key: 'password', header: 'كلمة المرور', render: (a) => <SecretCell value={a.password} /> },
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
            { label: 'تعديل البيانات', icon: 'edit', hidden: tab === 'active', onClick: () => openEdit(a) },
            { label: 'تعطيل الحساب', icon: 'x-circle', danger: true, hidden: tab !== 'active' || a.id === user?.id, onClick: () => disable(a) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="حسابات المسؤولين"
        subtitle="حسابات الإدارة الرئيسية التي تملك صلاحية كاملة على النظام"
        actions={<Button variant="primary" icon="user-plus" onClick={openCreate}>إضافة حساب</Button>}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[{ id: 'active', label: 'الحسابات النشطة' }, { id: 'disabled', label: 'الحسابات المعطّلة' }]}
      />
      <Card flush>
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث بالاسم أو اسم المستخدم…" />
        </Toolbar>
        <DataTable
          caption="حسابات المسؤولين"
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={load}
          emptyIcon="shield"
          emptyTitle={tab === 'active' ? 'لا توجد حسابات' : 'لا توجد حسابات معطّلة'}
        />
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={saving ? undefined : () => setForm(null)}
        title={form?.id ? 'تعديل الحساب' : 'إضافة حساب جديد'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="account-form" loading={saving}>{form?.id ? 'حفظ التعديلات' : 'إنشاء الحساب'}</Button>
          </>
        )}
      >
        {form && (
          <form id="account-form" onSubmit={submit} className="ui-form-stack">
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="ui-form-grid">
              <FormField label="الاسم الكامل" required><Input value={form.full_name} onChange={set('full_name')} required /></FormField>
              <FormField label="اسم المستخدم" required><Input value={form.username} onChange={set('username')} dir="ltr" autoComplete="off" required /></FormField>
              <FormField label="البريد الإلكتروني"><Input type="email" value={form.email} onChange={set('email')} dir="ltr" /></FormField>
              <FormField label="رقم الجوال"><Input value={form.phone_number} onChange={set('phone_number')} dir="ltr" inputMode="tel" /></FormField>
            </div>
            <FormField
              label={form.id ? 'كلمة مرور جديدة' : 'كلمة المرور'}
              required={!form.id}
              hint={form.id ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية. تغييرها يُنهي جلسات الحساب.' : '6 أحرف على الأقل'}
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
        title={`سجل دخول ${activityFor?.full_name || activityFor?.username || ''}`}
        load={() => usersAPI.getActivity(activityFor.id)}
      />
    </Page>
  );
}

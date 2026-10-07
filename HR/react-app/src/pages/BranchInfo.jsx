/**
 * Branch info (branch managers): contact details and headcount. The headcount is what the dashboard
 * uses to compute how complete the employee data is.
 */
import { useState, useEffect, useCallback } from 'react';
import { Page, PageHeader, Card, FormField, Input, Button, Badge, EmptyState, Skeleton } from '../ui';
import { branchesAPI, clearCache } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';

const toForm = (b) => ({
  phone_number: b.phone_number || '',
  email: b.email || '',
  number_of_employees: b.number_of_employees !== null && b.number_of_employees !== undefined ? String(b.number_of_employees) : '',
});

export default function BranchInfo() {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branch, setBranch] = useState(null);
  const [form, setForm] = useState({ phone_number: '', email: '', number_of_employees: '' });

  const loadBranch = useCallback(async () => {
    try {
      setLoading(true);
      const response = await branchesAPI.getById(user.branch_id);
      if (response?.data?.success) {
        setBranch(response.data.data);
        setForm(toForm(response.data.data));
      } else {
        showError('فشل تحميل معلومات الفرع');
      }
    } catch (error) {
      console.error('Error loading branch:', error);
      showError(`فشل تحميل معلومات الفرع: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  }, [user?.branch_id, showError]);

  useEffect(() => {
    if (user?.branch_id) loadBranch();
  }, [user?.branch_id, loadBranch]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const count = String(form.number_of_employees || '').trim();
      const response = await branchesAPI.updateMyBranch({
        phone_number: form.phone_number.trim() || null,
        email: form.email.trim() || null,
        number_of_employees: count === '' ? null : count,
      });

      // Branch info feeds several other screens: drop their cached copies.
      clearCache('/api/branches');
      clearCache('/api/branch-statistics');
      clearCache('/api/employees');

      if (response?.data?.success && response.data.data) {
        setBranch(response.data.data);
        setForm(toForm(response.data.data));
      } else {
        await loadBranch();
      }
      showSuccess('تم تحديث معلومات الفرع بنجاح');
      window.dispatchEvent(new CustomEvent('branchInfoUpdated')); // lets the dashboard refresh
    } catch (error) {
      console.error('Error updating branch:', error);
      showError(`فشل تحديث معلومات الفرع: ${error.response?.data?.message || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page narrow>
        <PageHeader title="معلومات الفرع" />
        <Card><Skeleton lines={4} height={16} /></Card>
      </Page>
    );
  }

  if (!branch) {
    return (
      <Page narrow>
        <PageHeader title="معلومات الفرع" />
        <Card><EmptyState icon="building" title="لم يتم العثور على معلومات الفرع" action={<Button variant="secondary" icon="refresh" onClick={loadBranch}>إعادة المحاولة</Button>} /></Card>
      </Page>
    );
  }

  return (
    <Page narrow>
      <PageHeader
        title="معلومات الفرع"
        subtitle={branch.branch_name}
        actions={<Badge tone="info">{branch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}</Badge>}
      />
      <Card title="بيانات التواصل والعدد" subtitle="يستخدمها المكتب الرئيسي للتواصل معك">
        <form onSubmit={submit} className="ui-form-stack" noValidate>
          <FormField label="رقم جوال الفرع">
            <Input value={form.phone_number} onChange={set('phone_number')} placeholder="مثال: 0501234567" dir="ltr" inputMode="tel" />
          </FormField>
          <FormField label="إيميل الفرع">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="مثال: branch@example.com" dir="ltr" />
          </FormField>
          <FormField label="عدد الموظفين في الفرع" hint="يُستخدم هذا العدد لحساب نسبة اكتمال بيانات الموظفين بدقة أكبر في لوحة التحكم">
            <Input type="number" min="0" step="1" value={form.number_of_employees} onChange={set('number_of_employees')} placeholder="مثال: 50" />
          </FormField>
          <div className="ui-page-actions">
            <Button type="submit" variant="primary" icon="check" loading={saving}>حفظ التغييرات</Button>
            <Button variant="secondary" onClick={() => setForm(toForm(branch))} disabled={saving}>إلغاء التغييرات</Button>
          </div>
        </form>
      </Card>
    </Page>
  );
}

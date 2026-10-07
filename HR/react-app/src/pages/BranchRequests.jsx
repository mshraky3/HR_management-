/**
 * Requests (branch managers): send a request to head office, optionally about one employee and with a
 * file, and follow the answers.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page, PageHeader, Card, Tabs, Button, Alert, Modal, FormField, Input, Select, Textarea, SearchInput, EmptyState,
  Skeleton, useConfirm,
} from '../ui';
import { requestsAPI, employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getLastSeen, setLastSeen } from '../utils/notificationTracker';
import RequestCard from './requests/RequestCard';
import './requests/requests.css';

const EMPTY_FORM = { main_manager_id: '', employee_id: '', request_name: '', request_text: '' };
const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

export default function BranchRequests() {
  const { user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();

  const [requests, setRequests] = useState([]);
  const [mainManagers, setMainManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newResponsesCount, setNewResponsesCount] = useState(0);
  const [tab, setTab] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachment, setAttachment] = useState(null);

  const branchId = user?.branch_id || null;
  const isMainManagerUser = user?.role === 'main_manager';

  const loadData = useCallback(async () => {
    if (!user || isMainManagerUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const employeeFilters = { is_active: true };
      if (branchId) employeeFilters.branch_id = branchId;
      const [requestsRes, managersRes, employeesRes] = await Promise.all([
        requestsAPI.getAll(),
        requestsAPI.getMainManagers(),
        employeesAPI.getAll(employeeFilters),
      ]);
      if (requestsRes.data.success) setRequests(requestsRes.data.data || []);
      if (managersRes.data.success) setMainManagers(managersRes.data.data || []);
      if (employeesRes.data.success) setEmployees(employeesRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      showError('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [user, isMainManagerUser, branchId, showError]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!branchId || isMainManagerUser) return;
    const lastSeen = getLastSeen(`branch_requests_last_seen_${branchId}`);
    setNewResponsesCount(requests.filter((r) => {
      if (!r.responded_at) return false;
      const date = new Date(r.responded_at);
      return !Number.isNaN(date.getTime()) && (!lastSeen || date > lastSeen);
    }).length);
  }, [requests, branchId, isMainManagerUser]);

  const employeeOptions = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return employees
      .filter((e) => !q || fullName(e).toLowerCase().includes(q))
      .map((e) => ({ value: String(e.id), label: fullName(e) }));
  }, [employees, employeeSearch]);

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    answered: requests.filter((r) => r.status !== 'pending').length,
  }), [requests]);

  const visible = requests.filter((r) => (tab === 'pending' ? r.status === 'pending' : tab === 'answered' ? r.status !== 'pending' : true));

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setAttachment(null);
    setEmployeeSearch('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.main_manager_id || !form.request_name.trim() || !form.request_text.trim()) {
      showWarning('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    try {
      setSaving(true);
      const data = new FormData();
      data.append('main_manager_id', form.main_manager_id);
      if (form.employee_id) data.append('employee_id', form.employee_id);
      data.append('request_name', form.request_name.trim());
      data.append('request_text', form.request_text.trim());
      if (attachment) data.append('file', attachment);
      const response = await requestsAPI.create(data);
      if (response.data.success) {
        showSuccess('تم إرسال الطلب بنجاح');
        setFormOpen(false);
        setForm(EMPTY_FORM);
        setAttachment(null);
        setEmployeeSearch('');
        await loadData();
      }
    } catch (error) {
      console.error('Error creating request:', error);
      showError(error.response?.data?.message || 'فشل إنشاء الطلب');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (request) => {
    const ok = await confirm({ title: 'حذف الطلب', message: `هل أنت متأكد من حذف الطلب «${request.request_name}»؟`, tone: 'danger', confirmText: 'حذف' });
    if (!ok) return;
    try {
      const response = await requestsAPI.delete(request.id);
      if (response.data.success) {
        showSuccess('تم حذف الطلب بنجاح');
        await loadData();
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      showError(error.response?.data?.message || 'فشل حذف الطلب');
    }
  };

  if (isMainManagerUser) {
    return (
      <Page>
        <PageHeader title="الطلبات" />
        <Card><EmptyState icon="inbox" title="هذه الصفحة متاحة فقط لمديري الفروع" description="يمكنك الرد على طلبات الفروع من «إدارة الطلبات»." action={<Button variant="primary" to="/manage-requests">إدارة الطلبات</Button>} /></Card>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="الطلبات"
        subtitle="أرسل طلباً للإدارة وتابع الردود عليه"
        actions={<Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>إرسال طلب جديد</Button>}
      />

      {newResponsesCount > 0 && (
        <Alert
          tone="info"
          action={<Button size="sm" variant="secondary" onClick={() => { setLastSeen(`branch_requests_last_seen_${branchId}`, new Date()); setNewResponsesCount(0); }}>تم الاطلاع</Button>}
        >
          لديك {newResponsesCount} رد جديد على طلباتك
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="تصفية الطلبات"
        items={[
          { id: 'all', label: 'كل الطلبات', count: counts.all },
          { id: 'pending', label: 'قيد الانتظار', count: counts.pending },
          { id: 'answered', label: 'تم الرد', count: counts.answered },
        ]}
      />

      {loading ? (
        <div className="rq-grid">{[0, 1, 2].map((i) => <Card key={i}><Skeleton lines={4} height={14} /></Card>)}</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="inbox"
            title={requests.length === 0 ? 'لا توجد طلبات مرسلة' : 'لا توجد طلبات في هذا التصنيف'}
            description={requests.length === 0 ? 'أرسل أول طلب إلى الإدارة وسيظهر هنا مع الرد عليه.' : undefined}
            action={requests.length === 0 ? <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>إرسال طلب جديد</Button> : null}
          />
        </Card>
      ) : (
        <div className="rq-grid">
          {visible.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              whoLabel="المدير الرئيسي"
              who={request.main_manager_name}
              actions={request.status === 'pending' ? (
                <Button size="sm" variant="ghost" icon="trash" className="rq-danger" onClick={() => remove(request)}>حذف</Button>
              ) : null}
            />
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={closeForm}
        title="إرسال طلب جديد"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="rq-form" icon="mail" loading={saving}>إرسال الطلب</Button>
          </>
        )}
      >
        <form id="rq-form" onSubmit={submit} className="ui-form-stack" noValidate>
          <FormField label="المدير الرئيسي" required>
            <Select
              value={form.main_manager_id}
              onChange={(e) => setForm({ ...form, main_manager_id: e.target.value })}
              options={mainManagers.map((m) => ({ value: String(m.id), label: m.full_name || m.username }))}
              placeholder="اختر المدير الرئيسي"
            />
          </FormField>

          <FormField label="الموظف المعني (اختياري)">
            <Select
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              options={employeeOptions}
              placeholder="لا يوجد"
            />
          </FormField>
          <SearchInput value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} onClear={() => setEmployeeSearch('')} placeholder="ابحث عن الموظف بالاسم لتقصير القائمة…" aria-label="بحث عن موظف" />

          <FormField label="اسم الطلب" required>
            <Input value={form.request_name} onChange={(e) => setForm({ ...form, request_name: e.target.value })} placeholder="أدخل اسم الطلب" />
          </FormField>
          <FormField label="نص الطلب" required>
            <Textarea rows={5} value={form.request_text} onChange={(e) => setForm({ ...form, request_text: e.target.value })} placeholder="أدخل نص الطلب" />
          </FormField>
          <FormField label="إرفاق ملف (اختياري)" hint="PDF أو صورة">
            <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png,.gif" onChange={(e) => setAttachment(e.target.files[0] || null)} />
          </FormField>
          {attachment && (
            <div className="rq-file">
              <span>الملف المحدد: <bdi>{attachment.name}</bdi></span>
              <Button size="sm" variant="ghost" icon="x" onClick={() => setAttachment(null)}>إزالة</Button>
            </div>
          )}
        </form>
      </Modal>
    </Page>
  );
}

/**
 * Manage requests (head office): the requests branches sent, with a status filter and a reply
 * (status, text, optional file) for each.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader, Card, Tabs, Button, Alert, Modal, FormField, Select, Textarea, EmptyState, Skeleton } from '../ui';
import { requestsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getLastSeen, setLastSeen, countNewByDate } from '../utils/notificationTracker';
import RequestCard from './requests/RequestCard';
import { REQUEST_STATUS } from './requests/constants';
import './requests/requests.css';

const REPLY_STATUSES = ['approved', 'rejected', 'in_progress', 'completed'].map((value) => ({ value, label: REQUEST_STATUS[value].label }));
const FILTER_TABS = [
  { id: 'all', label: 'الكل', status: '' },
  { id: 'pending', label: 'قيد الانتظار', status: 'pending' },
  { id: 'approved', label: 'موافق عليه', status: 'approved' },
  { id: 'rejected', label: 'مرفوض', status: 'rejected' },
  { id: 'in_progress', label: 'قيد المعالجة', status: 'in_progress' },
  { id: 'completed', label: 'مكتمل', status: 'completed' },
];

export default function ManageRequests() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState({ status: '', response_text: '' });
  const [replyFile, setReplyFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('all');
  const [newRequestsCount, setNewRequestsCount] = useState(0);

  const statusFilter = FILTER_TABS.find((t) => t.id === tab)?.status || '';

  const loadRequests = async () => {
    try {
      setLoading(true);
      const filters = statusFilter ? { status: statusFilter } : {};
      const response = await requestsAPI.getAll(filters);
      if (response.data.success) setRequests(response.data.data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      showError('فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  };

  // Loaded once on mount and whenever the filter changes; no polling, so the list never jumps under the reader.
  useEffect(() => {
    if (isMainManager()) loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!isMainManager()) return;
    const lastSeen = getLastSeen('requests_last_seen_main');
    setNewRequestsCount(countNewByDate(requests.filter((r) => r.status === 'pending'), 'created_at', lastSeen));
  }, [requests, isMainManager]);

  const openReply = (request) => {
    setSelected(request);
    setReply({ status: request.status === 'pending' ? 'approved' : request.status, response_text: request.response_text || '' });
    setReplyFile(null);
  };

  const closeReply = () => {
    if (saving) return;
    setSelected(null);
    setReply({ status: '', response_text: '' });
    setReplyFile(null);
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!reply.status) {
      showWarning('يرجى اختيار حالة الرد');
      return;
    }
    try {
      setSaving(true);
      const data = new FormData();
      data.append('status', reply.status);
      if (reply.response_text) data.append('response_text', reply.response_text);
      if (replyFile) data.append('file', replyFile);
      const response = await requestsAPI.respond(selected.id, data);
      if (response.data.success) {
        showSuccess('تم الرد على الطلب بنجاح');
        setSelected(null);
        setReply({ status: '', response_text: '' });
        setReplyFile(null);
        loadRequests();
      }
    } catch (error) {
      console.error('Error responding to request:', error);
      showError(error.response?.data?.message || 'فشل الرد على الطلب');
    } finally {
      setSaving(false);
    }
  };

  if (!isMainManager()) {
    return (
      <Page>
        <PageHeader title="إدارة الطلبات" />
        <Card><EmptyState icon="inbox" title="هذه الصفحة متاحة فقط للمدير الرئيسي" /></Card>
      </Page>
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <Page>
      <PageHeader
        title="إدارة الطلبات"
        subtitle={pendingCount > 0 ? `لديك ${pendingCount} طلب قيد الانتظار` : 'طلبات الفروع والردود عليها'}
      />

      {newRequestsCount > 0 && (
        <Alert
          tone="info"
          action={<Button size="sm" variant="secondary" onClick={() => { setLastSeen('requests_last_seen_main', new Date()); setNewRequestsCount(0); }}>تم الاطلاع</Button>}
        >
          لديك {newRequestsCount} طلب جديد يحتاج مراجعة
        </Alert>
      )}

      <Tabs value={tab} onChange={setTab} items={FILTER_TABS.map(({ id, label }) => ({ id, label }))} ariaLabel="تصفية الطلبات حسب الحالة" />

      {loading ? (
        <div className="rq-grid">{[0, 1, 2].map((i) => <Card key={i}><Skeleton lines={4} height={14} /></Card>)}</div>
      ) : requests.length === 0 ? (
        <Card><EmptyState icon="inbox" title="لا توجد طلبات" description={statusFilter ? 'لا توجد طلبات بهذه الحالة.' : 'ستظهر هنا الطلبات التي ترسلها الفروع.'} /></Card>
      ) : (
        <div className="rq-grid">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              whoLabel="الفرع"
              who={request.branch_name}
              employeeAction={request.employee_id ? (
                <Button size="sm" variant="soft" icon="user" onClick={() => navigate('/employees', { state: { focusEmployeeId: request.employee_id } })}>عرض الموظف</Button>
              ) : null}
              actions={(
                <Button size="sm" variant={request.status === 'pending' ? 'primary' : 'secondary'} icon="message" onClick={() => openReply(request)}>
                  {request.status === 'pending' ? 'الرد على الطلب' : 'تعديل الرد'}
                </Button>
              )}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={closeReply}
        title="الرد على الطلب"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeReply} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="rq-reply-form" loading={saving}>إرسال الرد</Button>
          </>
        )}
      >
        {selected && (
          <form id="rq-reply-form" onSubmit={submitReply} className="ui-form-stack" noValidate>
            <blockquote className="rq-quote">
              <strong>{selected.request_name}</strong>
              <p>{selected.request_text}</p>
              <span className="rq-muted">من: {selected.branch_name}{selected.employee_name ? ` · الموظف: ${selected.employee_name}` : ''}</span>
            </blockquote>
            <FormField label="الحالة" required>
              <Select value={reply.status} onChange={(e) => setReply({ ...reply, status: e.target.value })} options={REPLY_STATUSES} placeholder="اختر الحالة" />
            </FormField>
            <FormField label="نص الرد">
              <Textarea rows={5} value={reply.response_text} onChange={(e) => setReply({ ...reply, response_text: e.target.value })} placeholder="أدخل نص الرد (اختياري)" />
            </FormField>
            <FormField label="إرفاق ملف مع الرد (اختياري)" hint="PDF أو صورة">
              <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png,.gif" onChange={(e) => setReplyFile(e.target.files[0] || null)} />
            </FormField>
            {replyFile && (
              <div className="rq-file">
                <span>الملف المحدد: <bdi>{replyFile.name}</bdi></span>
                <Button size="sm" variant="ghost" icon="x" onClick={() => setReplyFile(null)}>إزالة</Button>
              </div>
            )}
          </form>
        )}
      </Modal>
    </Page>
  );
}

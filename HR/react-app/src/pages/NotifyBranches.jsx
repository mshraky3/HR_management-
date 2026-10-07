/**
 * Notify branches (head office): send a notification to chosen branches and follow who responded.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Page, PageHeader, Card, Button, IconButton, Badge, Alert, Modal, FormField, Select, Input, Textarea, Checkbox, Chip,
  ChipGroup, SearchInput, EmptyState, Skeleton, Icon, useConfirm,
} from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { notificationsAPI, branchesAPI } from '../utils/api';
import { formatDate } from '../utils/dateConverters';
import { getSeenCounts, setSeenCounts } from '../utils/notificationTracker';
import './NotifyBranches.css';

const SEEN_KEY = 'notify_branches_seen_responses';
const IMPORTANCE = {
  1: { label: 'تنبيه', tone: 'success' },
  2: { label: 'هام و غير عاجل', tone: 'warning' },
  3: { label: 'هام و عاجل', tone: 'danger' },
  4: { label: 'تعميم', tone: 'info' },
  5: { label: 'تنبيه لمرة واحدة', tone: 'neutral' },
};
const RESPONSE_STATUS = {
  done: { text: 'تم', tone: 'success' },
  working_on_it: { text: 'قيد العمل', tone: 'info' },
  seen: { text: 'شوهد', tone: 'neutral' },
};
const EMPTY_FORM = { message: '', importance_level: 2, branch_ids: [], duration_days: 7, one_time: false };

export default function NotifyBranches() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();

  const [notifications, setNotifications] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachment, setAttachment] = useState(null);
  const [branchQuery, setBranchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [newResponsesCount, setNewResponsesCount] = useState(0);
  const [newByNotification, setNewByNotification] = useState({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [notificationsRes, branchesRes] = await Promise.all([
        notificationsAPI.getAll({ include_inactive: showInactive }),
        branchesAPI.getAll({ is_active: true }),
      ]);
      if (notificationsRes.data.success) {
        const list = notificationsRes.data.data || [];
        setNotifications(list);
        const seen = getSeenCounts(SEEN_KEY);
        const { totalNew, byId } = list.reduce((acc, n) => {
          const delta = Math.max(0, parseInt(n?.stats?.responded_count || 0, 10) - parseInt(seen?.[n.id] || 0, 10));
          if (delta > 0) { acc.totalNew += delta; acc.byId[n.id] = delta; }
          return acc;
        }, { totalNew: 0, byId: {} });
        setNewResponsesCount(totalNew);
        setNewByNotification(byId);
      }
      if (branchesRes.data.success) setBranches(branchesRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      showError('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isMainManager()) return;
    loadData();
    localStorage.setItem('notifications_last_visit', new Date().toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager, showInactive]);

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setAttachment(null);
    setBranchQuery('');
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) { showWarning('الرسالة مطلوبة'); return; }
    if (form.branch_ids.length === 0) { showWarning('يجب اختيار فرع واحد على الأقل'); return; }
    try {
      setSaving(true);
      const data = new FormData();
      data.append('message', form.message.trim());
      data.append('importance_level', parseInt(form.importance_level, 10));
      data.append('duration_days', parseInt(form.duration_days, 10) || 7);
      data.append('one_time', form.one_time ? 'true' : 'false');
      data.append('branch_ids', JSON.stringify(form.branch_ids.map((id) => parseInt(id, 10)))); // JSON: parsed reliably server-side
      if (attachment) data.append('file', attachment);
      const response = await notificationsAPI.create(data);
      if (response.data.success) {
        showSuccess('تم إرسال الإشعار بنجاح');
        setCreateOpen(false);
        setForm(EMPTY_FORM);
        setAttachment(null);
        loadData();
      }
    } catch (error) {
      console.error('Error creating notification:', error);
      showError(error.response?.data?.message || 'فشل إنشاء الإشعار');
    } finally {
      setSaving(false);
    }
  };

  const toggleDetails = async (id) => {
    if (openId === id && details) { setOpenId(null); setDetails(null); return; }
    try {
      setLoadingDetails(true);
      setOpenId(id);
      const response = await notificationsAPI.getById(id);
      if (response.data.success) {
        setDetails(response.data.data);
        const responded = parseInt(response.data.data?.stats?.responded_count || 0, 10);
        if (responded > 0) {
          setSeenCounts(SEEN_KEY, { ...getSeenCounts(SEEN_KEY), [id]: responded });
          const remaining = Object.entries(newByNotification).filter(([k]) => parseInt(k, 10) !== id).reduce((sum, [, c]) => sum + c, 0);
          setNewByNotification((prev) => { const next = { ...prev }; delete next[id]; return next; });
          setNewResponsesCount(remaining);
        }
      }
    } catch (error) {
      console.error('Error loading notification details:', error);
      showError('فشل تحميل تفاصيل الإشعار');
    } finally {
      setLoadingDetails(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({ title: 'حذف الإشعار', message: 'هل أنت متأكد من حذف هذا الإشعار؟', tone: 'danger', confirmText: 'حذف' });
    if (!ok) return;
    try {
      const response = await notificationsAPI.delete(id);
      if (response.data.success) {
        showSuccess('تم حذف الإشعار بنجاح');
        loadData();
        if (openId === id) { setOpenId(null); setDetails(null); }
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      showError(error.response?.data?.message || 'فشل حذف الإشعار');
    }
  };

  const toggleActive = async (id) => {
    try {
      const response = await notificationsAPI.toggleActive(id);
      if (response.data.success) { showSuccess(response.data.message); loadData(); }
    } catch (error) {
      console.error('Error toggling notification status:', error);
      showError(error.response?.data?.message || 'فشل تحديث حالة الإشعار');
    }
  };

  const markAllSeen = () => {
    setSeenCounts(SEEN_KEY, notifications.reduce((acc, n) => { acc[n.id] = parseInt(n?.stats?.responded_count || 0, 10); return acc; }, {}));
    setNewByNotification({});
    setNewResponsesCount(0);
  };

  const toggleBranch = (id) => setForm((prev) => ({ ...prev, branch_ids: prev.branch_ids.includes(id) ? prev.branch_ids.filter((x) => x !== id) : [...prev.branch_ids, id] }));
  const visibleBranches = useMemo(() => branches.filter((b) => b.branch_name.includes(branchQuery.trim())), [branches, branchQuery]);

  if (!isMainManager()) {
    return <Page><PageHeader title="غير مصرح" /><Card><EmptyState icon="shield" title="هذه الصفحة متاحة فقط للمدير الرئيسي" /></Card></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="إشعارات الفروع"
        subtitle="أرسل إشعاراً لفروع محددة وتابع من ردّ عليه"
        actions={(
          <>
            <Checkbox label="عرض الإشعارات غير النشطة" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>إرسال إشعار جديد</Button>
          </>
        )}
      />

      {newResponsesCount > 0 && (
        <Alert tone="info" action={<Button size="sm" variant="secondary" onClick={markAllSeen}>تم الاطلاع</Button>}>
          لديك {newResponsesCount} رد جديد من الفروع
        </Alert>
      )}

      {loading ? (
        <Card><Skeleton lines={4} height={16} /></Card>
      ) : notifications.length === 0 ? (
        <Card><EmptyState icon="bell" title="لا توجد إشعارات مرسلة بعد" action={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>إرسال إشعار جديد</Button>} /></Card>
      ) : (
        <ul className="nb-list">
          {notifications.map((n) => {
            const stats = n.stats || {};
            const imp = IMPORTANCE[n.importance_level] || { label: n.importance_level, tone: 'neutral' };
            const open = openId === n.id;
            return (
              <li key={n.id} className={`nb-card${n.is_active ? '' : ' is-inactive'}`}>
                <header className="nb-head">
                  <div className="nb-meta">
                    <Badge tone={imp.tone}>{imp.label}</Badge>
                    {!n.is_active && <Badge tone="neutral">غير نشط</Badge>}
                    {newByNotification[n.id] > 0 && <Badge tone="info" dot><bdi>{newByNotification[n.id]}</bdi> رد جديد</Badge>}
                    <span className="nb-muted">{formatDate(n.created_at)}</span>
                    {n.created_by_name && <span className="nb-muted">بواسطة: {n.created_by_name}</span>}
                  </div>
                  <div className="nb-actions">
                    <Button size="sm" variant="soft" iconEnd={open ? 'chevron-up' : 'chevron-down'} aria-expanded={open} onClick={() => toggleDetails(n.id)}>{open ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(n.id)}>{n.is_active ? 'إلغاء التفعيل' : 'تفعيل'}</Button>
                    <IconButton icon="trash" label="حذف" className="nb-danger" onClick={() => remove(n.id)} />
                  </div>
                </header>

                <p className="nb-message">{n.message}</p>

                {n.attachment_url && (
                  <div className="nb-attachment">
                    <Icon name="link" size={16} />
                    <span>{n.attachment_name || 'مرفق'}</span>
                    <a href={n.attachment_url} target="_blank" rel="noopener noreferrer">{n.attachment_type?.startsWith('image/') || n.attachment_type === 'application/pdf' ? 'معاينة / تحميل' : 'تحميل'}</a>
                  </div>
                )}

                <div className="nb-stats">
                  <Badge tone="neutral">إجمالي الفروع <bdi>{stats.total_branches || 0}</bdi></Badge>
                  <Badge tone="success">تم الرد <bdi>{stats.responded_count || 0}</bdi></Badge>
                  <Badge tone="warning">لم يرد <bdi>{stats.no_response_count || 0}</bdi></Badge>
                  {n.one_time && stats.seen_branches_count > 0 && <Badge tone="info">تمت المشاهدة <bdi>{stats.seen_branches_count}</bdi></Badge>}
                  {stats.done_count > 0 && <Badge tone="success">تم <bdi>{stats.done_count}</bdi></Badge>}
                  {stats.working_on_it_count > 0 && <Badge tone="info">قيد العمل <bdi>{stats.working_on_it_count}</bdi></Badge>}
                  {stats.seen_count > 0 && <Badge tone="neutral">شوهد <bdi>{stats.seen_count}</bdi></Badge>}
                </div>

                {open && (
                  <div className="nb-details">
                    {loadingDetails ? <Skeleton lines={3} height={14} /> : details ? (
                      <>
                        {details.responses?.length > 0 && (
                          <section>
                            <h4>الفروع التي ردت ({details.responses.length})</h4>
                            <ul className="nb-responses">
                              {details.responses.map((r) => {
                                const s = RESPONSE_STATUS[r.response_status] || { text: r.response_status, tone: 'neutral' };
                                return (
                                  <li key={r.id}>
                                    <div className="nb-resp-head"><strong>{r.branch_name}</strong><Badge tone={s.tone} dot>{s.text}</Badge><span className="nb-muted">{formatDate(r.responded_at)}</span></div>
                                    {r.response_message && <p>{r.response_message}</p>}
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        )}
                        {details.branches && (
                          <section>
                            <h4>الفروع التي لم ترد ({stats.no_response_count || 0})</h4>
                            <ChipGroup aria-label="الفروع التي لم ترد">
                              {details.branches.filter((b) => !details.responses?.some((r) => r.branch_id === b.id)).map((b) => (
                                <Badge key={b.id} tone="neutral">{b.branch_name} · {b.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}</Badge>
                              ))}
                            </ChipGroup>
                          </section>
                        )}
                      </>
                    ) : <Alert tone="danger">فشل تحميل التفاصيل</Alert>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="إرسال إشعار جديد"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={saving}>إلغاء</Button>
            <Button variant="primary" type="submit" form="nb-form" icon="bell" loading={saving} disabled={form.branch_ids.length === 0}>إرسال الإشعار</Button>
          </>
        )}
      >
        <form id="nb-form" onSubmit={submitCreate} className="ui-form-stack" noValidate>
          <FormField label="الرسالة" required>
            <Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="اكتب الرسالة هنا…" />
          </FormField>
          <div className="nb-grid">
            <FormField label="مستوى الأهمية" required>
              <Select
                value={String(form.importance_level)}
                onChange={(e) => setForm({ ...form, importance_level: parseInt(e.target.value, 10) })}
                options={Object.entries(IMPORTANCE).map(([value, v]) => ({ value, label: v.label }))}
              />
            </FormField>
            <FormField label="مدة الإشعار (أيام)">
              <Input type="number" min="1" max="365" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: parseInt(e.target.value, 10) || 7 })} />
            </FormField>
          </div>
          <Checkbox
            label="إشعار لمرة واحدة فقط"
            checked={form.one_time}
            onChange={(e) => {
              const oneTime = e.target.checked;
              setForm((prev) => ({ ...prev, one_time: oneTime, importance_level: oneTime ? 5 : (prev.importance_level === 5 ? 2 : prev.importance_level) }));
            }}
          />
          <FormField label="إرفاق ملف أو صورة (اختياري)" hint="PDF أو صورة">
            <input type="file" className="ui-file" accept=".pdf,.jpg,.jpeg,.png,.gif" onChange={(e) => setAttachment(e.target.files[0] || null)} />
          </FormField>
          {attachment && <p className="nb-muted"><bdi>{attachment.name}</bdi> · <bdi>{(attachment.size / 1024 / 1024).toFixed(2)}</bdi> ميجابايت</p>}

          <div className="ui-form-stack">
            <div className="nb-branch-head">
              <span className="ui-field-label">الفروع <span className="ui-field-required" aria-hidden="true">*</span> <Badge tone="info"><bdi>{form.branch_ids.length}</bdi> محدد</Badge></span>
              <span className="nb-actions">
                <Button size="sm" variant="soft" onClick={() => setForm((p) => ({ ...p, branch_ids: branches.map((b) => b.id) }))}>تحديد الكل</Button>
                <Button size="sm" variant="ghost" onClick={() => setForm((p) => ({ ...p, branch_ids: [] }))}>إلغاء التحديد</Button>
              </span>
            </div>
            <SearchInput value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} onClear={() => setBranchQuery('')} placeholder="ابحث عن فرع…" />
            <ChipGroup aria-label="الفروع">
              {visibleBranches.map((b) => <Chip key={b.id} selected={form.branch_ids.includes(b.id)} onClick={() => toggleBranch(b.id)}>{b.branch_name}</Chip>)}
            </ChipGroup>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

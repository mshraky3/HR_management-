/**
 * Suggestions
 * - Branch managers: send a suggestion with an importance level and follow the replies.
 * - Head office: statistics, filters, and a status + note for every suggestion.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page, PageHeader, Card, StatCard, Toolbar, Select, FormField, Textarea, Button, Badge, EmptyState, Alert, Modal,
  Skeleton, ErrorState, useConfirm,
} from '../ui';
import { suggestionsAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getLastSeen, setLastSeen, countNewByDate } from '../utils/notificationTracker';
import './Suggestions.css';

const IMPORTANCE_TONE = { urgent_important: 'danger', very_impactful: 'warning', useful: 'success', not_impactful: 'neutral' };
const IMPORTANCE_HINT = {
  urgent_important: 'يحتاج تنفيذاً فورياً',
  very_impactful: 'تأثير كبير على تجربة المستخدم',
  useful: 'تحسين عام للنظام',
  not_impactful: 'اقتراح بسيط',
};
const IMPORTANCE_ORDER = ['urgent_important', 'very_impactful', 'useful', 'not_impactful'];
const STATUS_TONE = { pending: 'warning', reviewed: 'info', implemented: 'success', rejected: 'danger' };

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Suggestions() {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm } = useConfirm();
  const isMain = isMainManager();

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [options, setOptions] = useState({ importanceLevels: {}, statusOptions: {} });
  const [stats, setStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [newCount, setNewCount] = useState(0);

  const [formData, setFormData] = useState({ suggestion_text: '', importance_level: 'useful' });
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState({ branch_id: '', importance_level: '', status: '' });
  const [edit, setEdit] = useState(null); // { suggestion, status, admin_notes }
  const [saving, setSaving] = useState(false);

  const seenKey = isMain ? 'suggestions_last_seen_main' : `suggestions_last_seen_branch_${user?.branch_id || 'unknown'}`;

  const loadSuggestions = useCallback(async () => {
    const params = {};
    if (filters.branch_id) params.branch_id = filters.branch_id;
    if (filters.importance_level) params.importance_level = filters.importance_level;
    if (filters.status) params.status = filters.status;
    const res = await suggestionsAPI.getAll(params);
    if (res.data.success) setSuggestions(res.data.data || []);
  }, [filters]);

  const loadStats = useCallback(async () => {
    try {
      const res = await suggestionsAPI.getStats();
      if (res.data.success) setStats(res.data.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  // First load: options, then (head office) branches + stats, then the list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(false);
        const optionsRes = await suggestionsAPI.getOptions();
        if (!cancelled && optionsRes.data.success) setOptions(optionsRes.data.data);
        if (isMain) {
          const branchesRes = await branchesAPI.getAll();
          if (!cancelled) setBranches(branchesRes.data.data || []);
          await loadStats();
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The list reloads whenever a filter changes (and once after the first load).
  useEffect(() => {
    loadSuggestions().catch((error) => {
      console.error('Error loading suggestions:', error);
      showError('فشل في تحميل الاقتراحات');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSuggestions]);

  useEffect(() => {
    if (loading) return;
    const lastSeen = getLastSeen(seenKey);
    const count = isMain
      ? countNewByDate(suggestions, 'created_at', lastSeen)
      : suggestions.filter((s) => {
        if (!s?.status || s.status === 'pending') return false;
        const updatedAt = s.updated_at || s.created_at;
        if (!updatedAt) return false;
        const date = new Date(updatedAt);
        return !Number.isNaN(date.getTime()) && (!lastSeen || date > lastSeen);
      }).length;
    setNewCount(count);
  }, [suggestions, loading, isMain, seenKey]);

  const submit = async (e) => {
    e.preventDefault();
    if (!formData.suggestion_text.trim()) {
      showWarning('الرجاء إدخال نص الاقتراح');
      return;
    }
    try {
      setSubmitting(true);
      const res = await suggestionsAPI.create(formData);
      if (res.data.success) {
        showSuccess('تم إرسال الاقتراح بنجاح');
        setFormData({ suggestion_text: '', importance_level: 'useful' });
        await loadSuggestions();
      } else {
        showError(res.data.message || 'فشل في إرسال الاقتراح');
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل في إرسال الاقتراح');
    } finally {
      setSubmitting(false);
    }
  };

  const saveStatus = async () => {
    if (!edit) return;
    try {
      setSaving(true);
      const res = await suggestionsAPI.update(edit.suggestion.id, { status: edit.status, admin_notes: edit.admin_notes });
      if (res.data.success) {
        showSuccess('تم تحديث حالة الاقتراح بنجاح');
        setEdit(null);
        await Promise.all([loadSuggestions(), loadStats()]);
      } else {
        showError(res.data.message || 'فشل في تحديث الاقتراح');
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل في تحديث الاقتراح');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({ title: 'حذف الاقتراح', message: 'هل أنت متأكد من حذف هذا الاقتراح؟', tone: 'danger', confirmText: 'حذف' });
    if (!ok) return;
    try {
      const res = await suggestionsAPI.delete(id);
      if (res.data.success) {
        showSuccess('تم حذف الاقتراح بنجاح');
        await loadSuggestions();
        if (isMain) await loadStats();
      } else {
        showError(res.data.message || 'فشل في حذف الاقتراح');
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل في حذف الاقتراح');
    }
  };

  const importanceRows = useMemo(() => {
    if (!stats?.byImportance?.length) return [];
    const total = stats.byImportance.reduce((sum, item) => sum + parseInt(item.count, 10), 0);
    return stats.byImportance.map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((parseInt(item.count, 10) / total) * 100) : 0,
      label: options.importanceLevels[item.importance_level] || item.importance_level,
    }));
  }, [stats, options]);

  const importanceOptions = Object.entries(options.importanceLevels)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => IMPORTANCE_ORDER.indexOf(a.value) - IMPORTANCE_ORDER.indexOf(b.value));
  const statusOptions = Object.entries(options.statusOptions).map(([value, label]) => ({ value, label }));
  const hasFilters = Boolean(filters.branch_id || filters.importance_level || filters.status);

  if (loadError) {
    return (
      <Page>
        <PageHeader title="الاقتراحات" />
        <ErrorState onRetry={() => window.location.reload()} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="الاقتراحات"
        subtitle={isMain ? 'متابعة ومراجعة الاقتراحات المقدمة من الفروع' : 'شاركنا اقتراحاتك لتحسين النظام'}
      />

      {newCount > 0 && (
        <Alert
          tone="info"
          action={(
            <Button size="sm" variant="secondary" onClick={() => { setLastSeen(seenKey, new Date()); setNewCount(0); }}>
              تم الاطلاع
            </Button>
          )}
        >
          {isMain ? `لديك ${newCount} اقتراح جديد` : `لديك ${newCount} رد جديد على اقتراحاتك`}
        </Alert>
      )}

      {isMain && (
        <>
          <div className="ui-grid-stats">
            <StatCard label="إجمالي الاقتراحات" value={stats?.overall?.total || 0} icon="message" tone="primary" loading={loading && !stats} />
            <StatCard label="قيد الانتظار" value={stats?.overall?.pending_count || 0} icon="clock" tone="warning" loading={loading && !stats} />
            <StatCard label="تمت المراجعة" value={stats?.overall?.reviewed_count || 0} icon="eye" tone="primary" loading={loading && !stats} />
            <StatCard label="تم التنفيذ" value={stats?.overall?.implemented_count || 0} icon="check-circle" tone="success" loading={loading && !stats} />
          </div>

          <div className="sg-split">
            <Card title="توزيع الاقتراحات حسب الأهمية">
              {importanceRows.length === 0 ? (
                <p className="sg-muted">لا توجد بيانات بعد</p>
              ) : (
                <ul className="sg-bars">
                  {importanceRows.map((item) => (
                    <li key={item.importance_level} className="sg-bar">
                      <div className="sg-bar-head">
                        <span>{item.label}</span>
                        <span className="sg-bar-count"><bdi>{item.count}</bdi> · <bdi>{item.percentage}%</bdi></span>
                      </div>
                      <div className="sg-bar-track" role="presentation">
                        <span className={`sg-bar-fill sg-fill-${IMPORTANCE_TONE[item.importance_level] || 'neutral'}`} style={{ width: `${item.percentage}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="الاقتراحات حسب الفرع">
              {stats?.byBranch?.length ? (
                <ul className="sg-rank">
                  {stats.byBranch.map((item) => (
                    <li key={item.branch_id}>
                      <span>{item.branch_name}</span>
                      <Badge tone="info"><bdi>{item.count}</bdi> اقتراح</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sg-muted">لا توجد بيانات بعد</p>
              )}
            </Card>
          </div>
        </>
      )}

      {!isMain && (
        <Card title="إضافة اقتراح جديد" subtitle="اكتب اقتراحك بوضوح وحدّد مدى أهميته، وسنرد عليك من هنا">
          <form onSubmit={submit} className="ui-form-stack" noValidate>
            <FormField label="نص الاقتراح" required>
              <Textarea
                rows={5}
                value={formData.suggestion_text}
                onChange={(e) => setFormData({ ...formData, suggestion_text: e.target.value })}
                placeholder="اكتب اقتراحك هنا…"
              />
            </FormField>

            <fieldset className="sg-levels">
              <legend className="ui-field-label">مستوى الأهمية والتأثير</legend>
              <div className="sg-level-grid">
                {importanceOptions.map((o) => (
                  <label key={o.value} className={`sg-level${formData.importance_level === o.value ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="importance_level"
                      value={o.value}
                      checked={formData.importance_level === o.value}
                      onChange={() => setFormData({ ...formData, importance_level: o.value })}
                    />
                    <span className={`sg-level-dot sg-fill-${IMPORTANCE_TONE[o.value] || 'neutral'}`} aria-hidden="true" />
                    <span className="sg-level-text">
                      <strong>{o.label}</strong>
                      <span>{IMPORTANCE_HINT[o.value]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Button type="submit" variant="primary" icon="message" loading={submitting}>إرسال الاقتراح</Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title={isMain ? 'قائمة الاقتراحات' : 'اقتراحاتي السابقة'}
        actions={<Badge tone="neutral"><bdi>{suggestions.length}</bdi></Badge>}
        flush
      >
        {isMain && (
          <Toolbar>
            <Select
              aria-label="الفرع"
              value={filters.branch_id}
              onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
              options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
              placeholder="جميع الفروع"
              className="sg-filter"
            />
            <Select
              aria-label="مستوى الأهمية"
              value={filters.importance_level}
              onChange={(e) => setFilters({ ...filters, importance_level: e.target.value })}
              options={importanceOptions}
              placeholder="جميع المستويات"
              className="sg-filter"
            />
            <Select
              aria-label="الحالة"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              options={statusOptions}
              placeholder="جميع الحالات"
              className="sg-filter"
            />
            {hasFilters && (
              <Button variant="ghost" icon="x" onClick={() => setFilters({ branch_id: '', importance_level: '', status: '' })}>مسح الفلاتر</Button>
            )}
          </Toolbar>
        )}

        {loading ? (
          <div className="sg-loading"><Skeleton lines={3} height={16} /></div>
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon="message"
            title={hasFilters ? 'لا توجد اقتراحات مطابقة' : isMain ? 'لا توجد اقتراحات حالياً' : 'لم ترسل أي اقتراحات بعد'}
            description={hasFilters ? 'جرّب تغيير الفلاتر أو مسحها.' : isMain ? 'ستظهر هنا الاقتراحات التي ترسلها الفروع.' : 'أرسل أول اقتراح من النموذج أعلاه.'}
          />
        ) : (
          <ul className="sg-list">
            {suggestions.map((s) => (
              <li key={s.id} className="sg-item">
                <div className="sg-item-head">
                  <div className="sg-item-meta">
                    {isMain && s.branch_name && <strong className="sg-branch">{s.branch_name}</strong>}
                    <Badge tone={IMPORTANCE_TONE[s.importance_level] || 'neutral'}>
                      {options.importanceLevels[s.importance_level] || s.importance_level}
                    </Badge>
                    <Badge tone={STATUS_TONE[s.status] || 'neutral'} dot>
                      {options.statusOptions[s.status] || s.status}
                    </Badge>
                  </div>
                  <time className="sg-date" dateTime={s.created_at}>{formatDate(s.created_at)}</time>
                </div>

                <p className="sg-text">{s.suggestion_text}</p>

                {s.admin_notes && (
                  <div className="sg-reply">
                    <strong>ملاحظات الإدارة</strong>
                    <p>{s.admin_notes}</p>
                  </div>
                )}

                <div className="sg-item-actions">
                  {isMain && (
                    <Button size="sm" variant="soft" icon="edit" onClick={() => setEdit({ suggestion: s, status: s.status, admin_notes: s.admin_notes || '' })}>
                      تحديث الحالة
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="trash" className="sg-delete" onClick={() => remove(s.id)}>حذف</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title="تحديث حالة الاقتراح"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
            <Button variant="primary" loading={saving} onClick={saveStatus}>حفظ التغييرات</Button>
          </>
        )}
      >
        {edit && (
          <div className="ui-form-stack">
            <blockquote className="sg-quote">{edit.suggestion.suggestion_text}</blockquote>
            <FormField label="الحالة">
              <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={statusOptions} />
            </FormField>
            <FormField label="ملاحظات الإدارة" hint="تظهر هذه الملاحظة لمدير الفرع">
              <Textarea rows={3} value={edit.admin_notes} onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value })} placeholder="أضف ملاحظات للفرع…" />
            </FormField>
          </div>
        )}
      </Modal>
    </Page>
  );
}

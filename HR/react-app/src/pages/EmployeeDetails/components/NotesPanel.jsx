import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, FormField, Skeleton, Textarea } from '../../../ui';
import { employeesAPI } from '../../../utils/api';
import { useNotification } from '../../../contexts/NotificationContext';

const dt = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
};

/** NotesPanel: free-text notes on an employee (handover, warnings, follow-ups). */
export default function NotesPanel({ employeeId, readOnly = false }) {
  const { showError } = useNotification();
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError(false);
    employeesAPI.getNotes(employeeId).then((res) => setNotes(res.data.data)).catch(() => setError(true));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [employeeId]);

  const add = async (e) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setSaving(true);
    try {
      const res = await employeesAPI.addNote(employeeId, text.trim());
      setNotes((prev) => [res.data.data, ...(prev || [])]);
      setText('');
    } catch (err) {
      showError(err.response?.data?.message || 'فشل حفظ الملاحظة');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState compact title="تعذّر تحميل الملاحظات" onRetry={load} />;

  return (
    <Card title="الملاحظات" subtitle="ملاحظات داخلية على الموظف، تظهر لك وللإدارة">
      {!readOnly && (
        <form onSubmit={add} className="ui-form-stack" style={{ marginBlockEnd: '1.25rem' }}>
          <FormField label="ملاحظة جديدة">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="اكتب الملاحظة هنا…" />
          </FormField>
          <div><Button variant="primary" type="submit" icon="plus" loading={saving} disabled={text.trim().length < 2}>إضافة الملاحظة</Button></div>
        </form>
      )}
      {!notes ? <Skeleton lines={3} height={16} /> : notes.length === 0 ? (
        <EmptyState compact icon="note" title="لا توجد ملاحظات" />
      ) : (
        <ul className="ui-notes">
          {notes.map((n) => (
            <li key={n.id} className="ui-note">
              <p>{n.note}</p>
              <span>{n.actor_kind === 'branch' ? `الفرع (${n.actor_name || '—'})` : n.actor_name || '—'} · {dt(n.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

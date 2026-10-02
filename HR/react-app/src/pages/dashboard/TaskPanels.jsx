import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, DataTable, FormField, Select, Textarea } from '../../ui';
import { notificationsAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`;

/** Employees with a salary or IBAN problem, each with a button that opens the edit form. */
export function IssueEmployeesPanel({ type, items }) {
  const navigate = useNavigate();
  const isSalary = type === 'salary_review';
  const columns = [
    { key: 'name', header: 'الموظف', mobilePrimary: true, render: (r) => <strong>{r.name}</strong> },
    {
      key: 'value', header: isSalary ? 'إجمالي الراتب' : 'الآيبان',
      render: (r) => (isSalary ? fmtMoney(r.total_salary) : (r.iban ? <bdi>{r.iban}</bdi> : '—')),
    },
    {
      key: 'issue', header: 'المشكلة',
      render: (r) => {
        if (isSalary) return r.issue === 'low' ? <Badge tone="warning">منخفض (أقل من 500)</Badge> : <Badge tone="info">مرتفع (13000 فأكثر)</Badge>;
        return r.issue === 'missing' ? <Badge tone="danger">غير موجود</Badge> : <Badge tone="warning">صيغة غير صحيحة</Badge>;
      },
    },
    {
      key: 'action', header: '', align: 'end',
      render: (r) => <Button size="sm" variant="soft" icon="edit" onClick={() => navigate('/employees', { state: { editEmployeeId: r.id } })}>تعديل</Button>,
    },
  ];
  return <DataTable columns={columns} rows={items} dense caption={isSalary ? 'موظفون بحاجة لمراجعة الراتب' : 'موظفون بحاجة لتصحيح الآيبان'} />;
}

const RESPONSES = [
  { value: 'seen', label: 'تم الاطلاع' },
  { value: 'working_on_it', label: 'جارٍ العمل عليه' },
  { value: 'done', label: 'تم التنفيذ' },
];

/** Notifications from the head office with a quick reply (status + optional message). */
export function NotificationsPanel({ items, onChanged }) {
  const { showSuccess, showError } = useNotification();
  const [openId, setOpenId] = useState(null);
  const [status, setStatus] = useState('seen');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const send = async (id) => {
    setSaving(true);
    try {
      await notificationsAPI.respond(id, { response_status: status, response_message: message.trim() || null });
      showSuccess('تم حفظ ردك');
      setOpenId(null); setMessage(''); setStatus('seen');
      onChanged?.();
    } catch (err) {
      showError(err.response?.data?.message || 'فشل حفظ الرد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ul className="ui-notice-list">
      {items.map((n) => (
        <li key={n.id} className="ui-notice">
          <p className="ui-notice-text">{n.message}</p>
          {openId === n.id ? (
            <div className="ui-form-stack">
              <FormField label="ردك">
                <Select value={status} onChange={(e) => setStatus(e.target.value)} options={RESPONSES} />
              </FormField>
              <FormField label="رسالة للإدارة (اختياري)">
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} />
              </FormField>
              <div className="ui-inline-actions">
                <Button variant="primary" size="sm" loading={saving} onClick={() => send(n.id)}>حفظ الرد</Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>إلغاء</Button>
              </div>
            </div>
          ) : (
            <Button variant="soft" size="sm" onClick={() => { setOpenId(n.id); setStatus('seen'); }}>الرد على الإشعار</Button>
          )}
        </li>
      ))}
    </ul>
  );
}

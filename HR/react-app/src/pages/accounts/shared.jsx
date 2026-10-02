import { useEffect, useState } from 'react';
import { Badge, Button, Modal, Alert, Skeleton, EmptyState, Icon } from '../../ui';
import { useNotification } from '../../contexts/NotificationContext';

export function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Active / disabled / temporarily locked, with the lock end time. */
export function AccountStatusBadge({ account }) {
  const locked = account.locked_until && new Date(account.locked_until) > new Date();
  if (account.is_active === false) return <Badge tone="neutral" dot>معطّل</Badge>;
  if (locked) return <Badge tone="danger" dot>مقفل مؤقتاً</Badge>;
  if (account.must_change_password) return <Badge tone="warning" dot>كلمة مرور مؤقتة</Badge>;
  return <Badge tone="success" dot>نشط</Badge>;
}

export function LastLogin({ value }) {
  const text = formatDateTime(value);
  return text ? <span className="ui-nowrap">{text}</span> : <span className="ui-cell-sub">لم يسجّل دخولاً بعد</span>;
}

/** Copies text to the clipboard with a visible confirmation. */
export function CopyButton({ text, label = 'نسخ' }) {
  const { showSuccess, showError } = useNotification();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('تم النسخ');
    } catch {
      showError('تعذّر النسخ، انسخ النص يدوياً');
    }
  };
  return <Button size="sm" variant="secondary" icon="link" onClick={copy}>{label}</Button>;
}

/** Password cell for the head office: hidden by default, revealed on demand. */
export function SecretCell({ value }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="ui-cell-sub">—</span>;
  return (
    <span className="ui-secret">
      <bdi className="ui-secret-text">{shown ? value : '••••••••'}</bdi>
      <button type="button" className="ui-secret-toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} title={shown ? 'إخفاء' : 'إظهار'}>
        <Icon name={shown ? 'lock' : 'eye'} size={16} />
      </button>
    </span>
  );
}

const EVENT_LABELS = {
  login_ok: ['تسجيل دخول ناجح', 'success'],
  otp_sent: ['تم إرسال رمز التحقق', 'neutral'],
  otp_resent: ['إعادة إرسال الرمز', 'neutral'],
  otp_cooldown: ['طلب رمز خلال فترة الانتظار', 'neutral'],
  otp_wrong: ['رمز تحقق خاطئ', 'warning'],
  otp_expired: ['رمز تحقق منتهي', 'warning'],
  otp_locked: ['تجاوز محاولات الرمز', 'danger'],
  otp_none: ['رمز غير موجود', 'warning'],
  bad_password: ['كلمة مرور خاطئة', 'warning'],
  unknown_user: ['اسم مستخدم غير معروف', 'warning'],
  blocked_locked: ['محاولة أثناء القفل', 'danger'],
  password_changed: ['تغيير كلمة المرور', 'info'],
  change_password_bad_current: ['كلمة مرور حالية خاطئة عند التغيير', 'warning'],
};

/** ActivityModal: recent sign-ins and failures of one account. `load` returns a promise of events. */
export function ActivityModal({ open, onClose, title, load }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEvents(null);
    setError(false);
    load().then((res) => setEvents(res.data.data || [])).catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} description="آخر 50 حدثاً على الحساب" size="md">
      {error ? <Alert tone="danger">تعذّر تحميل السجل</Alert>
        : !events ? <Skeleton lines={5} height={16} />
          : events.length === 0 ? <EmptyState compact icon="history" title="لا توجد أحداث بعد" />
            : (
              <ul className="ui-events">
                {events.map((ev, i) => {
                  const [label, tone] = EVENT_LABELS[ev.event] || [ev.event, 'neutral'];
                  return (
                    <li key={i} className="ui-event">
                      <Badge tone={tone}>{label}</Badge>
                      <span className="ui-event-time">{formatDateTime(ev.created_at)}</span>
                      {ev.ip_address && <bdi className="ui-event-ip">{ev.ip_address}</bdi>}
                    </li>
                  );
                })}
              </ul>
            )}
    </Modal>
  );
}

/** Shows a one-time temporary password after a reset (the head office hands it over). */
export function TempPasswordModal({ data, onClose }) {
  return (
    <Modal
      open={Boolean(data)}
      onClose={onClose}
      size="sm"
      title="كلمة المرور المؤقتة"
      footer={<Button variant="primary" onClick={onClose}>تم</Button>}
    >
      {data && (
        <div className="ui-form-stack">
          <Alert tone="warning">
            هذه المرة الوحيدة التي تظهر فيها كلمة المرور المؤقتة. سلّمها للحساب <bdi>{data.username}</bdi>؛ سيُطلب منه تغييرها عند أول دخول.
          </Alert>
          <div className="ui-temp-password">
            <bdi>{data.temporary_password}</bdi>
            <CopyButton text={data.temporary_password} />
          </div>
        </div>
      )}
    </Modal>
  );
}

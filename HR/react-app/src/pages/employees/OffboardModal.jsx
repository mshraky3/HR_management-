import { useEffect, useState } from 'react';
import { Modal, Button, FormField, Input, Textarea, Select, Checkbox, Alert, ARCHIVED_STATUS_OPTIONS } from '../../ui';
import { employeesAPI } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { fullName, todayIso } from './employeeUtils';

/**
 * OffboardModal: end of service for one employee or a selection.
 * The reason (an archived status), last working day, notes and rehire eligibility are stored with the
 * employee and in the status history. The head office finds them in the archive.
 */
export default function OffboardModal({ open, employees, onClose, onDone }) {
  const { showSuccess, showError } = useNotification();
  const list = employees || [];
  const many = list.length > 1;

  const [status, setStatus] = useState('resigned');
  const [reason, setReason] = useState('');
  const [lastDay, setLastDay] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [rehire, setRehire] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState([]);

  useEffect(() => {
    if (open) {
      setStatus('resigned'); setReason(''); setLastDay(todayIso()); setNotes(''); setRehire(true);
      setError(''); setFailures([]);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (status === 'other' && reason.trim().length < 2) {
      setError('اكتب سبب إنهاء الخدمة عند اختيار "أخرى"');
      return;
    }
    setSaving(true);
    try {
      if (!many) {
        await employeesAPI.offboard(list[0].id, {
          status, reason: reason.trim() || undefined, last_working_day: lastDay || undefined,
          exit_notes: notes.trim() || undefined, rehire_eligible: rehire,
        });
        showSuccess('تم إنهاء خدمة الموظف ونقله إلى الأرشيف');
        onDone?.();
        onClose?.();
      } else {
        const res = await employeesAPI.bulkArchive({
          employee_ids: list.map((x) => x.id), status, reason: reason.trim() || undefined, last_working_day: lastDay || undefined,
        });
        const { ok, failed } = res.data.counts;
        if (ok) showSuccess(`تمت أرشفة ${ok} موظف`);
        if (failed) {
          const byId = new Map(list.map((x) => [x.id, x]));
          setFailures(res.data.data.filter((r) => !r.ok).map((r) => ({ name: fullName(byId.get(r.id)), message: r.message })));
          showError(`تعذرت أرشفة ${failed} موظف`);
          onDone?.();
        } else {
          onDone?.();
          onClose?.();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إنهاء الخدمة. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      size="md"
      title={many ? `إنهاء خدمة ${list.length} موظف` : 'إنهاء خدمة موظف'}
      description={many ? undefined : fullName(list[0])}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="danger" type="submit" form="offboard-form" loading={saving}>
            {many ? 'أرشفة المحدد' : 'إنهاء الخدمة'}
          </Button>
        </>
      )}
    >
      <form id="offboard-form" onSubmit={submit} className="ui-form-stack">
        <Alert tone="info">
          سينتقل {many ? 'الموظفون' : 'الموظف'} إلى الأرشيف ويبقى السجل محفوظاً. يمكن للمدير الرئيسي استعادة الموظف لاحقاً.
        </Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="ui-form-grid">
          <FormField label="سبب إنهاء الخدمة" required>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} options={ARCHIVED_STATUS_OPTIONS} />
          </FormField>
          <FormField label="آخر يوم عمل">
            <Input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} max={todayIso()} />
          </FormField>
        </div>
        <FormField label={status === 'other' ? 'تفاصيل السبب' : 'تفاصيل إضافية (اختياري)'} required={status === 'other'}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
        </FormField>
        {!many && (
          <>
            <FormField label="ملاحظات (اختياري)" hint="مثال: تم تسليم العهدة، تم تصفية المستحقات">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
            </FormField>
            <Checkbox checked={rehire} onChange={(e) => setRehire(e.target.checked)} label="يمكن إعادة توظيفه مستقبلاً" />
          </>
        )}
        {failures.length > 0 && (
          <Alert tone="warning" title="لم تتم أرشفة هؤلاء:">
            <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
              {failures.map((f, i) => <li key={i}>{f.name}: {f.message}</li>)}
            </ul>
          </Alert>
        )}
      </form>
    </Modal>
  );
}

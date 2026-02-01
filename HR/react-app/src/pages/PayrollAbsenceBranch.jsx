import { useEffect, useMemo, useState } from 'react';
import { payrollAbsenceAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './PayrollAbsence.css';

// Format date as dd/mm/yyyy (Gregorian calendar only)
const formatDateDDMMYYYY = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Format month as mm/yyyy (Gregorian calendar only)
const formatMonthMMYYYY = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
};

const PayrollAbsenceBranch = ({ onComplete }) => {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [entries, setEntries] = useState({});

  const activeCycle = state?.active_cycle || state?.cycle;
  const cycleLabel = useMemo(() => {
    if (!activeCycle?.month_start) return '';
    return formatMonthMMYYYY(activeCycle.month_start);
  }, [activeCycle]);

  const loadState = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await payrollAbsenceAPI.getBranchState();
      const data = res?.data?.data;
      setState(data);
      if (data?.employees?.length) {
        const defaults = {};
        data.employees.forEach((emp) => {
          // Use pre-filled data from backend (includes previous submission data for reopened entries)
          defaults[emp.id] = {
            excused_absences: emp.excused_absences ?? 0,
            unexcused_absences: emp.unexcused_absences ?? 0,
            notes: emp.notes || ''
          };
        });
        setEntries(defaults);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'تعذر تحميل حالة الغياب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAbsenceChange = (employeeId, value, type) => {
    setEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        ...(type === 'excused'
          ? { excused_absences: value < 0 ? 0 : value }
          : { unexcused_absences: value < 0 ? 0 : value })
      }
    }));
  };

  const handleNoteChange = (employeeId, value) => {
    setEntries((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        notes: value
      }
    }));
  };

  const handleSubmit = async () => {
    if (!state?.employees?.length) return;
    const confirmSave = window.confirm('سيتم الحفظ لمرة واحدة لهذا الشهر ولا يمكن التعديل بعد الحفظ. هل أنت متأكد؟');
    if (!confirmSave) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payloadEntries = state.employees.map((emp) => ({
        employee_id: emp.id,
        excused_absences: parseInt(entries[emp.id]?.excused_absences, 10) || 0,
        unexcused_absences: parseInt(entries[emp.id]?.unexcused_absences, 10) || 0,
        notes: entries[emp.id]?.notes || ''
      }));
      await payrollAbsenceAPI.submitBranch({
        entries: payloadEntries,
        cycle_id: activeCycle?.id
      });
      setSuccess('تم الحفظ. للتعديل لاحقاً، يرجى مراسلة إدارة الموارد البشرية لفتح الإدخال.');
      await loadState();

      // Call onComplete callback if provided (for task completion tracking)
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل الحفظ، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const renderStateBlock = () => {
    if (!state) return null;

    if (state.state === 'countdown' || state.state === 'countdown_next') {
      return (
        <div className="state-block compact-state-block countdown-compact">
          <p className="helper-text" style={{ margin: 0, fontSize: 'var(--font-size-xs)', lineHeight: '1.4' }}>
            <strong style={{ color: 'var(--text)' }}>انتظار فتح التسجيل:</strong> يبدأ في {formatDateDDMMYYYY(state.target_open_at)} (بعد {state.days_until_open} يوم) | يفتح تلقائياً في آخر يوم من الشهر
          </p>
        </div>
      );
    }

    if (state.state === 'entry_open') {
      return (
        <div className="state-block">
          <div className="state-title">الحالة الحالية: التسجيل مفتوح اليوم</div>
          <p className="helper-text">
            يرجى إدخال عدد الغيابات وملاحظات كل موظف. الحفظ متاح مرة واحدة فقط لهذا الشهر.
          </p>
        </div>
      );
    }

    if (state.state === 'view_only') {
      return (
        <div className="state-block compact-state-block">
          <div className="state-title" style={{ marginBottom: 'var(--spacing-xs)' }}>الحالة الحالية: عرض البيانات المحفوظة</div>
          <p className="helper-text" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
            ينتهي في {formatDateDDMMYYYY(state.view_until)} | بعدها سيظهر العد التنازلي للشهر التالي
          </p>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="payroll-absence-page">
        <div className="payroll-absence-card">
          <div className="helper-text" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
            جاري التحميل...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payroll-absence-page">
      <div className="payroll-absence-card">
        <h2>مسيرات الرواتب</h2>
        <div className="payroll-absence-meta">
          <span className="pill info">شهر: {cycleLabel || 'غير محدد'}</span>
          {state?.last_submission && (
            <span className="pill success">
              تم الحفظ. للمراجعة: {formatDateDDMMYYYY(state.last_submission.submitted_at)}
            </span>
          )}
        </div>

        {renderStateBlock()}

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        {state?.state === 'entry_open' && (
          <>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>رقم الهوية</th>
                    <th> ايام الغياب بعذر</th>
                    <th> ايام الغياب بدون عذر</th>
                    <th>الإجمالي</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {state.employees.map((emp) => (
                    <tr key={emp.id} className={emp.is_new ? 'new-employee-row' : ''}>
                      <td data-label="الموظف">
                        {emp.full_name}
                        {emp.is_new && <span className="new-badge">جديد</span>}
                      </td>
                      <td data-label="رقم الهوية">{emp.employee_id}</td>
                      <td data-label="غياب بعذر">
                        <input
                          type="number"
                          min="0"
                          className="table-input"
                          value={entries[emp.id]?.excused_absences ?? 0}
                          onChange={(e) => handleAbsenceChange(emp.id, Number(e.target.value), 'excused')}
                        />
                      </td>
                      <td data-label="غياب بدون عذر">
                        <input
                          type="number"
                          min="0"
                          className="table-input"
                          value={entries[emp.id]?.unexcused_absences ?? 0}
                          onChange={(e) => handleAbsenceChange(emp.id, Number(e.target.value), 'unexcused')}
                        />
                      </td>
                      <td data-label="الإجمالي">
                        {(entries[emp.id]?.excused_absences || 0) + (entries[emp.id]?.unexcused_absences || 0)}
                      </td>
                      <td data-label="ملاحظات">
                        <textarea
                          className="note-input"
                          placeholder="ملاحظات إضافية"
                          value={entries[emp.id]?.notes || ''}
                          onChange={(e) => handleNoteChange(emp.id, e.target.value)}
                          rows="2"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="payroll-actions">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', alignItems: 'flex-start' }}>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'حفظ الغيابات'}
                </button>
                <span className="helper-text" style={{ fontSize: 'var(--font-size-xs)' }}>
                  الحفظ متاح مرة واحدة فقط لكل شهر.
                </span>
              </div>
            </div>
          </>
        )}

        {state?.state === 'view_only' && (
          <div className="view-only-container">
            <div style={{ position: 'relative', zIndex: 2 }}>
              <table className="payroll-table compact-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>رقم الهوية</th>
                    <th>غياب بعذر</th>
                    <th>غياب بدون عذر</th>
                    <th>الإجمالي</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {state.entries?.map((row) => (
                    <tr key={row.employee_id}>
                      <td data-label="الموظف">{row.full_name}</td>
                      <td data-label="رقم الهوية">{row.employee_id_number}</td>
                      <td data-label="غياب بعذر">{row.excused_absences ?? 0}</td>
                      <td data-label="غياب بدون عذر">{row.unexcused_absences ?? 0}</td>
                      <td data-label="الإجمالي">{row.absences ?? ((row.excused_absences ?? 0) + (row.unexcused_absences ?? 0))}</td>
                      <td data-label="ملاحظات">{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollAbsenceBranch;

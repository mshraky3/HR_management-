import { Fragment, useEffect, useMemo, useState } from 'react';
import { payrollAbsenceAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import './PayrollAbsence.css';

// Format date as dd/mm/yyyy (Gregorian calendar only)
const formatDateDDMMYYYY = (value) => {
  if (!value) return '—';
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

const statusLabel = (status) => {
  switch (status) {
    case 'entry_open':
      return { text: 'مفتوح للتسجيل', className: 'tag entry' };
    case 'view_only':
      return { text: 'عرض فقط', className: 'tag view' };
    case 'closed':
      return { text: 'مغلق', className: 'tag closed' };
    default:
      return { text: 'عد تنازلي', className: 'tag warning' };
  }
};

const PayrollAbsenceAdmin = () => {
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedBranches, setSelectedBranches] = useState(new Set());
  const [reopenNote, setReopenNote] = useState('');
  const [reopenUntil, setReopenUntil] = useState('');
  const [expandedBranches, setExpandedBranches] = useState(new Set());
  const [branchEntries, setBranchEntries] = useState({});
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadCycles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await payrollAbsenceAPI.getCycles();
      const data = res?.data?.data || [];
      setCycles(data);
      if (data.length > 0) {
        // Get current month (YYYY-MM format)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed

        // Find the cycle that matches current month
        let defaultCycle = data.find(c => {
          const cycleDate = new Date(c.month_start);
          return cycleDate.getFullYear() === currentYear && cycleDate.getMonth() === currentMonth;
        });

        // If no current month cycle, find the most recent one (first in the list, assuming sorted by date desc)
        if (!defaultCycle) {
          defaultCycle = data[0];
        }

        setSelectedCycleId(defaultCycle?.id || data[0].id);
      } else {
        setSelectedCycleId(null);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل تحميل الأشهر');
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async (cycleId) => {
    if (!cycleId) return;
    setLoading(true);
    setError('');
    setSelectedBranches(new Set());
    try {
      const res = await payrollAbsenceAPI.getBranches(cycleId);
      setBranches(res?.data?.data?.branches || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل تحميل فروع الشهر');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (selectedCycleId) {
      loadBranches(selectedCycleId);
    }
  }, [selectedCycleId]);

  const summary = useMemo(() => {
    const submitted = branches.filter((b) => (b.submission_count || 0) > 0).length;
    const entryOpen = branches.filter((b) => b.status === 'entry_open' || b.manual_opened).length;
    const totalAbsences = branches.reduce((sum, b) => sum + (parseInt(b.total_absences, 10) || 0), 0);
    return { submitted, entryOpen, total: branches.length, totalAbsences };
  }, [branches]);

  const toggleBranch = (branchId) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedBranches.size === branches.length) {
      setSelectedBranches(new Set());
    } else {
      setSelectedBranches(new Set(branches.map((b) => b.branch_id)));
    }
  };

  const handleReopen = async () => {
    if (!selectedCycleId || selectedBranches.size === 0) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      await payrollAbsenceAPI.reopenBranches({
        cycle_id: selectedCycleId,
        branch_ids: Array.from(selectedBranches),
        note: reopenNote || null,
        manual_expires_at: reopenUntil || null
      });
      setSuccessMessage('تم فتح الفروع المختارة لإعادة الإدخال');
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setSuccess('تم فتح الفروع المختارة لإعادة الإدخال');
      }, 2000);
      await loadBranches(selectedCycleId);
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل إعادة الفتح');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = async () => {
    if (!selectedCycleId || selectedBranches.size === 0) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      await payrollAbsenceAPI.closeBranches({
        cycle_id: selectedCycleId,
        branch_ids: Array.from(selectedBranches)
      });
      setSuccessMessage('تم إغلاق الإدخال للفروع المختارة');
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setSuccess('تم إغلاق الإدخال للفروع المختارة');
      }, 2000);
      await loadBranches(selectedCycleId);
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل إغلاق الإدخال');
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCycleId || selectedBranches.size === 0) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      const res = await payrollAbsenceAPI.exportBranches({
        cycle_id: selectedCycleId,
        branch_ids: Array.from(selectedBranches)
      });
      downloadFile(new Blob([res.data]), 'branch-absences.xlsx');
      setSuccess('تم إنشاء ملف الإكسل');
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل إنشاء ملف الإكسل');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = async () => {
    if (!selectedCycleId) return;
    const confirmReset = window.confirm('سيتم إعادة تعيين الشهر الحالي لجميع الفروع إلى حالة العد التنازلي وحذف البيانات المحفوظة. هل أنت متأكد؟');
    if (!confirmReset) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      await payrollAbsenceAPI.resetCycle({ cycle_id: selectedCycleId });
      setSuccess('تمت إعادة تعيين الشهر وإرجاع جميع الفروع إلى العد التنازلي');
      await loadBranches(selectedCycleId);
    } catch (err) {
      setError(err?.response?.data?.message || 'فشل إعادة التعيين');
    } finally {
      setProcessing(false);
    }
  };

  const toggleExpand = async (branchId) => {
    const next = new Set(expandedBranches);
    if (next.has(branchId)) {
      next.delete(branchId);
      setExpandedBranches(next);
      return;
    }
    next.add(branchId);
    setExpandedBranches(next);
    if (!branchEntries[branchId]) {
      try {
        const res = await payrollAbsenceAPI.getBranchEntries(selectedCycleId, branchId);
        setBranchEntries((prev) => ({ ...prev, [branchId]: res?.data?.data || { entries: [], submission: null } }));
      } catch (err) {
        setBranchEntries((prev) => ({ ...prev, [branchId]: { entries: [], submission: null } }));
      }
    }
  };

  return (
    <div className="payroll-absence-page">
      <div className="payroll-absence-card">
        <h2>المسيرات </h2>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div className="selection-bar">
          <label>
            الشهر:
            <select
              className="inline-input"
              value={selectedCycleId || ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCycleId(val ? parseInt(val, 10) : null);
              }}
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatMonthMMYYYY(c.month_start)}
                </option>
              ))}
            </select>
          </label>
          <span className="pill info">الفروع: {summary.total}</span>
          <span className="pill success">تم الحفظ: {summary.submitted}</span>
          <span className="pill warning">مفتوح الآن: {summary.entryOpen}</span>
          <span className="pill">إجمالي الغيابات: {summary.totalAbsences}</span>
        </div>

        <div className="selection-bar">
          <label>
            ملاحظة إعادة الفتح:
            <input
              className="inline-input"
              type="text"
              value={reopenNote}
              onChange={(e) => setReopenNote(e.target.value)}
              placeholder="اختياري"
            />
          </label>
          <label>
            حد زمني لإعادة الفتح:
            <input
              className="inline-input"
              type="date"
              value={reopenUntil}
              onChange={(e) => setReopenUntil(e.target.value)}
            />
          </label>
        </div>

        <div className="payroll-actions">
          <button
            className="btn btn-secondary"
            onClick={toggleAll}
            disabled={loading}
          >
            {selectedBranches.size === branches.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleReopen}
            disabled={processing || selectedBranches.size === 0}
          >
            {processing ? 'جارٍ التنفيذ...' : 'فتح إدخال يدوي'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={processing || selectedBranches.size === 0}
          >
            {processing ? 'جارٍ الإغلاق...' : 'إغلاق الإدخال'}
          </button>
          <button
            className="btn"
            onClick={handleReset}
            disabled={processing || !selectedCycleId}
          >
            {processing ? 'جارٍ إعادة التعيين...' : 'إعادة تعيين الشهر'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={processing || selectedBranches.size === 0}
          >
            {processing ? 'جارٍ التصدير...' : 'تصدير إكسل'}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--spacing-xl)' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton skeleton-branch-row" style={{ animationDelay: `${i * 0.1}s` }}></div>
            ))}
          </div>
        ) : (
          <div style={{ position: 'relative', zIndex: 2 }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedBranches.size === branches.length && branches.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th></th>
                  <th>الفرع</th>
                  <th>الحالة</th>
                  <th>عدد مرات الحفظ</th>
                  <th>ايام الغياب بعذر</th>
                  <th>ايام الغياب بدون عذر</th>
                  <th>إجمالي الغيابات</th>
                  <th>آخر حفظ</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const st = statusLabel(b.status);
                  return (
                    <Fragment key={b.branch_id}>
                      <tr className="branch-row">
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBranches.has(b.branch_id)}
                            onChange={() => toggleBranch(b.branch_id)}
                          />
                        </td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(b.branch_id)}>
                            {expandedBranches.has(b.branch_id) ? 'إخفاء' : 'عرض التفاصيل'}
                          </button>
                        </td>
                        <td>{b.branch_name}</td>
                        <td>
                          <span className={st.className}>{st.text}</span>
                        </td>
                        <td>{b.submission_count || 0}</td>
                        <td>{b.total_excused || 0}</td>
                        <td>{b.total_unexcused || 0}</td>
                        <td>{b.total_absences || 0}</td>
                        <td>{formatDateDDMMYYYY(b.last_submitted_at)}</td>
                      </tr>
                      {expandedBranches.has(b.branch_id) && (
                        <tr>
                          <td colSpan={9}>
                            <div className="state-block branch-details-expanded">
                              <div className="state-title">تفاصيل الموظفين</div>
                              {branchEntries[b.branch_id]?.entries?.length ? (
                                <table className="payroll-table" style={{ marginTop: 'var(--spacing-md)' }}>
                                  <thead>
                                    <tr>
                                      <th>الموظف</th>
                                      <th>رقم الهوية</th>
                                      <th>ايام الغياب بعذر</th>
                                      <th>ايام الغياب بدون عذر</th>
                                      <th>إجمالي الغياب</th>
                                      <th>ملاحظات</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {branchEntries[b.branch_id].entries.map((row) => (
                                      <tr key={row.employee_id}>
                                        <td>{row.full_name}</td>
                                        <td>{row.employee_id_number}</td>
                                        <td>{row.excused_absences ?? 0}</td>
                                        <td>{row.unexcused_absences ?? 0}</td>
                                        <td>{row.absences ?? ((row.excused_absences ?? 0) + (row.unexcused_absences ?? 0))}</td>
                                        <td>{row.notes || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="helper-text">لا توجد بيانات محفوظة لهذا الفرع.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Success Animation */}
      {showSuccessAnimation && (
        <div className="success-overlay">
          <div className="success-card">
            <div className="success-icon"></div>
            <div className="success-message">{successMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollAbsenceAdmin;

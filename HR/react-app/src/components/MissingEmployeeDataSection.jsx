import { useEffect, useState } from 'react';
import { employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './MissingEmployeeDataSection.css';

const MissingEmployeeDataSection = ({ onComplete }) => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState(null); // Track which employee is being saved
  const [errors, setErrors] = useState({});
  const [showFormatPopup, setShowFormatPopup] = useState(null); // Track which employee/field should show format popup

  const isValidDDMMYYYY = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = trimmed.match(regex);
    if (!match) return false;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  };

  const toIso = (value) => {
    if (!isValidDDMMYYYY(value)) return null;
    const [day, month, year] = value.trim().split('/').map((v) => v.padStart(2, '0'));
    return `${year}-${month}-${day}`;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      const res = await employeesAPI.getMissingRequiredData(params);
      if (res.data?.success) {
        const data = res.data.data || [];
        setRows(data);
        const initialDrafts = {};
        data.forEach((row) => {
          initialDrafts[row.id] = {
            contract_start_date: row.contract_start_date_gregorian
              ? row.contract_start_date_gregorian.split('T')[0]?.split('-').reverse().join('/')
              : '',
            contract_end_date: row.contract_end_date_gregorian
              ? row.contract_end_date_gregorian.split('T')[0]?.split('-').reverse().join('/')
              : '',
          };
        });
        setDrafts(initialDrafts);
      }
    } catch (error) {
      console.error('Error loading missing required data:', error);
      showError(error.response?.data?.message || 'فشل جلب البيانات الناقصة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDateChange = (employeeId, value, fieldPrefix) => {
    // Clear format popup when user starts typing
    if (showFormatPopup === employeeId) {
      setShowFormatPopup(null);
    }
    // Clear error for this employee when they start typing
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated[employeeId];
      return updated;
    });
    
    setDrafts((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [`${fieldPrefix}`]: value,
      },
    }));
  };

  // Save a single employee
  const handleSaveEmployee = async (employeeId) => {
    try {
      setSavingEmployeeId(employeeId);
      const row = rows.find(r => r.id === employeeId);
      if (!row) return;

      const draft = drafts[employeeId] || {};
      const file = draft.qualification_file;

      const startValid = isValidDDMMYYYY(draft.contract_start_date);
      const endValid = isValidDDMMYYYY(draft.contract_end_date);
      
      const newErrors = {};
      if (row.missing_start && !startValid) {
        newErrors[employeeId] = 'صيغة التاريخ يجب أن تكون dd/mm/yyyy (مثال 20/8/2026)';
      }
      if (row.missing_end && !endValid) {
        newErrors[employeeId] = 'صيغة التاريخ يجب أن تكون dd/mm/yyyy (مثال 20/8/2026)';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...newErrors }));
        // Show format popup animation for the failed employee
        setShowFormatPopup(employeeId);
        // Hide popup after 4 seconds
        setTimeout(() => setShowFormatPopup(null), 4000);
        setSavingEmployeeId(null);
        return;
      }

      setErrors(prev => {
        const updated = { ...prev };
        delete updated[employeeId];
        return updated;
      });

      const entry = {
        employee_id: row.id,
        contract_start_date_hijri: null,
        contract_start_date_gregorian: toIso(draft.contract_start_date),
        contract_end_date_hijri: null,
        contract_end_date_gregorian: toIso(draft.contract_end_date),
        qualification_file: file || null,
      };

      const formData = new FormData();
      formData.append('entries', JSON.stringify([
        {
          employee_id: entry.employee_id,
          contract_start_date_hijri: entry.contract_start_date_hijri,
          contract_start_date_gregorian: entry.contract_start_date_gregorian,
          contract_end_date_hijri: entry.contract_end_date_hijri,
          contract_end_date_gregorian: entry.contract_end_date_gregorian,
          qualification_file: entry.qualification_file ? 'attached' : null,
        }
      ]));

      if (entry.qualification_file) {
        formData.append('file_0', entry.qualification_file);
        formData.append('file_employee_0', entry.employee_id);
      }

      await employeesAPI.saveMissingRequiredData(formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showSuccess('تم حفظ بيانات الموظف');
      await loadData();
      
      // Check if all employees are now complete
      const remainingRes = await employeesAPI.getMissingRequiredData({});
      if (remainingRes.data?.success && (remainingRes.data.data || []).length === 0) {
        // Call onComplete callback if all employees are done
        if (onComplete) {
          onComplete();
        }
      }
    } catch (error) {
      console.error('Error saving employee data:', error);
      showError(error.response?.data?.message || 'فشل حفظ البيانات');
    } finally {
      setSavingEmployeeId(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const newErrors = {};
      const entries = rows.map((row) => {
        const draft = drafts[row.id] || {};
        const file = draft.qualification_file;

        const startValid = isValidDDMMYYYY(draft.contract_start_date);
        const endValid = isValidDDMMYYYY(draft.contract_end_date);
        if (row.missing_start && !startValid) {
          newErrors[row.id] = 'صيغة التاريخ يجب أن تكون dd/mm/yyyy (مثال 20/8/2026)';
        }
        if (row.missing_end && !endValid) {
          newErrors[row.id] = 'صيغة التاريخ يجب أن تكون dd/mm/yyyy (مثال 20/8/2026)';
        }

        return {
          employee_id: row.id,
          contract_start_date_hijri: null,
          contract_start_date_gregorian: toIso(draft.contract_start_date),
          contract_end_date_hijri: null,
          contract_end_date_gregorian: toIso(draft.contract_end_date),
          qualification_file: file || null,
        };
      });

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        // Show format popup animation for the first failed employee
        const firstFailedEmployeeId = Object.keys(newErrors)[0];
        if (firstFailedEmployeeId) {
          setShowFormatPopup(parseInt(firstFailedEmployeeId));
          // Hide popup after 4 seconds
          setTimeout(() => setShowFormatPopup(null), 4000);
        }
        setSaving(false);
        return;
      }
      setErrors({});

      const formData = new FormData();
      formData.append('entries', JSON.stringify(
        entries.map((e) => ({
          employee_id: e.employee_id,
          contract_start_date_hijri: e.contract_start_date_hijri,
          contract_start_date_gregorian: e.contract_start_date_gregorian,
          contract_end_date_hijri: e.contract_end_date_hijri,
          contract_end_date_gregorian: e.contract_end_date_gregorian,
          qualification_file: e.qualification_file ? 'attached' : null,
        }))
      ));

      entries.forEach((e, idx) => {
        if (e.qualification_file) {
          formData.append(`file_${idx}`, e.qualification_file);
          formData.append(`file_employee_${idx}`, e.employee_id);
        }
      });

      await employeesAPI.saveMissingRequiredData(formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showSuccess('تم حفظ البيانات');
      await loadData();
      
      // Call onComplete callback if provided (for task completion tracking)
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error saving missing required data:', error);
      showError(error.response?.data?.message || 'فشل حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="missing-data-card">
        <h2>استكمال بيانات الموظفين</h2>
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <div className="missing-data-card">
      <h2>استكمال بيانات الموظفين</h2>
      <p className="helper-text">
        أدخل تواريخ بداية ونهاية العقد، وارفع مستند المؤهل الأساسي لمن مؤهله أعلى من الثانوي.
        سيختفي هذا الجدول بعد اكتمال البيانات للجميع.
      </p>
      <div className="missing-data-table-wrapper">
        <table className="missing-data-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>بداية العقد</th>
              <th>نهاية العقد</th>
              <th>مؤهل أساسي</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.first_name} {row.second_name} {row.third_name} {row.fourth_name}
                </td>
                <td>
                  <div className="date-input-wrapper">
                    <input
                      type="text"
                      className={`text-input ${errors[row.id] ? 'input-error' : ''}`}
                      placeholder="سنة/ شهر /يوم"
                      value={drafts[row.id]?.contract_start_date || ''}
                      onChange={(e) => handleDateChange(row.id, e.target.value, 'contract_start_date')}
                    />
                    {showFormatPopup === row.id && (row.missing_start && !isValidDDMMYYYY(drafts[row.id]?.contract_start_date)) && (
                      <div className="date-format-popup">
                        <div className="format-popup-icon">📅</div>
                        <div className="format-popup-content">
                          <div className="format-popup-title">صيغة التاريخ الصحيحة:</div>
                          <div className="format-popup-example">
                            <span className="format-number">2026</span>
                            <span className="format-slash">/</span>
                            <span className="format-number">7</span>
                            <span className="format-slash">/</span>
                            <span className="format-number">18</span>
                          </div>
                          <div className="format-popup-description">يمكن استخدام رقم واحد أو رقمين (1/8/2026 أو 01/08/2026)</div>
                        </div>
                        <div className="format-popup-arrow"></div>
                      </div>
                    )}
                  </div>
                  <div className="subtext">أدخل التاريخ بصيغة مثل 19/5/2025 (ميلادي فقط)</div>
                  </td>
                <td>
                  <div className="date-input-wrapper">
                    <input
                      type="text"
                      className={`text-input ${errors[row.id] ? 'input-error' : ''}`}
                      placeholder="سنة/ شهر /يوم"
                      value={drafts[row.id]?.contract_end_date || ''}
                      onChange={(e) => handleDateChange(row.id, e.target.value, 'contract_end_date')}
                    />
                    {showFormatPopup === row.id && (row.missing_end && !isValidDDMMYYYY(drafts[row.id]?.contract_end_date)) && (
                      <div className="date-format-popup">
                        <div className="format-popup-icon">📅</div>
                        <div className="format-popup-content">
                          <div className="format-popup-title">صيغة التاريخ الصحيحة مثل :</div>
                          <div className="format-popup-example">
                            <span className="format-number">2025</span>
                            <span className="format-slash">/</span>
                            <span className="format-number">10</span>
                            <span className="format-slash">/</span>
                            <span className="format-number">26</span>
                          </div>
                          <div className="format-popup-description">يمكن استخدام رقم واحد أو رقمين (1/8/2026 أو 01/08/2026)</div>
                        </div>
                        <div className="format-popup-arrow"></div>
                      </div>
                    )}
                  </div>
                  <div className="subtext">أدخل التاريخ بصيغة مثل 19/5/2025 (ميلادي فقط)</div>
                </td>
                <td>
                  {row.missing_qualification_doc ? (
                    <div className="qual-upload">
                      <label className="file-upload-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>{drafts[row.id]?.qualification_file ? drafts[row.id].qualification_file.name : 'رفع مستند المؤهل'}</span>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="file-upload-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...prev[row.id],
                                qualification_file: file || null,
                              },
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <span className="badge badge-success">مكتمل</span>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-primary btn-sm employee-save-btn"
                    onClick={() => handleSaveEmployee(row.id)}
                    disabled={savingEmployeeId === row.id}
                  >
                    {savingEmployeeId === row.id ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="missing-data-actions">
        <button className="btn btn-secondary" onClick={loadData} disabled={saving}>
          تحديث
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ الكل'}
        </button>
      </div>
    </div>
  );
};

export default MissingEmployeeDataSection;

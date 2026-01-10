import { useEffect, useState } from 'react';
import { employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './MissingEmployeeDataSection.css';

const MissingEmployeeDataSection = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

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
    setDrafts((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [`${fieldPrefix}`]: value,
      },
    }));
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.first_name} {row.second_name} {row.third_name} {row.fourth_name}
                </td>
                <td>
                  <input
                    type="text"
                    className={`text-input ${errors[row.id] ? 'input-error' : ''}`}
                    placeholder="dd/mm/yyyy"
                    value={drafts[row.id]?.contract_start_date || ''}
                    onChange={(e) => handleDateChange(row.id, e.target.value, 'contract_start_date')}
                  />
                  <div className="subtext">أدخل التاريخ بصيغة مثل 19/5/2025 (ميلادي فقط)</div>
                  </td>
                <td>
                  <input
                    type="text"
                    className={`text-input ${errors[row.id] ? 'input-error' : ''}`}
                    placeholder="dd/mm/yyyy"
                    value={drafts[row.id]?.contract_end_date || ''}
                    onChange={(e) => handleDateChange(row.id, e.target.value, 'contract_end_date')}
                  />
                  <div className="subtext">أدخل التاريخ بصيغة مثل 19/5/2025 (ميلادي فقط)</div>
                </td>
                <td>
                  {row.missing_qualification_doc ? (
                    <div className="qual-upload">
                      <label className="badge badge-warning">يلزم رفع المؤهل الأساسي</label>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
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
                    </div>
                  ) : (
                    <span className="badge badge-success">مكتمل</span>
                  )}
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

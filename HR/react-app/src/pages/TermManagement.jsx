/**
 * Term Management Page
 * Manage academic year divisions and semesters for schools and daycare centers
 * Main Manager only
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { termsAPI, academicYearsAPI } from '../utils/api';
import { formatDate } from '../utils/dateConverters';
import './TermManagement.css';

const TermManagement = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();

  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    branch_type: 'school',
    year_label: '',
    term1_name: '',
    term1_start_date: '',
    term1_end_date: '',
    term2_name: '',
    term2_start_date: '',
    term2_end_date: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [editingYear, setEditingYear] = useState(null);

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadAcademicYears();
  }, [isMainManager]);

  const loadAcademicYears = async () => {
    try {
      setLoading(true);
      const response = await academicYearsAPI.getAll();

      if (response.data.success) {
        // Group by branch type
        const grouped = {
          school: [],
          healthcare_center: []
        };

        (response.data.data || []).forEach(year => {
          if (grouped[year.branch_type]) {
            grouped[year.branch_type].push(year);
          }
        });

        // Sort by year_start descending
        grouped.school.sort((a, b) => new Date(b.year_start) - new Date(a.year_start));
        grouped.healthcare_center.sort((a, b) => new Date(b.year_start) - new Date(a.year_start));

        setAcademicYears(grouped);
      }
    } catch (error) {
      console.error('Error loading academic years:', error);
      showError('فشل تحميل السنوات الدراسية');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };

      // Auto-fill term names when year_label changes
      if (name === 'year_label' && value.trim()) {
        const yearLabel = value.trim();
        const autoTerm1 = `الفصل الأول - ${yearLabel}`;
        const autoTerm2 = `الفصل الثاني - ${yearLabel}`;

        // Only auto-fill if empty or matches previous auto-pattern
        const prevAutoTerm1 = prev.year_label ? `الفصل الأول - ${prev.year_label.trim()}` : '';
        const prevAutoTerm2 = prev.year_label ? `الفصل الثاني - ${prev.year_label.trim()}` : '';

        if (!prev.term1_name || prev.term1_name === prevAutoTerm1) {
          updated.term1_name = autoTerm1;
        }
        if (!prev.term2_name || prev.term2_name === prevAutoTerm2) {
          updated.term2_name = autoTerm2;
        }
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.year_label.trim()) {
      showWarning('يرجى إدخال تسمية السنة الدراسية');
      return;
    }

    if (!formData.term1_name.trim() || !formData.term1_start_date || !formData.term1_end_date) {
      showWarning('يرجى إدخال بيانات الفصل الأول');
      return;
    }

    if (!formData.term2_name.trim() || !formData.term2_start_date || !formData.term2_end_date) {
      showWarning('يرجى إدخال بيانات الفصل الثاني');
      return;
    }

    // Validate dates
    if (new Date(formData.term1_start_date) > new Date(formData.term1_end_date)) {
      showWarning('تاريخ بداية الفصل الأول يجب أن يكون قبل تاريخ النهاية');
      return;
    }

    if (new Date(formData.term2_start_date) > new Date(formData.term2_end_date)) {
      showWarning('تاريخ بداية الفصل الثاني يجب أن يكون قبل تاريخ النهاية');
      return;
    }

    if (new Date(formData.term1_end_date) >= new Date(formData.term2_start_date)) {
      showWarning('يجب أن يبدأ الفصل الثاني بعد انتهاء الفصل الأول');
      return;
    }

    try {
      setSubmitting(true);
      const response = await termsAPI.createAcademicYear({
        branch_type: formData.branch_type,
        year_label: formData.year_label.trim(),
        term1_name: formData.term1_name.trim(),
        term1_start_date: formData.term1_start_date,
        term1_end_date: formData.term1_end_date,
        term2_name: formData.term2_name.trim(),
        term2_start_date: formData.term2_start_date,
        term2_end_date: formData.term2_end_date
      });

      if (response.data.success) {
        showSuccess('تم إنشاء السنة الدراسية والفصلين بنجاح');
        setShowCreateForm(false);
        resetForm();
        loadAcademicYears();
      }
    } catch (error) {
      console.error('Error creating academic year:', error);
      showError(error.response?.data?.message || 'فشل إنشاء السنة الدراسية');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      branch_type: 'school',
      year_label: '',
      term1_name: '',
      term1_start_date: '',
      term1_end_date: '',
      term2_name: '',
      term2_start_date: '',
      term2_end_date: ''
    });
    setEditingYear(null);
  };

  const handleCompleteYear = async (yearId) => {
    if (!window.confirm('هل أنت متأكد من إتمام هذه السنة الدراسية؟ سيتم تغيير حالة جميع الموظفين إلى "قيد الانتظار"')) {
      return;
    }

    try {
      const response = await academicYearsAPI.completeYear(yearId);
      if (response.data.success) {
        showSuccess('تم إتمام السنة الدراسية بنجاح');
        loadAcademicYears();
      }
    } catch (error) {
      console.error('Error completing year:', error);
      showError(error.response?.data?.message || 'فشل إتمام السنة الدراسية');
    }
  };

  if (!isMainManager()) {
    return (
      <div className="term-management-page">
        <h1>غير مصرح</h1>
        <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
      </div>
    );
  }

  return (
    <div className="term-management-page">
      <div className="page-header">
        <h1>إدارة تقسيم السنة الدراسية</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'إلغاء' : 'إضافة سنة دراسية جديدة'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="create-form-card">
          <h2>إضافة سنة دراسية جديدة</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>نوع الفرع *</label>
                <select
                  name="branch_type"
                  value={formData.branch_type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="school">مدرسة</option>
                  <option value="healthcare_center">مركز رعاية نهارية</option>
                </select>
              </div>

              <div className="form-group">
                <label>تسمية السنة الدراسية *</label>
                <input
                  type="text"
                  name="year_label"
                  value={formData.year_label}
                  onChange={handleInputChange}
                  placeholder="مثال: 2025/2026"
                  required
                />
                <span className="form-helper">الصيغة: سنة البداية/سنة النهاية</span>
              </div>
            </div>

            <p className="auto-fill-hint">
              سيتم تعبئة اسم الفصل تلقائياً بناءً على تسمية السنة — يمكنك تعديله يدوياً
            </p>

            <div className="terms-section">
              <h3>الفصل الدراسي الأول</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>اسم الفصل الأول *</label>
                  <input
                    type="text"
                    name="term1_name"
                    value={formData.term1_name}
                    onChange={handleInputChange}
                    placeholder="مثال: الفصل الأول - 2025/2026"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>تاريخ البداية *</label>
                  <input
                    type="date"
                    name="term1_start_date"
                    value={formData.term1_start_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>تاريخ النهاية *</label>
                  <input
                    type="date"
                    name="term1_end_date"
                    value={formData.term1_end_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="terms-section">
              <h3>الفصل الدراسي الثاني</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>اسم الفصل الثاني *</label>
                  <input
                    type="text"
                    name="term2_name"
                    value={formData.term2_name}
                    onChange={handleInputChange}
                    placeholder="مثال: الفصل الثاني - 2025/2026"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>تاريخ البداية *</label>
                  <input
                    type="date"
                    name="term2_start_date"
                    value={formData.term2_start_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>تاريخ النهاية *</label>
                  <input
                    type="date"
                    name="term2_end_date"
                    value={formData.term2_end_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="info-section">
              <h3>السنة الدراسية (يتم حسابها تلقائياً)</h3>
              <p className="info-text">
                <strong>بداية السنة الدراسية:</strong> تاريخ بداية الفصل الأول<br />
                <strong>نهاية السنة الدراسية:</strong> تاريخ نهاية الفصل الثاني<br />
                <br />
                يتم استخدام السنة الدراسية الكاملة لتحديد موعد تغيير حالة الموظفين عند إتمام السنة.
              </p>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Academic Years List */}
      {loading ? (
        <div className="loading">جاري التحميل...</div>
      ) : (
        <div className="academic-years-list">
          {/* Schools */}
          <div className="branch-type-section">
            <h2>المدارس</h2>
            {academicYears.school && academicYears.school.length > 0 ? (
              <div className="years-grid">
                {academicYears.school.map(year => (
                  <AcademicYearCard
                    key={year.id}
                    year={year}
                    onComplete={handleCompleteYear}
                    onUpdate={loadAcademicYears}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-state">لا توجد سنوات دراسية للمدارس</p>
            )}
          </div>

          {/* Healthcare Centers */}
          <div className="branch-type-section">
            <h2>مراكز الرعاية النهارية</h2>
            {academicYears.healthcare_center && academicYears.healthcare_center.length > 0 ? (
              <div className="years-grid">
                {academicYears.healthcare_center.map(year => (
                  <AcademicYearCard
                    key={year.id}
                    year={year}
                    onComplete={handleCompleteYear}
                    onUpdate={loadAcademicYears}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-state">لا توجد سنوات دراسية لمراكز الرعاية النهارية</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper: determine term date status
const getTermStatus = (term) => {
  if (!term) return null;
  const now = new Date();
  const start = new Date(term.start_date);
  const end = new Date(term.end_date);
  if (now >= start && now <= end) return 'active';
  if (now < start) return 'upcoming';
  return 'past';
};

const termStatusLabels = {
  active: 'جاري الآن',
  upcoming: 'قادم',
  past: 'منتهي'
};

// Academic Year Card Component
const AcademicYearCard = ({ year, onComplete, onUpdate }) => {
  const { showError, showSuccess } = useNotification();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Derive "current" status from dates, not just the is_current flag
  const now = new Date();
  const yearStart = new Date(year.year_start);
  const yearEnd = new Date(year.year_end);
  const isCurrentByDate = now >= yearStart && now <= yearEnd;
  const isCurrent = year.is_current || isCurrentByDate;
  const isInactive = !isCurrent && !year.is_completed;

  const startEditing = () => {
    setEditData({
      term1_name: year.term1?.term_name || '',
      term1_start_date: year.term1?.start_date ? year.term1.start_date.slice(0, 10) : '',
      term1_end_date: year.term1?.end_date ? year.term1.end_date.slice(0, 10) : '',
      term2_name: year.term2?.term_name || '',
      term2_start_date: year.term2?.start_date ? year.term2.start_date.slice(0, 10) : '',
      term2_end_date: year.term2?.end_date ? year.term2.end_date.slice(0, 10) : '',
    });
    setValidationError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditData({});
    setValidationError('');
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
    setValidationError('');
  };

  const handleSave = async () => {
    // Client-side validation
    if (editData.term1_start_date && editData.term1_end_date &&
      new Date(editData.term1_start_date) > new Date(editData.term1_end_date)) {
      setValidationError('تاريخ بداية الفصل الأول يجب أن يكون قبل تاريخ النهاية');
      return;
    }
    if (editData.term2_start_date && editData.term2_end_date &&
      new Date(editData.term2_start_date) > new Date(editData.term2_end_date)) {
      setValidationError('تاريخ بداية الفصل الثاني يجب أن يكون قبل تاريخ النهاية');
      return;
    }
    if (editData.term1_end_date && editData.term2_start_date &&
      new Date(editData.term1_end_date) >= new Date(editData.term2_start_date)) {
      setValidationError('يجب أن يبدأ الفصل الثاني بعد انتهاء الفصل الأول');
      return;
    }

    try {
      setSaving(true);

      if (year.term1) {
        await termsAPI.update(year.term1.id, {
          term_name: editData.term1_name.trim(),
          start_date: editData.term1_start_date,
          end_date: editData.term1_end_date,
        });
      }

      if (year.term2) {
        await termsAPI.update(year.term2.id, {
          term_name: editData.term2_name.trim(),
          start_date: editData.term2_start_date,
          end_date: editData.term2_end_date,
        });
      }

      setEditing(false);
      showSuccess('تم حفظ التعديلات بنجاح');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error saving term edits:', error);
      showError(error.response?.data?.message || 'فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  const cardClass = [
    'academic-year-card',
    isCurrent ? 'current' : '',
    year.is_completed ? 'completed' : '',
    isInactive ? 'inactive' : '',
    editing ? 'editing' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className="card-header">
        <h3>{year.year_label}</h3>
        <div className="card-badges">
          {isCurrent && <span className="badge current-badge">الحالية</span>}
          {year.is_completed && <span className="badge completed-badge">مكتملة</span>}
          {isInactive && <span className="badge inactive-badge">غير نشطة</span>}
        </div>
      </div>

      <div className="card-body">
        <div className="year-dates">
          <div className="date-item">
            <span className="label">بداية السنة:</span>
            <span className="value">{formatDate(year.year_start)}</span>
          </div>
          <div className="date-item">
            <span className="label">نهاية السنة:</span>
            <span className="value">{formatDate(year.year_end)}</span>
          </div>
        </div>

        {editing ? (
          <>
            {year.term1 && (
              <div className="term-info term-edit">
                <h4>الفصل الأول</h4>
                <div className="edit-field">
                  <label>الاسم:</label>
                  <input type="text" name="term1_name" value={editData.term1_name} onChange={handleEditChange} />
                </div>
                <div className="edit-dates-row">
                  <div className="edit-field">
                    <label>البداية:</label>
                    <input type="date" name="term1_start_date" value={editData.term1_start_date} onChange={handleEditChange} />
                  </div>
                  <div className="edit-field">
                    <label>النهاية:</label>
                    <input type="date" name="term1_end_date" value={editData.term1_end_date} onChange={handleEditChange} />
                  </div>
                </div>
              </div>
            )}

            {year.term2 && (
              <div className="term-info term-edit">
                <h4>الفصل الثاني</h4>
                <div className="edit-field">
                  <label>الاسم:</label>
                  <input type="text" name="term2_name" value={editData.term2_name} onChange={handleEditChange} />
                </div>
                <div className="edit-dates-row">
                  <div className="edit-field">
                    <label>البداية:</label>
                    <input type="date" name="term2_start_date" value={editData.term2_start_date} onChange={handleEditChange} />
                  </div>
                  <div className="edit-field">
                    <label>النهاية:</label>
                    <input type="date" name="term2_end_date" value={editData.term2_end_date} onChange={handleEditChange} />
                  </div>
                </div>
              </div>
            )}

            {validationError && (
              <div className="edit-validation-error">{validationError}</div>
            )}
          </>
        ) : (
          <>
            {year.term1 && (
              <div className="term-info">
                <h4>
                  الفصل الأول: {year.term1.term_name}
                  {(() => {
                    const status = getTermStatus(year.term1);
                    return status ? <span className={`term-status ${status}`}>{termStatusLabels[status]}</span> : null;
                  })()}
                </h4>
                <p>{formatDate(year.term1.start_date)} - {formatDate(year.term1.end_date)}</p>
              </div>
            )}

            {year.term2 && (
              <div className="term-info">
                <h4>
                  الفصل الثاني: {year.term2.term_name}
                  {(() => {
                    const status = getTermStatus(year.term2);
                    return status ? <span className={`term-status ${status}`}>{termStatusLabels[status]}</span> : null;
                  })()}
                </h4>
                <p>{formatDate(year.term2.start_date)} - {formatDate(year.term2.end_date)}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card-actions">
        {editing ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={cancelEditing} disabled={saving}>
              إلغاء
            </button>
          </>
        ) : (
          <>
            {!year.is_completed && (
              <>
                <button className="btn btn-outline btn-sm" onClick={startEditing}>
                  تعديل
                </button>
                <div>
                  <button className="btn btn-warning btn-sm" onClick={() => onComplete(year.id)}>
                    إتمام السنة
                  </button>
                  <p className="complete-year-hint">سيتم تغيير حالة جميع الموظفين إلى &quot;قيد الانتظار&quot;</p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TermManagement;

